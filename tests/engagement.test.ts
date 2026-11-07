import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../db/schema";
import { createDb, type NaviDb } from "../lib/db/client";
import { recordActivity, runReminders, updateReminderSettings } from "../lib/db/engagement";
import * as navi from "../lib/db/navi";
import { migrationSql, removeTempDir } from "./migrations";
import { nextStreak, previousDate, reminderDue, zonedParts } from "../lib/engagement/dates";

delete process.env.GEMINI_API_KEY;
const profile = { role: "Frontend Developer", level: "Baru mulai", hours: "6 jam per minggu", timeline: "3 bulan", preference: "Belajar lewat membangun proyek" };
let dir: string; let db: NaviDb;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "navi-engage-"));
  db = createDb(`file:${join(dir, "test.db")}`);
  await db.$client.executeMultiple(migrationSql());
  await db.$client.execute("PRAGMA foreign_keys = ON");
  await db.insert(users).values([{ id: "alice", name: "Alice", email: "alice@x.id" }, { id: "bob", name: "Bob", email: "bob@x.id" }]);
  await navi.seedInitialNaviData(db, "alice", profile);
  await navi.seedInitialNaviData(db, "bob", profile);
});
afterAll(() => { db.$client.close(); removeTempDir(dir); });

describe("streak calendar", () => {
  it("uses the user timezone and resets after a missed day", async () => {
    expect(zonedParts("Asia/Jakarta", new Date("2026-11-01T17:30:00Z")).date).toBe("2026-11-02");
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
    expect(nextStreak(2, "2026-11-01", "2026-11-01")).toBe(2);
    expect(reminderDue("07:30", 7)).toBe(true);
    expect(reminderDue("07:30", 8)).toBe(false);

    const first = await recordActivity(db, "alice", { type: "chat" }, new Date("2026-11-01T10:00:00Z"));
    expect(first).toMatchObject({ date: "2026-11-01", currentStreak: 1 });
    const sameDay = await recordActivity(db, "alice", { type: "chat" }, new Date("2026-11-01T12:00:00Z"));
    expect(sameDay.currentStreak).toBe(1);
    const nextDay = await recordActivity(db, "alice", { type: "chat" }, new Date("2026-11-02T10:00:00Z"));
    expect(nextDay).toMatchObject({ date: "2026-11-02", currentStreak: 2, longestStreak: 2 });
    const missed = await recordActivity(db, "alice", { type: "chat" }, new Date("2026-11-04T10:00:00Z"));
    expect(missed).toMatchObject({ currentStreak: 1, longestStreak: 2 });
    expect((await navi.loadDashboard(db, "bob"))?.progress.currentStreak).toBe(0);
  });

  it("adds study minutes only for the user who finished the task", async () => {
    const dash = await navi.loadDashboard(db, "bob");
    const taskId = dash!.plan.nextTask!.id;
    expect(await navi.completeTask(db, "bob", taskId)).toBe(true);
    expect(await navi.completeTask(db, "bob", taskId)).toBe(false);
    const after = await navi.loadDashboard(db, "bob");
    expect(after?.progress.studyMinutes).toBeGreaterThan(0);
    expect(after?.progress.currentStreak).toBe(1);
    expect((await navi.loadDashboard(db, "alice"))?.progress.studyMinutes).toBe(0);
  });
});

describe("daily reminders", () => {
  const morning = new Date("2026-11-07T00:30:00Z");

  it("sends once per local day and skips a timezone that is not on that hour", async () => {
    await updateReminderSettings(db, "alice", { enabled: true, reminderTime: "07:00", timezone: "Asia/Jakarta" });
    await updateReminderSettings(db, "bob", { enabled: true, reminderTime: "07:00", timezone: "Asia/Makassar" });
    const sent: string[] = [];
    const first = await runReminders(db, morning, async (to) => { sent.push(to); return true; });
    expect(sent).toEqual(["alice@x.id"]);
    expect(first).toMatchObject({ sent: 1, failed: 0 });
    const second = await runReminders(db, morning, async () => true);
    expect(second.sent).toBe(0);
    const saved = await navi.loadDashboard(db, "alice");
    expect(saved?.progress.remindersEnabled).toBe(true);
    expect(saved?.progress.timezone).toBe("Asia/Jakarta");
  });

  it("releases the daily slot when email sending fails", async () => {
    await updateReminderSettings(db, "bob", { enabled: true, reminderTime: "08:00", timezone: "Asia/Makassar" });
    const failed = await runReminders(db, morning, async () => false);
    expect(failed.failed).toBe(1);
    const retried = await runReminders(db, morning, async (to) => to === "bob@x.id");
    expect(retried.sent).toBe(1);
  });
});
