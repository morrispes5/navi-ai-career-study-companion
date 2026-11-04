import { GoogleGenAI } from "@google/genai";
import { requireUserId } from "../../../lib/auth";
import { addChatMessage, getActivePlanSummary, getOrCreateConversation, getProfileRow, listMemories } from "../../../lib/server/navi";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const requestSchema = z.object({ message: z.string().trim().min(1).max(1200), conversationId: z.string().min(1).max(64).optional() });
const responseSchema = z.object({ answer: z.string().trim().min(1).max(1600), nextAction: z.string().trim().min(1).max(240), followUp: z.string().trim().min(1).max(240).nullable() });
const responseFormat = { type: "text", mime_type: "application/json", schema: { type: "object", properties: { answer: { type: "string" }, nextAction: { type: "string" }, followUp: { type: ["string", "null"] } }, required: ["answer", "nextAction", "followUp"], additionalProperties: false } } as const;
const instruction = "Kamu adalah Navi, mentor karier untuk calon developer Indonesia. Berikan satu rekomendasi yang realistis, alasan atau trade-off-nya, lalu satu langkah kecil yang konkret. Gunakan konteks profil, rencana, dan catatan pengguna yang diberikan. Jangan menjanjikan pekerjaan, gaji, atau hasil pasti. Jika pengguna ingin mengubah target atau waktunya, jelaskan dampaknya dan tawarkan untuk membuka halaman Profil; jangan mengubah rencana otomatis. Jawab hangat dan ringkas dalam Bahasa Indonesia.";

type ChatReply = { answer: string; nextAction: string; followUp: string | null };
const fixture = (hours: string): ChatReply => ({ answer: `Dengan ${hours.toLowerCase()}, kita fokus pada konsistensi, bukan menambah materi sekaligus.`, nextAction: "Sisihkan 30 menit hari ini untuk menyelesaikan satu bagian kecil dari proyekmu.", followUp: "Bagian proyek mana yang paling ingin kamu lanjutkan minggu ini?" });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pesan chat tidak valid." }, { status: 400 });
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Silakan masuk untuk memakai Navi." }, { status: 401 }); }
  const profile = await getProfileRow(userId);
  if (!profile) return NextResponse.json({ error: "Profil belum siap." }, { status: 409 });
  const [plan, memories] = await Promise.all([getActivePlanSummary(userId), listMemories(userId, true, 12)]);
  const conversationId = await getOrCreateConversation(userId, parsed.data.conversationId);
  if (!conversationId) return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
  try { await addChatMessage(userId, conversationId, "user", parsed.data.message); } catch { return NextResponse.json({ error: "Pesan tidak dapat disimpan." }, { status: 500 }); }
  let reply: ChatReply = fixture(`${profile.weeklyHours ?? 0} jam per minggu`); let source = "fixture";
  const memoryContext = memories.map((item) => `- ${item.label}: ${item.value} (${item.reason})`).join("\n") || "Tidak ada catatan tambahan.";
  const planContext = plan ? `${plan.title}; target ${profile.targetRole}; ${profile.weeklyHours} jam/minggu; target ${profile.targetMonths ?? "belum pasti"} bulan.` : "Rencana belum tersedia.";
  if (process.env.GEMINI_API_KEY) try { const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); const result = await ai.interactions.create({ model: process.env.GEMINI_MODEL || "gemini-3.6-flash", system_instruction: instruction, input: `Profil: target ${profile.targetRole}; level ${profile.skills?.find((s) => s.startsWith("level:"))?.slice(6) ?? profile.currentLevel}; waktu ${profile.weeklyHours} jam/minggu; target ${profile.targetMonths ?? "belum pasti"} bulan; preferensi ${profile.learningPreference}.\nRencana aktif: ${planContext}\nCatatan pengguna:\n${memoryContext}\n\nPesan: ${parsed.data.message}`, response_format: responseFormat }); const raw = JSON.parse(result.output_text || "") as Record<string, unknown>; reply = responseSchema.parse({ answer: typeof raw.answer === "string" ? raw.answer.slice(0, 1600) : "", nextAction: typeof raw.nextAction === "string" ? raw.nextAction.slice(0, 240) : "", followUp: raw.followUp === null ? null : typeof raw.followUp === "string" ? raw.followUp.slice(0, 240) : "" }); source = "gemini"; } catch { /* fixture is intentional */ }
  try { await addChatMessage(userId, conversationId, "assistant", `${reply.answer}\n\nLangkah berikutnya: ${reply.nextAction}${reply.followUp ? `\n\n${reply.followUp}` : ""}`, source === "gemini" ? "gemini" : "fixture"); }
  catch { return NextResponse.json({ error: "Jawaban Navi belum dapat disimpan." }, { status: 500 }); }
  return NextResponse.json({ ...reply, source, conversationId });
}
