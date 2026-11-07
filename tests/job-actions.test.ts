import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { users } from "../db/schema";
import { createDb, type NaviDb } from "../lib/db/client";
import { migrationSql, removeTempDir } from "./migrations";

const state: { db: NaviDb | null; user: string | null } = { db: null, user: null };
vi.mock("../lib/auth", () => ({ getSessionUser: async () => (state.user ? { id: state.user, email: `${state.user}@x.id` } : null) }));
vi.mock("../lib/db/client", async (orig) => ({ ...(await orig<typeof import("../lib/db/client")>()), getDb: () => state.db }));

const actions = await import("../lib/navi/job-actions");
const as = (u: string | null) => { state.user = u; };
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "navi-jobact-"));
  state.db = createDb(`file:${join(dir, "test.db")}`);
  await state.db.$client.executeMultiple(migrationSql());
  await state.db.$client.execute("PRAGMA foreign_keys = ON");
  await state.db.insert(users).values([{ id: "alice", name: "Alice", email: "a@x.id" }, { id: "bob", name: "Bob", email: "b@x.id" }]);
});
afterAll(() => { state.db?.$client.close(); removeTempDir(dir); });

const base = { company: "Tokopedia", position: "Frontend Intern", url: "", location: "", salaryRange: "", status: "wishlist", appliedAt: "", notes: "" };

describe("job actions: session, validation, user_id isolation", () => {
  it("rejects calls without a session", async () => {
    as(null);
    await expect(actions.listJobsAction()).rejects.toThrow(/Sesi/);
    await expect(actions.createJobAction(base)).rejects.toThrow(/Sesi/);
  });

  it("edits all fields for the owner and validates input", async () => {
    as("alice");
    const job = await actions.createJobAction(base);
    const edited = await actions.updateJobAction(job.id, { ...base, position: "Frontend Engineer", url: "https://jobs.example/1", salaryRange: "8-10 jt", status: "applied", appliedAt: "2026-11-01" });
    expect(edited).toMatchObject({ position: "Frontend Engineer", url: "https://jobs.example/1", salaryRange: "8-10 jt", status: "applied", userId: "alice" });
    expect(edited.appliedAt?.toISOString().slice(0, 10)).toBe("2026-11-01");
    await expect(actions.updateJobAction(job.id, { ...base, url: "javascript:alert(1)" })).rejects.toThrow();
    await expect(actions.updateJobAction(job.id, { ...base, company: "" })).rejects.toThrow();
    await expect(actions.updateJobAction(job.id, { ...base, status: "hired" })).rejects.toThrow();
  });

  it("blocks another user from editing or reading a job's details", async () => {
    as("alice"); const [job] = (await actions.listJobsAction()).items;
    as("bob");
    await expect(actions.updateJobAction(job.id, { ...base, company: "Hacked" })).rejects.toThrow(/tidak ditemukan/);
    await expect(actions.getJobDetailAction(job.id)).rejects.toThrow(/tidak ditemukan/);
    await expect(actions.addNoteAction(job.id, { body: "x" })).rejects.toThrow(/tidak ditemukan/);
    await expect(actions.addContactAction(job.id, { name: "x" })).rejects.toThrow(/tidak ditemukan/);
    expect((await actions.listJobsAction()).items).toEqual([]);
    as("alice"); expect((await actions.listJobsAction()).items[0].company).toBe("Tokopedia");
  });

  it("notes: owner can add/list/delete; other users cannot delete", async () => {
    as("alice"); const [job] = (await actions.listJobsAction()).items;
    const note = await actions.addNoteAction(job.id, { body: "  HR call on Monday  " });
    expect(note).toMatchObject({ body: "HR call on Monday", userId: "alice", applicationId: job.id });
    await expect(actions.addNoteAction(job.id, { body: "   " })).rejects.toThrow();
    as("bob"); await expect(actions.deleteNoteAction(note.id)).rejects.toThrow(/tidak ditemukan/);
    as("alice");
    expect((await actions.getJobDetailAction(job.id)).notes).toHaveLength(1);
    await actions.deleteNoteAction(note.id);
    expect((await actions.getJobDetailAction(job.id)).notes).toEqual([]);
  });

  it("contacts: validated, owner-only update/delete", async () => {
    as("alice"); const [job] = (await actions.listJobsAction()).items;
    const c = await actions.addContactAction(job.id, { name: "Rina", role: "Recruiter", email: "rina@corp.id", profileUrl: "https://linkedin.com/in/rina" });
    expect(c).toMatchObject({ name: "Rina", userId: "alice" });
    await expect(actions.addContactAction(job.id, { name: "X", email: "not-an-email" })).rejects.toThrow();
    await expect(actions.addContactAction(job.id, { name: "X", profileUrl: "ftp://x" })).rejects.toThrow();
    as("bob");
    await expect(actions.updateContactAction(c.id, { name: "Hacked" })).rejects.toThrow(/tidak ditemukan/);
    await expect(actions.deleteContactAction(c.id)).rejects.toThrow(/tidak ditemukan/);
    as("alice");
    expect((await actions.updateContactAction(c.id, { name: "Rina S", role: "Recruiter" })).name).toBe("Rina S");
    await actions.deleteContactAction(c.id);
    expect((await actions.getJobDetailAction(job.id)).contacts).toEqual([]);
  });

  it("deleting a job cascades its notes and contacts", async () => {
    as("alice"); const [job] = (await actions.listJobsAction()).items;
    await actions.addNoteAction(job.id, { body: "n" }); await actions.addContactAction(job.id, { name: "c" });
    as("bob"); await expect(actions.deleteJobAction(job.id)).rejects.toThrow();
    as("alice"); await actions.deleteJobAction(job.id);
    const left = await state.db!.$client.execute("SELECT (SELECT count(*) FROM job_application_notes) + (SELECT count(*) FROM job_application_contacts) AS n");
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
