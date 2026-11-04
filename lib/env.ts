import { z } from "zod";

/**
 * Env validation (Zod). Validation is LAZY: it runs the first time a server
 * module needs the value (first request), never at import/build time, so
 * `next build` works without secrets. Fails fast with a clear message.
 */
const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

const dbSchema = z.object({
  TURSO_DATABASE_URL: z.string().min(1, "TURSO_DATABASE_URL wajib diisi"),
  // Required for remote Turso (libsql://, https://); not needed for local file: databases.
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),
}).superRefine((v, ctx) => {
  if (!v.TURSO_DATABASE_URL.startsWith("file:") && !v.TURSO_AUTH_TOKEN) {
    ctx.addIssue({ code: "custom", path: ["TURSO_AUTH_TOKEN"], message: "TURSO_AUTH_TOKEN wajib untuk database Turso remote" });
  }
});

const serverSchema = z.object({
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL harus URL valid"),
  BETTER_AUTH_SECRET: z.string().min(isTest ? 1 : 32, "BETTER_AUTH_SECRET minimal 32 karakter (openssl rand -base64 32)"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.6-flash"),
});

const empty = (v: string | undefined) => (v && v.trim() ? v : undefined);

function format(error: z.ZodError) {
  return error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
}

export type DbEnv = z.infer<typeof dbSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export function getDbEnv(): DbEnv {
  const r = dbSchema.safeParse({ TURSO_DATABASE_URL: empty(process.env.TURSO_DATABASE_URL), TURSO_AUTH_TOKEN: empty(process.env.TURSO_AUTH_TOKEN) });
  if (!r.success) throw new Error(`Env database tidak valid:\n${format(r.error)}`);
  return r.data;
}

let serverEnv: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  if (serverEnv) return serverEnv;
  const r = serverSchema.safeParse({ BETTER_AUTH_URL: empty(process.env.BETTER_AUTH_URL), BETTER_AUTH_SECRET: empty(process.env.BETTER_AUTH_SECRET), NEXT_PUBLIC_APP_URL: empty(process.env.NEXT_PUBLIC_APP_URL) });
  if (!r.success) throw new Error(`Env auth tidak valid:\n${format(r.error)}`);
  return (serverEnv = r.data);
}

/** Gemini is optional: without a key, /api/chat uses its fixture reply. */
export function getGeminiConfig() {
  const r = geminiSchema.parse({ GEMINI_API_KEY: empty(process.env.GEMINI_API_KEY), GEMINI_MODEL: empty(process.env.GEMINI_MODEL) });
  return { apiKey: r.GEMINI_API_KEY, model: r.GEMINI_MODEL };
}

export function trustedOrigins(env: Pick<ServerEnv, "BETTER_AUTH_URL" | "NEXT_PUBLIC_APP_URL">) {
  return [...new Set([env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL].filter((v): v is string => Boolean(v)).map((v) => new URL(v).origin))];
}
