import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    services: {
      database: Boolean(process.env.TURSO_DATABASE_URL),
      auth: Boolean(process.env.BETTER_AUTH_SECRET),
      gemini: Boolean(process.env.GEMINI_API_KEY)
    }
  });
}
