import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { chatMessages, conversations, learningPlans, memoryFacts, planMilestones, planTasks, profiles } from "../../db/schema";
import { buildPlanTemplate, rangeLabel } from "../navi/templates";
import { numberFromLabel, toDbLevel, type NaviProfile } from "../navi/profile";
import type { NaviDb } from "./client";

/*
 * Data layer Navi. SETIAP fungsi menerima `userId` dari session server dan
 * memfilter semua query/mutasi dengan userId itu. Jangan pernah meneruskan
 * userId dari input client.
 */

export type PlanTask = { id: string; milestoneId: string; title: string; description: string; estimatedMinutes: number; status: "completed" | "pending"; position: number };
export type PlanMilestone = { id: string; title: string; description: string; range: string; done: boolean; position: number; tasks: PlanTask[] };
export type NaviMemory = { id: string; label: string; value: string; reason: string; category: "profile" | "note" };
export type ChatMessage = { id: string; role: "user" | "navi"; content: string; createdAt: string };
export type DashboardData = {
  profile: NaviProfile;
  plan: { id: string; title: string; milestones: PlanMilestone[]; nextTask: PlanTask | null; completedTasks: number; totalTasks: number };
  memories: NaviMemory[];
  conversationId: string | null;
  messages: ChatMessage[];
  history: { id: string; title: string; archivedAt: string | null }[];
};
export type MemoryInput = Pick<NaviMemory, "label" | "value" | "reason">;

const LEVEL_PREFIX = "level:";

function profileRow(userId: string, profile: NaviProfile) {
  const weeklyHours = numberFromLabel(profile.hours);
  if (!weeklyHours) throw new Error("Waktu belajar tidak valid.");
  return {
    userId,
    targetRole: profile.role,
    currentLevel: toDbLevel(profile.level),
    // Label level asli disimpan di `skills` agar UI bisa menampilkannya kembali.
    skills: [`${LEVEL_PREFIX}${profile.level}`],
    weeklyHours,
    targetMonths: numberFromLabel(profile.timeline),
    learningPreference: profile.preference,
  };
}

type ProfileRow = typeof profiles.$inferSelect;
function viewProfile(row: ProfileRow): NaviProfile {
  const level = row.skills?.find((item) => item.startsWith(LEVEL_PREFIX))?.slice(LEVEL_PREFIX.length) ?? row.currentLevel ?? "";
  return { role: row.targetRole ?? "", level, hours: `${row.weeklyHours ?? 0} jam per minggu`, timeline: row.targetMonths ? `${row.targetMonths} bulan` : "Belum pasti", preference: row.learningPreference ?? "" };
}

const encodeMemory = (input: MemoryInput) => JSON.stringify({ label: input.label, value: input.value, reason: input.reason });
function decodeMemory(row: typeof memoryFacts.$inferSelect): NaviMemory {
  let parsed: Partial<MemoryInput> = {};
  try { parsed = JSON.parse(row.content); } catch { parsed = { label: "Catatan", value: row.content, reason: "" }; }
  return { id: row.id, label: parsed.label ?? "", value: parsed.value ?? "", reason: parsed.reason ?? "", category: row.category === "profile" ? "profile" : "note" };
}

export async function getProfile(db: NaviDb, userId: string): Promise<NaviProfile | null> {
  const row = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
  return row ? viewProfile(row) : null;
}

export async function getActivePlan(db: NaviDb, userId: string) {
  return db.query.learningPlans.findFirst({ where: and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active")), orderBy: desc(learningPlans.createdAt) });
}

export async function createPlanForUser(db: NaviDb, userId: string, profile: NaviProfile) {
  const template = buildPlanTemplate(profile);
  return db.transaction(async (tx) => {
    const [plan] = await tx.insert(learningPlans).values({ userId, title: `Jalur ${profile.role}`, status: "active", source: "template" }).returning({ id: learningPlans.id });
    for (const [mPos, milestone] of template.entries()) {
      const [m] = await tx.insert(planMilestones).values({ userId, planId: plan.id, position: mPos, title: milestone.title, description: milestone.description }).returning({ id: planMilestones.id });
      if (milestone.tasks.length) await tx.insert(planTasks).values(milestone.tasks.map((task, tPos) => ({ userId, milestoneId: m.id, position: tPos, title: task.title, estimatedMinutes: task.minutes })));
    }
    return plan.id;
  });
}

export async function archiveActivePlans(db: NaviDb, userId: string) {
  await db.update(learningPlans).set({ status: "archived", updatedAt: new Date() }).where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active")));
}

/** Simpan profil onboarding dan pastikan ada rencana aktif. Aman diulang. */
export async function seedInitialNaviData(db: NaviDb, userId: string, profile: NaviProfile) {
  const row = profileRow(userId, profile);
  await db.insert(profiles).values({ ...row, onboardedAt: new Date() }).onConflictDoUpdate({ target: profiles.userId, set: { ...row, updatedAt: new Date() } });
  const current = await getActivePlan(db, userId);
  if (current) return current.id;
  return createPlanForUser(db, userId, profile);
}

export async function applyReplan(db: NaviDb, userId: string, next: NaviProfile) {
  await archiveActivePlans(db, userId);
  const row = profileRow(userId, next);
  await db.update(profiles).set({ ...row, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  return createPlanForUser(db, userId, next);
}

export async function loadDashboard(db: NaviDb, userId: string): Promise<DashboardData | null> {
  const profile = await getProfile(db, userId);
  if (!profile) return null;
  let plan = await getActivePlan(db, userId);
  if (!plan) { await createPlanForUser(db, userId, profile); plan = await getActivePlan(db, userId); }
  if (!plan) throw new Error("Rencana belum tersedia.");

  const weeklyHours = numberFromLabel(profile.hours) ?? 1;
  const template = buildPlanTemplate(profile);
  const milestoneRows = await db.select().from(planMilestones).where(and(eq(planMilestones.userId, userId), eq(planMilestones.planId, plan.id))).orderBy(asc(planMilestones.position));
  const ids = milestoneRows.map((m) => m.id);
  const taskRows = ids.length ? await db.select().from(planTasks).where(and(eq(planTasks.userId, userId), inArray(planTasks.milestoneId, ids))).orderBy(asc(planTasks.position)) : [];
  const positionOf = new Map(milestoneRows.map((m) => [m.id, m.position]));
  const tasks: PlanTask[] = taskRows.map((t) => ({ id: t.id, milestoneId: t.milestoneId, title: t.title, description: template[positionOf.get(t.milestoneId) ?? -1]?.tasks[t.position]?.description ?? "", estimatedMinutes: t.estimatedMinutes ?? 45, status: t.completedAt ? "completed" : "pending", position: t.position }));
  const milestones: PlanMilestone[] = milestoneRows.map((m) => {
    const own = tasks.filter((t) => t.milestoneId === m.id);
    return { id: m.id, title: m.title, description: m.description ?? "", range: rangeLabel(m.position, weeklyHours), done: own.length > 0 && own.every((t) => t.status === "completed"), position: m.position, tasks: own };
  });
  const nextTask = milestones.flatMap((m) => m.tasks).find((t) => t.status !== "completed") ?? null;

  const memories = (await db.select().from(memoryFacts).where(eq(memoryFacts.userId, userId)).orderBy(asc(memoryFacts.createdAt), asc(sql`rowid`))).map(decodeMemory);
  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.userId, userId), orderBy: desc(conversations.updatedAt) });
  const messageRows = conversation ? await db.select().from(chatMessages).where(and(eq(chatMessages.userId, userId), eq(chatMessages.conversationId, conversation.id))).orderBy(asc(chatMessages.createdAt), asc(sql`rowid`)) : [];
  const historyRows = await db.select().from(learningPlans).where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "archived"))).orderBy(desc(learningPlans.updatedAt)).limit(3);

  return {
    profile,
    plan: { id: plan.id, title: plan.title, milestones, nextTask, completedTasks: tasks.filter((t) => t.status === "completed").length, totalTasks: tasks.length },
    memories,
    conversationId: conversation?.id ?? null,
    messages: messageRows.map((m) => ({ id: m.id, role: m.role === "assistant" ? "navi" : "user", content: m.content, createdAt: m.createdAt.toISOString() })),
    history: historyRows.map((p) => ({ id: p.id, title: p.title, archivedAt: p.updatedAt.toISOString() })),
  };
}

export async function completeTask(db: NaviDb, userId: string, taskId: string) {
  const updated = await db.update(planTasks).set({ completedAt: new Date() }).where(and(eq(planTasks.id, taskId), eq(planTasks.userId, userId), isNull(planTasks.completedAt))).returning({ id: planTasks.id });
  return updated.length > 0;
}

export async function listMemories(db: NaviDb, userId: string, limit = 50) {
  return (await db.select().from(memoryFacts).where(and(eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note"))).orderBy(asc(memoryFacts.createdAt), asc(sql`rowid`)).limit(limit)).map(decodeMemory);
}

export async function createMemory(db: NaviDb, userId: string, input: MemoryInput) {
  const [row] = await db.insert(memoryFacts).values({ userId, content: encodeMemory(input), category: "note" }).returning();
  return decodeMemory(row);
}

export async function updateMemory(db: NaviDb, userId: string, id: string, input: MemoryInput) {
  const [row] = await db.update(memoryFacts).set({ content: encodeMemory(input), updatedAt: new Date() }).where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note"))).returning();
  if (!row) throw new Error("Memori tidak ditemukan.");
  return decodeMemory(row);
}

export async function removeMemory(db: NaviDb, userId: string, id: string) {
  await db.delete(memoryFacts).where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note")));
}

export async function clearMemories(db: NaviDb, userId: string) {
  await db.delete(memoryFacts).where(and(eq(memoryFacts.userId, userId), eq(memoryFacts.category, "note")));
}

// ---------- Chat ----------
export async function findConversation(db: NaviDb, userId: string, id: string) {
  return db.query.conversations.findFirst({ where: and(eq(conversations.id, id), eq(conversations.userId, userId)) });
}
export async function createConversation(db: NaviDb, userId: string, title = "Diskusi dengan Navi") {
  const [row] = await db.insert(conversations).values({ userId, title }).returning({ id: conversations.id });
  return row.id;
}
export async function addChatMessage(db: NaviDb, userId: string, conversationId: string, role: "user" | "assistant", content: string, source?: "gemini" | "fixture") {
  if (!(await findConversation(db, userId, conversationId))) throw new Error("Percakapan tidak ditemukan.");
  await db.insert(chatMessages).values({ userId, conversationId, role, content, source });
  await db.update(conversations).set({ updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}
