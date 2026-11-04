import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { buildPlanTemplate, type MilestoneTemplate, type NaviProfileInput } from "../navi/templates";

/** Gemini output contract. Minimum 12 tasks keeps planNeedsUpgrade() satisfied. */
export const generatedPlanSchema = z.object({
  title: z.string().trim().min(3).max(120),
  milestones: z.array(z.object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(3).max(400),
    tasks: z.array(z.object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().min(3).max(400),
      minutes: z.number().int().min(15).max(240),
    })).min(3).max(5),
  })).min(3).max(6),
}).refine((p) => p.milestones.reduce((n, m) => n + m.tasks.length, 0) >= 12, { message: "Plan needs at least 12 tasks" });

export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type PlanResult = { source: "gemini" | "template"; title: string; milestones: MilestoneTemplate[]; fallbackReason?: string };

/** Minimal client shape so tests can inject a mock. Returns raw JSON text. */
export type PlanModelClient = (args: { model: string; system: string; input: string; signal: AbortSignal }) => Promise<string>;

const jsonSchema = {
  type: "object", additionalProperties: false, required: ["title", "milestones"],
  properties: {
    title: { type: "string" },
    milestones: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "description", "tasks"], properties: {
      title: { type: "string" }, description: { type: "string" },
      tasks: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "description", "minutes"], properties: { title: { type: "string" }, description: { type: "string" }, minutes: { type: "integer" } } } },
    } } },
  },
} as const;

const defaultClient: PlanModelClient = async ({ model, system, input }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const result = await ai.interactions.create({ model, system_instruction: system, input, response_format: { type: "text", mime_type: "application/json", schema: jsonSchema } });
  return result.output_text || "";
};

const SYSTEM = "Kamu Navi, mentor karier. Susun rencana belajar personal dalam Bahasa Indonesia: 4 milestone berurutan, masing-masing 3-4 tugas praktis dan konkret dengan estimasi menit realistis sesuai jam per minggu pengguna. Balas hanya JSON sesuai schema.";

export function buildPlanPrompt(p: NaviProfileInput) {
  return `Target peran: ${p.role}\nLevel saat ini: ${p.level}\nWaktu belajar: ${p.hours}\nTarget waktu: ${p.timeline}\nGaya belajar: ${p.preference}`;
}

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "item"; }

function toMilestones(plan: GeneratedPlan): MilestoneTemplate[] {
  return plan.milestones.map((m, i) => ({ key: `ai-${i}-${slug(m.title)}`, title: m.title, description: m.description, tasks: m.tasks.map((t, j) => ({ key: `ai-${i}-${j}-${slug(t.title)}`, title: t.title, description: t.description, minutes: t.minutes })) }));
}

function templateResult(profile: NaviProfileInput, reason: string): PlanResult {
  return { source: "template", title: `Jalur ${profile.role}`, milestones: buildPlanTemplate(profile), fallbackReason: reason };
}

/** Generates a personalized plan with Gemini; falls back to templates on missing key, error, timeout or invalid output. Never throws. */
export async function generateStudyPlan(profile: NaviProfileInput, opts: { client?: PlanModelClient; timeoutMs?: number; model?: string } = {}): Promise<PlanResult> {
  if (!opts.client && !process.env.GEMINI_API_KEY) return templateResult(profile, "no_api_key");
  const client = opts.client ?? defaultClient;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs); });
  try {
    const raw = await Promise.race([client({ model: opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.6-flash", system: SYSTEM, input: buildPlanPrompt(profile), signal: controller.signal }), timeout]);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return templateResult(profile, "invalid_json"); }
    const parsed = generatedPlanSchema.safeParse(json);
    if (!parsed.success) return templateResult(profile, "invalid_output");
    return { source: "gemini", title: parsed.data.title, milestones: toMilestones(parsed.data) };
  } catch (error) {
    return templateResult(profile, error instanceof Error && error.message === "timeout" ? "timeout" : "error");
  } finally {
    clearTimeout(timer);
  }
}
