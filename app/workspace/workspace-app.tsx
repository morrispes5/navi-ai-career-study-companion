"use client";

import { Briefcase, Check, ChevronRight, CircleUserRound, Clock3, FileClock, Lightbulb, LogOut, MessageCircle, Pencil, Plus, Send, Sparkles, Target, Trash2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { applyReplan, clearMemories, completeTask, createMemory, getSessionInfo, loadDashboard, removeMemory, seedInitialNaviData, updateMemory } from "../../lib/navi/actions";
import { clearOnboardingDraft, readOnboardingDraft } from "../../lib/navi/draft";
import { previewReplan, type NaviProfile } from "../../lib/navi/profile";
import type { DashboardData, NaviMemory } from "../../lib/db/navi";
import { authClient } from "../../lib/auth/client";
import { JobTracker } from "./jobs/job-tracker";

export type WorkspaceView = "today" | "plan" | "chat" | "memory" | "profile" | "jobs";
const roleOptions = ["Frontend Developer", "Backend Developer", "UI/UX Designer", "Data Analyst"];
const levelOptions = ["Baru mulai", "Sudah memahami dasar HTML & CSS", "Pernah membuat beberapa proyek", "Sudah siap melamar"];
const hourOptions = ["3 jam per minggu", "6 jam per minggu", "10 jam per minggu", "15+ jam per minggu"];
const timelineOptions = ["3 bulan", "6-9 bulan", "9-12 bulan", "Belum pasti"];
const preferenceOptions = ["Belajar lewat membangun proyek", "Belajar terstruktur langkah demi langkah", "Belajar dari materi visual", "Belajar sambil diskusi"];

const navigation: { id: WorkspaceView; label: string; href: string; icon: typeof Target }[] = [
  { id: "today", label: "Hari ini", href: "/workspace", icon: Target },
  { id: "plan", label: "Rencana", href: "/workspace/plan", icon: FileClock },
  { id: "chat", label: "Chat", href: "/workspace/chat", icon: MessageCircle },
  { id: "memory", label: "Memori", href: "/workspace/memory", icon: Sparkles },
  { id: "jobs", label: "Lamaran", href: "/workspace/jobs", icon: Briefcase },
  { id: "profile", label: "Profil", href: "/workspace/profile", icon: UserRound }
];

function Logo() { return <Link href="/" className="logo-mark"><Sparkles size={17} fill="currentColor" /> Navi</Link>; }
const profileFacts = (profile: NaviProfile) => [
  { label: "Target karier", value: profile.role, reason: "Membantu Navi memilih jalur dan latihan yang relevan." },
  { label: "Level saat ini", value: profile.level, reason: "Menentukan titik mulai dan tingkat kesulitan tugas." },
  { label: "Waktu tersedia", value: profile.hours, reason: "Menjaga beban mingguan tetap realistis." },
  { label: "Cara belajar", value: profile.preference, reason: "Menentukan bentuk latihan yang ditawarkan." }
];

export function WorkspaceApp({ view }: { view: WorkspaceView }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [editedProfile, setEditedProfile] = useState<NaviProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [memoryForm, setMemoryForm] = useState({ label: "", value: "", reason: "" });
  const [editingMemory, setEditingMemory] = useState<NaviMemory | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const session = await getSessionInfo();
      if (!session) { window.location.assign("/login"); return; }
      setEmail(session.email);
      let dashboard = await loadDashboard();
      if (!dashboard) {
        const draft = readOnboardingDraft();
        if (!draft) { setNeedsOnboarding(true); return; }
        await seedInitialNaviData(draft); clearOnboardingDraft(); dashboard = await loadDashboard();
        if (!dashboard) throw new Error("Rencana belum tersedia.");
      }
      setData(dashboard); setEditedProfile(dashboard.profile); setNeedsOnboarding(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Koneksi data sempat terputus. Coba lagi sebentar.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const notes = useMemo(() => data?.memories.filter((memory) => memory.category === "note") ?? [], [data]);
  const proposal = data && editedProfile ? previewReplan(data.profile, editedProfile) : null;

  async function markDone(taskId: string) {
    setSavingTask(taskId); setError("");
    try { await completeTask(taskId); setNotice("Tugas selesai. Navi sudah memilih langkah berikutnya."); await refresh(); }
    catch { setError("Tugas belum dapat diperbarui. Coba lagi."); }
    finally { setSavingTask(null); }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || chatLoading || !data) return;
    setMessage(""); setChatLoading(true); setError("");
    const optimistic = { id: `local-${Date.now()}`, role: "user" as const, content: text, createdAt: new Date().toISOString() };
    setData({ ...data, messages: [...data.messages, optimistic] });
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, conversationId: data.conversationId ?? undefined }) });
      const result = await response.json() as { answer?: string; nextAction?: string; followUp?: string | null; conversationId?: string; error?: string };
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok || !result.answer || !result.nextAction) throw new Error(result.error ?? "Navi belum dapat membalas.");
      const reply = `${result.answer}\n\nLangkah berikutnya: ${result.nextAction}${result.followUp ? `\n\n${result.followUp}` : ""}`;
      setData((current) => current ? { ...current, conversationId: result.conversationId ?? current.conversationId, messages: [...current.messages, { id: `reply-${Date.now()}`, role: "navi", content: reply, createdAt: new Date().toISOString() }] } : current);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Navi belum dapat membalas. Coba lagi sebentar.");
    } finally { setChatLoading(false); }
  }

  async function submitMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memoryForm.label.trim() || !memoryForm.value.trim() || !memoryForm.reason.trim()) return;
    try {
      if (editingMemory) await updateMemory(editingMemory.id, memoryForm); else await createMemory(memoryForm);
      setMemoryForm({ label: "", value: "", reason: "" }); setEditingMemory(null); setNotice(editingMemory ? "Memori diperbarui." : "Catatan untuk Navi ditambahkan."); await refresh();
    } catch { setError("Memori belum dapat disimpan."); }
  }
  async function deleteMemory(id: string) { try { await removeMemory(id); setNotice("Memori dihapus."); await refresh(); } catch { setError("Memori belum dapat dihapus."); } }
  async function deleteAllMemories() { if (!confirm("Hapus semua catatan yang dipakai Navi?")) return; try { await clearMemories(); setNotice("Semua catatan dihapus."); await refresh(); } catch { setError("Memori belum dapat dihapus."); } }
  function openProfileProposal() { if (!data || !editedProfile) return; if (JSON.stringify(data.profile) === JSON.stringify(editedProfile)) { setNotice("Belum ada perubahan profil untuk diterapkan."); return; } setProposalOpen(true); }
  async function confirmReplan() { if (!editedProfile) return; setApplyingPlan(true); try { await applyReplan(editedProfile); setProposalOpen(false); setEditingProfile(false); setNotice("Rencana baru dibuat. Capaian lama tetap tersimpan di riwayat."); await refresh(); } catch { setError("Rencana belum dapat diperbarui."); } finally { setApplyingPlan(false); } }
  async function logout() { await authClient.signOut(); window.location.assign("/"); }

  if (loading) return <main className="workspace-loader"><Logo /><p>Memuat rencana belajarmu...</p></main>;
  if (needsOnboarding) return <main className="workspace-loader"><Logo /><h1>Hubungkan rencanamu</h1><p>Akunmu sudah masuk, tetapi jawaban onboarding belum tersimpan. Isi lima pertanyaan agar rencanamu bisa dibuat.</p><Link className="primary-button" href="/?start=1">Lengkapi onboarding</Link><button className="back-button" onClick={logout}>Keluar akun</button></main>;
  if (!data) return <main className="workspace-loader"><Logo /><h1>Data belum siap</h1><p>{error || "Rencana belum dapat dimuat."}</p><button className="primary-button" onClick={refresh}>Coba lagi</button><button className="back-button" onClick={logout}>Keluar akun</button></main>;

  return <main className="workspace"><aside className="sidebar"><Logo /><nav>{navigation.map((item) => { const Icon = item.icon; return <Link key={item.id} className={view === item.id ? "active" : ""} href={item.href}><Icon />{item.label}</Link>; })}</nav><div className="sidebar-bottom"><button onClick={logout}><LogOut /> Keluar akun</button><div className="mini-profile"><span>{email.slice(0, 1).toUpperCase() || "N"}</span><div><b>{data.profile.role}</b><small>{email}</small></div></div></div></aside><header className="mobile-nav"><Logo /><Link aria-label="Buka profil" href="/workspace/profile"><CircleUserRound /></Link></header><section className="content">{notice && <p className="inline-notice" role="status">{notice}<button aria-label="Tutup pemberitahuan" onClick={() => setNotice("")}><X size={14} /></button></p>}{error && <p className="inline-error" role="alert">{error}</p>}
    {view === "jobs" && <JobTracker />}
    {view === "today" && <TodayView data={data} onComplete={markDone} savingTask={savingTask} />}
    {view === "plan" && <PlanView data={data} onComplete={markDone} savingTask={savingTask} />}
    {view === "chat" && <ChatView data={data} message={message} onChange={setMessage} onSubmit={sendChat} loading={chatLoading} />}
    {view === "memory" && <MemoryView profile={data.profile} notes={notes} form={memoryForm} setForm={setMemoryForm} editing={editingMemory} setEditing={setEditingMemory} onSubmit={submitMemory} onDelete={deleteMemory} onClear={deleteAllMemories} />}
    {view === "profile" && editedProfile && <ProfileView data={data} profile={editedProfile} setProfile={setEditedProfile} editing={editingProfile} setEditing={setEditingProfile} proposalOpen={proposalOpen} proposal={proposal} applying={applyingPlan} onPreview={openProfileProposal} onCancelProposal={() => { setProposalOpen(false); setEditedProfile(data.profile); }} onApply={confirmReplan} onLogout={logout} />}
  </section><nav className="mobile-tabs">{navigation.map((item) => { const Icon = item.icon; return <Link className={view === item.id ? "active" : ""} key={item.id} href={item.href}><Icon />{item.label}</Link>; })}</nav></main>;
}

function TodayView({ data, onComplete, savingTask }: { data: DashboardData; onComplete: (id: string) => void; savingTask: string | null }) {
  const percent = data.plan.totalTasks ? Math.round((data.plan.completedTasks / data.plan.totalTasks) * 100) : 0;
  const task = data.plan.nextTask;
  return <><header className="content-head"><div><p className="eyebrow"><span /> Hari ini</p><h1>Satu langkah untuk {data.profile.role}.</h1><p>Fokus pada satu tugas kecil agar rencanamu benar-benar bergerak.</p></div><Link className="secondary-button" href="/workspace/profile"><Pencil size={15} /> Sesuaikan</Link></header><div className="today-summary"><article><small>Progres rencana</small><b>{percent}%</b><span>{data.plan.completedTasks} dari {data.plan.totalTasks} tugas selesai</span><i><em style={{ width: `${percent}%` }} /></i></article><article><small>Ritme minggu ini</small><b>{data.profile.hours}</b><span>Target {data.profile.timeline}</span></article></div>{task ? <TaskCard task={task} onComplete={onComplete} saving={savingTask === task.id} /> : <div className="empty success-empty"><Check size={24} /><h2>Semua tugas di rencana ini selesai.</h2><p>Lihat riwayat capaianmu atau sesuaikan target berikutnya.</p><Link className="primary-button" href="/workspace/profile">Sesuaikan rencana</Link></div>}<div className="today-links"><Link href="/workspace/plan"><FileClock size={17} /> Lihat seluruh rencana</Link><Link href="/workspace/chat"><MessageCircle size={17} /> Diskusikan hambatan dengan Navi</Link></div></>;
}

function TaskCard({ task, onComplete, saving }: { task: DashboardData["plan"]["nextTask"] extends infer T ? Exclude<T, null> : never; onComplete: (id: string) => void; saving: boolean }) {
  return <article className="next-task"><div className="task-top"><span className="focus-tag"><Sparkles size={13} /> Mulai dari sini</span><span className="time"><Clock3 size={14} /> {task.estimatedMinutes} menit</span></div><h2>{task.title}</h2><p>{task.description}</p><div className="task-footer"><div className="task-tags"><span>Praktik</span><span>Langkah kecil</span></div><button className="done-button" disabled={saving} onClick={() => onComplete(task.id)}>{saving ? "Menyimpan..." : "Tandai selesai"}</button></div></article>;
}

function PlanView({ data, onComplete, savingTask }: { data: DashboardData; onComplete: (id: string) => void; savingTask: string | null }) {
  return <><header className="content-head"><div><p className="eyebrow"><span /> Rencana belajarmu</p><h1>{data.plan.title}</h1><p>{data.profile.hours} · Target {data.profile.timeline} · {data.plan.completedTasks}/{data.plan.totalTasks} tugas selesai</p></div><Link className="secondary-button" href="/workspace/profile"><Pencil size={15} /> Sesuaikan</Link></header><div className="plan-stack">{data.plan.milestones.map((milestone) => <article className={`milestone-card ${milestone.done ? "done" : ""}`} key={milestone.id}><header><span className="timeline-dot">{milestone.done ? <Check size={13} /> : milestone.position + 1}</span><div><p>{milestone.range}</p><h2>{milestone.title}</h2><span>{milestone.description}</span></div><b>{milestone.tasks.filter((task) => task.status === "completed").length}/{milestone.tasks.length}</b></header><div className="task-list">{milestone.tasks.map((task) => <div key={task.id} className={task.status === "completed" ? "task-row done" : "task-row"}><span>{task.status === "completed" ? <Check size={15} /> : <Clock3 size={15} />}</span><div><h3>{task.title}</h3><p>{task.estimatedMinutes} menit · {task.description}</p></div>{task.status === "completed" ? <em>Selesai</em> : <button disabled={savingTask === task.id} onClick={() => onComplete(task.id)}>{savingTask === task.id ? "..." : "Selesaikan"}</button>}</div>)}</div></article>)}</div>{data.history.length > 0 && <section className="history-section"><p className="eyebrow"><span /> Capaian tersimpan</p><h2>Rencana sebelumnya</h2><p>Tugas yang sudah kamu selesaikan tetap aman saat kamu menyesuaikan rencana.</p>{data.history.map((item) => <div key={item.id}><Check size={15} /> {item.title}</div>)}</section>}</>;
}

function ChatView({ data, message, onChange, onSubmit, loading }: { data: DashboardData; message: string; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean }) {
  const messages = data.messages.length ? data.messages : [{ id: "welcome", role: "navi" as const, content: `Halo! Aku sudah melihat jalur ${data.profile.role}-mu. Bagian mana yang ingin kamu diskusikan?`, createdAt: "" }];
  return <div className="chat"><header className="content-head"><div><p className="eyebrow"><span /> Mentor di sampingmu</p><h1>Chat dengan Navi</h1><p>Ceritakan hambatanmu. Navi akan memberi satu rekomendasi dan langkah kecil berikutnya.</p></div></header><div className="quick-prompts"><button onClick={() => onChange("Aku hanya punya 30 menit hari ini. Apa yang paling penting dikerjakan?")}>Aku punya 30 menit</button><button onClick={() => onChange("Aku bingung memulai tugas hari ini. Bantu pecah menjadi langkah kecil.")}>Bantu mulai hari ini</button><button onClick={() => onChange("Waktu belajarku berubah. Apa dampaknya untuk rencanaku?")}>Waktu berubah</button></div><div className="messages" aria-live="polite">{messages.map((item) => <div className={`message ${item.role}`} key={item.id}><p>{item.content}</p></div>)}{loading && <div className="message navi"><p>Navi sedang menyusun saran...</p></div>}</div><form className="composer" onSubmit={onSubmit}><input aria-label="Pesan untuk Navi" placeholder="Contoh: Aku bingung mulai dari mana hari ini" value={message} onChange={(event) => onChange(event.target.value)} maxLength={1200} /><button aria-label="Kirim pesan" disabled={loading}><Send size={17} /></button></form></div>;
}

function MemoryView({ profile, notes, form, setForm, editing, setEditing, onSubmit, onDelete, onClear }: { profile: NaviProfile; notes: NaviMemory[]; form: { label: string; value: string; reason: string }; setForm: (form: { label: string; value: string; reason: string }) => void; editing: NaviMemory | null; setEditing: (memory: NaviMemory | null) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void; onClear: () => void }) {
  return <><header className="content-head"><div><p className="eyebrow"><span /> Yang Navi ingat</p><h1>Memorimu</h1><p>Kamu mengendalikan fakta yang dipakai Navi untuk memberi saran.</p></div><Link className="secondary-button" href="/workspace/profile"><Pencil size={15} /> Ubah fakta profil</Link></header><section className="memory-note"><Sparkles size={18} /><p>Fakta profil selalu berasal dari halaman Profil. Catatan di bawah dapat kamu tambah, edit, atau hapus kapan saja.</p></section><section className="memory-facts"><h2>Fakta profil</h2>{profileFacts(profile).map((fact) => <article key={fact.label}><div><p>{fact.label}</p><h3>{fact.value}</h3><span>{fact.reason}</span></div><Link href="/workspace/profile"><Pencil size={16} /></Link></article>)}</section><section className="memory-facts"><h2>Catatan untuk Navi</h2>{notes.map((memory) => <article key={memory.id}><div><p>{memory.label}</p><h3>{memory.value}</h3><span>{memory.reason}</span></div><div className="memory-actions"><button aria-label={`Edit memori ${memory.label}`} onClick={() => { setEditing(memory); setForm({ label: memory.label, value: memory.value, reason: memory.reason }); }}><Pencil size={16} /></button><button aria-label={`Hapus memori ${memory.label}`} onClick={() => onDelete(memory.id)}><Trash2 size={16} /></button></div></article>)}</section><form className="memory-form" onSubmit={onSubmit}><h2>{editing ? "Ubah catatan" : "Tambah catatan untuk Navi"}</h2><label>Judul<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Contoh: Waktu fokus" maxLength={80} required /></label><label>Isi<input value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} placeholder="Contoh: Pagi sebelum kuliah" maxLength={160} required /></label><label>Alasan dipakai Navi<textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Contoh: Agar saran latihan sesuai jadwal" maxLength={220} required /></label><div className="profile-actions">{editing && <button type="button" className="back-button" onClick={() => { setEditing(null); setForm({ label: "", value: "", reason: "" }); }}>Batal</button>}<button className="primary-button"><Plus size={16} /> {editing ? "Simpan catatan" : "Tambah catatan"}</button></div></form>{notes.length > 0 && <button className="clear-button" onClick={onClear}><Trash2 size={15} /> Hapus semua catatan</button>}</>;
}

function ProfileView({ data, profile, setProfile, editing, setEditing, proposalOpen, proposal, applying, onPreview, onCancelProposal, onApply, onLogout }: { data: DashboardData; profile: NaviProfile; setProfile: (profile: NaviProfile) => void; editing: boolean; setEditing: (value: boolean) => void; proposalOpen: boolean; proposal: ReturnType<typeof previewReplan> | null; applying: boolean; onPreview: () => void; onCancelProposal: () => void; onApply: () => void; onLogout: () => void }) {
  return <><header className="content-head"><div><p className="eyebrow"><span /> Akun & preferensi</p><h1>Profilmu</h1><p>Ubah kondisi belajar, lalu lihat dampak sebelum rencana diganti.</p></div><button className="secondary-button" onClick={onLogout}><LogOut size={15} /> Keluar</button></header><div className="account-card"><h2>Sesuaikan rencana</h2><p>Perubahan belum disimpan sampai kamu menyetujui proposal rencana baru.</p>{editing ? <div className="profile-form"><ProfileSelect label="Target karier" value={profile.role} options={roleOptions} onChange={(role) => setProfile({ ...profile, role })} /><ProfileSelect label="Level saat ini" value={profile.level} options={levelOptions} onChange={(level) => setProfile({ ...profile, level })} /><ProfileSelect label="Waktu per minggu" value={profile.hours} options={hourOptions} onChange={(hours) => setProfile({ ...profile, hours })} /><ProfileSelect label="Target waktumu" value={profile.timeline} options={timelineOptions} onChange={(timeline) => setProfile({ ...profile, timeline })} /><ProfileSelect label="Cara belajar" value={profile.preference} options={preferenceOptions} onChange={(preference) => setProfile({ ...profile, preference })} /><div className="profile-actions"><button className="back-button" onClick={() => { setEditing(false); setProfile(data.profile); }}>Batal</button><button className="primary-button" onClick={onPreview}><Lightbulb size={16} /> Lihat dampak</button></div></div> : <button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={15} /> Ubah profil</button>}</div>{proposalOpen && proposal && <article className="proposal-card"><p className="eyebrow"><span /> Proposal perubahan</p><h2>Perbarui rencana belajar?</h2><p>{proposal.changes.length ? `Navi akan menyesuaikan ${proposal.changes.join(", ")}. ${proposal.affectedTasks} tugas pending akan dibentuk ulang.` : "Belum ada perubahan yang perlu diterapkan."}</p><div className="proposal-impact"><span><Check size={15} /> Capaian selesai tetap tersimpan di riwayat.</span><span><Clock3 size={15} /> Tugas yang belum selesai akan diganti sesuai kondisi terbaru.</span></div><div className="profile-actions"><button className="back-button" onClick={onCancelProposal}>Tetap pakai rencana lama</button><button className="primary-button" disabled={applying} onClick={onApply}>{applying ? "Menerapkan..." : <>Terapkan perubahan <ChevronRight size={16} /></>}</button></div></article>}</>;
}

function ProfileSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="form-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>; }
