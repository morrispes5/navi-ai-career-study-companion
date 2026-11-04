"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { createJobAction, deleteJobAction, listJobsAction, setJobStatusAction } from "../../../lib/navi/job-actions";

const STATUSES = ["wishlist", "applied", "interview", "offer", "rejected", "ghosted"] as const;
type Status = (typeof STATUSES)[number];
const LABELS: Record<Status, string> = { wishlist: "Wishlist", applied: "Dilamar", interview: "Interview", offer: "Offer", rejected: "Ditolak", ghosted: "Tanpa kabar" };
type Job = Awaited<ReturnType<typeof listJobsAction>>["items"][number];

export function JobTracker() {
  const [items, setItems] = useState<Job[]>([]);
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try { const r = await listJobsAction(); setItems(r.items); setPipeline(r.pipeline); setError(null); }
    catch { setError("Data lamaran belum bisa dimuat. Coba lagi."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    setSaving(true);
    try {
      await createJobAction({ company: f.get("company"), position: f.get("position"), url: f.get("url"), location: f.get("location"), status: f.get("status"), appliedAt: f.get("appliedAt"), notes: f.get("notes") });
      form.reset();
      await refresh();
    } catch { setError("Lamaran belum tersimpan. Periksa isian lalu coba lagi."); }
    finally { setSaving(false); }
  }
  async function move(id: string, status: Status) { try { await setJobStatusAction(id, status); await refresh(); } catch { setError("Status belum bisa diubah."); } }
  async function remove(id: string) { try { await deleteJobAction(id); await refresh(); } catch { setError("Lamaran belum bisa dihapus."); } }

  return (
    <main className="wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <p className="eyebrow"><span /> Karier</p>
      <h1>Pelacak lamaran</h1>
      <p><Link href="/workspace">← Kembali ke workspace</Link></p>
      {error && <p role="alert" className="inline-notice">{error}</p>}
      <form className="memory-form" onSubmit={onCreate} aria-label="Tambah lamaran">
        <label>Perusahaan<input name="company" required maxLength={120} /></label>
        <label>Posisi<input name="position" required maxLength={120} /></label>
        <label>Link lowongan<input name="url" type="url" maxLength={500} /></label>
        <label>Lokasi<input name="location" maxLength={120} /></label>
        <label>Status<select name="status" defaultValue="wishlist">{STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}</select></label>
        <label>Tanggal melamar<input name="appliedAt" type="date" /></label>
        <label>Catatan<textarea name="notes" maxLength={2000} rows={2} /></label>
        <button className="primary-button" disabled={saving}>{saving ? "Menyimpan..." : "Tambah lamaran"}</button>
      </form>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 28 }} aria-label="Pipeline lamaran">
        {STATUSES.map((status) => (
          <div key={status} className="milestone-card">
            <h2>{LABELS[status]} <small>({pipeline[status] ?? 0})</small></h2>
            {items.filter((j) => j.status === status).map((job) => (
              <article key={job.id} className="task-row" style={{ gridTemplateColumns: "1fr" }}>
                <div><h3>{job.position}</h3><p>{job.company}{job.location ? ` · ${job.location}` : ""}</p>
                  {job.url && <p><a href={job.url} target="_blank" rel="noopener noreferrer">Lowongan</a></p>}</div>
                <select aria-label="Ubah status" value={job.status} onChange={(e) => move(job.id, e.target.value as Status)}>{STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}</select>
                <button onClick={() => remove(job.id)}>Hapus</button>
              </article>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
