import { buildPlanTemplate, type NaviProfileInput } from "./templates";

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

/** Result wrapper so server actions never throw opaque errors to the client. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: "UNAUTHORIZED" | "MISSING_PROFILE" };

export function previewReplan(current: NaviProfile, next: NaviProfile) {
  const changes = [
    current.role !== next.role ? `jalur ${current.role} menjadi ${next.role}` : null,
    current.hours !== next.hours ? `ritme ${next.hours.toLowerCase()}` : null,
    current.timeline !== next.timeline ? `target ${next.timeline.toLowerCase()}` : null,
    current.preference !== next.preference ? `gaya ${next.preference.toLowerCase()}` : null
  ].filter(Boolean) as string[];
  return { changes, affectedTasks: buildPlanTemplate(next).flatMap((milestone) => milestone.tasks).length };
}
