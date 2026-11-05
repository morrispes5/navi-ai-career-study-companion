"use client";

import { Check, Compass, ExternalLink, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Suggestion = { title: string; companyType: string; seniority: "intern" | "junior" | "mid" | "senior"; location: string; matchReason: string; matchedSkills: string[]; missingSkills: string[]; searchQuery: string; url: string };
const seniorityLabel = { intern: "Magang", junior: "Junior", mid: "Menengah", senior: "Senior" } as const;

export function JobSuggestionsView({ role }: { role: string }) {
  const [location, setLocation] = useState("");
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/job-suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(location.trim() ? { location: location.trim() } : {}) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Gagal memuat saran lowongan."); return; }
      setItems(json.suggestions ?? []); setMessage(json.message ?? "");
    } catch { setError("Koneksi bermasalah. Coba lagi."); } finally { setLoading(false); }
  }

  async function save(s: Suggestion) {
    const key = `${s.title}|${s.companyType}`;
    const { url: _url, ...body } = s; void _url;
    const res = await fetch("/api/job-suggestions/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setSaved((m) => ({ ...m, [key]: json.message })); else setError(json.error ?? "Gagal menyimpan.");
  }

  return <><header className="content-head"><div><p className="eyebrow"><span /> Saran lowongan</p><h1>Posisi yang cocok untuk {role || "kamu"}</h1><p>Navi menyarankan jenis posisi berdasarkan target karier dan skill di profilmu.</p></div></header>
    <form className="memory-form" onSubmit={(e) => { e.preventDefault(); void load(); }}><label>Preferensi lokasi (opsional)<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Contoh: Jakarta atau Remote" maxLength={80} /></label><div className="profile-actions"><button className="primary-button" disabled={loading}><Sparkles size={16} /> {loading ? "Mencari..." : items ? "Cari ulang" : "Tampilkan saran"}</button></div></form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {items && items.length === 0 && <div className="empty"><Compass size={24} /><h2>Belum ada saran.</h2><p>{message || "Lengkapi target karier dan skill di Profil, lalu coba lagi."}</p><Link className="primary-button" href="/workspace/profile">Buka Profil</Link></div>}
    {items && items.length > 0 && <section className="memory-facts">{items.map((s) => { const key = `${s.title}|${s.companyType}`; return <article key={key}><div><p>{seniorityLabel[s.seniority]} · {s.companyType} · {s.location}</p><h3>{s.title}</h3><span>{s.matchReason}</span>{s.matchedSkills.length > 0 && <span> Cocok: {s.matchedSkills.join(", ")}.</span>}{s.missingSkills.length > 0 && <span> Perlu dipelajari: {s.missingSkills.join(", ")}.</span>}{saved[key] && <small role="status"> {saved[key]}</small>}</div><div className="memory-actions"><a aria-label={`Cari lowongan ${s.title}`} href={s.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /></a><button aria-label={`Simpan ${s.title} ke pelacak`} disabled={!!saved[key]} onClick={() => void save(s)}>{saved[key] ? <Check size={16} /> : <Plus size={16} />}</button></div></article>; })}</section>}
  </>;
}
