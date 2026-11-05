import { and, eq, sql } from "drizzle-orm";
import { jobApplications, profiles, rateLimits } from "../../db/schema";
import type { NaviDb } from "./client";
import type { JobSuggestion } from "../server/job-suggestions-schema";

export const JOB_SUGGEST_RATE_LIMIT = { max: 10, windowSeconds: 3600 } as const;

/** Fixed-window limiter on rate_limits (key "job_suggest:<userId>"). Returns true if allowed. */
export async function consumeJobSuggestQuota(db: NaviDb, userId: string, now = Date.now()) {
  const w = JOB_SUGGEST_RATE_LIMIT.windowSeconds;
  const windowStart = Math.floor(now / 1000 / w) * w;
  const [row] = await db.insert(rateLimits).values({ key: `job_suggest:${userId}`, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= JOB_SUGGEST_RATE_LIMIT.max;
}

/** Raw profile skills (minus internal "level:" markers) for prompting. */
export async function getProfileSkills(db: NaviDb, userId: string) {
  const row = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId), columns: { skills: true } });
  return (row?.skills ?? []).filter((s) => !s.startsWith("level:"));
}

/** Save a suggestion as a wishlist row in the user's tracker. Idempotent per (user, position, company). */
export async function saveSuggestionToTracker(db: NaviDb, userId: string, s: JobSuggestion & { url: string }) {
  const [existing] = await db.select({ id: jobApplications.id }).from(jobApplications)
    .where(and(eq(jobApplications.userId, userId), eq(jobApplications.position, s.title), eq(jobApplications.company, s.companyType))).limit(1);
  if (existing) return { id: existing.id, created: false };
  const notes = [`Saran Navi: ${s.matchReason}`, s.missingSkills.length ? `Skill yang perlu dipelajari: ${s.missingSkills.join(", ")}` : ""].filter(Boolean).join("\n");
  const [row] = await db.insert(jobApplications).values({ userId, company: s.companyType, position: s.title, url: s.url, location: s.location, status: "wishlist", notes })
    .returning({ id: jobApplications.id });
  return { id: row.id, created: true };
}
