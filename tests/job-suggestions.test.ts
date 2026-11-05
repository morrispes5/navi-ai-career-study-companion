import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "navi-jobs-"));
const file = join(dir, "jobs.db");
process.env.TURSO_DATABASE_URL = `file:${file}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.GEMINI_API_KEY = "test-key-not-real";

const session = vi.hoisted(() => ({ userId: null as string | null }));
const gemini = vi.hoisted(() => ({ generate: undefined as undefined | ((a: { input: string; signal: AbortSignal }) => Promise<string>) }));
vi.mock("../lib/server/job-suggestions", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/server/job-suggestions")>();
  return { ...mod, generateJobSuggestions: (p: Parameters<typeof mod.generateJobSuggestions>[0], o: Parameters<typeof mod.generateJobSuggestions>[1] = {}) => mod.generateJobSuggestions(p, { generate: gemini.generate, ...o }) };
});
vi.mock("../lib/auth", () => ({ getSessionUser: async () => (session.userId ? { id: session.userId, email: `${session.userId}@test.dev` } : null) }));

const suggestion = { title: "Junior Frontend Developer", companyType: "Startup fintech", seniority: "junior", location: "Jakarta", matchReason: "Cocok dengan React.", matchedSkills: ["React"], missingSkills: ["Testing"], searchQuery: "junior frontend react" };
const good = { suggestions: [suggestion] };

let route: typeof import("../app/api/job-suggestions/route");
let save: typeof import("../app/api/job-suggestions/save/route");
let gen: typeof import("../lib/server/job-suggestions");
let db: import("../lib/db/client").NaviDb;
let client: import("@libsql/client").Client;
const req = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const suggest = (body: unknown = {}) => route.POST(req("/api/job-suggestions", body));

beforeAll(async () => {
  client = createClient({ url: `file:${file}` });
  const sql = readdirSync(join(__dirname, "../db")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().map((f) => readFileSync(join(__dirname, "../db", f), "utf8").replace(/--> statement-breakpoint/g, "")).join("\n");
  await client.executeMultiple(sql);
  for (const id of ["user-a", "user-b", "user-c", "user-d"]) await client.execute({ sql: `INSERT INTO "user"(id,name,email) VALUES (?,?,?)`, args: [id, id, `${id}@test.dev`] });
  for (const id of ["user-a", "user-b", "user-c"]) await client.execute({ sql: `INSERT INTO profiles(user_id,target_role,current_level,weekly_hours,skills) VALUES (?,?,?,?,?)`, args: [id, "Frontend Developer", "beginner", 6, JSON.stringify(["level:Baru mulai", "React"])] });
  route = await import("../app/api/job-suggestions/route");
  save = await import("../app/api/job-suggestions/save/route");
  gen = await import("../lib/server/job-suggestions");
  db = (await import("../lib/db/client")).getDb();
});
afterAll(() => { client.close(); db.$client.close(); rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { gemini.generate = async () => JSON.stringify(good); });

describe("job suggestions", () => {
  it("401 without session", async () => {
    session.userId = null;
    expect((await suggest()).status).toBe(401);
    expect((await save.POST(req("/api/job-suggestions/save", suggestion))).status).toBe(401);
  });

  it("returns validated suggestions with a search link, using profile skills without level markers", async () => {
    session.userId = "user-a";
    let prompt = "";
    gemini.generate = async ({ input }) => { prompt = input; return JSON.stringify(good); };
    const res = await suggest({ location: "Jakarta" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestions[0].title).toBe("Junior Frontend Developer");
    expect(json.suggestions[0].url).toMatch(/^https:\/\/www\.linkedin\.com\/jobs\/search\/\?/);
    expect(prompt).toContain("Skill: React");
    expect(prompt).not.toContain("level:");
  });

  it("graceful empty state without a profile, and when Gemini returns nothing", async () => {
    session.userId = "user-d";
    const a = await (await suggest()).json();
    expect(a).toMatchObject({ suggestions: [], empty: "no_profile" });
    session.userId = "user-a";
    gemini.generate = async () => JSON.stringify({ suggestions: [] });
    const b = await (await suggest()).json();
    expect(b).toMatchObject({ suggestions: [], empty: "no_results" });
  });

  it("503 on invalid output, error, or timeout", async () => {
    session.userId = "user-b";
    gemini.generate = async () => JSON.stringify({ suggestions: [{ title: "x" }] });
    expect((await suggest()).status).toBe(503);
    gemini.generate = async () => { throw new Error("boom"); };
    expect((await suggest()).status).toBe(503);
    const r = await gen.generateJobSuggestions({ role: "FE", level: "", skills: [] }, { timeoutMs: 5, generate: ({ signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))) });
    expect(r).toEqual({ ok: false, reason: "timeout" });
  });

  it("rate limits per user (10/hour)", async () => {
    session.userId = "user-c";
    for (let i = 0; i < 10; i++) expect((await suggest()).status).toBe(200);
    expect((await suggest()).status).toBe(429);
    session.userId = "user-a";
    expect((await suggest()).status).toBe(200);
  });

  it("saves a suggestion to the tracker scoped to the user, idempotently, with a server-built URL", async () => {
    session.userId = "user-a";
    const first = await save.POST(req("/api/job-suggestions/save", suggestion));
    expect(first.status).toBe(201);
    expect((await save.POST(req("/api/job-suggestions/save", suggestion))).status).toBe(200);
    expect((await save.POST(req("/api/job-suggestions/save", { ...suggestion, seniority: "boss" }))).status).toBe(400);
    const rows = await client.execute(`SELECT user_id, status, url, company FROM job_applications`);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ user_id: "user-a", status: "wishlist", company: "Startup fintech" });
    expect(String(rows.rows[0].url)).toContain("linkedin.com/jobs/search");
  });

  it("does not burn quota or leak reasons when Gemini fails", async () => {
    session.userId = "user-b";
    gemini.generate = async () => { throw new Error("secret detail"); };
    for (let i = 0; i < 12; i++) {
      const res = await suggest();
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.reason).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain("secret");
    }
    gemini.generate = async () => JSON.stringify(good);
    expect((await suggest()).status).toBe(200);
  });

  it("rejects client skills override and client url", async () => {
    session.userId = "user-a";
    expect((await suggest({ skills: ["Hacking"] })).status).toBe(400);
    expect((await save.POST(req("/api/job-suggestions/save", { ...suggestion, url: "https://evil.example" }))).status).toBe(400);
  });

  it("dedupes on a normalized key and handles concurrent saves", async () => {
    session.userId = "user-b";
    const variant = { ...suggestion, title: "  junior   FRONTEND developer ", companyType: "startup Fintech" };
    const results = await Promise.all([suggestion, variant, suggestion].map((b) => save.POST(req("/api/job-suggestions/save", b))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const rows = await client.execute({ sql: `SELECT COUNT(*) AS n FROM job_applications WHERE user_id = ?`, args: ["user-b"] });
    expect(Number(rows.rows[0].n)).toBe(1);
  });

  it("enforces the 1000-row tracker cap and a save rate limit", async () => {
    session.userId = "user-c";
    await client.execute(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 1000) INSERT INTO job_applications(id,user_id,company,position) SELECT 'cap-'||i,'user-c','C','P' FROM n`);
    expect((await save.POST(req("/api/job-suggestions/save", suggestion))).status).toBe(409);
    session.userId = "user-d";
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await save.POST(req("/api/job-suggestions/save", { ...suggestion, title: `Role ${i}` }))).status);
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
