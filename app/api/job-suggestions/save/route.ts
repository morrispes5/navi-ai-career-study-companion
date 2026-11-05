import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db/client";
import { consumeJobSaveQuota, saveSuggestionToTracker } from "../../../../lib/db/jobs-suggest";
import { jobSearchUrl, jobSuggestionSchema } from "../../../../lib/server/job-suggestions-schema";

export const runtime = "nodejs";

const collapse = (s: string) => s.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim();
const dedupe = (xs: string[]) => [...new Map(xs.map((x) => collapse(x)).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];
// Strict: unknown keys (e.g. a client-supplied url) are rejected; strings are normalized server-side.
const saveSchema = jobSuggestionSchema.strict().transform((s) => ({
  ...s, title: collapse(s.title), companyType: collapse(s.companyType), location: collapse(s.location), matchReason: collapse(s.matchReason),
  searchQuery: collapse(s.searchQuery), matchedSkills: dedupe(s.matchedSkills), missingSkills: dedupe(s.missingSkills),
})).refine((s) => s.title && s.companyType && s.location && s.searchQuery && s.matchReason);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saran lowongan tidak valid." }, { status: 400 });
  const db = getDb();
  if (!(await consumeJobSaveQuota(db, user.id))) return NextResponse.json({ error: "Terlalu banyak penyimpanan. Coba lagi nanti." }, { status: 429 });
  // URL is rebuilt server-side; never trust a client-supplied link.
  const saved = await saveSuggestionToTracker(db, user.id, { ...parsed.data, url: jobSearchUrl(parsed.data.searchQuery, parsed.data.location) });
  if (saved.capped) return NextResponse.json({ error: "Pelacak lamaranmu sudah penuh (maks. 1000). Hapus beberapa lamaran dulu." }, { status: 409 });
  return NextResponse.json({ id: saved.id, created: saved.created, message: saved.created ? "Disimpan ke pelacak lamaran (wishlist)." : "Saran ini sudah ada di pelacak lamaranmu." }, { status: saved.created ? 201 : 200 });
}
