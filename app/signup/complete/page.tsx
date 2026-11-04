"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { clearOnboardingDraft, readOnboardingDraft } from "../../../lib/navi/draft";
import { getSessionInfo, seedInitialNaviData } from "../../../lib/navi/actions";

export default function SignupCompletePage() {
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const session = await getSessionInfo().catch(() => null);
    if (!session) { setError("Sesi belum terbentuk. Silakan masuk dengan akunmu."); return; }
    const draft = readOnboardingDraft();
    try { if (draft) { await seedInitialNaviData(draft); clearOnboardingDraft(); } window.location.assign("/workspace"); }
    catch { setError("Akun sudah aktif, tetapi rencana belum tersambung. Masuk kembali agar Navi mencobanya lagi."); }
  })(); }, []);
  return <main className="workspace-loader"><span className="logo-mark"><Sparkles size={17} fill="currentColor" /> Navi</span><h1>{error ? "Akun aktif" : "Menyiapkan rencanamu"}</h1><p>{error || "Navi sedang menyinkronkan akun dan rencana belajarmu…"}</p>{error && <Link className="primary-button" href="/login">Masuk</Link>}</main>;
}
