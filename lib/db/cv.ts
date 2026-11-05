import { and, desc, eq, sql } from "drizzle-orm";
import { cvReviews, rateLimits } from "../../db/schema";
import type { NaviDb } from "./client";
import type { CvReviewResult } from "../server/cv-schema";

export const CV_RATE_LIMIT = { max: 5, windowSeconds: 3600 } as const;

/** Fixed-window limiter on rate_limits (key "cv_review:<userId>"). Returns true if the call is allowed. */
export async function consumeCvReviewQuota(db: NaviDb, userId: string, now = Date.now()) {
  const windowStart = Math.floor(now / 1000 / CV_RATE_LIMIT.windowSeconds) * CV_RATE_LIMIT.windowSeconds;
  const [row] = await db.insert(rateLimits).values({ key: `cv_review:${userId}`, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= CV_RATE_LIMIT.max;
}

export async function saveCvReview(db: NaviDb, userId: string, input: { targetRole: string | null; cvText: string; result: CvReviewResult; model: string }) {
  const [row] = await db.insert(cvReviews).values({
    userId, targetRole: input.targetRole, cvText: input.cvText, score: input.result.score,
    feedback: { strengths: input.result.strengths, improvements: input.result.weaknesses, keywords: input.result.keywordGaps, rewrites: input.result.rewrites, summary: input.result.summary, model: input.model },
  }).returning({ id: cvReviews.id });
  return row.id;
}

export async function listCvReviews(db: NaviDb, userId: string, limit = 50) {
  return db.select({ id: cvReviews.id, targetRole: cvReviews.targetRole, score: cvReviews.score, createdAt: cvReviews.createdAt })
    .from(cvReviews).where(eq(cvReviews.userId, userId)).orderBy(desc(cvReviews.createdAt)).limit(limit);
}

export async function getCvReview(db: NaviDb, userId: string, id: string) {
  const [row] = await db.select().from(cvReviews).where(and(eq(cvReviews.id, id), eq(cvReviews.userId, userId))).limit(1);
  if (!row) return null;
  const f = row.feedback ?? { strengths: [], improvements: [], keywords: [] };
  return { id: row.id, targetRole: row.targetRole, score: row.score, createdAt: row.createdAt, cvText: row.cvText,
    strengths: f.strengths, weaknesses: f.improvements, keywordGaps: f.keywords, rewrites: f.rewrites ?? [], summary: f.summary ?? "" };
}
