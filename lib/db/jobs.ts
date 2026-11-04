import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { jobApplications } from "../../db/schema";
import type { NaviDb } from "./client";

/*
 * Job tracker data layer (issue #8). Every function takes the userId from the
 * server session and every query filters by user_id.
 */
export const JOB_STATUSES = ["wishlist", "applied", "interview", "offer", "rejected", "ghosted"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_MAX_PER_USER = 1000;

export type JobInput = {
  company: string;
  position: string;
  url?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  status?: JobStatus;
  appliedAt?: Date | null;
  notes?: string | null;
};
export type JobApplication = typeof jobApplications.$inferSelect;

export class JobLimitError extends Error { constructor() { super("Batas jumlah lamaran tercapai."); this.name = "JobLimitError"; } }

export async function listJobs(db: NaviDb, userId: string, status?: JobStatus) {
  const where = status ? and(eq(jobApplications.userId, userId), eq(jobApplications.status, status)) : eq(jobApplications.userId, userId);
  return db.select().from(jobApplications).where(where).orderBy(desc(jobApplications.updatedAt), desc(jobApplications.createdAt));
}

export async function getJob(db: NaviDb, userId: string, id: string) {
  const [row] = await db.select().from(jobApplications).where(and(eq(jobApplications.id, id), eq(jobApplications.userId, userId))).limit(1);
  return row ?? null;
}

export async function createJob(db: NaviDb, userId: string, input: JobInput) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(jobApplications).where(eq(jobApplications.userId, userId));
  if (n >= JOB_MAX_PER_USER) throw new JobLimitError();
  const status = input.status ?? "wishlist";
  const appliedAt = input.appliedAt ?? (status !== "wishlist" ? new Date() : null);
  const [row] = await db.insert(jobApplications).values({ ...input, userId, status, appliedAt }).returning();
  return row;
}

/** Returns null when the job does not exist or belongs to another user. */
export async function updateJob(db: NaviDb, userId: string, id: string, input: Partial<JobInput>) {
  const [row] = await db.update(jobApplications).set({ ...input, updatedAt: new Date() })
    .where(and(eq(jobApplications.id, id), eq(jobApplications.userId, userId))).returning();
  return row ?? null;
}

/** Moves a job along the pipeline; sets applied_at the first time it leaves the wishlist. */
export async function setJobStatus(db: NaviDb, userId: string, id: string, status: JobStatus) {
  const current = await getJob(db, userId, id);
  if (!current) return null;
  const appliedAt = current.appliedAt ?? (status !== "wishlist" ? new Date() : null);
  return updateJob(db, userId, id, { status, appliedAt });
}

export async function deleteJob(db: NaviDb, userId: string, id: string) {
  const rows = await db.delete(jobApplications).where(and(eq(jobApplications.id, id), eq(jobApplications.userId, userId))).returning({ id: jobApplications.id });
  return rows.length > 0;
}

/** Counts per status for the pipeline header. */
export async function jobPipeline(db: NaviDb, userId: string) {
  const rows = await db.select({ status: jobApplications.status, n: sql<number>`count(*)` }).from(jobApplications)
    .where(eq(jobApplications.userId, userId)).groupBy(jobApplications.status);
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  for (const r of rows) counts[r.status] = Number(r.n);
  return counts;
}
