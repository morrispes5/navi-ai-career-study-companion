"use server";

import { z } from "zod";
import { getSessionUser, UnauthorizedError } from "../../lib/auth";
import * as data from "../../lib/server/navi";
import type { ActionResult, DashboardData, NaviMemory } from "../../lib/navi/types";

const profileSchema = z.object({ role: z.string().trim().min(1).max(80), level: z.string().trim().min(1).max(80), hours: z.string().trim().min(1).max(40), timeline: z.string().trim().min(1).max(40), preference: z.string().trim().min(1).max(120) });
const memorySchema = z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(160), reason: z.string().trim().min(1).max(220) });
const idSchema = z.string().min(1).max(64);

async function run<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await getSessionUser();
    if (!user) throw new UnauthorizedError();
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { ok: false, error: error.message, code: "UNAUTHORIZED" };
    if (error instanceof data.MissingNaviProfileError) return { ok: false, error: error.message, code: "MISSING_PROFILE" };
    if (error instanceof z.ZodError) return { ok: false, error: "Data yang dikirim tidak valid." };
    console.error("[navi action]", error);
    return { ok: false, error: "Koneksi data sempat terputus. Coba lagi sebentar." };
  }
}

export async function getSessionAction() {
  const user = await getSessionUser();
  return user ? { id: user.id, email: user.email } : null;
}
export async function loadDashboardAction(): Promise<ActionResult<DashboardData>> { return run((userId) => data.loadDashboard(userId)); }
export async function seedInitialNaviDataAction(profile: unknown) { return run((userId) => data.seedInitialNaviData(userId, profileSchema.parse(profile))); }
export async function completeTaskAction(taskId: unknown) { return run((userId) => data.completeTask(userId, idSchema.parse(taskId))); }
export async function createMemoryAction(input: unknown): Promise<ActionResult<NaviMemory>> { return run((userId) => data.createMemory(userId, memorySchema.parse(input))); }
export async function updateMemoryAction(id: unknown, input: unknown): Promise<ActionResult<NaviMemory>> { return run((userId) => data.updateMemory(userId, idSchema.parse(id), memorySchema.parse(input))); }
export async function removeMemoryAction(id: unknown) { return run((userId) => data.removeMemory(userId, idSchema.parse(id))); }
export async function clearMemoriesAction() { return run((userId) => data.clearMemories(userId)); }
export async function applyReplanAction(profile: unknown) { return run((userId) => data.applyReplan(userId, profileSchema.parse(profile))); }
