import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const requestSchema = z.object({ message: z.string().trim().min(1).max(1200), conversationId: z.string().uuid().optional() });
const responseSchema = z.object({ answer: z.string().trim().min(1).max(1600), nextAction: z.string().trim().min(1).max(240), followUp: z.string().trim().min(1).max(240).nullable() });
const responseFormat = { type: "text", mime_type: "application/json", schema: { type: "object", properties: { answer: { type: "string" }, nextAction: { type: "string" }, followUp: { type: ["string", "null"] } }, required: ["answer", "nextAction", "followUp"], additionalProperties: false } } as const;
const instruction = "Kamu adalah Navi, mentor karier untuk calon developer Indonesia. Berikan satu rekomendasi yang realistis, alasan atau trade-off-nya, lalu satu langkah kecil yang konkret. Gunakan konteks profil, rencana, dan catatan pengguna yang diberikan. Jangan menjanjikan pekerjaan, gaji, atau hasil pasti. Jika pengguna ingin mengubah target atau waktunya, jelaskan dampaknya dan tawarkan untuk membuka halaman Profil; jangan mengubah rencana otomatis. Jawab hangat dan ringkas dalam Bahasa Indonesia.";

type ChatReply = { answer: string; nextAction: string; followUp: string | null };
const fixture = (hours: string): ChatReply => ({ answer: `Dengan ${hours.toLowerCase()}, kita fokus pada konsistensi, bukan menambah materi sekaligus.`, nextAction: "Sisihkan 30 menit hari ini untuk menyelesaikan satu bagian kecil dari proyekmu.", followUp: "Bagian proyek mana yang paling ingin kamu lanjutkan minggu ini?" });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pesan chat tidak valid." }, { status: 400 });
  const authorization = request.headers.get("authorization");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!authorization || !url || !key) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  const db = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(accessToken);
  const userId = userData.user?.id;
  if (userError || !userId) return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 });
  const { data: profile, error: profileError } = await db.from("profiles").select("target_role,current_level,weekly_hours,target_months,learning_preference").eq("id", userId).single();
  if (profileError || !profile) return NextResponse.json({ error: "Profil belum siap." }, { status: 409 });
  const [{ data: plan }, { data: memories }] = await Promise.all([
    db.from("learning_plans").select("title,target_role,weekly_hours,target_months").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("memory_facts").select("label,value,reason").eq("user_id", userId).eq("category", "note").order("created_at").limit(12)
  ]);
  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const { data: conversation, error } = await db.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (error || !conversation) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
  }
  if (!conversationId) { const { data: conversation, error } = await db.from("conversations").insert({ user_id: userId, title: "Diskusi dengan Navi" }).select("id").single(); if (error || !conversation) return NextResponse.json({ error: "Percakapan tidak dapat dibuat." }, { status: 500 }); conversationId = conversation.id; }
  const { error: userMessageError } = await db.from("chat_messages").insert({ conversation_id: conversationId, role: "user", content: parsed.data.message });
  if (userMessageError) return NextResponse.json({ error: "Pesan tidak dapat disimpan." }, { status: 500 });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", userId);
  let reply: ChatReply = fixture(`${profile.weekly_hours} jam per minggu`); let source = "fixture";
  const memoryContext = (memories ?? []).map((item) => `- ${item.label}: ${item.value} (${item.reason})`).join("\n") || "Tidak ada catatan tambahan.";
  const planContext = plan ? `${plan.title}; target ${plan.target_role}; ${plan.weekly_hours} jam/minggu; target ${plan.target_months ?? "belum pasti"} bulan.` : "Rencana belum tersedia.";
  if (process.env.GEMINI_API_KEY) try { const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); const result = await ai.interactions.create({ model: process.env.GEMINI_MODEL || "gemini-3.6-flash", system_instruction: instruction, input: `Profil: target ${profile.target_role}; level ${profile.current_level}; waktu ${profile.weekly_hours} jam/minggu; target ${profile.target_months ?? "belum pasti"} bulan; preferensi ${profile.learning_preference}.\nRencana aktif: ${planContext}\nCatatan pengguna:\n${memoryContext}\n\nPesan: ${parsed.data.message}`, response_format: responseFormat }); const raw = JSON.parse(result.output_text || "") as Record<string, unknown>; reply = responseSchema.parse({ answer: typeof raw.answer === "string" ? raw.answer.slice(0, 1600) : "", nextAction: typeof raw.nextAction === "string" ? raw.nextAction.slice(0, 240) : "", followUp: raw.followUp === null ? null : typeof raw.followUp === "string" ? raw.followUp.slice(0, 240) : "" }); source = "gemini"; } catch { /* fixture is intentional */ }
  const { error: assistantMessageError } = await db.from("chat_messages").insert({ conversation_id: conversationId, role: "assistant", content: `${reply.answer}\n\nLangkah berikutnya: ${reply.nextAction}${reply.followUp ? `\n\n${reply.followUp}` : ""}` });
  if (assistantMessageError) return NextResponse.json({ error: "Jawaban Navi belum dapat disimpan." }, { status: 500 });
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", userId);
  return NextResponse.json({ ...reply, source, conversationId });
}
