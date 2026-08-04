"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { PasswordField } from "../components/password-field";
import { authErrorMessage } from "../../lib/supabase/auth-errors";
import { createClient } from "../../lib/supabase/client";
import { clearOnboardingDraft, readOnboardingDraft, seedInitialNaviData, type NaviProfile } from "../../lib/supabase/navi";

export default function SignupPage() {
  const router = useRouter(); const [draft, setDraft] = useState<NaviProfile | null>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(""); const [status, setStatus] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { const saved = readOnboardingDraft(); if (!saved) { router.replace("/"); return; } setDraft(saved); }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft) return; setError(""); setStatus("");
    if (password.length < 8) { setError("Password minimal 8 karakter."); return; }
    if (password !== confirmPassword) { setError("Konfirmasi password belum sama."); return; }
    setLoading(true);
    const supabase = createClient();
    const { data: currentUserData } = await supabase.auth.getUser();
    if (currentUserData.user) {
      try { await seedInitialNaviData(draft); clearOnboardingDraft(); window.location.assign("/workspace"); }
      catch { setLoading(false); setError("Akun sudah aktif, tetapi rencana belum tersambung. Coba lagi sebentar—proses ini aman diulang."); }
      return;
    }
    const emailRedirectTo = `${window.location.origin}/signup/complete`;
    const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo } });
    if (signUpError) { setLoading(false); setError(authErrorMessage(signUpError, "signup")); return; }
    if (!data.session) { setLoading(false); setStatus("Akunmu sudah dibuat. Cek email konfirmasi, lalu kembali dan tekan Masuk. Jawaban onboarding tetap tersimpan di perangkat ini."); return; }
    try { await seedInitialNaviData(draft); clearOnboardingDraft(); window.location.assign("/workspace"); }
    catch { setLoading(false); setError("Akun berhasil dibuat, tetapi rencana belum tersambung. Tekan lagi tombol di bawah untuk melanjutkan—proses ini aman diulang."); }
  }

  if (!draft) return <main className="auth-page"><p className="auth-loading">Menyiapkan ringkasan rencanamu…</p></main>;
  return <main className="auth-page"><section className="auth-card auth-card-wide"><Link className="logo-mark" href="/"><Sparkles size={17} fill="currentColor" /> Navi</Link><p className="eyebrow"><span /> Simpan rencanamu</p><h1>Buat akun untuk mulai.</h1><p className="auth-lede">Setelah daftar, Navi menyimpan rencana awalmu secara aman ke akun ini.</p><div className="signup-summary"><p><Check size={15} /> Target: <b>{draft.role}</b></p><p><Check size={15} /> Ritme: <b>{draft.hours}</b> · {draft.timeline}</p><p><Check size={15} /> Gaya: <b>{draft.preference}</b></p></div><form onSubmit={submit} className="auth-form"><label className="form-field">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><PasswordField label="Password" hint="Minimal 8 karakter" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} /><PasswordField label="Konfirmasi password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={setConfirmPassword} />{error && <p className="form-error" role="alert">{error}</p>}{status && <p className="form-status" role="status">{status} <Link href="/login">Ke halaman Masuk</Link></p>}<button className="primary-button wide-button" disabled={loading}>{loading ? "Menyinkronkan akun…" : <>Buat akun & simpan rencana <ArrowRight size={18} /></>}</button></form><p className="auth-note">Sudah punya akun? <Link href="/login">Masuk</Link></p></section></main>;
}
