import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { headers } from "next/headers";
import { accounts, sessions, users, verifications } from "../../db/schema";
import { getDb } from "../db/client";
import { getServerEnv, trustedOrigins } from "../env";
import { escapeHtml } from "../html";
import { sendResendEmail } from "../server/email";

/** Production without RESEND_API_KEY cannot deliver reset links: fail loudly instead of silently succeeding. */
export function assertResetEmailConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production" && !env.RESEND_API_KEY?.trim()) {
    console.error("[navi] RESEND_API_KEY belum diset di production: email reset password tidak bisa dikirim.");
    throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_NOT_CONFIGURED", message: "Pengiriman email reset belum dikonfigurasi." });
  }
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
        assertResetEmailConfigured();
        const sent = await sendResendEmail(user.email, "Reset password Navi", `<p>Klik tautan ini untuk membuat password baru:</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`);
        // Tanpa RESEND_API_KEY link hanya dicatat di log server (dev).
        if (!sent && process.env.NODE_ENV === "production") throw new APIError("BAD_GATEWAY", { code: "EMAIL_SEND_FAILED", message: "Email reset gagal dikirim." });
        if (!sent) console.info(`[navi] reset password untuk ${user.email}: ${url}`);
      },
    },
    socialProviders: googleId && googleSecret ? { google: { clientId: googleId, clientSecret: googleSecret } } : undefined,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/request-password-reset" || ctx.path === "/forget-password") assertResetEmailConfigured();
      }),
    },
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
