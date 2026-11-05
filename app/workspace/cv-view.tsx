"use client";

import { FileText, Upload } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Summary = { id: string; targetRole: string | null; score: number | null; createdAt: string | number | null };
type Detail = { id: string; targetRole: string | null; score: number | null; summary: string; strengths: string[]; weaknesses: string[]; keywordGaps: string[]; rewrites: { original: string; suggestion: string }[] };

const fmt = (v: Summary["createdAt"]) => (v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "");

export function CvReviewView({ defaultRole }: { defaultRole: string }) {
  const [role, setRole] = useState(defaultRole);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Summary[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/cv-review");
    if (res.ok) setHistory((await res.json()).reviews);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function open(id: string) {
    setError("");
    const res = await fetch(`/api/cv-review/${encodeURIComponent(id)}`);
    if (res.ok) setDetail(await res.json()); else setError("Review tidak ditemukan.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (file && file.size > 5 * 1024 * 1024) { setError("File CV maksimal 5MB."); return; }
    setLoading(true);
    try {
      const body = new FormData(); body.set("targetRole", role);
      if (file) body.set("file", file); else body.set("cvText", text);
      const res = await fetch("/api/cv-review", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Review CV gagal."); return; }
      setDetail(json); setText(""); setFile(null); await refresh();
    } catch { setError("Review CV gagal. Periksa koneksimu."); } finally { setLoading(false); }
  }

  return <>
    <header className="content-head"><div><p className="eyebrow"><span /> Karier</p><h1>Review CV</h1><p>Tempel teks CV atau unggah PDF/DOCX (maks 5MB). Navi menilai CV-mu untuk target role, maksimal 5 review per jam.</p></div></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <form className="memory-form" onSubmit={submit}>
      <label>Target role<input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} /></label>
      <label>Teks CV<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel isi CV di sini..." rows={10} disabled={Boolean(file)} /></label>
      <label><Upload size={15} /> Atau unggah file<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <div className="profile-actions"><button className="primary-button" disabled={loading || (!file && text.trim().length === 0)}><FileText size={16} /> {loading ? "Menilai..." : "Review CV"}</button></div>
    </form>
    {detail && <section className="memory-facts" aria-label="Detail review">
      <h2>Skor {detail.score ?? "-"} / 100{detail.targetRole ? ` · ${detail.targetRole}` : ""}</h2>
      {detail.summary && <p>{detail.summary}</p>}
      <h3>Kekuatan</h3><ul>{detail.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h3>Kelemahan</h3><ul>{detail.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h3>Kata kunci ATS yang belum ada</h3><p>{detail.keywordGaps.join(", ") || "Tidak ada."}</p>
      <h3>Saran penulisan ulang</h3>{detail.rewrites.map((r, i) => <article key={i}><div><p>Sebelum: {r.original}</p><h3>{r.suggestion}</h3></div></article>)}
    </section>}
    <section className="memory-facts"><h2>Riwayat review</h2>
      {history.length === 0 ? <p>Belum ada review.</p> : history.map((h) => <article key={h.id}><div><p>{fmt(h.createdAt)}</p><h3>Skor {h.score ?? "-"}</h3><span>{h.targetRole}</span></div><button className="secondary-button" onClick={() => open(h.id)}>Lihat</button></article>)}
    </section>
  </>;
}
