import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { jobApplications, rateLimits } from "../../db/schema";
import type { NaviDb } from "./client";
import { JOB_MAX_PER_USER } from "./jobs";

/** Same per-user cap as the job tracker (#24). */
export { JOB_MAX_PER_USER };
import type { JobSuggestion } from "../server/job-suggestions-schema";

export const JOB_SUGGEST_RATE_LIMIT = { max: 10, windowSeconds: 3600 } as const;
export const JOB_SAVE_RATE_LIMIT = { max: 30, windowSeconds: 3600 } as const;

const windowStartFor = (now: number, w: number) => Math.floor(now / 1000 / w) * w;

/** Fixed-window limiter on rate_limits. Returns true if allowed. */
async function consume(db: NaviDb, key: string, limit: { max: number; windowSeconds: number }, now: number) {
  const windowStart = windowStartFor(now, limit.windowSeconds);
  const [row] = await db.insert(rateLimits).values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= limit.max;
}

export const consumeJobSuggestQuota = (db: NaviDb, userId: string, now = Date.now()) => consume(db, `job_suggest:${userId}`, JOB_SUGGEST_RATE_LIMIT, now);
export const consumeJobSaveQuota = (db: NaviDb, userId: string, now = Date.now()) => consume(db, `job_save:${userId}`, JOB_SAVE_RATE_LIMIT, now);

/** Give back one suggestion unit when generation failed (so failures don't burn quota). */
export async function refundJobSuggestQuota(db: NaviDb, userId: string, now = Date.now()) {
  const windowStart = windowStartFor(now, JOB_SUGGEST_RATE_LIMIT.windowSeconds);
  await db.update(rateLimits).set({ count: sql`max(${rateLimits.count} - 1, 0)` })
    .where(and(eq(rateLimits.key, `job_suggest:${userId}`), eq(rateLimits.windowStart, windowStart)));
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
/** Normalized dedupe key per (title, company type). */
export const suggestionKey = (s: Pick<JobSuggestion, "title" | "companyType">) => `${norm(s.title)}|${norm(s.companyType)}`;

export type SaveResult = { id: string | null; created: boolean; capped?: true };

/** Save a suggestion as a wishlist row. Idempotent per (user, suggestion_key) via a unique index + insert-or-ignore. */
export async function saveSuggestionToTracker(db: NaviDb, userId: string, s: JobSuggestion & { url: string }): Promise<SaveResult> {
  const key = suggestionKey(s);
  const findExisting = async () => (await db.select({ id: jobApplications.id }).from(jobApplications)
    .where(and(eq(jobApplications.userId, userId), eq(jobApplications.suggestionKey, key))).limit(1))[0];
  const existing = await findExisting();
  if (existing) return { id: existing.id, created: false };
  const [{ n }] = await db.select({ n: count() }).from(jobApplications).where(eq(jobApplications.userId, userId));
  if (n >= JOB_MAX_PER_USER) return { id: null, created: false, capped: true };
  const notes = [`Saran Navi: ${s.matchReason}`, s.missingSkills.length ? `Skill yang perlu dipelajari: ${s.missingSkills.join(", ")}` : ""].filter(Boolean).join("\n");
  const [row] = await db.insert(jobApplications).values({ userId, company: s.companyType, position: s.title, url: s.url, location: s.location, status: "wishlist", notes, suggestionKey: key })
    .onConflictDoNothing().returning({ id: jobApplications.id });
  if (row) return { id: row.id, created: true };
  return { id: (await findExisting())?.id ?? null, created: false };
}
