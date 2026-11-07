import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { activityLog, jobApplications, learningPlans, planMilestones, planTasks, profiles, rateLimits, streaks, users } from "../../db/schema";
import { nextStreak, reminderDue, zonedParts, type NaviTimezone } from "../engagement/dates";
import { escapeHtml } from "../html";
import type { NaviDb } from "./client";

export type ActivityDb = Pick<NaviDb, "insert" | "select" | "update" | "delete">;
export type ActivityType = "task_completed" | "chat" | "cv_review" | "job_update" | "login";

export type EngagementSummary = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  studyMinutes: number;
  applicationCount: number;
  remindersEnabled: boolean;
  reminderTime: string | null;
  timezone: string;
};

const REMINDER_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function loadEngagementSummary(db: ActivityDb, userId: string): Promise<EngagementSummary> {
  const [profile] = await db.select({ timezone: profiles.timezone, reminderTime: profiles.reminderTime, remindersEnabled: profiles.remindersEnabled }).from(profiles).where(eq(profiles.userId, userId));
  const [streak] = await db.select().from(streaks).where(eq(streaks.userId, userId));
  const [minutes] = await db.select({ total: sql<number>`coalesce(sum(${activityLog.minutes}), 0)` }).from(activityLog).where(eq(activityLog.userId, userId));
  const [apps] = await db.select({ total: sql<number>`count(*)` }).from(jobApplications).where(eq(jobApplications.userId, userId));
  return {
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    lastActiveDate: streak?.lastActiveDate ?? null,
    studyMinutes: Number(minutes?.total ?? 0),
    applicationCount: Number(apps?.total ?? 0),
    remindersEnabled: profile?.remindersEnabled ?? false,
    reminderTime: profile?.reminderTime ?? null,
    timezone: profile?.timezone || "Asia/Jakarta",
  };
}

/** Catat aktivitas milik userId dan perbarui streak menurut tanggal di zona profil. */
export async function recordActivity(db: ActivityDb, userId: string, input: { type: ActivityType; refId?: string | null; minutes?: number | null }, now = new Date()) {
  const [profile] = await db.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const { date } = zonedParts(profile?.timezone || "Asia/Jakarta", now);
  await db.insert(activityLog).values({ userId, type: input.type, refId: input.refId ?? null, activityDate: date, minutes: input.minutes ?? null });
  const [streak] = await db.select().from(streaks).where(eq(streaks.userId, userId));
  if (streak?.lastActiveDate === date) return { date, currentStreak: streak.currentStreak, longestStreak: streak.longestStreak };
  const currentStreak = nextStreak(streak?.currentStreak ?? 0, streak?.lastActiveDate ?? null, date);
  const longestStreak = Math.max(streak?.longestStreak ?? 0, currentStreak);
  await db.insert(streaks).values({ userId, currentStreak, longestStreak, lastActiveDate: date, updatedAt: now })
    .onConflictDoUpdate({ target: streaks.userId, set: { currentStreak, longestStreak, lastActiveDate: date, updatedAt: now } });
  return { date, currentStreak, longestStreak };
}

export async function updateReminderSettings(db: ActivityDb, userId: string, input: { enabled: boolean; reminderTime: string; timezone: NaviTimezone }) {
  if (!REMINDER_TIME.test(input.reminderTime)) throw new Error("Jam pengingat tidak valid.");
  const updated = await db.update(profiles).set({ remindersEnabled: input.enabled, reminderTime: input.reminderTime, timezone: input.timezone, updatedAt: new Date() }).where(eq(profiles.userId, userId)).returning({ userId: profiles.userId });
  if (!updated.length) throw new Error("Profil belum dibuat.");
}

async function claimReminder(db: ActivityDb, userId: string, date: string) {
  const windowStart = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
  const key = `reminder:${userId}`;
  const [row] = await db.insert(rateLimits).values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  return { claimed: (row?.count ?? 1) === 1, key, windowStart };
}

async function releaseReminder(db: ActivityDb, key: string, windowStart: number) {
  await db.update(rateLimits).set({ count: 0 }).where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)));
}

async function nextTaskTitle(db: ActivityDb, userId: string) {
  const [task] = await db.select({ title: planTasks.title }).from(planTasks)
    .innerJoin(planMilestones, eq(planTasks.milestoneId, planMilestones.id))
    .innerJoin(learningPlans, eq(planMilestones.planId, learningPlans.id))
    .where(and(eq(planTasks.userId, userId), eq(learningPlans.userId, userId), eq(learningPlans.status, "active"), isNull(planTasks.completedAt)))
    .orderBy(asc(planMilestones.position), asc(planTasks.position))
    .limit(1);
  return task?.title ?? null;
}

export type ReminderSend = (to: string, subject: string, html: string) => Promise<boolean>;

/** Kirim pengingat harian untuk pengguna yang opt-in dan jam lokalnya cocok. Satu email per tanggal zona pengguna. */
export async function runReminders(db: ActivityDb, now: Date, send: ReminderSend) {
  const rows = await db.select({
    userId: profiles.userId, email: users.email, name: users.name, reminderTime: profiles.reminderTime, timezone: profiles.timezone, targetRole: profiles.targetRole,
  }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(eq(profiles.remindersEnabled, true));

  let sent = 0; let skipped = 0; let failed = 0;
  for (const row of rows) {
    const parts = zonedParts(row.timezone || "Asia/Jakarta", now);
    if (!reminderDue(row.reminderTime, parts.hour)) { skipped += 1; continue; }
    const claim = await claimReminder(db, row.userId, parts.date);
    if (!claim.claimed) { skipped += 1; continue; }
    const task = await nextTaskTitle(db, row.userId);
    const role = escapeHtml(row.targetRole || "karier");
    const step = task ? `<p>Langkah hari ini: <b>${escapeHtml(task)}</b></p>` : "<p>Buka Navi untuk melihat langkah berikutnya.</p>";
    const html = `<p>Halo ${escapeHtml(row.name || "kamu")},</p><p>Ini pengingat belajar untuk jalur ${role}.</p>${step}<p>Buka Navi dan kerjakan satu bagian kecil saja.</p>`;
    const ok = await send(row.email, "Pengingat belajar Navi", html);
    if (!ok) { await releaseReminder(db, claim.key, claim.windowStart); failed += 1; continue; }
    sent += 1;
  }

  const cutoff = Math.floor(now.getTime() / 1000) - 86400;
  await db.delete(rateLimits).where(and(sql`${rateLimits.windowStart} > 1000000000`, sql`${rateLimits.windowStart} < ${cutoff}`));
  return { sent, skipped, failed };
}
