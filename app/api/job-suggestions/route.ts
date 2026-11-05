import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db/client";
import { getProfile } from "../../../lib/db/navi";
import { consumeJobSuggestQuota, getProfileSkills } from "../../../lib/db/jobs-suggest";
import { generateJobSuggestions } from "../../../lib/server/job-suggestions";
import { jobSearchUrl } from "../../../lib/server/job-suggestions-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ location: z.string().trim().max(80).optional(), skills: z.array(z.string().trim().max(60)).max(20).optional() }).strict();
const FALLBACK = "Saran lowongan dengan AI sedang tidak tersedia. Coba lagi beberapa menit lagi.";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid." }, { status: 400 });
  const db = getDb();
  const profile = await getProfile(db, user.id);
  if (!profile?.role) return NextResponse.json({ suggestions: [], empty: "no_profile", message: "Lengkapi target karier di Profil dulu agar Navi bisa menyarankan lowongan." });
  if (!(await consumeJobSuggestQuota(db, user.id))) return NextResponse.json({ error: "Batas saran lowongan tercapai (10 per jam). Coba lagi nanti." }, { status: 429 });
  const skills = parsed.data.skills?.length ? parsed.data.skills : await getProfileSkills(db, user.id);
  const outcome = await generateJobSuggestions({ role: profile.role, level: profile.level, skills, location: parsed.data.location });
  if (!outcome.ok) return NextResponse.json({ error: FALLBACK, reason: outcome.reason }, { status: 503 });
  const suggestions = outcome.result.suggestions.map((s) => ({ ...s, url: jobSearchUrl(s.searchQuery, s.location) }));
  return NextResponse.json({ role: profile.role, suggestions, ...(suggestions.length ? {} : { empty: "no_results", message: "Belum ada saran yang cocok. Coba ubah lokasi atau lengkapi skill di Profil." }) });
}
