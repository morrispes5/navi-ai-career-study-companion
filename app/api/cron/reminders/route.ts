import { NextResponse } from "next/server";
import { runReminders } from "../../../../lib/db/engagement";
import { getDb } from "../../../../lib/db/client";
import { bearerMatches } from "../../../../lib/server/cron-auth";
import { sendResendEmail } from "../../../../lib/server/email";

export const runtime = "nodejs";

async function deliver(to: string, subject: string, html: string) {
  const sent = await sendResendEmail(to, subject, html);
  if (sent) return true;
  if (process.env.NODE_ENV === "production") return false;
  console.info(`[navi] reminder (dev, email tidak dikirim) untuk ${to}: ${subject}`);
  return true;
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Pengingat belum dikonfigurasi." }, { status: 503 });
  if (!bearerMatches(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  const result = await runReminders(getDb(), new Date(), deliver);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
