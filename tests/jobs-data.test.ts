import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../db/schema";
import { createDb, type NaviDb } from "../lib/db/client";
import * as jobs from "../lib/db/jobs";

let dir: string; let db: NaviDb;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "navi-jobs-"));
  db = createDb(`file:${join(dir, "test.db")}`);
  await db.$client.executeMultiple(readFileSync(join(__dirname, "../db/0000_init.sql"), "utf8"));
  await db.$client.execute("PRAGMA foreign_keys = ON");
  await db.insert(users).values([{ id: "alice", name: "Alice", email: "a@x.id" }, { id: "bob", name: "Bob", email: "b@x.id" }]);
});
afterAll(() => { db.$client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("job tracker user_id scoping", () => {
  it("creates and lists jobs only for the owner", async () => {
    const job = await jobs.createJob(db, "alice", { company: "Tokopedia", position: "Frontend Intern" });
    expect(job.userId).toBe("alice");
    expect(job.status).toBe("wishlist");
    expect(job.appliedAt).toBeNull();
    expect(await jobs.listJobs(db, "alice")).toHaveLength(1);
    expect(await jobs.listJobs(db, "bob")).toEqual([]);
    expect(await jobs.getJob(db, "bob", job.id)).toBeNull();
  });

  it("does not let another user update, move or delete a job", async () => {
    const [job] = await jobs.listJobs(db, "alice");
    expect(await jobs.updateJob(db, "bob", job.id, { company: "Hacked" })).toBeNull();
    expect(await jobs.setJobStatus(db, "bob", job.id, "offer")).toBeNull();
    expect(await jobs.deleteJob(db, "bob", job.id)).toBe(false);
    const after = await jobs.getJob(db, "alice", job.id);
    expect(after?.company).toBe("Tokopedia");
    expect(after?.status).toBe("wishlist");
  });

  it("moves through the pipeline and stamps applied_at once", async () => {
    const [job] = await jobs.listJobs(db, "alice");
    const applied = await jobs.setJobStatus(db, "alice", job.id, "applied");
    expect(applied?.appliedAt).toBeInstanceOf(Date);
    const interview = await jobs.setJobStatus(db, "alice", job.id, "interview");
    expect(interview?.appliedAt?.getTime()).toBe(applied?.appliedAt?.getTime());
    await jobs.createJob(db, "bob", { company: "Gojek", position: "Backend", status: "applied" });
    expect(await jobs.jobPipeline(db, "alice")).toMatchObject({ interview: 1, applied: 0 });
    expect(await jobs.jobPipeline(db, "bob")).toMatchObject({ applied: 1, interview: 0 });
    expect(await jobs.listJobs(db, "alice", "interview")).toHaveLength(1);
  });

  it("deletes for the owner", async () => {
    const [job] = await jobs.listJobs(db, "alice");
    expect(await jobs.deleteJob(db, "alice", job.id)).toBe(true);
    expect(await jobs.listJobs(db, "alice")).toEqual([]);
    expect(await jobs.listJobs(db, "bob")).toHaveLength(1);
  });
});
