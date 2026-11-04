import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { buildPlanTemplate, rangeLabel } from "../navi/templates";
import type { DashboardData, NaviMemory, NaviProfile } from "../navi/types";

/**
 * Server-side data layer. EVERY function takes the authenticated userId and
 * EVERY query filters by user_id. Never call these with a client-supplied id.
 */
const { profiles, learningPlans, planMilestones, planTasks, memoryFacts, conversations, chatMessages } = schema;

export class MissingNaviProfileError extends Error { constructor() { super("Profil Navi belum dibuat."); this.name = "MissingNaviProfileError"; } }

export class ConversationNotFoundError extends Error { constructor() { super("Percakapan tidak ditemukan."); this.name = "ConversationNotFoundError"; } }

// ---------- profile mapping ----------
// DB enum is beginner|intermediate|advanced; the exact UI label is kept in skills as "level:<label>".
const LEVEL_MAP: Record<string, "beginner" | "intermediate" | "advanced"> = {
  "Baru mulai": "beginner",
  "Sudah memahami dasar HTML & CSS": "beginner",
  "Pernah membuat beberapa proyek": "intermediate",
  "Sudah siap melamar": "advanced",
};
const LEVEL_FALLBACK = { beginner: "Baru mulai", intermediate: "Pernah membuat beberapa proyek", advanced: "Sudah siap melamar" } as const;
const numberFromLabel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0) || null;

function toDbProfile(profile: NaviProfile) {
  const weeklyHours = numberFromLabel(profile.hours);
  if (!weeklyHours) throw new Error("Waktu belajar tidak valid.");
  return {
    targetRole: profile.role,
    currentLevel: LEVEL_MAP[profile.level] ?? "beginner",
    weeklyHours,
    targetMonths: numberFromLabel(profile.timeline),
    learningPreference: profile.preference,
    skills: [`level:${profile.level}`],
  };
}

type ProfileRow = typeof profiles.$inferSelect;
function toViewProfile(row: ProfileRow): NaviProfile {
  const levelLabel = row.skills?.find((item) => item.startsWith("level:"))?.slice(6);
  return {
    role: row.targetRole ?? "",
    level: levelLabel ?? LEVEL_FALLBACK[row.currentLevel ?? "beginner"],
    hours: `${row.weeklyHours ?? 0} jam per minggu`,
    timeline: row.targetMonths ? `${row.targetMonths} bulan` : "Belum pasti",
    preference: row.learningPreference ?? "",
  };
}

export async function getProfile(userId: string): Promise<NaviProfile | null> {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ? toViewProfile(row) : null;
}

export async function getProfileRow(userId: string) {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ?? null;
}

async function upsertProfile(db: DbOrTx, userId: string, profile: NaviProfile) {
  const values = toDbProfile(profile);
  await db.insert(profiles).values({ userId, ...values, onboardedAt: new Date() })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...values, updatedAt: new Date() } });
}

// ---------- plans ----------
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

async function createPlanForUser(db: DbOrTx, userId: string, profile: NaviProfile) {
  const weeklyHours = toDbProfile(profile).weeklyHours;
  const [plan] = await db.insert(learningPlans).values({ userId, title: `Jalur ${profile.role}`, summary: `Template v1 · ${weeklyHours} jam/minggu`, source: "template", status: "active" }).returning({ id: learningPlans.id });
  const template = buildPlanTemplate(profile);
  for (const [position, milestone] of template.entries()) {
    const [row] = await db.insert(planMilestones).values({ userId, planId: plan.id, position, title: milestone.title, description: milestone.description }).returning({ id: planMilestones.id });
    if (milestone.tasks.length) {
      await db.insert(planTasks).values(milestone.tasks.map((task, taskPosition) => ({ userId, milestoneId: row.id, position: taskPosition, title: task.title, estimatedMinutes: task.minutes })));
    }
  }
  return plan.id;
}

async function archiveActivePlans(db: DbOrTx, userId: string) {
  await db.update(learningPlans).set({ status: "archived", updatedAt: new Date() }).where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active")));
}

async function getActivePlan(userId: string) {
  const [plan] = await getDb().select({ id: learningPlans.id, title: learningPlans.title }).from(learningPlans)
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active"))).orderBy(desc(learningPlans.createdAt)).limit(1);
  return plan ?? null;
}

async function planNeedsUpgrade(userId: string, planId: string) {
  const db = getDb();
  const milestones = await db.select({ id: planMilestones.id }).from(planMilestones).where(and(eq(planMilestones.userId, userId), eq(planMilestones.planId, planId)));
  if (!milestones.length) return true;
  const tasks = await db.select({ id: planTasks.id }).from(planTasks).where(and(eq(planTasks.userId, userId), inArray(planTasks.milestoneId, milestones.map((m) => m.id))));
  return tasks.length < 12;
}

/** Saves onboarding answers and makes sure an up-to-date active plan exists. Idempotent. */
export async function seedInitialNaviData(userId: string, profile: NaviProfile) {
  const db = getDb();
  await upsertProfile(db, userId, profile);
  const current = await getActivePlan(userId);
  if (current && !(await planNeedsUpgrade(userId, current.id))) return current.id;
  // Archive + create atomically so a failure never leaves the user without an active plan.
  return db.transaction(async (tx) => {
    if (current) await archiveActivePlans(tx, userId);
    return createPlanForUser(tx, userId, profile);
  });
}

// ---------- memory ----------
type MemoryContent = { label: string; value: string; reason: string };
function parseMemory(content: string): MemoryContent {
  try { const v = JSON.parse(content) as Partial<MemoryContent>; return { label: v.label ?? "", value: v.value ?? "", reason: v.reason ?? "" }; }
  catch { return { label: "Catatan", value: content, reason: "" }; }
}
function toViewMemory(row: typeof memoryFacts.$inferSelect): NaviMemory {
  return { id: row.id, ...parseMemory(row.content), category: row.category === "profile" ? "profile" : "note" };
}

export async function listMemories(userId: string, onlyNotes = false, limit?: number) {
  const where = onlyNotes ? and(eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note")) : eq(memoryFacts.userId, userId);
  const query = getDb().select().from(memoryFacts).where(where).orderBy(asc(memoryFacts.createdAt));
  const rows = limit ? await query.limit(limit) : await query;
  return rows.map(toViewMemory);
}

export async function createMemory(userId: string, input: MemoryContent) {
  const [row] = await getDb().insert(memoryFacts).values({ userId, content: JSON.stringify(input), category: "note" }).returning();
  return toViewMemory(row);
}

export async function updateMemory(userId: string, id: string, input: MemoryContent) {
  const [row] = await getDb().update(memoryFacts).set({ content: JSON.stringify(input), updatedAt: new Date() })
    .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note"))).returning();
  if (!row) throw new Error("Memori tidak ditemukan.");
  return toViewMemory(row);
}

export async function removeMemory(userId: string, id: string) {
  await getDb().delete(memoryFacts).where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note")));
}

export async function clearMemories(userId: string) {
  await getDb().delete(memoryFacts).where(and(eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note")));
}

// ---------- tasks ----------
export async function completeTask(userId: string, taskId: string) {
  const [row] = await getDb().update(planTasks).set({ completedAt: new Date() })
    .where(and(eq(planTasks.id, taskId), eq(planTasks.userId, userId), isNull(planTasks.completedAt))).returning({ id: planTasks.id });
  return Boolean(row);
}

// ---------- conversations / chat ----------
export async function getOrCreateConversation(userId: string, conversationId?: string) {
  const db = getDb();
  if (conversationId) {
    const [row] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
    return row?.id ?? null;
  }
  const [row] = await db.insert(conversations).values({ userId, title: "Diskusi dengan Navi" }).returning({ id: conversations.id });
  return row.id;
}

export async function addChatMessage(userId: string, conversationId: string, role: "user" | "assistant", content: string, source?: "gemini" | "fixture") {
  const db = getDb();
  // Verify ownership here too, so callers can't accidentally write into another user's conversation.
  const [owned] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  if (!owned) throw new ConversationNotFoundError();
  await db.insert(chatMessages).values({ userId, conversationId, role, content, source });
  await db.update(conversations).set({ updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

export async function getActivePlanSummary(userId: string) {
  return getActivePlan(userId);
}

// ---------- dashboard ----------
export async function loadDashboard(userId: string): Promise<DashboardData> {
  const db = getDb();
  const profileRow = await getProfileRow(userId);
  if (!profileRow) throw new MissingNaviProfileError();
  const profile = toViewProfile(profileRow);

  let plan = await getActivePlan(userId);
  if (!plan || await planNeedsUpgrade(userId, plan.id)) {
    await seedInitialNaviData(userId, profile);
    plan = await getActivePlan(userId);
    if (!plan) throw new Error("Rencana belum tersedia.");
  }

  const milestoneRows = await db.select().from(planMilestones).where(and(eq(planMilestones.userId, userId), eq(planMilestones.planId, plan.id))).orderBy(asc(planMilestones.position));
  const milestoneIds = milestoneRows.map((m) => m.id);
  const taskRows = milestoneIds.length
    ? await db.select().from(planTasks).where(and(eq(planTasks.userId, userId), inArray(planTasks.milestoneId, milestoneIds))).orderBy(asc(planTasks.position))
    : [];

  // Task descriptions/keys are not stored in the Turso schema; recover them from the template by title.
  const templateTasks = new Map(buildPlanTemplate(profile).flatMap((m) => m.tasks).map((t) => [t.title, t]));
  const tasks = taskRows.map((task) => {
    const tpl = templateTasks.get(task.title);
    return { id: task.id, milestoneId: task.milestoneId, templateKey: tpl?.key ?? null, title: task.title, description: tpl?.description ?? "", estimatedMinutes: task.estimatedMinutes ?? 45, status: task.completedAt ? "completed" : "pending", position: task.position };
  });
  const milestones = milestoneRows.map((m) => {
    const own = tasks.filter((t) => t.milestoneId === m.id);
    return { id: m.id, templateKey: null, title: m.title, description: m.description ?? "", range: rangeLabel(m.position, profileRow.weeklyHours ?? 1), done: own.length > 0 && own.every((t) => t.status === "completed"), position: m.position, tasks: own };
  });
  const nextTask = milestones.flatMap((m) => m.tasks).find((t) => t.status !== "completed") ?? null;

  const memories = await listMemories(userId);
  const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt)).limit(1);
  const messageRows = conversation
    ? await db.select().from(chatMessages).where(and(eq(chatMessages.userId, userId), eq(chatMessages.conversationId, conversation.id))).orderBy(asc(chatMessages.createdAt))
    : [];
  const historyRows = await db.select({ id: learningPlans.id, title: learningPlans.title, updatedAt: learningPlans.updatedAt }).from(learningPlans)
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "archived"))).orderBy(desc(learningPlans.updatedAt)).limit(3);

  return {
    profile,
    plan: { id: plan.id, title: plan.title, milestones, nextTask, completedTasks: tasks.filter((t) => t.status === "completed").length, totalTasks: tasks.length },
    memories,
    conversationId: conversation?.id ?? null,
    messages: messageRows.map((m) => ({ id: m.id, role: m.role === "assistant" ? "navi" : "user", content: m.content, createdAt: m.createdAt.toISOString() })),
    history: historyRows.map((h) => ({ id: h.id, title: h.title, archivedAt: h.updatedAt.toISOString() })),
  };
}

// ---------- profile change proposal ----------
export async function applyReplan(userId: string, next: NaviProfile) {
  return getDb().transaction(async (tx) => {
    await archiveActivePlans(tx, userId);
    await upsertProfile(tx, userId, next);
    return createPlanForUser(tx, userId, next);
  });
}
