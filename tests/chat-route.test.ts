import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { migrationSql } from "./migrations";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// POST /api/chat with a mocked session: 401 without session, 404 for another user's conversation.
const dir = mkdtempSync(join(tmpdir(), "navi-chat-"));
const file = join(dir, "chat.db");
process.env.TURSO_DATABASE_URL = `file:${file}`;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.GEMINI_API_KEY;

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../lib/auth", () => ({ getSessionUser: async () => (session.userId ? { id: session.userId, email: `${session.userId}@test.dev` } : null) }));

const profile = { role: "Frontend Developer", level: "Baru mulai", hours: "6 jam per minggu", timeline: "3 bulan", preference: "Belajar lewat membangun proyek" };
let POST: typeof import("../app/api/chat/route").POST;
let navi: typeof import("../lib/db/navi");
let db: import("../lib/db/client").NaviDb;
const req = (body: unknown) => new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  const client = createClient({ url: `file:${file}` });
  await client.executeMultiple(migrationSql());
  for (const id of ["user-a", "user-b"]) await client.execute({ sql: `INSERT INTO "user"(id,name,email) VALUES (?,?,?)`, args: [id, id, `${id}@test.dev`] });
  client.close();
  navi = await import("../lib/db/navi");
  db = (await import("../lib/db/client")).getDb();
  await navi.seedInitialNaviData(db, "user-a", profile);
  await navi.seedInitialNaviData(db, "user-b", profile);
  ({ POST } = await import("../app/api/chat/route"));
});
afterAll(() => { db.$client.close(); rmSync(dir, { recursive: true, force: true }); });

describe("POST /api/chat", () => {
  it("returns 401 without a session", async () => {
    session.userId = null;
    expect((await POST(req({ message: "halo" }))).status).toBe(401);
  });

  it("returns 404 for another user's conversation and writes nothing", async () => {
    const conv = await navi.createConversation(db, "user-a");
    session.userId = "user-b";
    expect((await POST(req({ message: "halo", conversationId: conv }))).status).toBe(404);
    expect((await navi.loadDashboard(db, "user-a"))?.messages).toEqual([]);
  });

  it("works for the owner (fixture reply without Gemini key)", async () => {
    session.userId = "user-a";
    const conv = (await navi.loadDashboard(db, "user-a"))!.conversationId!;
    const res = await POST(req({ message: "halo", conversationId: conv }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("fixture");
    expect((await navi.loadDashboard(db, "user-a"))?.messages).toHaveLength(2);
  });
});
