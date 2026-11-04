import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { accounts, sessions, users, verifications } from "../../db/schema";
import { getDb } from "../db/client";

function build() {
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema: { user: users, session: sessions, account: accounts, verification: verifications } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      requireEmailVerification: false,
      async sendResetPassword({ user, url }) {
        if (!process.env.RESEND_API_KEY) {
          // TODO(M1 follow-up): kirim email via Resend. Tanpa RESEND_API_KEY link hanya dicatat di log server (dev).
          if (process.env.NODE_ENV !== "production") console.info(`[navi] reset password untuk ${user.email}: ${url}`);
          return;
        }
        // TODO: integrasi Resend (RESEND_API_KEY + EMAIL_FROM).
        console.warn("[navi] RESEND_API_KEY terisi tetapi pengiriman email belum diimplementasikan.");
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
