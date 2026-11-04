"use server";

import { z } from "zod";
import { getSessionUser } from "../auth";
import { getDb } from "../db/client";
import * as data from "../db/navi";
import type { NaviProfile } from "./profile";

const profileSchema = z.object({ role: z.string().min(1).max(120), level: z.string().min(1).max(120), hours: z.string().min(1).max(60), timeline: z.string().min(1).max(60), preference: z.string().min(1).max(200) });
const memorySchema = z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(600), reason: z.string().trim().min(1).max(300) });
const idSchema = z.string().min(1).max(64);

async function requireUserId() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  return user.id;
}

export async function getSessionInfo() { const user = await getSessionUser(); return user ? { email: user.email } : null; }
export async function seedInitialNaviData(profile: NaviProfile) { return data.seedInitialNaviData(getDb(), await requireUserId(), profileSchema.parse(profile)); }
/** null = profil belum dibuat (perlu onboarding). */
export async function loadDashboard() { return data.loadDashboard(getDb(), await requireUserId()); }
export async function completeTask(taskId: string) { await data.completeTask(getDb(), await requireUserId(), idSchema.parse(taskId)); }
export async function createMemory(input: data.MemoryInput) { return data.createMemory(getDb(), await requireUserId(), memorySchema.parse(input)); }
export async function updateMemory(id: string, input: data.MemoryInput) { return data.updateMemory(getDb(), await requireUserId(), idSchema.parse(id), memorySchema.parse(input)); }
export async function removeMemory(id: string) { await data.removeMemory(getDb(), await requireUserId(), idSchema.parse(id)); }
export async function clearMemories() { await data.clearMemories(getDb(), await requireUserId()); }
export async function applyReplan(next: NaviProfile) { return data.applyReplan(getDb(), await requireUserId(), profileSchema.parse(next)); }
