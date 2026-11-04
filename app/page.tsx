"use client";

import { ArrowRight, Check, ChevronLeft, Clock3, Compass, MessageCircle, Sparkles, Target } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { clearOnboardingDraft, readOnboardingDraft, saveOnboardingDraft } from "../lib/navi/draft";
import type { NaviProfile } from "../lib/navi/profile";
import { getSessionInfo, seedInitialNaviData } from "../lib/navi/actions";

type Screen = "landing" | "onboarding" | "summary";
const emptyProfile: NaviProfile = { role: "", level: "", hours: "", timeline: "", preference: "" };
const steps: { key: keyof NaviProfile; label: string; helper: string; options: string[] }[] = [
  { key: "role", label: "Target karier", helper: "Pilih jalur yang ingin kamu eksplorasi lebih dulu.", options: ["Frontend Developer", "Backend Developer", "UI/UX Designer", "Data Analyst"] },
  { key: "level", label: "Level saat ini", helper: "Tidak ada jawaban yang lebih baik. Ini membantu Navi menentukan titik mulai.", options: ["Baru mulai", "Sudah memahami dasar HTML & CSS", "Pernah membuat beberapa proyek", "Sudah siap melamar"] },
  { key: "hours", label: "Waktu belajarmu", helper: "Rencana yang baik mengikuti ritme hidupmu, bukan sebaliknya.", options: ["3 jam per minggu", "6 jam per minggu", "10 jam per minggu", "15+ jam per minggu"] },
  { key: "timeline", label: "Target waktumu", helper: "Target boleh berubah nanti. Kami hanya menggunakannya untuk mengatur beban awal.", options: ["3 bulan", "6-9 bulan", "9-12 bulan", "Belum pasti"] },
  { key: "preference", label: "Cara belajar", helper: "Navi akan mengubah bentuk latihan agar lebih cocok untukmu.", options: ["Belajar lewat membangun proyek", "Belajar terstruktur langkah demi langkah", "Belajar dari materi visual", "Belajar sambil diskusi"] }
];

function Logo() { return <span className="logo-mark"><Sparkles size={17} fill="currentColor" /> Navi</span>; }

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [screen, setScreen] = useState<Screen>(searchParams.get("start") === "1" ? "onboarding" : "landing");
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<NaviProfile>(emptyProfile);
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    const draft = readOnboardingDraft();
    if (draft) setProfile(draft);
    getSessionInfo().then((info) => setHasSession(Boolean(info))).catch(() => setHasSession(false));
  }, []);

  const current = steps[step];
  const hasAnswer = Boolean(profile[current.key]);
  const start = () => setScreen("onboarding");
  const updateAnswer = (value: string) => {
    const next = { ...profile, [current.key]: value };
    setProfile(next);
    saveOnboardingDraft(next);
  };
  const completeOnboarding = () => {
    if (steps.some((item) => !profile[item.key])) return;
    saveOnboardingDraft(profile);
    setScreen("summary");
  };
  const saveForCurrentUser = async () => {
    setSaving(true);
    setSummaryError("");
    try { await seedInitialNaviData(profile); clearOnboardingDraft(); window.location.assign("/workspace"); }
    catch { setSaving(false); setSummaryError("Rencana belum dapat disimpan. Coba lagi—jawabanmu tetap aman."); }
  };

  if (screen === "onboarding") return <main className="onboarding"><header className="onboarding-header"><Logo /><button className="icon-button" aria-label="Tutup onboarding" onClick={() => setScreen("landing")}>×</button></header><div className="progress" aria-label={`Langkah ${step + 1} dari 5`}><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div><section className="question"><p className="step-label">{String(step + 1).padStart(2, "0")} / 05</p><h1>{current.label}</h1><p className="question-sub">{current.helper}</p><div className="option-list">{current.options.map((option) => <button key={option} className={profile[current.key] === option ? "option selected" : "option"} onClick={() => updateAnswer(option)}><span>{option}</span>{profile[current.key] === option && <Check size={18} />}</button>)}</div><div className="onboarding-actions">{step ? <button className="back-button" onClick={() => setStep(step - 1)}><ChevronLeft size={18} /> Kembali</button> : <span />}{step < 4 ? <button className="primary-button" disabled={!hasAnswer} onClick={() => setStep(step + 1)}>Lanjut <ArrowRight size={18} /></button> : <button className="primary-button" disabled={!hasAnswer} onClick={completeOnboarding}>Lihat ringkasan <ArrowRight size={18} /></button>}</div></section></main>;

  if (screen === "summary") return <main className="auth-page"><section className="summary-card"><Logo /><p className="eyebrow"><span /> Rencanamu sudah siap</p><h1>Mulai jalur {profile.role}-mu.</h1><p className="summary-lede">Navi akan membentuk 4 tahap dan 12 tugas kecil untuk {profile.hours.toLowerCase()}, dengan gaya {profile.preference.toLowerCase()}.</p><div className="summary-facts"><span><Target size={16} /> Mulai dari: {profile.level}</span><span><Clock3 size={16} /> Target: {profile.timeline}</span><span><Compass size={16} /> Tugas pertama sudah dipilih</span></div>{summaryError && <p className="form-error" role="alert">{summaryError}</p>}<button className="primary-button wide-button" disabled={saving} onClick={hasSession ? saveForCurrentUser : () => router.push("/signup")}>{saving ? "Menyimpan rencana..." : hasSession ? "Simpan & lanjutkan" : "Simpan rencana dengan akun"} <ArrowRight size={18} /></button><button className="back-button center-button" onClick={() => setScreen("onboarding")}>Ubah jawaban</button>{!hasSession && <p className="auth-note">Sudah punya akun? <button onClick={() => router.push("/login")}>Masuk</button></p>}</section></main>;

  return <main className="landing"><nav className="nav wrap"><Logo /><div className="nav-links"><a href="#cara-kerja">Cara kerja</a><a href="#untukmu">Untukmu</a></div>{hasSession ? <button className="text-button" onClick={() => router.push("/workspace")}>Lanjutkan rencanaku <ArrowRight size={15} /></button> : <button className="text-button" onClick={() => router.push("/login")}>Masuk <ArrowRight size={15} /></button>}</nav><section className="hero wrap"><div className="hero-copy"><p className="eyebrow"><span /> Untuk calon profesional teknologi Indonesia</p><h1>Belajarmu punya <em>arah.</em></h1><p className="hero-lede">Navi mengubah target kariermu menjadi rencana belajar yang realistis, lalu menemanimu menjalankan satu langkah kecil setiap kali.</p><button className="primary-button" onClick={start}>Buat rencana belajarku <ArrowRight size={18} /></button><p className="helper"><Check size={15} /> Jawab 5 pertanyaan singkat, lalu simpan rencanamu.</p></div><div className="product-preview" aria-label="Contoh rencana belajar Navi"><div className="preview-top"><div><span className="preview-name">Hari ini</span><span className="preview-sub">Rencana belajar Raka</span></div><span className="preview-badge">1 dari 12 tugas</span></div><div className="focus-card"><span className="focus-tag"><Sparkles size={13} /> Mulai dari sini</span><h3>Buat layout profil responsif</h3><p>Latih layout, keterbacaan, dan commit Git dalam satu proyek kecil.</p></div><div className="preview-row"><div className="progress-ring">8%</div><div><b>Jalur Frontend</b><span>4 milestone yang bisa diikuti</span><div className="meter"><i /></div></div></div></div></section><section id="cara-kerja" className="how-section wrap"><p className="eyebrow"><span /> Cara kerja Navi</p><h2>Dari bingung menjadi satu langkah yang bisa dikerjakan hari ini.</h2><div className="how-grid"><article><span>01</span><h3>Jawab kondisimu</h3><p>Pilih target, level, waktu, target, dan cara belajar tanpa perlu membuat akun dulu.</p></article><article><span>02</span><h3>Lihat rencana personal</h3><p>Navi menyusun empat tahap dan tugas kecil yang sesuai ritme belajarmu.</p></article><article><span>03</span><h3>Belajar bersama Navi</h3><p>Tandai tugas selesai, simpan progres, lalu chat saat kamu punya hambatan.</p></article></div></section><section id="untukmu" className="for-you wrap"><p className="eyebrow"><span /> Untukmu</p><h2>Dibuat untuk kondisi belajar yang nyata.</h2><div className="benefit-grid"><article><span className="icon-box coral"><Target /></span><h3>Baru mulai dan butuh arah</h3><p>Mulai dari tugas kecil yang jelas, bukan daftar materi yang terlalu panjang.</p></article><article><span className="icon-box blue"><Clock3 /></span><h3>Waktumu terbatas</h3><p>Beban tugas mengikuti jam belajar yang benar-benar kamu punya setiap minggu.</p></article><article><span className="icon-box sage"><MessageCircle /></span><h3>Targetmu berubah</h3><p>Lihat dampak perubahan dulu, lalu pilih apakah rencana baru perlu diterapkan.</p></article></div></section></main>;
}

export default function Home() {
  return <Suspense fallback={<main className="auth-page"><p className="auth-loading">Menyiapkan Navi...</p></main>}><HomeContent /></Suspense>;
}
