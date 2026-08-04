import { createClient } from "./client";

export type NaviProfile = { role: string; level: string; hours: string; timeline: string; preference: string };
export type DashboardData = { profile: NaviProfile; plan: { id: string; title: string; milestones: { id: string; title: string; description: string; range: string; done: boolean }[]; task: { id: string; title: string; description: string; status: string } | null }; memories: { id: string; label: string; value: string; reason: string }[]; conversationId: string | null };

export class MissingNaviProfileError extends Error { constructor() { super("Profil Navi belum dibuat."); this.name = "MissingNaviProfileError"; } }

const DRAFT_KEY = "navi.onboarding.v2";
const numberFromLabel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0) || null;
export const readOnboardingDraft = (): NaviProfile | null => { if (typeof window === "undefined") return null; try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"); } catch { return null; } };
export const saveOnboardingDraft = (profile: NaviProfile) => { if (typeof window !== "undefined") localStorage.setItem(DRAFT_KEY, JSON.stringify(profile)); };
export const clearOnboardingDraft = () => { if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY); };

const seedMilestones = [
  ["Minggu 1–3", "Fondasi modern web", "Rapikan HTML, CSS responsif, dan Git sambil membuat halaman profil."],
  ["Minggu 4–7", "Mulai dengan JavaScript", "Bangun aplikasi kecil dan kuasai konsep inti JavaScript."],
  ["Minggu 8–13", "Naik kelas ke React", "Pelajari komponen, state, dan API lewat dashboard sederhana."],
  ["Minggu 14–18", "Portofolio & persiapan kerja", "Selesaikan proyek dan tulis studi kasus yang jelas."]
] as const;

async function currentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  return data.user;
}

export async function seedInitialNaviData(profile: NaviProfile) {
  const supabase = createClient();
  const user = await currentUser();
  const weeklyHours = numberFromLabel(profile.hours);
  if (!weeklyHours) throw new Error("Waktu belajar tidak valid.");
  const targetMonths = numberFromLabel(profile.timeline);

  const { data: existingProfile, error: profileLookupError } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profileLookupError) throw profileLookupError;
  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, target_role: profile.role, current_level: profile.level, weekly_hours: weeklyHours, target_months: targetMonths, learning_preference: profile.preference });
  if (profileError) throw profileError;

  const { data: existingPlan, error: existingPlanError } = await supabase.from("learning_plans").select("id").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (existingPlanError) throw existingPlanError;
  let planId = existingPlan?.id;
  const planWasMissing = !planId;
  if (!planId) {
    const { data: plan, error: planError } = await supabase.from("learning_plans").insert({ user_id: user.id, title: `Jalur ${profile.role}`, target_role: profile.role, weekly_hours: weeklyHours, target_months: targetMonths, status: "active" }).select("id").single();
    if (planError || !plan) throw planError ?? new Error("Rencana tidak dapat dibuat.");
    planId = plan.id;
  }

  const milestonePayload = seedMilestones.map(([range, title, description], position) => ({ plan_id: planId, position, range_label: range, title, description }));
  const { error: milestoneUpsertError } = await supabase.from("plan_milestones").upsert(milestonePayload, { onConflict: "plan_id,position", ignoreDuplicates: true });
  if (milestoneUpsertError) throw milestoneUpsertError;
  const { data: milestones, error: milestoneLoadError } = await supabase.from("plan_milestones").select("id,position").eq("plan_id", planId).order("position");
  if (milestoneLoadError || !milestones?.length) throw milestoneLoadError ?? new Error("Milestone tidak dapat dibuat.");
  const first = milestones.find((item) => item.position === 0);
  if (first) {
    const { error: taskError } = await supabase.from("plan_tasks").upsert({ milestone_id: first.id, position: 0, title: "Buat halaman profil responsif", description: "Gunakan HTML semantic dan CSS Flexbox atau Grid.", estimated_minutes: 90 }, { onConflict: "milestone_id,position", ignoreDuplicates: true });
    if (taskError) throw taskError;
  }

  if (!existingProfile || planWasMissing) {
    const { data: currentMemories, error: memoryLookupError } = await supabase.from("memory_facts").select("label").eq("user_id", user.id);
    if (memoryLookupError) throw memoryLookupError;
    const existingLabels = new Set((currentMemories ?? []).map((item) => item.label));
    const memories = [
      { user_id: user.id, label: "Target", value: profile.role, reason: "Untuk menyusun jalur belajar yang relevan." },
      { user_id: user.id, label: "Waktu tersedia", value: profile.hours, reason: "Agar beban mingguan tetap realistis." },
      { user_id: user.id, label: "Cara belajar", value: profile.preference, reason: "Untuk memilih bentuk latihan yang cocok." }
    ].filter((item) => !existingLabels.has(item.label));
    if (memories.length) {
      const { error: memoryError } = await supabase.from("memory_facts").insert(memories);
      if (memoryError) throw memoryError;
    }
  }
  return planId;
}

export async function loadDashboard(): Promise<DashboardData> {
  const supabase = createClient();
  const user = await currentUser();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("target_role,current_level,weekly_hours,target_months,learning_preference").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new MissingNaviProfileError();
  const profileView: NaviProfile = { role: profile.target_role, level: profile.current_level, hours: `${profile.weekly_hours} jam per minggu`, timeline: profile.target_months ? `${profile.target_months} bulan` : "Belum pasti", preference: profile.learning_preference };
  const { data: plan, error: planError } = await supabase.from("learning_plans").select("id,title").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (planError) throw planError;
  if (!plan) {
    await seedInitialNaviData(profileView);
    return loadDashboard();
  }
  const { data: milestoneRows, error: milestonesError } = await supabase.from("plan_milestones").select("id,title,description,range_label,is_completed").eq("plan_id", plan.id).order("position");
  if (milestonesError) throw milestonesError;
  const firstMilestone = milestoneRows?.[0];
  const { data: task, error: taskError } = firstMilestone ? await supabase.from("plan_tasks").select("id,title,description,status").eq("milestone_id", firstMilestone.id).order("position").limit(1).maybeSingle() : { data: null, error: null };
  if (taskError) throw taskError;
  const { data: memories, error: memoryError } = await supabase.from("memory_facts").select("id,label,value,reason").eq("user_id", user.id).order("created_at");
  if (memoryError) throw memoryError;
  const { data: conversation, error: conversationError } = await supabase.from("conversations").select("id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (conversationError) throw conversationError;
  return { profile: profileView, plan: { id: plan.id, title: plan.title, milestones: (milestoneRows ?? []).map((item) => ({ id: item.id, title: item.title, description: item.description, range: item.range_label, done: item.is_completed })), task: task ? { id: task.id, title: task.title, description: task.description ?? "", status: task.status } : null }, memories: memories ?? [], conversationId: conversation?.id ?? null };
}

export async function completeTask(id: string) { const { error } = await createClient().from("plan_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id); if (error) throw error; }
export async function removeMemory(id: string) { const { error } = await createClient().from("memory_facts").delete().eq("id", id); if (error) throw error; }
export async function clearMemories() { const user = await currentUser(); const { error } = await createClient().from("memory_facts").delete().eq("user_id", user.id); if (error) throw error; }
export async function updateProfile(profile: NaviProfile) { const user = await currentUser(); const weeklyHours = numberFromLabel(profile.hours); if (!weeklyHours) throw new Error("Waktu belajar tidak valid."); const targetMonths = numberFromLabel(profile.timeline); const { error } = await createClient().from("profiles").update({ target_role: profile.role, current_level: profile.level, weekly_hours: weeklyHours, target_months: targetMonths, learning_preference: profile.preference }).eq("id", user.id); if (error) throw error; }
export async function applyPlanProposal(planId: string, profile: NaviProfile) { const weeklyHours = numberFromLabel(profile.hours); if (!weeklyHours) throw new Error("Waktu belajar tidak valid."); const targetMonths = numberFromLabel(profile.timeline); const { error } = await createClient().from("learning_plans").update({ target_role: profile.role, weekly_hours: weeklyHours, target_months: targetMonths, title: `Jalur ${profile.role}` }).eq("id", planId); if (error) throw error; }
