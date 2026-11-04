"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { PasswordField } from "../components/password-field";
import { authErrorMessage } from "../../lib/auth/errors";
import { authClient } from "../../lib/auth/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [ready, setReady] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [token, setToken] = useState("");
  useEffect(() => { const params = new URLSearchParams(window.location.search); const value = params.get("token") ?? ""; if (!value || params.get("error")) setError("Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru."); setToken(value); setReady(true); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); if (password.length < 8) { setError("Password minimal 8 karakter."); return; } if (password !== confirmPassword) { setError("Konfirmasi password belum sama."); return; }
    setLoading(true); const { error: updateError } = await authClient.resetPassword({ newPassword: password, token }); setLoading(false);
    if (updateError) { setError(authErrorMessage(updateError, "password")); return; } window.location.assign("/login");
  }
  return <main className="auth-page"><section className="auth-card"><Link className="logo-mark" href="/"><Sparkles size={17} fill="currentColor" /> Navi</Link><p className="eyebrow"><span /> Password baru</p><h1>Amankan akunmu.</h1>{ready && <form onSubmit={submit} className="auth-form"><PasswordField label="Password baru" hint="Minimal 8 karakter" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} /><PasswordField label="Konfirmasi password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={setConfirmPassword} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button wide-button" disabled={loading || Boolean(error && !password)}>{loading ? "Menyimpan…" : <>Simpan password baru <ArrowRight size={18} /></>}</button></form>}<p className="auth-note"><Link href="/forgot-password">Kirim ulang tautan reset</Link></p></section></main>;
}
