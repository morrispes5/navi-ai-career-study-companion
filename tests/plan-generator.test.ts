import { describe, expect, it, vi } from "vitest";
import { generateStudyPlan, type PlanModelClient } from "../lib/server/plan-generator";
import { buildPlanTemplate } from "../lib/navi/templates";

const profile = { role: "Backend Developer", level: "Pemula", hours: "6 jam", timeline: "6 bulan", preference: "Belajar sambil praktik" };
const task = (n: number) => ({ title: `Tugas ${n}`, description: "Kerjakan latihan konkret.", minutes: 60 });
const validPlan = { title: "Jalur Backend Personal", milestones: [0, 1, 2, 3].map((i) => ({ title: `Milestone ${i}`, description: "Deskripsi milestone.", tasks: [task(1), task(2), task(3)] })) };

describe("generateStudyPlan", () => {
  it("returns a Gemini plan when output is valid", async () => {
    const client: PlanModelClient = vi.fn(async () => JSON.stringify(validPlan));
    const r = await generateStudyPlan(profile, { client });
    expect(r.source).toBe("gemini");
    expect(r.title).toBe("Jalur Backend Personal");
    expect(r.milestones).toHaveLength(4);
    expect(r.milestones.flatMap((m) => m.tasks)).toHaveLength(12);
    expect(client).toHaveBeenCalledOnce();
  });

  it("falls back to the template on schema-invalid output", async () => {
    const bad = { ...validPlan, milestones: validPlan.milestones.slice(0, 2) };
    const r = await generateStudyPlan(profile, { client: async () => JSON.stringify(bad) });
    expect(r.source).toBe("template");
    expect(r.fallbackReason).toBe("invalid_output");
    expect(r.milestones).toEqual(buildPlanTemplate(profile));
  });

  it("falls back to the template on non-JSON output", async () => {
    const r = await generateStudyPlan(profile, { client: async () => "not json" });
    expect(r.fallbackReason).toBe("invalid_json");
  });

  it("falls back to the template on client error", async () => {
    const r = await generateStudyPlan(profile, { client: async () => { throw new Error("boom"); } });
    expect(r).toMatchObject({ source: "template", fallbackReason: "error" });
  });

  it("falls back to the template on timeout and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const client: PlanModelClient = (args) => { signal = args.signal; return new Promise(() => {}); };
    const r = await generateStudyPlan(profile, { client, timeoutMs: 20 });
    expect(r).toMatchObject({ source: "template", fallbackReason: "timeout" });
    expect(signal?.aborted).toBe(true);
  });

  it("uses the template without calling Gemini when no API key is set", async () => {
    const prev = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
    try { expect((await generateStudyPlan(profile)).fallbackReason).toBe("no_api_key"); }
    finally { if (prev !== undefined) process.env.GEMINI_API_KEY = prev; }
  });
});
