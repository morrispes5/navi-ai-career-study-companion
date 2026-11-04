import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../db/schema";
import { createDb, type NaviDb } from "../lib/db/client";
import * as navi from "../lib/db/navi";

const profile = { role: "Frontend Developer", level: "Baru mulai", hours: "6 jam per minggu", timeline: "3 bulan", preference: "Belajar lewat membangun proyek" };
let dir: string; let db: NaviDb;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "navi-test-"));
  db = createDb(`file:${join(dir, "test.db")}`);
  const sql = readFileSync(join(__dirname, "../db/0000_init.sql"), "utf8");
  await db.$client.executeMultiple(sql);
  await db.$client.execute("PRAGMA foreign_keys = ON");
  await db.insert(users).values([{ id: "alice", name: "Alice", email: "a@x.id" }, { id: "bob", name: "Bob", email: "b@x.id" }]);
  await navi.seedInitialNaviData(db, "alice", profile);
  await navi.seedInitialNaviData(db, "bob", { ...profile, role: "Data Analyst" });
});
afterAll(() => { db.$client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("data layer user_id scoping", () => {
  it("seed is idempotent and creates a plan with tasks", async () => {
    const first = await navi.loadDashboard(db, "alice");
    await navi.seedInitialNaviData(db, "alice", profile);
    const again = await navi.loadDashboard(db, "alice");
    expect(again?.plan.id).toBe(first?.plan.id);
    expect(first?.plan.totalTasks).toBeGreaterThan(0);
    expect(first?.profile).toEqual(profile);
  });

  it("returns null dashboard for a user without profile", async () => {
    await db.insert(users).values({ id: "carol", name: "Carol", email: "c@x.id" });
    expect(await navi.loadDashboard(db, "carol")).toBeNull();
  });

  it("dashboards only contain the owner's data", async () => {
    const a = await navi.loadDashboard(db, "alice"); const b = await navi.loadDashboard(db, "bob");
    expect(a?.plan.id).not.toBe(b?.plan.id);
    expect(b?.profile.role).toBe("Data Analyst");
  });

  it("cannot complete another user's task", async () => {
    const a = await navi.loadDashboard(db, "alice");
    const taskId = a!.plan.nextTask!.id;
    expect(await navi.completeTask(db, "bob", taskId)).toBe(false);
    expect((await navi.loadDashboard(db, "alice"))!.plan.completedTasks).toBe(0);
    expect(await navi.completeTask(db, "alice", taskId)).toBe(true);
    expect((await navi.loadDashboard(db, "alice"))!.plan.completedTasks).toBe(1);
  });

  it("memories are isolated per user", async () => {
    const mem = await navi.createMemory(db, "alice", { label: "Tujuan", value: "Kerja remote", reason: "Fokus" });
    await expect(navi.updateMemory(db, "bob", mem.id, { label: "x", value: "y", reason: "z" })).rejects.toThrow();
    await navi.removeMemory(db, "bob", mem.id);
    await navi.clearMemories(db, "bob");
    expect((await navi.listMemories(db, "alice")).map((m) => m.id)).toContain(mem.id);
    expect(await navi.listMemories(db, "bob")).toHaveLength(0);
    await navi.removeMemory(db, "alice", mem.id);
    expect(await navi.listMemories(db, "alice")).toHaveLength(0);
  });

  it("conversations cannot be read or written by another user", async () => {
    const conv = await navi.createConversation(db, "alice");
    expect(await navi.findConversation(db, "bob", conv)).toBeUndefined();
    await expect(navi.addChatMessage(db, "bob", conv, "user", "halo")).rejects.toThrow();
    await navi.addChatMessage(db, "alice", conv, "user", "halo");
    await navi.addChatMessage(db, "alice", conv, "assistant", "hai", "fixture");
    const a = await navi.loadDashboard(db, "alice");
    expect(a?.messages.map((m) => m.role)).toEqual(["user", "navi"]);
    expect((await navi.loadDashboard(db, "bob"))?.messages).toHaveLength(0);
  });

  it("replan archives only the caller's plan", async () => {
    const bobBefore = await navi.loadDashboard(db, "bob");
    await navi.applyReplan(db, "alice", { ...profile, hours: "10 jam per minggu" });
    const a = await navi.loadDashboard(db, "alice");
    expect(a?.history).toHaveLength(1);
    expect(a?.profile.hours).toBe("10 jam per minggu");
    expect((await navi.loadDashboard(db, "bob"))?.plan.id).toBe(bobBefore?.plan.id);
  });
});
