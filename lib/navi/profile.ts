import { buildPlanTemplate, type NaviProfileInput } from "./templates";

export type NaviProfile = NaviProfileInput;
export type DbLevel = "beginner" | "intermediate" | "advanced";

const levelMap: Record<string, DbLevel> = {
  "Baru mulai": "beginner",
  "Sudah memahami dasar HTML & CSS": "beginner",
  "Pernah membuat beberapa proyek": "intermediate",
  "Sudah siap melamar": "advanced",
};
export const toDbLevel = (label: string): DbLevel => levelMap[label] ?? "beginner";
export const numberFromLabel = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0) || null;

export function previewReplan(current: NaviProfile, next: NaviProfile) {
  const changes = [
    current.role !== next.role ? `jalur ${current.role} menjadi ${next.role}` : null,
    current.hours !== next.hours ? `ritme ${next.hours.toLowerCase()}` : null,
    current.timeline !== next.timeline ? `target ${next.timeline.toLowerCase()}` : null,
    current.preference !== next.preference ? `gaya ${next.preference.toLowerCase()}` : null,
  ].filter(Boolean) as string[];
  return { changes, affectedTasks: buildPlanTemplate(next).flatMap((milestone) => milestone.tasks).length };
}
