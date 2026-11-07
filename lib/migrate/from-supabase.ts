/**
 * One-off Supabase → Turso copy for Navi.
 *
 * Passwords are never copied. Better Auth sign-in looks up an `account` row
 * with provider_id = credential and account_id = user.id, then verifies a
 * `salt:key` scrypt hash. A hash without that shape throws inside verify and
 * turns login into a 500. We store a well-formed hash of zeros so login fails
 * closed (401) and "lupa password" can replace it.
 *
 * Default is dry-run. A URL containing `morriztech` is refused unless the
 * process was started with `--apply` and ALLOW_PRODUCTION=1.
 */
import { createClient, type Client, type InArgs, type InStatement } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** 16-byte zero salt + 64-byte key. Not a Supabase bcrypt hash, and not a real scrypt digest. */
export const UNUSABLE_PASSWORD = `${"00".repeat(16)}:${"00".repeat(64)}`;

const LEVELS = {
  "Baru mulai": "beginner",
  "Sudah memahami dasar HTML & CSS": "beginner",
  "Pernah membuat beberapa proyek": "intermediate",
  "Sudah siap melamar": "advanced",
} as const;

const PROFILE_LABELS = new Set(["Target", "Waktu tersedia", "Cara belajar"]);
const MIGRATED_TABLES = [
  "user",
  "account",
  "profiles",
  "learning_plans",
  "plan_milestones",
  "plan_tasks",
  "memory_facts",
  "conversations",
  "chat_messages",
] as const;

export type SqlClient = Pick<Client, "execute" | "batch">;
export type Statement = { sql: string; args: (string | number | null)[] };

export type Skipped = {
  usersWithoutEmail: number;
  duplicateEmails: number;
  duplicateIds: number;
  orphanProfiles: number;
  orphanPlans: number;
  orphanMilestones: number;
  orphanTasks: number;
  orphanMemories: number;
  orphanConversations: number;
  orphanMessages: number;
  badRoles: number;
  incomplete: number;
};

export type MigrationPlan = {
  statements: Statement[];
  planned: Record<(typeof MIGRATED_TABLES)[number], number>;
  skipped: Skipped;
  passwordResetsRequired: number;
  demotedActivePlans: number;
};

type Loose = Record<string, unknown>;
type DbLevel = "beginner" | "intermediate" | "advanced";
type PlanStatus = "active" | "archived" | "completed";

const emptySkipped = (): Skipped => ({
  usersWithoutEmail: 0,
  duplicateEmails: 0,
  duplicateIds: 0,
  orphanProfiles: 0,
  orphanPlans: 0,
  orphanMilestones: 0,
  orphanTasks: 0,
  orphanMemories: 0,
  orphanConversations: 0,
  orphanMessages: 0,
  badRoles: 0,
  incomplete: 0,
});

function isRow(value: unknown): value is Loose {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function rows(source: Record<string, unknown>, ...keys: string[]): Loose[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value.filter(isRow);
  }
  return [];
}

function text(row: Loose, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function intIn(row: Loose, min: number, max: number, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isInteger(n) && n >= min && n <= max) return n;
  }
  return null;
}

export function unixSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function stamp(row: Loose, ...keys: string[]): number {
  return unixSeconds(text(row, ...keys)) ?? Math.floor(Date.now() / 1000);
}

/** Keep only the fields the mapper needs. Drops encrypted_password and any other auth secret. */
export function scrubAuthUser(raw: unknown): Loose {
  if (!isRow(raw)) return {};
  const meta = isRow(raw.user_metadata) ? raw.user_metadata : {};
  return {
    id: raw.id,
    email: raw.email,
    email_confirmed_at: raw.email_confirmed_at,
    created_at: raw.created_at,
    user_metadata: {
      name: meta.name,
      full_name: meta.full_name,
      display_name: meta.display_name,
    },
  };
}

function mapLevel(label: string | null): { level: DbLevel; skills: string | null } {
  if (label === "beginner" || label === "intermediate" || label === "advanced") return { level: label, skills: null };
  const level = (label && LEVELS[label as keyof typeof LEVELS]) || "beginner";
  return { level, skills: label ? JSON.stringify([`level:${label}`]) : null };
}

function mapStatus(status: string | null): PlanStatus {
  if (status === "active" || status === "completed") return status;
  return "archived";
}

function parseWeeks(label: string | null): { start: number | null; end: number | null } {
  if (!label) return { start: null, end: null };
  const range = label.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };
  const one = label.match(/(\d+)/);
  return one ? { start: Number(one[1]), end: Number(one[1]) } : { start: null, end: null };
}

type PlannedUser = { id: string; name: string; email: string; verified: number; created: number };
type PlannedPlan = { id: string; userId: string; title: string; summary: string; status: PlanStatus; created: number; updated: number };

export function planSupabaseMigration(input: Record<string, unknown>): MigrationPlan {
  const skipped = emptySkipped();
  const statements: Statement[] = [];
  const seenIds = new Set<string>();
  const claim = (id: string) => {
    if (seenIds.has(id)) {
      skipped.duplicateIds += 1;
      return false;
    }
    seenIds.add(id);
    return true;
  };

  const authUsers = rows(input, "users").map(scrubAuthUser);
  const profiles = rows(input, "profiles");
  const profileByUser = new Map<string, Loose>();
  for (const profile of profiles) {
    const id = text(profile, "id", "user_id");
    if (id && !profileByUser.has(id)) profileByUser.set(id, profile);
  }

  const users: PlannedUser[] = [];
  const emails = new Set<string>();
  for (const raw of authUsers) {
    const id = text(raw, "id");
    const email = text(raw, "email")?.toLowerCase() ?? null;
    if (!id || !email || !email.includes("@")) {
      skipped.usersWithoutEmail += 1;
      continue;
    }
    if (emails.has(email)) {
      skipped.duplicateEmails += 1;
      continue;
    }
    if (!claim(id)) continue;
    emails.add(email);
    const meta = isRow(raw.user_metadata) ? raw.user_metadata : {};
    const profile = profileByUser.get(id);
    const name = (profile && text(profile, "display_name"))
      || text(meta, "display_name", "full_name", "name")
      || email.split("@")[0]
      || "Pengguna Navi";
    users.push({
      id,
      name: name.slice(0, 120),
      email,
      verified: text(raw, "email_confirmed_at") ? 1 : 0,
      created: stamp(raw, "created_at"),
    });
  }
  const userIds = new Set(users.map((user) => user.id));

  for (const user of users) {
    statements.push({
      sql: `INSERT OR IGNORE INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [user.id, user.name, user.email, user.verified, user.created, user.created],
    });
    statements.push({
      sql: `INSERT OR IGNORE INTO "account" (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (?, ?, ?, 'credential', ?, ?, ?)`,
      args: [`cred:${user.id}`, user.id, user.id, UNUSABLE_PASSWORD, user.created, user.created],
    });
  }

  let profileCount = 0;
  for (const profile of profiles) {
    const userId = text(profile, "id", "user_id");
    if (!userId || !userIds.has(userId)) {
      skipped.orphanProfiles += 1;
      continue;
    }
    const level = mapLevel(text(profile, "current_level"));
    const created = stamp(profile, "created_at");
    profileCount += 1;
    statements.push({
      sql: `INSERT OR IGNORE INTO profiles (user_id, display_name, target_role, current_level, weekly_hours, target_months, learning_preference, skills, timezone, reminders_enabled, onboarded_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Asia/Jakarta', 0, ?, ?, ?)`,
      args: [
        userId,
        text(profile, "display_name"),
        text(profile, "target_role"),
        level.level,
        intIn(profile, 1, 168, "weekly_hours"),
        intIn(profile, 1, 60, "target_months"),
        text(profile, "learning_preference"),
        level.skills,
        created,
        created,
        stamp(profile, "updated_at", "created_at"),
      ],
    });
  }

  const rawPlans = rows(input, "plans", "learning_plans");
  const plans: PlannedPlan[] = [];
  for (const plan of rawPlans) {
    const id = text(plan, "id");
    const userId = text(plan, "user_id");
    if (!id || !userId || !userIds.has(userId)) {
      skipped.orphanPlans += 1;
      continue;
    }
    if (!claim(id)) continue;
    const hours = intIn(plan, 1, 168, "weekly_hours");
    plans.push({
      id,
      userId,
      title: text(plan, "title") || text(plan, "target_role") || "Rencana belajar",
      summary: `Migrasi Supabase · ${hours ?? 0} jam/minggu`,
      status: mapStatus(text(plan, "status")),
      created: stamp(plan, "created_at"),
      updated: stamp(plan, "updated_at", "created_at"),
    });
  }

  let demotedActivePlans = 0;
  const byUser = new Map<string, PlannedPlan[]>();
  for (const plan of plans) {
    const list = byUser.get(plan.userId) ?? [];
    list.push(plan);
    byUser.set(plan.userId, list);
  }
  for (const list of byUser.values()) {
    const active = list.filter((plan) => plan.status === "active").sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
    for (const plan of active.slice(1)) {
      plan.status = "archived";
      demotedActivePlans += 1;
    }
  }
  for (const plan of plans) {
    statements.push({
      sql: `INSERT OR IGNORE INTO learning_plans (id, user_id, title, summary, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'template', ?, ?, ?)`,
      args: [plan.id, plan.userId, plan.title, plan.summary, plan.status, plan.created, plan.updated],
    });
  }
  const planOwner = new Map(plans.map((plan) => [plan.id, plan.userId]));

  const milestones = rows(input, "milestones", "plan_milestones");
  const milestoneOwner = new Map<string, string>();
  let milestoneCount = 0;
  for (const milestone of milestones) {
    const id = text(milestone, "id");
    const planId = text(milestone, "plan_id");
    const userId = planId ? planOwner.get(planId) : undefined;
    const position = intIn(milestone, 0, 1000, "position");
    if (!id || !planId || !userId || position === null || !text(milestone, "title")) {
      skipped.orphanMilestones += 1;
      continue;
    }
    if (!claim(id)) continue;
    const weeks = parseWeeks(text(milestone, "range_label"));
    milestoneOwner.set(id, userId);
    milestoneCount += 1;
    statements.push({
      sql: `INSERT OR IGNORE INTO plan_milestones (id, user_id, plan_id, position, title, description, week_start, week_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, userId, planId, position, text(milestone, "title"), text(milestone, "description"), weeks.start, weeks.end, stamp(milestone, "created_at")],
    });
  }

  let taskCount = 0;
  for (const task of rows(input, "tasks", "plan_tasks")) {
    const id = text(task, "id");
    const milestoneId = text(task, "milestone_id");
    const userId = milestoneId ? milestoneOwner.get(milestoneId) : undefined;
    const position = intIn(task, 0, 1000, "position");
    if (!id || !milestoneId || !userId || position === null || !text(task, "title")) {
      skipped.orphanTasks += 1;
      continue;
    }
    if (!claim(id)) continue;
    const completed = unixSeconds(text(task, "completed_at"))
      ?? ((text(task, "status") === "completed" || task.completed === true) ? stamp(task, "created_at") : null);
    taskCount += 1;
    statements.push({
      sql: `INSERT OR IGNORE INTO plan_tasks (id, user_id, milestone_id, position, title, description, estimated_minutes, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, userId, milestoneId, position, text(task, "title"), text(task, "description"), intIn(task, 1, 1440, "estimated_minutes"), completed, stamp(task, "created_at")],
    });
  }

  let memoryCount = 0;
  for (const memory of rows(input, "memories", "memory_facts")) {
    const id = text(memory, "id");
    const userId = text(memory, "user_id");
    const label = text(memory, "label");
    const value = text(memory, "value");
    if (!id || !userId || !userIds.has(userId) || !label || !value) {
      skipped.orphanMemories += 1;
      continue;
    }
    if (!claim(id)) continue;
    const category = text(memory, "category") === "profile" || PROFILE_LABELS.has(label) ? "profile" : "note";
    memoryCount += 1;
    statements.push({
      sql: `INSERT OR IGNORE INTO memory_facts (id, user_id, content, category, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      args: [id, userId, JSON.stringify({ label, value, reason: text(memory, "reason") ?? "" }), category, stamp(memory, "created_at"), stamp(memory, "updated_at", "created_at")],
    });
  }

  const conversations = rows(input, "conversations");
  const conversationOwner = new Map<string, string>();
  let conversationCount = 0;
  for (const conversation of conversations) {
    const id = text(conversation, "id");
    const userId = text(conversation, "user_id");
    if (!id || !userId || !userIds.has(userId)) {
      skipped.orphanConversations += 1;
      continue;
    }
    if (!claim(id)) continue;
    conversationOwner.set(id, userId);
    conversationCount += 1;
    statements.push({
      sql: `INSERT OR IGNORE INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [id, userId, text(conversation, "title"), stamp(conversation, "created_at"), stamp(conversation, "updated_at", "created_at")],
    });
  }

  let messageCount = 0;
  for (const message of rows(input, "messages", "chat_messages")) {
    const id = text(message, "id");
    const conversationId = text(message, "conversation_id");
    const userId = conversationId ? conversationOwner.get(conversationId) : undefined;
    const role = text(message, "role");
    const content = text(message, "content");
    if (!id || !conversationId || !userId || !content) {
      skipped.orphanMessages += 1;
      continue;
    }
    if (role !== "user" && role !== "assistant") {
      skipped.badRoles += 1;
      continue;
    }
    if (!claim(id)) continue;
    messageCount += 1;
    statements.push({
      sql: `INSERT OR IGNORE INTO chat_messages (id, user_id, conversation_id, role, content, source, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      args: [id, userId, conversationId, role, content, stamp(message, "created_at")],
    });
  }

  return {
    statements,
    planned: {
      user: users.length,
      account: users.length,
      profiles: profileCount,
      learning_plans: plans.length,
      plan_milestones: milestoneCount,
      plan_tasks: taskCount,
      memory_facts: memoryCount,
      conversations: conversationCount,
      chat_messages: messageCount,
    },
    skipped,
    passwordResetsRequired: users.length,
    demotedActivePlans,
  };
}

const QUOTED: Record<string, string> = {
  user: '"user"',
  account: '"account"',
  profiles: "profiles",
  learning_plans: "learning_plans",
  plan_milestones: "plan_milestones",
  plan_tasks: "plan_tasks",
  memory_facts: "memory_facts",
  conversations: "conversations",
  chat_messages: "chat_messages",
};

export async function countTables(client: SqlClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of MIGRATED_TABLES) {
    const result = await client.execute(`SELECT COUNT(*) AS n FROM ${QUOTED[table]}`);
    counts[table] = Number(result.rows[0]?.n ?? 0);
  }
  return counts;
}

export async function applyMigration(client: SqlClient, plan: MigrationPlan) {
  await client.execute("PRAGMA foreign_keys = ON");
  const before = await countTables(client);
  const chunkSize = 200;
  for (let index = 0; index < plan.statements.length; index += chunkSize) {
    const chunk: InStatement[] = plan.statements.slice(index, index + chunkSize).map((statement) => ({
      sql: statement.sql,
      args: statement.args as InArgs,
    }));
    await client.batch(chunk, "write");
  }
  const after = await countTables(client);
  const inserted: Record<string, number> = {};
  for (const table of MIGRATED_TABLES) inserted[table] = after[table] - before[table];
  return { before, after, inserted };
}

/** Refuse the live Turso database unless this run is an explicit production apply. */
export function assertSafeTarget(url: string, opts: { apply: boolean; allowProduction: boolean }) {
  if (!/morriztech/i.test(url)) return;
  if (opts.apply && opts.allowProduction) return;
  throw new Error("Target berisi morriztech. Skrip tidak menyentuh database produksi tanpa --apply dan ALLOW_PRODUCTION=1.");
}

const SKIP_LABELS: Record<keyof Skipped, string> = {
  usersWithoutEmail: "user tanpa email",
  duplicateEmails: "email duplikat",
  duplicateIds: "id duplikat",
  orphanProfiles: "profil tanpa user",
  orphanPlans: "rencana tanpa user",
  orphanMilestones: "milestone tanpa rencana",
  orphanTasks: "tugas tanpa milestone",
  orphanMemories: "memori tanpa user",
  orphanConversations: "percakapan tanpa user",
  orphanMessages: "pesan tanpa percakapan",
  badRoles: "peran pesan tidak dikenal",
  incomplete: "baris tidak lengkap",
};

function printPlan(plan: MigrationPlan) {
  const planned = Object.entries(plan.planned).map(([table, count]) => `${count} ${table}`).join(", ");
  console.log(`Rencana tulis: ${planned}.`);
  console.log(`${plan.passwordResetsRequired} pengguna perlu mengatur ulang password. Password lama tidak disalin.`);
  if (plan.demotedActivePlans) console.log(`${plan.demotedActivePlans} rencana aktif lama diarsipkan agar tiap pengguna punya satu rencana aktif.`);
  const skips = (Object.keys(SKIP_LABELS) as (keyof Skipped)[])
    .filter((key) => plan.skipped[key] > 0)
    .map((key) => `${plan.skipped[key]} ${SKIP_LABELS[key]}`);
  if (skips.length) console.log(`Dilewati: ${skips.join(", ")}.`);
}

async function loadDump(dumpPath: string | undefined): Promise<Record<string, unknown>> {
  if (dumpPath) {
    const parsed: unknown = JSON.parse(readFileSync(dumpPath, "utf8"));
    if (!isRow(parsed)) throw new Error("File dump harus berupa objek JSON.");
    return parsed;
  }
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY, atau berikan --dump file.json.");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("SUPABASE_URL tidak valid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("SUPABASE_URL harus http atau https.");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const users = await fetchUsers(url, headers);
  const [profiles, plans, milestones, tasks, memories, conversations, messages] = await Promise.all([
    fetchTable(url, headers, "profiles"),
    fetchTable(url, headers, "learning_plans"),
    fetchTable(url, headers, "plan_milestones"),
    fetchTable(url, headers, "plan_tasks"),
    fetchTable(url, headers, "memory_facts"),
    fetchTable(url, headers, "conversations"),
    fetchTable(url, headers, "chat_messages"),
  ]);
  return { users, profiles, plans, milestones, tasks, memories, conversations, messages };
}

async function fetchTable(base: URL, headers: Record<string, string>, table: string): Promise<Loose[]> {
  const pageSize = 1000;
  const rowsOut: Loose[] = [];
  let firstId = "";
  for (let page = 0; page < 500; page += 1) {
    const from = page * pageSize;
    const endpoint = new URL(`/rest/v1/${table}`, base);
    endpoint.searchParams.set("select", "*");
    const response = await request(endpoint, {
      ...headers,
      Range: `${from}-${from + pageSize - 1}`,
      Accept: "application/json",
    }, table);
    const batch = await jsonRows(response, table);
    if (!batch.length) break;
    const id = text(batch[0], "id") ?? "";
    if (page > 0 && id && id === firstId) break;
    if (!firstId) firstId = id;
    rowsOut.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rowsOut;
}

async function fetchUsers(base: URL, headers: Record<string, string>): Promise<Loose[]> {
  const pageSize = 200;
  const users: Loose[] = [];
  let firstId = "";
  for (let page = 1; page <= 500; page += 1) {
    const endpoint = new URL("/auth/v1/admin/users", base);
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", String(pageSize));
    const response = await request(endpoint, { ...headers, Accept: "application/json" }, "auth.users");
    const payload: unknown = await response.json();
    const batch = (isRow(payload) && Array.isArray(payload.users) ? payload.users : []).filter(isRow).map(scrubAuthUser);
    if (!batch.length) break;
    const id = text(batch[0], "id") ?? "";
    if (page > 1 && id && id === firstId) break;
    if (!firstId) firstId = id;
    users.push(...batch);
    if (batch.length < pageSize) break;
  }
  return users;
}

async function request(url: URL, headers: Record<string, string>, label: string) {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error(`Tidak dapat menghubungi Supabase (${label}).`);
  }
  if (!response.ok) throw new Error(`Supabase ${label} gagal: HTTP ${response.status}.`);
  return response;
}

async function jsonRows(response: Response, label: string): Promise<Loose[]> {
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error(`Supabase ${label} tidak mengembalikan daftar.`);
  return payload.filter(isRow);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dumpFlag = process.argv.indexOf("--dump");
  const dumpPath = dumpFlag >= 0 ? process.argv[dumpFlag + 1] : undefined;
  if (dumpFlag >= 0 && !dumpPath) throw new Error("Argumen --dump membutuhkan path file JSON.");
  const plan = planSupabaseMigration(await loadDump(dumpPath));
  printPlan(plan);
  if (!apply) {
    console.log("Dry-run. Tidak ada baris yang ditulis.");
    return;
  }
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL wajib diisi saat --apply.");
  const allowProduction = process.env.ALLOW_PRODUCTION === "1";
  assertSafeTarget(url, { apply: true, allowProduction });
  const fileDb = url.startsWith("file:") || url.startsWith(":memory:");
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!fileDb && !authToken) throw new Error("TURSO_AUTH_TOKEN wajib diisi untuk database remote.");
  const client = createClient({ url, authToken: authToken || undefined });
  try {
    const result = await applyMigration(client, plan);
    console.log(`Sebelum: ${formatCounts(result.before)}.`);
    console.log(`Sesudah: ${formatCounts(result.after)}.`);
    console.log(`Ditulis kali ini: ${formatCounts(result.inserted)}.`);
  } finally {
    client.close();
  }
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts).map(([table, count]) => `${count} ${table}`).join(", ");
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isCliEntry()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Migrasi gagal.");
    process.exit(1);
  });
}
