import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db/client";
import { getCvReview } from "../../../../lib/db/cv";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  const { id } = await params;
  const review = id.length <= 64 ? await getCvReview(getDb(), user.id, id) : null;
  if (!review) return NextResponse.json({ error: "Review tidak ditemukan." }, { status: 404 });
  return NextResponse.json(review);
}
