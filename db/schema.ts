// Draft Drizzle schema (sqlite-core) untuk Turso. Tabel auth mengikuti Better Auth (user/session/account/verification).
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);
const updatedAt = () => integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => new Date());
const userRef = () => text("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

// ---------- Better Auth ----------
export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(), updatedAt: updatedAt(),
});
export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: userRef(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
  createdAt: createdAt(), updatedAt: updatedAt(),
});
export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: userRef(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"), password: text("password"),
  createdAt: createdAt(), updatedAt: updatedAt(),
});
export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

// ---------- Domain ----------
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  targetRole: text("target_role"),
  currentLevel: text("current_level", { enum: ["beginner", "intermediate", "advanced"] }),
  weeklyHours: integer("weekly_hours"),
  targetMonths: integer("target_months"),
  learningPreference: text("learning_preference"),
  skills: text("skills", { mode: "json" }).$type<string[]>(),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  reminderTime: text("reminder_time"), // "07:00"
  remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(false),
  onboardedAt: integer("onboarded_at", { mode: "timestamp" }),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const learningPlans = sqliteTable("learning_plans", {
  id: id(), userId: userRef(),
  title: text("title").notNull(),
  summary: text("summary"),
  source: text("source", { enum: ["template", "gemini"] }).notNull().default("template"),
  status: text("status", { enum: ["active", "archived", "completed"] }).notNull().default("active"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("learning_plans_user_idx").on(t.userId, t.status)]);

export const planMilestones = sqliteTable("plan_milestones", {
  id: id(), userId: userRef(),
  planId: text("plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  weekStart: integer("week_start"), weekEnd: integer("week_end"),
  createdAt: createdAt(),
}, (t) => [index("plan_milestones_plan_idx").on(t.planId)]);

export const planTasks = sqliteTable("plan_tasks", {
  id: id(), userId: userRef(),
  milestoneId: text("milestone_id").notNull().references(() => planMilestones.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  resourceUrl: text("resource_url"),
  estimatedMinutes: integer("estimated_minutes"),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: createdAt(),
}, (t) => [index("plan_tasks_user_idx").on(t.userId), index("plan_tasks_milestone_idx").on(t.milestoneId)]);

export const memoryFacts = sqliteTable("memory_facts", {
  id: id(), userId: userRef(),
  content: text("content").notNull(),
  category: text("category"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("memory_facts_user_idx").on(t.userId)]);

export const conversations = sqliteTable("conversations", {
  id: id(), userId: userRef(),
  title: text("title"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("conversations_user_idx").on(t.userId)]);

export const chatMessages = sqliteTable("chat_messages", {
  id: id(), userId: userRef(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  source: text("source", { enum: ["gemini", "fixture"] }),
  createdAt: createdAt(),
}, (t) => [index("chat_messages_conv_idx").on(t.conversationId, t.createdAt)]);

export const jobApplications = sqliteTable("job_applications", {
  id: id(), userId: userRef(),
  company: text("company").notNull(),
  position: text("position").notNull(),
  url: text("url"), location: text("location"), salaryRange: text("salary_range"),
  status: text("status", { enum: ["wishlist", "applied", "interview", "offer", "rejected", "ghosted"] }).notNull().default("wishlist"),
  appliedAt: integer("applied_at", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("job_applications_user_idx").on(t.userId, t.status)]);

export const cvReviews = sqliteTable("cv_reviews", {
  id: id(), userId: userRef(),
  targetRole: text("target_role"),
  cvText: text("cv_text").notNull(),
  score: integer("score"), // 0-100
  feedback: text("feedback", { mode: "json" }).$type<{ strengths: string[]; improvements: string[]; keywords: string[]; rewrites?: { original: string; suggestion: string }[]; summary?: string; model?: string }>(),
  createdAt: createdAt(),
}, (t) => [index("cv_reviews_user_idx").on(t.userId)]);

export const streaks = sqliteTable("streaks", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"), // YYYY-MM-DD (zona user)
  updatedAt: updatedAt(),
});

export const activityLog = sqliteTable("activity_log", {
  id: id(), userId: userRef(),
  type: text("type", { enum: ["task_completed", "chat", "cv_review", "job_update", "login"] }).notNull(),
  refId: text("ref_id"),
  activityDate: text("activity_date").notNull(), // YYYY-MM-DD
  minutes: integer("minutes"),
  createdAt: createdAt(),
}, (t) => [index("activity_user_date_idx").on(t.userId, t.activityDate)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").notNull(), // mis. "chat:<userId>"
  windowStart: integer("window_start").notNull(), // unix detik
  count: integer("count").notNull().default(0),
}, (t) => [uniqueIndex("rate_limits_key_window").on(t.key, t.windowStart)]);
