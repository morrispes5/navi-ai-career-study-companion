"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  addContactAction, addNoteAction, createJobAction, deleteContactAction, deleteJobAction, deleteNoteAction,
  getJobDetailAction, listJobsAction, setJobStatusAction, updateJobAction,
} from "../../../lib/navi/job-actions";

const STATUSES = ["wishlist", "applied", "interview", "offer", "rejected", "ghosted"] as const;
type Status = (typeof STATUSES)[number];
const LABELS: Record<Status, string> = { wishlist: "Wishlist", applied: "Dilamar", interview: "Interview", offer: "Offer", rejected: "Ditolak", ghosted: "Tanpa kabar" };
type Job = Awaited<ReturnType<typeof listJobsAction>>["items"][number];
type Detail = Awaited<ReturnType<typeof getJobDetailAction>>;

const toDateInput = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
function jobFields(f: FormData) {
  return { company: f.get("company"), position: f.get("position"), url: f.get("url"), location: f.get("location"), salaryRange: f.get("salaryRange"), status: f.get("status"), appliedAt: f.get("appliedAt"), notes: f.get("notes") };
}

function JobFields({ job }: { job?: Job }) {
  return <>
    <label>Perusahaan<input name="company" required maxLength={120} defaultValue={job?.company} /></label>
    <label>Posisi<input name="position" required maxLength={120} defaultValue={job?.position} /></label>
    <label>Link lowongan<input name="url" type="url" maxLength={500} defaultValue={job?.url ?? ""} /></label>
    <label>Lokasi<input name="location" maxLength={120} defaultValue={job?.location ?? ""} /></label>
    <label>Kisaran gaji<input name="salaryRange" maxLength={80} defaultValue={job?.salaryRange ?? ""} /></label>
    <label>Status<select name="status" defaultValue={job?.status ?? "wishlist"}>{STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}</select></label>
    <label>Tanggal melamar<input name="appliedAt" type="date" defaultValue={toDateInput(job?.appliedAt ?? null)} /></label>
    <label>Ringkasan<textarea name="notes" maxLength={2000} rows={2} defaultValue={job?.notes ?? ""} /></label>
  </>;
}

export function JobTracker() {
  const [items, setItems] = useState<Job[]>([]);
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const refresh = useCallback(async () => {
    try { const r = await listJobsAction(); setItems(r.items); setPipeline(r.pipeline); setError(null); }
    catch { setError("Data lamaran belum bisa dimuat. Coba lagi."); }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await getJobDetailAction(id)); } catch { setError("Detail lamaran belum bisa dimuat."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setDetail(null); if (openId) void loadDetail(openId); }, [openId, loadDetail]);

  async function run(fn: () => Promise<unknown>, msg: string, after?: () => Promise<void>) {
    setSaving(true);
    try { await fn(); setError(null); await (after ?? refresh)(); } catch { setError(msg); } finally { setSaving(false); }
  }
  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    void run(async () => { await createJobAction(jobFields(f)); form.reset(); }, "Lamaran belum tersimpan. Periksa isian lalu coba lagi.");
  }
  function onEdit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    void run(() => updateJobAction(id, jobFields(f)), "Perubahan belum tersimpan. Periksa isian lalu coba lagi.");
  }
  function onNote(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    void run(async () => { await addNoteAction(id, { body: f.get("body") }); form.reset(); }, "Catatan belum tersimpan.", () => loadDetail(id));
  }
  function onContact(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    void run(async () => { await addContactAction(id, { name: f.get("name"), role: f.get("role"), email: f.get("email"), profileUrl: f.get("profileUrl") }); form.reset(); }, "Kontak belum tersimpan. Periksa email/URL.", () => loadDetail(id));
  }

  const open = items.find((j) => j.id === openId);
  return <>
    <header className="content-head"><div><p className="eyebrow"><span /> Karier</p><h1>Pelacak lamaran</h1><p>Catat lamaranmu dan pindahkan statusnya seiring proses berjalan.</p></div></header>
    {error && <p role="alert" className="inline-notice">{error}</p>}
    <form className="memory-form" onSubmit={onCreate} aria-label="Tambah lamaran"><JobFields /><button className="primary-button" disabled={saving}>{saving ? "Menyimpan..." : "Tambah lamaran"}</button></form>
    {open && <section className="milestone-card" aria-label="Detail lamaran" style={{ marginTop: 24 }}>
      <h2>Ubah: {open.position} · {open.company}</h2>
      <form key={open.id + String(open.updatedAt)} className="memory-form" onSubmit={(e) => onEdit(e, open.id)} aria-label="Ubah lamaran">
        <JobFields job={open} />
        <div><button className="primary-button" disabled={saving}>Simpan perubahan</button> <button type="button" onClick={() => setOpenId(null)}>Tutup</button></div>
      </form>
      <h3>Catatan</h3>
      <ul>{detail?.notes.map((n) => <li key={n.id}>{n.body} <button onClick={() => run(() => deleteNoteAction(n.id), "Catatan belum bisa dihapus.", () => loadDetail(open.id))}>Hapus</button></li>)}</ul>
      <form onSubmit={(e) => onNote(e, open.id)} aria-label="Tambah catatan"><textarea name="body" required maxLength={2000} rows={2} /><button disabled={saving}>Tambah catatan</button></form>
      <h3>Kontak</h3>
      <ul>{detail?.contacts.map((c) => <li key={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}{c.email ? ` · ${c.email}` : ""}{c.profileUrl && <> · <a href={c.profileUrl} target="_blank" rel="noopener noreferrer">Profil</a></>} <button onClick={() => run(() => deleteContactAction(c.id), "Kontak belum bisa dihapus.", () => loadDetail(open.id))}>Hapus</button></li>)}</ul>
      <form onSubmit={(e) => onContact(e, open.id)} aria-label="Tambah kontak">
        <input name="name" placeholder="Nama" required maxLength={120} /><input name="role" placeholder="Peran" maxLength={120} />
        <input name="email" type="email" placeholder="Email" maxLength={320} /><input name="profileUrl" type="url" placeholder="Link profil" maxLength={500} />
        <button disabled={saving}>Tambah kontak</button>
      </form>
    </section>}
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 28 }} aria-label="Pipeline lamaran">
      {STATUSES.map((status) => <div key={status} className="milestone-card">
        <h2>{LABELS[status]} <small>({pipeline[status] ?? 0})</small></h2>
        {items.filter((j) => j.status === status).map((job) => <article key={job.id} className="task-row" style={{ gridTemplateColumns: "1fr" }}>
          <div><h3>{job.position}</h3><p>{job.company}{job.location ? ` · ${job.location}` : ""}</p>
            {job.url && <p><a href={job.url} target="_blank" rel="noopener noreferrer">Lowongan</a></p>}</div>
          <select aria-label="Ubah status" value={job.status} onChange={(e) => run(() => setJobStatusAction(job.id, e.target.value), "Status belum bisa diubah.")}>{STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}</select>
          <button onClick={() => setOpenId(job.id)}>Ubah / detail</button>
          <button onClick={() => run(async () => { await deleteJobAction(job.id); if (openId === job.id) setOpenId(null); }, "Lamaran belum bisa dihapus.")}>Hapus</button>
        </article>)}
      </div>)}
    </section>
  </>;
}
