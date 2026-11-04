import { readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the real data layer against a throwaway local SQLite file created from db/0000_init.sql
// and proves that user B can never read or mutate user A's rows (every query filters by user_id).
const file = join(tmpdir(), `navi-test-${process.pid}.db`);
process.env.TURSO_DATABASE_URL = `file:${file}`;
delete process.env.TURSO_AUTH_TOKEN;

const profile = { role: "Frontend Developer", level: "Baru mulai", hours: "6 jam per minggu", timeline: "3 bulan", preference: "Belajar lewat membangun proyek" };

let navi: typeof import("../lib/server/navi");

beforeAll(async () => {
  rmSync(file, { force: true });
  const client = createClient({ url: `file:${file}` });
  await client.executeMultiple(readFileSync(join(__dirname, "../db/0000_init.sql"), "utf8"));
  for (const id of ["user-a", "user-b"]) await client.execute({ sql: `INSERT INTO "user"(id,name,email) VALUES (?,?,?)`, args: [id, id, `${id}@test.dev`] });
  client.close();
  navi = await import("../lib/server/navi");
});

describe("data layer user isolation", () => {
  it("seeds and loads a dashboard per user", async () => {
    await navi.seedInitialNaviData("user-a", profile);
    const dash = await navi.loadDashboard("user-a");
    expect(dash.profile).toEqual(profile);
    expect(dash.plan.totalTasks).toBeGreaterThanOrEqual(12);
    await expect(navi.loadDashboard("user-b")).rejects.toBeInstanceOf(navi.MissingNaviProfileError);
  });

  it("does not let another user complete a task", async () => {
    const task = (await navi.loadDashboard("user-a")).plan.nextTask!;
    expect(await navi.completeTask("user-b", task.id)).toBe(false);
    expect((await navi.loadDashboard("user-a")).plan.completedTasks).toBe(0);
    expect(await navi.completeTask("user-a", task.id)).toBe(true);
    expect((await navi.loadDashboard("user-a")).plan.completedTasks).toBe(1);
  });

  it("does not let another user read, edit or delete memories", async () => {
    const memory = await navi.createMemory("user-a", { label: "Waktu fokus", value: "Pagi", reason: "Jadwal" });
    expect(await navi.listMemories("user-b")).toEqual([]);
    await expect(navi.updateMemory("user-b", memory.id, { label: "x", value: "x", reason: "x" })).rejects.toThrow();
    await navi.removeMemory("user-b", memory.id);
    await navi.clearMemories("user-b");
    expect((await navi.listMemories("user-a")).map((m) => m.value)).toEqual(["Pagi"]);
  });

  it("does not let another user use a conversation", async () => {
    const conv = await navi.getOrCreateConversation("user-a");
    await navi.addChatMessage("user-a", conv!, "user", "halo");
    expect(await navi.getOrCreateConversation("user-b", conv!)).toBeNull();
    expect((await navi.loadDashboard("user-a")).messages).toHaveLength(1);
  });

  it("replans only for the owner and keeps history", async () => {
    await navi.applyReplan("user-a", { ...profile, role: "Backend Developer" });
    const dash = await navi.loadDashboard("user-a");
    expect(dash.plan.title).toBe("Jalur Backend Developer");
    expect(dash.history).toHaveLength(1);
  });

  it("never shows one user's plan or plan history to another user", async () => {
    await navi.seedInitialNaviData("user-b", { ...profile, role: "Data Analyst" });
    const a = await navi.loadDashboard("user-a");
    const b = await navi.loadDashboard("user-b");
    expect(b.plan.id).not.toBe(a.plan.id);
    expect(b.plan.title).toBe("Jalur Data Analyst");
    expect(b.history).toEqual([]);
    const aIds = new Set([a.plan.id, ...a.history.map((h) => h.id), ...a.plan.milestones.flatMap((m) => m.tasks.map((t) => t.id))]);
    expect(b.plan.milestones.flatMap((m) => m.tasks.map((t) => t.id)).some((id) => aIds.has(id))).toBe(false);
    expect((await navi.getActivePlanSummary("user-b"))?.id).toBe(b.plan.id);
    // B replanning must not archive or touch A's active plan.
    await navi.applyReplan("user-b", { ...profile, role: "QA Engineer" });
    const aAfter = await navi.loadDashboard("user-a");
    expect(aAfter.plan.id).toBe(a.plan.id);
    expect(aAfter.history.map((h) => h.id)).toEqual(a.history.map((h) => h.id));
    expect((await navi.loadDashboard("user-b")).history.map((h) => h.id)).toEqual([b.plan.id]);
  });

  it("addChatMessage refuses to write into another user's conversation", async () => {
    const conv = await navi.getOrCreateConversation("user-a");
    await expect(navi.addChatMessage("user-b", conv!, "user", "intip")).rejects.toBeInstanceOf(navi.ConversationNotFoundError);
    expect((await navi.loadDashboard("user-b")).messages).toEqual([]);
  });
});
