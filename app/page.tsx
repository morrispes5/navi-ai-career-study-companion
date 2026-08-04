"use client";

import { ArrowRight, Check, ChevronLeft, Clock3, Compass, Sparkles, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearOnboardingDraft, readOnboardingDraft, saveOnboardingDraft, seedInitialNaviData, type NaviProfile } from "../lib/supabase/navi";
import { createClient } from "../lib/supabase/client";

type Screen = "landing" | "onboarding" | "summary";

const defaults: NaviProfile = {
  role: "Frontend Developer",
  level: "Sudah memahami dasar HTML & CSS",
  hours: "6 jam per minggu",
  timeline: "6–9 bulan",
  preference: "Belajar lewat membangun proyek"
};

const steps = [
  { label: "Target karier", key: "role", options: ["Frontend Developer", "Backend Developer", "UI/UX Designer", "Data Analyst"] },
  { label: "Level saat ini", key: "level", options: ["Baru mulai", "Sudah memahami dasar HTML & CSS", "Pernah membuat beberapa proyek", "Sudah siap melamar"] },
  { label: "Waktu belajarmu", key: "hours", options: ["3 jam per minggu", "6 jam per minggu", "10 jam per minggu", "15+ jam per minggu"] },
  { label: "Target waktumu", key: "timeline", options: ["3 bulan", "6–9 bulan", "9–12 bulan", "Belum pasti"] },
  { label: "Cara belajar", key: "preference", options: ["Belajar lewat membangun proyek", "Belajar terstruktur langkah demi langkah", "Belajar dari materi visual", "Belajar sambil diskusi"] }
] as const;

function Logo() {
  return <span className="logo-mark"><Sparkles size={17} fill="currentColor" /> Navi</span>;
}

export default function Home() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("landing");
  const [profile, setProfile] = useState<NaviProfile>(defaults);
  const [step, setStep] = useState(0);
  const [hasSession, setHasSession] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const draft = readOnboardingDraft();
    if (draft) setProfile(draft);
    createClient().auth.getUser().then(({ data }) => setHasSession(Boolean(data.user)));
    if (new URLSearchParams(window.location.search).get("start") === "1") setScreen("onboarding");
  }, []);

  const start = () => { setStep(0); setScreen("onboarding"); };
  const completeOnboarding = () => { saveOnboardingDraft(profile); setScreen("summary"); };
  const saveForCurrentUser = async () => { setSaving(true); setSummaryError(""); try { await seedInitialNaviData(profile); clearOnboardingDraft(); window.location.assign("/workspace"); } catch { setSaving(false); setSummaryError("Rencana belum dapat disimpan. Coba lagi—jawabanmu tetap aman."); } };

  if (screen === "onboarding") {
    const current = steps[step];
    const key = current.key as keyof NaviProfile;
    return <main className="onboarding"><header className="onboarding-header"><Logo /><button className="icon-button" aria-label="Tutup onboarding" onClick={() => setScreen("landing")}>×</button></header><div className="progress"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div><section className="question"><p className="step-label">{String(step + 1).padStart(2, "0")} / 05</p><h1>{current.label}</h1><p className="question-sub">{step === 2 ? "Rencana yang baik mengikuti ritme hidupmu, bukan sebaliknya." : "Pilih jawaban yang paling dekat dengan kondisimu saat ini."}</p><div className="option-list">{current.options.map((option) => <button key={option} className={profile[key] === option ? "option selected" : "option"} onClick={() => setProfile({ ...profile, [key]: option })}><span>{option}</span>{profile[key] === option && <Check size={18} />}</button>)}</div><div className="onboarding-actions">{step ? <button className="back-button" onClick={() => setStep(step - 1)}><ChevronLeft size={18} /> Kembali</button> : <span />}{step < 4 ? <button className="primary-button" onClick={() => setStep(step + 1)}>Lanjut <ArrowRight size={18} /></button> : <button className="primary-button" onClick={completeOnboarding}>Lihat ringkasan <ArrowRight size={18} /></button>}</div></section></main>;
  }

  if (screen === "summary") return <main className="auth-page"><section className="summary-card"><Logo /><p className="eyebrow"><span /> Rencanamu sudah siap</p><h1>Mulai jalur {profile.role}-mu.</h1><p className="summary-lede">Kami akan menyimpan 4 tahap belajar untuk {profile.hours.toLowerCase()}, dengan fokus {profile.preference.toLowerCase()}.</p><div className="summary-facts"><span><Target size={16} /> {profile.level}</span><span><Clock3 size={16} /> Target {profile.timeline}</span><span><Compass size={16} /> Satu tugas pertama sudah dipilih</span></div>{summaryError && <p className="form-error" role="alert">{summaryError}</p>}<button className="primary-button wide-button" disabled={saving} onClick={hasSession ? saveForCurrentUser : () => router.push("/signup")}>{saving ? "Menyimpan rencana…" : hasSession ? "Simpan & lanjutkan" : "Simpan rencana dengan akun"} <ArrowRight size={18} /></button><button className="back-button center-button" onClick={() => setScreen("onboarding")}>Ubah jawaban</button>{!hasSession && <p className="auth-note">Sudah punya akun? <button onClick={() => router.push("/login")}>Masuk</button></p>}</section></main>;

  return <main className="landing"><nav className="nav wrap"><Logo /><div className="nav-links"><a href="#cara-kerja">Cara kerja</a><a href="#untukmu">Untukmu</a></div>{hasSession ? <button className="text-button" onClick={() => router.push("/workspace")}>Lanjutkan rencanaku <ArrowRight size={15} /></button> : <button className="text-button" onClick={() => router.push("/login")}>Masuk <ArrowRight size={15} /></button>}</nav><section className="hero wrap"><div className="hero-copy"><p className="eyebrow"><span /> Untuk calon developer Indonesia</p><h1>Belajarmu punya <em>arah.</em></h1><p className="hero-lede">Navi membantu kamu menyusun langkah belajar yang realistis—sesuai tujuan, waktu, dan cara belajarmu.</p><button className="primary-button" onClick={start}>Buat rencana belajarku <ArrowRight size={18} /></button><p className="helper"><Check size={15} /> Jawab 5 pertanyaan singkat, lalu simpan rencanamu.</p></div><div className="product-preview" aria-label="Contoh rencana belajar Navi"><div className="preview-top"><div><span className="preview-name">Halo, Raka</span><span className="preview-sub">Rencana minggu ini</span></div></div><div className="focus-card"><span className="focus-tag"><Sparkles size={13} /> Mulai dari sini</span><h3>Buat halaman profil responsif</h3><p>Latih CSS layout dan Git lewat satu proyek kecil.</p></div><div className="preview-row"><div className="progress-ring">25%</div><div><b>Jalur Frontend</b><span>1 dari 4 tahap selesai</span><div className="meter"><i /></div></div></div></div></section><section id="cara-kerja" className="benefits wrap"><p className="eyebrow"><span /> Bukan sekadar daftar materi</p><div className="benefit-grid"><article><span className="icon-box coral"><Target /></span><h2>Tujuanmu jadi jelas</h2><p>Ubah target karier menjadi langkah kecil yang masuk akal.</p></article><article><span className="icon-box blue"><Clock3 /></span><h2>Pas dengan hidupmu</h2><p>Rencana mengikuti waktu yang benar-benar kamu punya setiap minggu.</p></article><article><span className="icon-box sage"><Compass /></span><h2>Ada arah berikutnya</h2><p>Selalu tahu satu tugas paling berguna untuk dilakukan sekarang.</p></article></div></section></main>;
}
