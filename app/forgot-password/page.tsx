"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { authErrorMessage } from "../../lib/auth-errors";
import { authClient } from "../../lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [error, setError] = useState(""); const [sent, setSent] = useState(false); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const redirectTo = `${window.location.origin}/update-password`;
    const { error: resetError } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo });
    setLoading(false); if (resetError) { setError(authErrorMessage(resetError, "recovery")); return; } setSent(true);
  }
  return <main className="auth-page"><section className="auth-card"><Link className="logo-mark" href="/"><Sparkles size={17} fill="currentColor" /> Navi</Link><p className="eyebrow"><span /> Reset password</p><h1>Buat password baru.</h1><p className="auth-lede">Masukkan email akunmu. Kami akan mengirim tautan aman untuk mengganti password.</p>{sent ? <p className="form-status">Jika email tersebut terdaftar, tautan reset telah dikirim. Cek inbox dan folder spam.</p> : <form onSubmit={submit} className="auth-form"><label className="form-field">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button wide-button" disabled={loading}>{loading ? "Mengirim…" : <>Kirim tautan reset <ArrowRight size={18} /></>}</button></form>}<p className="auth-note"><Link href="/login">Kembali ke halaman masuk</Link></p></section></main>;
}
