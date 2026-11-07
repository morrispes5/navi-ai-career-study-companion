"use server";

import { z } from "zod";
import { getSessionUser } from "../auth";
import { getDb } from "../db/client";
import { recordActivity } from "../db/engagement";
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

async function noteJobActivity(userId: string, refId: string) {
  try { await recordActivity(getDb(), userId, { type: "job_update", refId }); }
  catch (error) { console.error("[navi] activity job", error instanceof Error ? error.message : "gagal"); }
}

export async function listJobsAction() {
  const userId = await requireUserId();
  const db = getDb();
  const [items, pipeline] = await Promise.all([jobs.listJobs(db, userId), jobs.jobPipeline(db, userId)]);
  return { items, pipeline };
}
export async function createJobAction(input: unknown) {
  const parsed = jobSchema.parse(input);
  const userId = await requireUserId();
  const row = await jobs.createJob(getDb(), userId, { ...parsed, appliedAt: parsed.appliedAt ?? undefined });
  await noteJobActivity(userId, row.id);
  return row;
}
/** Full replace of the editable fields (the edit form always sends every field). */
export async function updateJobAction(id: unknown, input: unknown) {
  const row = await jobs.updateJob(getDb(), await requireUserId(), idSchema.parse(id), jobSchema.parse(input));
  if (!row) throw new Error("Lamaran tidak ditemukan.");
  return row;
}
export async function setJobStatusAction(id: unknown, status: unknown) {
  const userId = await requireUserId();
  const row = await jobs.setJobStatus(getDb(), userId, idSchema.parse(id), statusSchema.parse(status));
  if (!row) throw new Error("Lamaran tidak ditemukan.");
  await noteJobActivity(userId, row.id);
  return row;
}
export async function deleteJobAction(id: unknown) {
  if (!(await jobs.deleteJob(getDb(), await requireUserId(), idSchema.parse(id)))) throw new Error("Lamaran tidak ditemukan.");
}

const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: optionalText(120),
  email: z.string().trim().max(320).optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || z.string().email().safeParse(v).success, "Email tidak valid"),
  profileUrl: urlField,
});
const notFound = () => new Error("Lamaran tidak ditemukan.");

export async function getJobDetailAction(id: unknown) {
  const userId = await requireUserId(); const db = getDb(); const jobId = idSchema.parse(id);
  const [notes, contacts] = await Promise.all([jobs.listNotes(db, userId, jobId), jobs.listContacts(db, userId, jobId)]);
  if (!notes || !contacts) throw notFound();
  return { notes, contacts };
}
export async function addNoteAction(jobId: unknown, input: unknown) {
  const row = await jobs.addNote(getDb(), await requireUserId(), idSchema.parse(jobId), noteSchema.parse(input));
  if (!row) throw notFound(); return row;
}
export async function deleteNoteAction(id: unknown) {
  if (!(await jobs.deleteNote(getDb(), await requireUserId(), idSchema.parse(id)))) throw new Error("Catatan tidak ditemukan.");
}
export async function addContactAction(jobId: unknown, input: unknown) {
  const row = await jobs.addContact(getDb(), await requireUserId(), idSchema.parse(jobId), contactSchema.parse(input));
  if (!row) throw notFound(); return row;
}
export async function updateContactAction(id: unknown, input: unknown) {
  const row = await jobs.updateContact(getDb(), await requireUserId(), idSchema.parse(id), contactSchema.parse(input));
  if (!row) throw new Error("Kontak tidak ditemukan."); return row;
}
export async function deleteContactAction(id: unknown) {
  if (!(await jobs.deleteContact(getDb(), await requireUserId(), idSchema.parse(id)))) throw new Error("Kontak tidak ditemukan.");
}
