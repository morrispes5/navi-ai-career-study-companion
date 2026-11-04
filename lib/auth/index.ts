import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { accounts, sessions, users, verifications } from "../../db/schema";
import { getDb } from "../db/client";
import { getServerEnv, trustedOrigins } from "../env";
import { escapeHtml } from "../html";

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Navi <onboarding@resend.dev>", to, subject, html }) });
  if (!res.ok) console.error("[navi] Resend error", res.status);
  return res.ok;
}

function build() {
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const env = getServerEnv();
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(env),
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema: { user: users, session: sessions, account: accounts, verification: verifications } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      requireEmailVerification: false,
      async sendResetPassword({ user, url }) {
        const sent = await sendEmail(user.email, "Reset password Navi", `<p>Klik tautan ini untuk membuat password baru:</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`);
        // Tanpa RESEND_API_KEY link hanya dicatat di log server (dev).
        if (!sent && process.env.NODE_ENV !== "production") console.info(`[navi] reset password untuk ${user.email}: ${url}`);
      },
    },
    socialProviders: googleId && googleSecret ? { google: { clientId: googleId, clientSecret: googleSecret } } : undefined,
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof build>;
let instance: Auth | undefined;
export function getAuth(): Auth { return (instance ??= build()); }

/** userId dari session server, atau null. Satu-satunya sumber userId yang boleh dipercaya. */
export async function getSessionUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
