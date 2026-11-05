import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../auth";
import { getDb } from "../db/client";
import { getProfile } from "../db/navi";
import { consumeCvReviewQuota, refundCvReviewQuota, saveCvReview } from "../db/cv";
import { CV_MAX_BODY_BYTES, CV_MAX_CHARS, CV_MIN_CHARS, CvInputError, extractCvText, normaliseCvText, readBodyLimited } from "./cv-parse";
import { defaultGenerate, generateCvReview, type GenerateFn } from "./cv-review";

const textSchema = z.object({ cvText: z.string().max(CV_MAX_CHARS * 2), targetRole: z.string().trim().max(120).optional() });
const FALLBACK = "Review CV dengan AI sedang tidak tersedia. CV-mu belum disimpan, coba lagi beberapa menit lagi.";

export type CvReviewDeps = { generate: GenerateFn; geminiTimeoutMs?: number; parseTimeoutMs?: number; maxBodyBytes?: number };

async function readInput(request: Request, deps: CvReviewDeps): Promise<{ cvText: string; targetRole?: string }> {
  const type = request.headers.get("content-type") ?? "";
  const body = await readBodyLimited(request, deps.maxBodyBytes ?? CV_MAX_BODY_BYTES);
  if (type.includes("multipart/form-data")) {
    const form = await new Response(body, { headers: { "content-type": type } }).formData().catch(() => null);
    if (!form) throw new CvInputError("Form tidak valid.");
    const role = typeof form.get("targetRole") === "string" ? String(form.get("targetRole")).slice(0, 120) : undefined;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) return { cvText: await extractCvText(file, { timeoutMs: deps.parseTimeoutMs }), targetRole: role };
    const text = form.get("cvText");
    return { cvText: typeof text === "string" ? text : "", targetRole: role };
  }
  let json: unknown = null;
  try { json = JSON.parse(new TextDecoder().decode(body)); } catch { /* invalid */ }
  const parsed = textSchema.safeParse(json);
  if (!parsed.success) throw new CvInputError("Teks CV tidak valid atau terlalu panjang.");
  return parsed.data;
}

/** POST handler factory; Gemini is injected so tests never need a global override. */
export function createCvReviewPost(deps: CvReviewDeps = { generate: defaultGenerate }) {
  return async function POST(request: Request) {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
    const db = getDb();
    // Rate limit first, before any body buffering or PDF/DOCX parsing.
    if (!(await consumeCvReviewQuota(db, user.id))) {
      return NextResponse.json({ error: "Batas review CV tercapai (5 per jam). Coba lagi nanti." }, { status: 429 });
    }
    let input: { cvText: string; targetRole?: string };
    try { input = await readInput(request, deps); } catch (e) {
      await refundCvReviewQuota(db, user.id);
      if (e instanceof CvInputError) return NextResponse.json({ error: e.message }, { status: e.status });
      return NextResponse.json({ error: "Input CV tidak valid." }, { status: 400 });
    }
    const cvText = normaliseCvText(input.cvText);
    if (cvText.length < CV_MIN_CHARS) {
      await refundCvReviewQuota(db, user.id);
      return NextResponse.json({ error: `Teks CV terlalu pendek (minimal ${CV_MIN_CHARS} karakter).` }, { status: 400 });
    }
    const profile = await getProfile(db, user.id);
    const targetRole = input.targetRole?.trim() || profile?.role || "Developer";
    const outcome = await generateCvReview(cvText, targetRole, { generate: deps.generate, timeoutMs: deps.geminiTimeoutMs });
    if (!outcome.ok) {
      await refundCvReviewQuota(db, user.id);
      console.warn("[navi] CV review unavailable:", outcome.reason);
      return NextResponse.json({ error: FALLBACK }, { status: 503 });
    }
    const id = await saveCvReview(db, user.id, { targetRole, cvText, result: outcome.result, model: outcome.model });
    return NextResponse.json({ id, targetRole, ...outcome.result }, { status: 201 });
  };
}
