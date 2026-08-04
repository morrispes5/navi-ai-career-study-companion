"use client";

import { Check, ChevronRight, CircleUserRound, Clock3, LogOut, MessageCircle, Pencil, Send, Sparkles, Target, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { applyPlanProposal, clearMemories, clearOnboardingDraft, completeTask, loadDashboard, MissingNaviProfileError, readOnboardingDraft, removeMemory, seedInitialNaviData, updateProfile, type DashboardData, type NaviProfile } from "../../lib/supabase/navi";
import { createClient } from "../../lib/supabase/client";

type Tab = "plan" | "chat" | "memory" | "profile";
type ChatItem = { role: "user" | "navi"; content: string };
const roleOptions = ["Frontend Developer", "Backend Developer", "UI/UX Designer", "Data Analyst"];
const levelOptions = ["Baru mulai", "Sudah memahami dasar HTML & CSS", "Pernah membuat beberapa proyek", "Sudah siap melamar"];
const hourOptions = ["3 jam per minggu", "6 jam per minggu", "10 jam per minggu", "15+ jam per minggu"];
const timelineOptions = ["3 bulan", "6–9 bulan", "9–12 bulan", "Belum pasti"];
const preferenceOptions = ["Belajar lewat membangun proyek", "Belajar terstruktur langkah demi langkah", "Belajar dari materi visual", "Belajar sambil diskusi"];

function Logo() { return <span className="logo-mark"><Sparkles size={17} fill="currentColor" /> Navi</span>; }

export default function WorkspacePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("plan"); const [data, setData] = useState<DashboardData | null>(null); const [email, setEmail] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(""); const [chat, setChat] = useState<ChatItem[]>([{ role: "navi", content: "Halo! Aku sudah menyiapkan langkah pertama di rencanamu. Ada yang ingin kamu diskusikan?" }]); const [chatLoading, setChatLoading] = useState(false);
  const [editing, setEditing] = useState(false); const [editedProfile, setEditedProfile] = useState<NaviProfile | null>(null); const [proposal, setProposal] = useState(false); const [saving, setSaving] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  async function refresh() {
    setLoading(true); setError("");
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { window.location.assign("/login"); return; }
    setEmail(userData.user.email ?? "");
    try {
      let dashboard: DashboardData;
      try { dashboard = await loadDashboard(); }
      catch (loadError) {
        if (!(loadError instanceof MissingNaviProfileError)) throw loadError;
        const draft = readOnboardingDraft();
        if (!draft) { setNeedsOnboarding(true); return; }
        await seedInitialNaviData(draft); clearOnboardingDraft(); dashboard = await loadDashboard();
      }
      setData(dashboard); setEditedProfile(dashboard.profile); setNeedsOnboarding(false);
    } catch { setError("Koneksi data sempat terputus. Coba lagi sebentar."); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function markTaskDone() {
    if (!data?.plan.task) return; setSaving(true);
    try { await completeTask(data.plan.task.id); setData({ ...data, plan: { ...data.plan, task: { ...data.plan.task, status: "completed" } } }); } catch { setError("Tugas belum dapat diperbarui. Coba lagi."); } finally { setSaving(false); }
  }
  async function deleteMemory(id: string) { if (!data) return; try { await removeMemory(id); setData({ ...data, memories: data.memories.filter((memory) => memory.id !== id) }); } catch { setError("Memori belum dapat dihapus."); } }
  async function deleteAllMemories() { if (!data || !confirm("Hapus semua memori yang dipakai Navi?")) return; try { await clearMemories(); setData({ ...data, memories: [] }); } catch { setError("Memori belum dapat dihapus."); } }
  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!message.trim() || chatLoading || !data) return;
    const text = message.trim(); setMessage(""); setChat((items) => [...items, { role: "user", content: text }]); setChatLoading(true);
    try {
      const { data: sessionData } = await createClient().auth.getSession();
      if (!sessionData.session?.access_token) throw new Error("Sesi berakhir. Silakan masuk kembali.");
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ message: text, conversationId: data.conversationId ?? undefined }) });
      const result = await response.json() as { answer?: string; nextAction?: string; followUp?: string | null; conversationId?: string; error?: string };
      if (!response.ok || !result.answer || !result.nextAction) throw new Error(result.error ?? "Navi belum dapat membalas.");
      setChat((items) => [...items, { role: "navi", content: `${result.answer}\n\nLangkah berikutnya: ${result.nextAction}${result.followUp ? `\n\n${result.followUp}` : ""}` }]);
      setData({ ...data, conversationId: result.conversationId ?? data.conversationId });
    } catch (chatError) { setChat((items) => [...items, { role: "navi", content: chatError instanceof Error ? chatError.message : "Navi belum dapat membalas. Coba lagi sebentar." }]); } finally { setChatLoading(false); }
  }
  async function saveProfile() {
    if (!data || !editedProfile) return; setSaving(true); setError("");
    try { await updateProfile(editedProfile); setData({ ...data, profile: editedProfile }); setEditing(false); setProposal(true); } catch { setError("Profil belum dapat diperbarui."); } finally { setSaving(false); }
  }
  async function applyProposal() {
    if (!data || !editedProfile) return; setSaving(true);
    try { await applyPlanProposal(data.plan.id, editedProfile); setData({ ...data, plan: { ...data.plan, title: `Jalur ${editedProfile.role}` } }); setProposal(false); } catch { setError("Perubahan rencana belum dapat diterapkan."); } finally { setSaving(false); }
  }
  async function logout() { await createClient().auth.signOut({ scope: "local" }); window.location.assign("/"); }

  if (loading) return <main className="workspace-loader"><Logo /><p>Memuat rencana belajarmu…</p></main>;
  if (needsOnboarding) return <main className="workspace-loader"><Logo /><h1>Hubungkan rencanamu</h1><p>Akunmu sudah berhasil masuk, tetapi jawaban onboarding belum tersimpan ke Supabase. Isi 5 pertanyaan sekali lagi agar semuanya sinkron.</p><button className="primary-button" onClick={() => window.location.assign("/?start=1")}>Lengkapi onboarding</button><button className="back-button" onClick={logout}>Keluar akun</button></main>;
  if (error && !data) return <main className="workspace-loader"><Logo /><h1>Koneksi data terganggu</h1><p>{error}</p><button className="primary-button" onClick={refresh}>Coba lagi</button><button className="back-button" onClick={logout}>Keluar akun</button></main>;
  if (!data || !data.plan.id) return <main className="workspace-loader"><Logo /><h1>Rencanamu belum tersedia</h1><p>Selesaikan onboarding untuk menyimpan rencana pertamamu.</p><button className="primary-button" onClick={() => router.push("/")}>Buat rencana belajarku</button></main>;

  const nav = [{ id: "plan" as Tab, label: "Rencanaku", icon: Target }, { id: "chat" as Tab, label: "Chat dengan Navi", icon: MessageCircle }, { id: "memory" as Tab, label: "Memori", icon: Sparkles }, { id: "profile" as Tab, label: "Profil", icon: UserRound }];
  return <main className="workspace"><aside className="sidebar"><Logo /><nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.icon />{item.label}</button>)}</nav><div className="sidebar-bottom"><button onClick={logout}><LogOut /> Keluar akun</button><div className="mini-profile"><span>{email.slice(0, 1).toUpperCase() || "N"}</span><div><b>{data.profile.role}</b><small>{email}</small></div></div></div></aside><header className="mobile-nav"><Logo /><button aria-label="Buka profil" onClick={() => setTab("profile")}><CircleUserRound /></button></header><section className="content">{error && <p className="inline-error" role="alert">{error}</p>}
    {tab === "plan" && <><header className="content-head"><div><p className="eyebrow"><span /> Rencana belajarmu</p><h1>{data.plan.title}</h1><p>{data.profile.hours} · Target {data.profile.timeline}</p></div><button className="secondary-button" onClick={() => setTab("profile")}><Pencil size={15} /> Sesuaikan</button></header>{data.plan.task ? <article className="next-task"><div className="task-top"><span className="focus-tag"><Sparkles size={13} /> Mulai dari sini</span><span className="time"><Clock3 size={14} /> 90 menit</span></div><h2>{data.plan.task.title}</h2><p>{data.plan.task.description}</p><div className="task-footer"><div className="task-tags"><span>Praktik</span><span>Proyek kecil</span></div><button className="done-button" disabled={saving || data.plan.task.status === "completed"} onClick={markTaskDone}>{data.plan.task.status === "completed" ? <><Check size={16} /> Selesai</> : "Tandai selesai"}</button></div></article> : <div className="empty"><h3>Tugas pertama sedang disiapkan</h3><p>Muat ulang sebentar lagi.</p></div>}<div className="section-title"><h2>Perjalanan belajarmu</h2><span>{data.plan.milestones.filter((item) => item.done).length} / {data.plan.milestones.length} tahap</span></div><div>{data.plan.milestones.map((milestone) => <article className={`milestone ${milestone.done ? "done" : ""}`} key={milestone.id}><span className="timeline-dot">{milestone.done && <Check size={13} />}</span><div><p>{milestone.range}</p><h3>{milestone.title}</h3><span>{milestone.description}</span></div></article>)}</div></>}
    {tab === "chat" && <div className="chat"><header className="content-head"><div><p className="eyebrow"><span /> Mentor di sampingmu</p><h1>Chat dengan Navi</h1><p>Bahas hambatanmu, lalu ambil satu langkah kecil.</p></div></header><div className="messages" aria-live="polite">{chat.map((item, index) => <div className={`message ${item.role}`} key={`${item.role}-${index}`}><p>{item.content}</p></div>)}{chatLoading && <div className="message navi"><p>Navi sedang menyusun saran…</p></div>}</div><form className="composer" onSubmit={sendChat}><input aria-label="Pesan untuk Navi" placeholder="Contoh: Aku bingung mulai dari mana hari ini" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} /><button aria-label="Kirim pesan" disabled={chatLoading}><Send size={17} /></button></form></div>}
    {tab === "memory" && <><header className="content-head"><div><p className="eyebrow"><span /> Yang Navi ingat</p><h1>Memorimu</h1><p>Kamu selalu mengendalikan fakta yang dipakai untuk menyusun saran.</p></div></header><div className="memory-note"><Sparkles size={18} /><p>Setiap fakta berikut dipakai hanya untuk membuat rencana dan saranmu lebih relevan.</p></div><div className="memory-list">{data.memories.map((memory) => <article key={memory.id}><div><p>{memory.label}</p><h3>{memory.value}</h3><span>{memory.reason}</span></div><button aria-label={`Hapus memori ${memory.label}`} onClick={() => deleteMemory(memory.id)}><Trash2 size={17} /></button></article>)}</div>{data.memories.length ? <button className="clear-button" onClick={deleteAllMemories}><Trash2 size={15} /> Hapus semua memori</button> : <div className="empty"><h3>Belum ada memori</h3><p>Navi tidak akan mengandalkan fakta lama sampai kamu menambahkannya lagi lewat profil.</p></div>}</>}
    {tab === "profile" && editedProfile && <><header className="content-head"><div><p className="eyebrow"><span /> Akun & preferensi</p><h1>Profilmu</h1><p>{email}</p></div><button className="secondary-button" onClick={logout}><LogOut size={15} /> Keluar</button></header><div className="account-card"><h2>Sesuaikan rencana</h2><p>Ubah kondisi belajarmu terlebih dahulu. Navi akan menjelaskan dampaknya sebelum rencana diperbarui.</p>{editing ? <div className="profile-form"><ProfileSelect label="Target karier" value={editedProfile.role} options={roleOptions} onChange={(role) => setEditedProfile({ ...editedProfile, role })} /><ProfileSelect label="Level saat ini" value={editedProfile.level} options={levelOptions} onChange={(level) => setEditedProfile({ ...editedProfile, level })} /><ProfileSelect label="Waktu per minggu" value={editedProfile.hours} options={hourOptions} onChange={(hours) => setEditedProfile({ ...editedProfile, hours })} /><ProfileSelect label="Target waktumu" value={editedProfile.timeline} options={timelineOptions} onChange={(timeline) => setEditedProfile({ ...editedProfile, timeline })} /><ProfileSelect label="Cara belajar" value={editedProfile.preference} options={preferenceOptions} onChange={(preference) => setEditedProfile({ ...editedProfile, preference })} /><div className="profile-actions"><button className="back-button" onClick={() => { setEditing(false); setEditedProfile(data.profile); }}>Batal</button><button className="primary-button" disabled={saving} onClick={saveProfile}>Simpan perubahan</button></div></div> : <button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={15} /> Ubah profil</button>}</div>{proposal && <article className="proposal-card"><p className="eyebrow"><span /> Proposal perubahan</p><h2>Perbarui asumsi rencana?</h2><p>Navi akan menyesuaikan target jalur dan beban rencana menjadi {editedProfile.hours.toLowerCase()} untuk target {editedProfile.role}. Tahap yang sudah ada tidak akan dihapus.</p><div className="profile-actions"><button className="back-button" onClick={() => { setProposal(false); setEditedProfile(data.profile); }}>Tetap pakai rencana lama</button><button className="primary-button" disabled={saving} onClick={applyProposal}>Terapkan perubahan <ChevronRight size={16} /></button></div></article>}</>}
  </section><nav className="mobile-tabs">{nav.map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}><item.icon />{item.label}</button>)}</nav></main>;
}

function ProfileSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="form-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
}
