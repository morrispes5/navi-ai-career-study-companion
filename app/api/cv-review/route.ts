import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db/client";
import { listCvReviews } from "../../../lib/db/cv";
import { createCvReviewPost } from "../../../lib/server/cv-review-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  return NextResponse.json({ reviews: await listCvReviews(getDb(), user.id) });
}

export const POST = createCvReviewPost();
