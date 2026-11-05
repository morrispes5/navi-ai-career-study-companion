import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db/client";
import { saveSuggestionToTracker } from "../../../../lib/db/jobs-suggest";
import { jobSearchUrl, jobSuggestionSchema } from "../../../../lib/server/job-suggestions-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  const parsed = jobSuggestionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saran lowongan tidak valid." }, { status: 400 });
  // URL is rebuilt server-side; never trust a client-supplied link.
  const saved = await saveSuggestionToTracker(getDb(), user.id, { ...parsed.data, url: jobSearchUrl(parsed.data.searchQuery, parsed.data.location) });
  return NextResponse.json({ ...saved, message: saved.created ? "Disimpan ke pelacak lamaran (wishlist)." : "Saran ini sudah ada di pelacak lamaranmu." }, { status: saved.created ? 201 : 200 });
}
