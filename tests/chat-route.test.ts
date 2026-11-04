import { readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Exercises POST /api/chat with a mocked session: 401 without session, 404 for another user's conversation.
const file = join(tmpdir(), `navi-chat-test-${process.pid}.db`);
process.env.TURSO_DATABASE_URL = `file:${file}`;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.GEMINI_API_KEY;

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../lib/auth", () => ({
  requireUserId: async () => { if (!session.userId) throw new Error("unauthorized"); return session.userId; },
}));

const profile = { role: "Frontend Developer", level: "Baru mulai", hours: "6 jam per minggu", timeline: "3 bulan", preference: "Belajar lewat membangun proyek" };
let POST: typeof import("../app/api/chat/route").POST;
let navi: typeof import("../lib/server/navi");
const req = (body: unknown) => new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  rmSync(file, { force: true });
  const client = createClient({ url: `file:${file}` });
  await client.executeMultiple(readFileSync(join(__dirname, "../db/0000_init.sql"), "utf8"));
  for (const id of ["user-a", "user-b"]) await client.execute({ sql: `INSERT INTO "user"(id,name,email) VALUES (?,?,?)`, args: [id, id, `${id}@test.dev`] });
  client.close();
  navi = await import("../lib/server/navi");
  await navi.seedInitialNaviData("user-a", profile);
  await navi.seedInitialNaviData("user-b", profile);
  ({ POST } = await import("../app/api/chat/route"));
});

describe("POST /api/chat", () => {
  it("returns 401 without a session", async () => {
    session.userId = null;
    expect((await POST(req({ message: "halo" }))).status).toBe(401);
  });

  it("returns 404 for another user's conversation and writes nothing", async () => {
    const conv = await navi.getOrCreateConversation("user-a");
    session.userId = "user-b";
    const res = await POST(req({ message: "halo", conversationId: conv }));
    expect(res.status).toBe(404);
    expect((await navi.loadDashboard("user-a")).messages).toEqual([]);
  });

  it("works for the owner (fixture reply without Gemini key)", async () => {
    session.userId = "user-a";
    const conv = (await navi.loadDashboard("user-a")).conversationId;
    const res = await POST(req({ message: "halo", conversationId: conv }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("fixture");
    expect(json.conversationId).toBe(conv);
    expect((await navi.loadDashboard("user-a")).messages).toHaveLength(2);
  });
});
