import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db/client";
import { getProfile } from "../../../lib/db/navi";
import { consumeCvReviewQuota, listCvReviews, saveCvReview } from "../../../lib/db/cv";
import { CV_MAX_BYTES, CV_MAX_CHARS, CV_MIN_CHARS, CvInputError, extractCvText, normaliseCvText } from "../../../lib/server/cv-parse";
import { generateCvReview } from "../../../lib/server/cv-review";

export const runtime = "nodejs";
export const maxDuration = 60;

const textSchema = z.object({ cvText: z.string().max(CV_MAX_CHARS * 2), targetRole: z.string().trim().max(120).optional() });
const FALLBACK = "Review CV dengan AI sedang tidak tersedia. CV-mu belum disimpan, coba lagi beberapa menit lagi.";

async function readInput(request: Request): Promise<{ cvText: string; targetRole?: string }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const len = Number(request.headers.get("content-length") ?? 0);
    if (len > CV_MAX_BYTES + 64 * 1024) throw new CvInputError("File CV maksimal 5MB.");
    const form = await request.formData().catch(() => null);
    if (!form) throw new CvInputError("Form tidak valid.");
    const role = typeof form.get("targetRole") === "string" ? String(form.get("targetRole")).slice(0, 120) : undefined;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) return { cvText: await extractCvText(file), targetRole: role };
    const text = form.get("cvText");
    return { cvText: typeof text === "string" ? text : "", targetRole: role };
  }
  const parsed = textSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new CvInputError("Teks CV tidak valid atau terlalu panjang.");
  return parsed.data;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  return NextResponse.json({ reviews: await listCvReviews(getDb(), user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  let input: { cvText: string; targetRole?: string };
  try { input = await readInput(request); } catch (e) {
    return NextResponse.json({ error: e instanceof CvInputError ? e.message : "Input CV tidak valid." }, { status: e instanceof CvInputError && e.message.includes("5MB") ? 413 : 400 });
  }
  const cvText = normaliseCvText(input.cvText);
  if (cvText.length < CV_MIN_CHARS) return NextResponse.json({ error: `Teks CV terlalu pendek (minimal ${CV_MIN_CHARS} karakter).` }, { status: 400 });
  const db = getDb();
  const profile = await getProfile(db, user.id);
  const targetRole = input.targetRole?.trim() || profile?.role || "Developer";
  if (!(await consumeCvReviewQuota(db, user.id))) return NextResponse.json({ error: "Batas review CV tercapai (5 per jam). Coba lagi nanti." }, { status: 429 });
  const outcome = await generateCvReview(cvText, targetRole, {});
  if (!outcome.ok) return NextResponse.json({ error: FALLBACK, reason: outcome.reason }, { status: 503 });
  const id = await saveCvReview(db, user.id, { targetRole, cvText, result: outcome.result, model: outcome.model });
  return NextResponse.json({ id, targetRole, ...outcome.result }, { status: 201 });
}
