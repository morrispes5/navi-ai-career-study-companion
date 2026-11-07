import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPassword } from "@better-auth/utils/password";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type NaviDb } from "../lib/db/client";
import { UNUSABLE_PASSWORD, applyMigration, assertSafeTarget, planSupabaseMigration, scrubAuthUser } from "../lib/migrate/from-supabase";
import { migrationSql, removeTempDir } from "./migrations";

const SECRET_HASH = "supabase-secret-hash-$2a$should-not-appear";
let dir: string;
let db: NaviDb;

const dump = {
  users: [
    {
      id: "alice",
      email: "Alice@Example.com",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      encrypted_password: SECRET_HASH,
      user_metadata: { full_name: "Dari Meta", password: SECRET_HASH },
    },
    { id: "bob", email: "bob@example.com", created_at: "2026-02-01T00:00:00Z", user_metadata: { name: "Budi" }, encrypted_password: SECRET_HASH },
    { id: "ghost", email: "", encrypted_password: SECRET_HASH },
    { id: "dup", email: "alice@example.com", encrypted_password: SECRET_HASH },
  ],
  profiles: [
    {
      id: "alice",
      display_name: "Sari",
      target_role: "Frontend Developer",
      current_level: "Baru mulai",
      weekly_hours: 6,
      target_months: 3,
      learning_preference: "Belajar lewat membangun proyek",
      created_at: "2026-01-02T00:00:00Z",
    },
    { id: "bob", display_name: "Budi", target_role: "Data Analyst", current_level: "intermediate", weekly_hours: 4, target_months: 2, learning_preference: "Membaca" },
    { id: "missing-user", display_name: "Orphan", target_role: "Data Analyst", current_level: "advanced", weekly_hours: 4, learning_preference: "Membaca" },
  ],
  plans: [
    { id: "plan-old", user_id: "alice", title: "Lama", target_role: "Frontend Developer", weekly_hours: 6, status: "active", created_at: "2026-01-01T00:00:00Z" },
    { id: "plan-new", user_id: "alice", title: "Baru", weekly_hours: 6, status: "active", created_at: "2026-06-01T00:00:00Z" },
    { id: "plan-done", user_id: "alice", title: "Selesai", status: "completed", created_at: "2026-03-01T00:00:00Z" },
    { id: "plan-paused", user_id: "alice", title: "Jeda", status: "paused", created_at: "2026-04-01T00:00:00Z" },
    { id: "plan-draft", user_id: "alice", title: "Draf", status: "draft", created_at: "2026-04-02T00:00:00Z" },
    { id: "plan-orphan", user_id: "nobody", title: "Hilang", status: "active" },
  ],
  milestones: [
    { id: "ms-1", plan_id: "plan-new", position: 0, title: "Fondasi", description: "Dasar", range_label: "Minggu 1-3", created_at: "2026-06-01T00:00:00Z" },
    { id: "ms-orphan", plan_id: "missing-plan", position: 0, title: "Hilang", description: "Tidak" },
  ],
  tasks: [
    { id: "task-at", milestone_id: "ms-1", position: 0, title: "Sudah tanggal", status: "completed", completed_at: "2026-05-01T00:00:00Z", estimated_minutes: 30, created_at: "2026-04-01T00:00:00Z" },
    { id: "task-status", milestone_id: "ms-1", position: 1, title: "Sudah status", status: "completed", created_at: "2026-04-02T00:00:00Z" },
    { id: "task-open", milestone_id: "ms-1", position: 2, title: "Belum", status: "not_started", estimated_minutes: 45, created_at: "2026-04-03T00:00:00Z" },
    { id: "task-orphan", milestone_id: "missing-ms", position: 0, title: "Yatim", status: "completed" },
  ],
  memories: [
    { id: "mem-note", user_id: "alice", label: "Catatan", value: "Suka proyek", reason: "Praktik", category: "note", created_at: "2026-02-01T00:00:00Z" },
    { id: "mem-profile", user_id: "alice", label: "Target", value: "Frontend", reason: "Karier", category: "note" },
    { id: "mem-orphan", user_id: "nobody", label: "X", value: "Y", reason: "Z" },
  ],
  conversations: [
    { id: "conv-1", user_id: "alice", title: "Mulai", created_at: "2026-02-02T00:00:00Z" },
    { id: "conv-orphan", user_id: "nobody", title: "Bukan" },
  ],
  messages: [
    { id: "msg-1", conversation_id: "conv-1", role: "assistant", content: "Langkah berikutnya.", created_at: "2026-02-02T00:00:00Z" },
    { id: "msg-bad", conversation_id: "conv-1", role: "system", content: "rahasia internal" },
    { id: "msg-orphan", conversation_id: "missing-conv", role: "user", content: "halo" },
  ],
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "navi-migrate-"));
  db = createDb(`file:${join(dir, "test.db")}`);
  await db.$client.executeMultiple(migrationSql());
});
afterAll(() => { db.$client.close(); removeTempDir(dir); });

describe("supabase to turso migration", () => {
  it("drops password material when scrubbing an auth user", () => {
    const clean = scrubAuthUser(dump.users[0]);
    expect(JSON.stringify(clean)).not.toContain(SECRET_HASH);
    expect(clean).not.toHaveProperty("encrypted_password");
  });

  it("refuses the production database unless apply and ALLOW_PRODUCTION are both set", () => {
    const live = "libsql://morriztech-kenzyplay.aws-ap-southeast-1.turso.io";
    expect(() => assertSafeTarget(live, { apply: true, allowProduction: false })).toThrow(/morriztech/);
    expect(() => assertSafeTarget(live, { apply: false, allowProduction: true })).toThrow(/morriztech/);
    expect(() => assertSafeTarget(live, { apply: true, allowProduction: true })).not.toThrow();
    expect(() => assertSafeTarget("file:migrate.db", { apply: true, allowProduction: false })).not.toThrow();
  });

  it("plans one active plan, an unusable credential, and no copied secret", () => {
    const plan = planSupabaseMigration(dump);
    const packed = JSON.stringify(plan.statements);
    expect(packed).not.toContain(SECRET_HASH);
    expect(packed).not.toContain("encrypted_password");
    expect(plan.passwordResetsRequired).toBe(2);
    expect(plan.demotedActivePlans).toBe(1);
    expect(plan.planned).toMatchObject({
      user: 2,
      account: 2,
      profiles: 2,
      learning_plans: 5,
      plan_milestones: 1,
      plan_tasks: 3,
      memory_facts: 2,
      conversations: 1,
      chat_messages: 1,
    });
    expect(plan.skipped).toMatchObject({
      usersWithoutEmail: 1,
      duplicateEmails: 1,
      orphanProfiles: 1,
      orphanPlans: 1,
      orphanMilestones: 1,
      orphanTasks: 1,
      orphanMemories: 1,
      orphanConversations: 1,
      orphanMessages: 1,
      badRoles: 1,
    });
    const account = plan.statements.find((statement) => statement.sql.includes('INTO "account"') && statement.args[1] === "alice");
    expect(account?.args[2]).toBe("alice");
    expect(account?.args[3]).toBe(UNUSABLE_PASSWORD);
  });

  it("is idempotent, isolates users, and verifies row counts", async () => {
    const plan = planSupabaseMigration(dump);
    const first = await applyMigration(db.$client, plan);
    expect(first.inserted).toEqual(plan.planned);
    expect(first.after.user - first.before.user).toBe(2);

    const second = await applyMigration(db.$client, plan);
    expect(second.inserted).toEqual({
      user: 0, account: 0, profiles: 0, learning_plans: 0, plan_milestones: 0, plan_tasks: 0, memory_facts: 0, conversations: 0, chat_messages: 0,
    });
    expect(second.after).toEqual(first.after);

    const passwords = await db.$client.execute("SELECT password FROM account");
    expect(passwords.rows.map((row) => row.password)).toEqual([UNUSABLE_PASSWORD, UNUSABLE_PASSWORD]);
    expect(await verifyPassword(UNUSABLE_PASSWORD, "rahasia-navi")).toBe(false);

    const profile = await db.$client.execute("SELECT display_name, current_level, skills, email FROM profiles JOIN \"user\" ON \"user\".id = profiles.user_id WHERE profiles.user_id = 'alice'");
    expect(profile.rows[0]).toMatchObject({ display_name: "Sari", current_level: "beginner", email: "alice@example.com" });
    expect(String(profile.rows[0].skills)).toContain("level:Baru mulai");

    const plans = await db.$client.execute("SELECT id, status FROM learning_plans WHERE user_id = 'alice' ORDER BY id");
    expect(Object.fromEntries(plans.rows.map((row) => [row.id, row.status]))).toEqual({
      "plan-done": "completed",
      "plan-draft": "archived",
      "plan-new": "active",
      "plan-old": "archived",
      "plan-paused": "archived",
    });
    const bobPlans = await db.$client.execute("SELECT COUNT(*) AS n FROM learning_plans WHERE user_id = 'bob'");
    expect(Number(bobPlans.rows[0].n)).toBe(0);
    const bobProfile = await db.$client.execute("SELECT current_level, skills FROM profiles WHERE user_id = 'bob'");
    expect(bobProfile.rows[0].current_level).toBe("intermediate");
    expect(bobProfile.rows[0].skills).toBeNull();

    const tasks = await db.$client.execute("SELECT id, user_id, completed_at FROM plan_tasks ORDER BY position");
    expect(tasks.rows.map((row) => row.user_id)).toEqual(["alice", "alice", "alice"]);
    expect(tasks.rows[0].completed_at).toBe(Math.floor(Date.parse("2026-05-01T00:00:00Z") / 1000));
    expect(tasks.rows[1].completed_at).toBe(Math.floor(Date.parse("2026-04-02T00:00:00Z") / 1000));
    expect(tasks.rows[2].completed_at).toBeNull();

    const memory = await db.$client.execute("SELECT category, content FROM memory_facts WHERE id = 'mem-profile'");
    expect(memory.rows[0].category).toBe("profile");
    expect(JSON.parse(String(memory.rows[0].content))).toEqual({ label: "Target", value: "Frontend", reason: "Karier" });

    const message = await db.$client.execute("SELECT user_id, role, content FROM chat_messages");
    expect(message.rows).toEqual([{ user_id: "alice", role: "assistant", content: "Langkah berikutnya." }]);

    const weeks = await db.$client.execute("SELECT week_start, week_end FROM plan_milestones WHERE id = 'ms-1'");
    expect(weeks.rows[0]).toMatchObject({ week_start: 1, week_end: 3 });
  });
});
