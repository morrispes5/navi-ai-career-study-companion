"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { PasswordField } from "../components/password-field";
import { authErrorMessage } from "../../lib/auth-errors";
import { authClient } from "../../lib/auth-client";
import { clearOnboardingDraft, readOnboardingDraft } from "../../lib/navi/draft";
import { seedInitialNaviDataAction } from "../actions/navi";


export default function LoginPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const { data, error: signInError } = await authClient.signIn.email({ email: email.trim(), password });
    if (signInError || !data) { setLoading(false); setError(authErrorMessage(signInError, "login")); return; }
    const draft = readOnboardingDraft();
    if (draft) {
      try { const r = await seedInitialNaviDataAction(draft); if (!r.ok) throw new Error(r.error); clearOnboardingDraft(); }
      catch { setLoading(false); setError("Akun berhasil masuk, tetapi rencana belum tersambung. Coba tombol Masuk sekali lagi—jawaban onboarding-mu tetap aman."); return; }
    }
    window.location.assign("/workspace");
  }

  return <main className="auth-page"><section className="auth-card"><Link className="logo-mark" href="/"><Sparkles size={17} fill="currentColor" /> Navi</Link><p className="eyebrow"><span /> Selamat datang kembali</p><h1>Lanjutkan rencanamu.</h1><p className="auth-lede">Masuk untuk melihat progres, chat, dan rencana belajar yang tersimpan.</p><form onSubmit={submit} className="auth-form"><label className="form-field">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button wide-button" disabled={loading}>{loading ? "Menyinkronkan akun…" : <>Masuk <ArrowRight size={18} /></>}</button></form><Link className="subtle-link" href="/forgot-password">Lupa password?</Link><p className="auth-note">Belum punya akun? <Link href="/">Buat rencana dulu</Link></p></section></main>;
}
