import { buildPlanTemplate, rangeLabel, type NaviProfileInput } from "../navi/templates";
import { createClient } from "./client";

export type NaviProfile = NaviProfileInput;
export type PlanTask = { id: string; milestoneId: string; templateKey: string | null; title: string; description: string; estimatedMinutes: number; status: string; position: number };
export type PlanMilestone = { id: string; templateKey: string | null; title: string; description: string; range: string; done: boolean; position: number; tasks: PlanTask[] };
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

export class MissingNaviProfileError extends Error { constructor() { super("Profil Navi belum dibuat."); this.name = "MissingNaviProfileError"; } }

const DRAFT_KEY = "navi.onboarding.v3";
const numberFromLabel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0) || null;
const blank = (value: string | null | undefined) => value ?? "";

export const readOnboardingDraft = (): NaviProfile | null => {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"); } catch { return null; }
};
export const saveOnboardingDraft = (profile: NaviProfile) => { if (typeof window !== "undefined") localStorage.setItem(DRAFT_KEY, JSON.stringify(profile)); };
export const clearOnboardingDraft = () => { if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY); };

async function currentUser() {
  const { data, error } = await createClient().auth.getUser();
  if (error || !data.user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  return data.user;
}

function dbProfile(profile: NaviProfile) {
  const weeklyHours = numberFromLabel(profile.hours);
  if (!weeklyHours) throw new Error("Waktu belajar tidak valid.");
  return { target_role: profile.role, current_level: profile.level, weekly_hours: weeklyHours, target_months: numberFromLabel(profile.timeline), learning_preference: profile.preference };
}

function viewProfile(row: { target_role: string; current_level: string; weekly_hours: number; target_months: number | null; learning_preference: string }): NaviProfile {
  return { role: row.target_role, level: row.current_level, hours: `${row.weekly_hours} jam per minggu`, timeline: row.target_months ? `${row.target_months} bulan` : "Belum pasti", preference: row.learning_preference };
}

async function createPlanForUser(userId: string, profile: NaviProfile) {
  const supabase = createClient();
  const input = dbProfile(profile);
  const { data: plan, error: planError } = await supabase.from("learning_plans").insert({ user_id: userId, title: `Jalur ${profile.role}`, target_role: input.target_role, weekly_hours: input.weekly_hours, target_months: input.target_months, status: "active", template_version: "v1" }).select("id").single();
  if (planError || !plan) throw planError ?? new Error("Rencana tidak dapat dibuat.");

  const template = buildPlanTemplate(profile);
  for (const [milestonePosition, milestone] of template.entries()) {
    const { data: milestoneRow, error: milestoneError } = await supabase.from("plan_milestones").insert({ plan_id: plan.id, position: milestonePosition, template_key: milestone.key, range_label: rangeLabel(milestonePosition, input.weekly_hours), title: milestone.title, description: milestone.description }).select("id").single();
    if (milestoneError || !milestoneRow) throw milestoneError ?? new Error("Tahap rencana tidak dapat dibuat.");
    const tasks = milestone.tasks.map((task, taskPosition) => ({ milestone_id: milestoneRow.id, position: taskPosition, template_key: task.key, task_type: "practice", title: task.title, description: task.description, estimated_minutes: task.minutes }));
    const { error: taskError } = await supabase.from("plan_tasks").insert(tasks);
    if (taskError) throw taskError;
  }
  return plan.id;
}

async function archiveLegacyPlan(userId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("learning_plans").update({ status: "archived", archived_at: new Date().toISOString() }).eq("user_id", userId).eq("status", "active");
  if (error) throw error;
}

async function activePlanNeedsUpgrade(planId: string) {
  const supabase = createClient();
  const { data: milestones, error: milestoneError } = await supabase.from("plan_milestones").select("id").eq("plan_id", planId);
  if (milestoneError) throw milestoneError;
  const milestoneIds = (milestones ?? []).map((item) => item.id);
  if (!milestoneIds.length) return true;
  const { count, error } = await supabase.from("plan_tasks").select("id", { count: "exact", head: true }).in("milestone_id", milestoneIds);
  if (error) throw error;
  return (count ?? 0) < 12;
}

export async function seedInitialNaviData(profile: NaviProfile) {
  const user = await currentUser();
  const supabase = createClient();
  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, ...dbProfile(profile) });
  if (profileError) throw profileError;
  const { data: currentPlan, error: planLookupError } = await supabase.from("learning_plans").select("id").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (planLookupError) throw planLookupError;
  if (currentPlan && !(await activePlanNeedsUpgrade(currentPlan.id))) return currentPlan.id;
  if (currentPlan) await archiveLegacyPlan(user.id);
  return createPlanForUser(user.id, profile);
}

export async function loadDashboard(): Promise<DashboardData> {
  const user = await currentUser();
  const supabase = createClient();
  const { data: profileRow, error: profileError } = await supabase.from("profiles").select("target_role,current_level,weekly_hours,target_months,learning_preference").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) throw new MissingNaviProfileError();
  const profile = viewProfile(profileRow);
  let { data: plan, error: planError } = await supabase.from("learning_plans").select("id,title").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (planError) throw planError;
  if (!plan || await activePlanNeedsUpgrade(plan.id)) {
    await seedInitialNaviData(profile);
    const retry = await supabase.from("learning_plans").select("id,title").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
    if (retry.error || !retry.data) throw retry.error ?? new Error("Rencana belum tersedia.");
    plan = retry.data;
  }

  const { data: milestoneRows, error: milestonesError } = await supabase.from("plan_milestones").select("id,template_key,title,description,range_label,is_completed,position").eq("plan_id", plan.id).order("position");
  if (milestonesError) throw milestonesError;
  const milestoneIds = (milestoneRows ?? []).map((item) => item.id);
  const { data: taskRows, error: taskError } = milestoneIds.length ? await supabase.from("plan_tasks").select("id,milestone_id,template_key,title,description,estimated_minutes,status,position").in("milestone_id", milestoneIds).order("position") : { data: [], error: null };
  if (taskError) throw taskError;
  const tasks = (taskRows ?? []).map((task) => ({ id: task.id, milestoneId: task.milestone_id, templateKey: task.template_key, title: task.title, description: blank(task.description), estimatedMinutes: task.estimated_minutes ?? 45, status: task.status, position: task.position }));
  const milestones = (milestoneRows ?? []).map((milestone) => ({ id: milestone.id, templateKey: milestone.template_key, title: milestone.title, description: milestone.description, range: milestone.range_label, done: milestone.is_completed, position: milestone.position, tasks: tasks.filter((task) => task.milestoneId === milestone.id) }));
  const nextTask = milestones.flatMap((milestone) => milestone.tasks).find((task) => task.status !== "completed") ?? null;

  const { data: memories, error: memoryError } = await supabase.from("memory_facts").select("id,label,value,reason,category").eq("user_id", user.id).order("created_at");
  if (memoryError) throw memoryError;
  const { data: conversation, error: conversationError } = await supabase.from("conversations").select("id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (conversationError) throw conversationError;
  const { data: messageRows, error: messageError } = conversation ? await supabase.from("chat_messages").select("id,role,content,created_at").eq("conversation_id", conversation.id).order("created_at") : { data: [], error: null };
  if (messageError) throw messageError;
  const { data: historyRows, error: historyError } = await supabase.from("learning_plans").select("id,title,archived_at").eq("user_id", user.id).eq("status", "archived").order("archived_at", { ascending: false }).limit(3);
  if (historyError) throw historyError;

  return {
    profile,
    plan: { id: plan.id, title: plan.title, milestones, nextTask, completedTasks: tasks.filter((task) => task.status === "completed").length, totalTasks: tasks.length },
    memories: (memories ?? []).map((memory) => ({ id: memory.id, label: memory.label, value: memory.value, reason: memory.reason, category: memory.category === "profile" ? "profile" : "note" })),
    conversationId: conversation?.id ?? null,
    messages: (messageRows ?? []).map((message) => ({ id: message.id, role: message.role === "assistant" ? "navi" : "user", content: message.content, createdAt: message.created_at })),
    history: (historyRows ?? []).map((item) => ({ id: item.id, title: item.title, archivedAt: item.archived_at }))
  };
}

export async function completeTask(id: string, milestoneId: string) {
  const supabase = createClient();
  const { error: taskError } = await supabase.from("plan_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
  if (taskError) throw taskError;
  const { data: tasks, error: loadError } = await supabase.from("plan_tasks").select("status").eq("milestone_id", milestoneId);
  if (loadError) throw loadError;
  if ((tasks ?? []).every((task) => task.status === "completed")) {
    const { error: milestoneError } = await supabase.from("plan_milestones").update({ is_completed: true, completed_at: new Date().toISOString() }).eq("id", milestoneId);
    if (milestoneError) throw milestoneError;
  }
}

export async function createMemory(input: Pick<NaviMemory, "label" | "value" | "reason">) {
  const user = await currentUser();
  const { data, error } = await createClient().from("memory_facts").insert({ user_id: user.id, ...input, category: "note" }).select("id,label,value,reason,category").single();
  if (error || !data) throw error ?? new Error("Memori belum dapat ditambahkan.");
  return { ...data, category: "note" as const };
}

export async function updateMemory(id: string, input: Pick<NaviMemory, "label" | "value" | "reason">) {
  const { data, error } = await createClient().from("memory_facts").update(input).eq("id", id).eq("category", "note").select("id,label,value,reason,category").single();
  if (error || !data) throw error ?? new Error("Memori belum dapat diperbarui.");
  return { ...data, category: "note" as const };
}

export async function removeMemory(id: string) { const { error } = await createClient().from("memory_facts").delete().eq("id", id).eq("category", "note"); if (error) throw error; }
export async function clearMemories() { const user = await currentUser(); const { error } = await createClient().from("memory_facts").delete().eq("user_id", user.id).eq("category", "note"); if (error) throw error; }

export function previewReplan(current: NaviProfile, next: NaviProfile) {
  const changes = [
    current.role !== next.role ? `jalur ${current.role} menjadi ${next.role}` : null,
    current.hours !== next.hours ? `ritme ${next.hours.toLowerCase()}` : null,
    current.timeline !== next.timeline ? `target ${next.timeline.toLowerCase()}` : null,
    current.preference !== next.preference ? `gaya ${next.preference.toLowerCase()}` : null
  ].filter(Boolean) as string[];
  return { changes, affectedTasks: buildPlanTemplate(next).flatMap((milestone) => milestone.tasks).length };
}

export async function applyReplan(next: NaviProfile) {
  const user = await currentUser();
  const supabase = createClient();
  const { error: archiveError } = await supabase.from("learning_plans").update({ status: "archived", archived_at: new Date().toISOString() }).eq("user_id", user.id).eq("status", "active");
  if (archiveError) throw archiveError;
  const { error: profileError } = await supabase.from("profiles").update(dbProfile(next)).eq("id", user.id);
  if (profileError) throw profileError;
  return createPlanForUser(user.id, next);
}
