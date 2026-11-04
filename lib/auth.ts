import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getDb, schema } from "./db";
import { getServerEnv, trustedOrigins } from "./env";
import { escapeHtml } from "./html";

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn(`[auth] RESEND_API_KEY kosong; email "${subject}" untuk ${to} tidak dikirim.`); return; }
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Navi <onboarding@resend.dev>", to, subject, html }) });
  if (!res.ok) console.error("[auth] Resend error", res.status);
}

function createAuth() {
  const env = getServerEnv();
  const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } } : undefined;
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env),
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema: { user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(user.email, "Reset password Navi", `<p>Klik tautan ini untuk membuat password baru:</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`);
      },
    },
    socialProviders: google,
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth | undefined;
export function getAuth(): Auth { return (auth ??= createAuth()); }

export class UnauthorizedError extends Error { constructor() { super("Sesi login tidak ditemukan. Silakan masuk kembali."); this.name = "UnauthorizedError"; } }

export async function getSessionUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
