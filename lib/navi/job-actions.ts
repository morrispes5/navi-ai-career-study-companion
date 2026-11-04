"use server";

import { z } from "zod";
import { getSessionUser } from "../auth";
import { getDb } from "../db/client";
import * as jobs from "../db/jobs";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const urlField = z.string().trim().max(500).optional().nullable().transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "URL harus diawali http(s)://");
const statusSchema = z.enum(jobs.JOB_STATUSES);
const dateField = z.union([z.string().date(), z.literal(""), z.null()]).optional().transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));
const jobSchema = z.object({
  company: z.string().trim().min(1).max(120),
  position: z.string().trim().min(1).max(120),
  url: urlField,
  location: optionalText(120),
  salaryRange: optionalText(80),
  status: statusSchema.optional(),
  appliedAt: dateField,
  notes: optionalText(2000),
});
const idSchema = z.string().min(1).max(64);

async function requireUserId() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  return user.id;
}

export async function listJobsAction() {
  const userId = await requireUserId();
  const db = getDb();
  const [items, pipeline] = await Promise.all([jobs.listJobs(db, userId), jobs.jobPipeline(db, userId)]);
  return { items, pipeline };
}
export async function createJobAction(input: unknown) {
  const parsed = jobSchema.parse(input);
  return jobs.createJob(getDb(), await requireUserId(), { ...parsed, appliedAt: parsed.appliedAt ?? undefined });
}
export async function updateJobAction(id: unknown, input: unknown) {
  const row = await jobs.updateJob(getDb(), await requireUserId(), idSchema.parse(id), jobSchema.partial().parse(input));
  if (!row) throw new Error("Lamaran tidak ditemukan.");
  return row;
}
export async function setJobStatusAction(id: unknown, status: unknown) {
  const row = await jobs.setJobStatus(getDb(), await requireUserId(), idSchema.parse(id), statusSchema.parse(status));
  if (!row) throw new Error("Lamaran tidak ditemukan.");
  return row;
}
export async function deleteJobAction(id: unknown) {
  if (!(await jobs.deleteJob(getDb(), await requireUserId(), idSchema.parse(id)))) throw new Error("Lamaran tidak ditemukan.");
}
