# Navi — AI Career & Study Companion

Navi membantu calon profesional teknologi Indonesia mengubah target karier menjadi rencana belajar yang kecil, terarah, dan dapat dikerjakan. Pengunjung menjawab lima pertanyaan, membuat akun untuk menyimpan rencana, lalu menjalankan tugas hari ini bersama mentor chat Navi.

## Menjalankan proyek

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Isi `.env.local` (lihat `docs/ENV.md`): Turso, Better Auth, dan Gemini. Jangan pernah commit file tersebut atau key asli.

## Alur produk

1. `/` — landing menjelaskan produk, dengan tautan **Cara kerja** dan **Untukmu** yang melakukan smooth-scroll.
2. Onboarding — pengguna menjawab lima pertanyaan tanpa akun. Jawaban tersimpan sementara di browser dan dapat diubah dengan tombol kembali.
3. `/signup` — pengguna membuat akun email + password; setelah berhasil, Navi menyimpan profil dan menghasilkan rencana deterministik.
4. `/workspace` — halaman **Hari ini** berisi tugas prioritas, waktu, progres, dan streak.
5. `/workspace/dashboard` — jam belajar, streak, progres rencana, dan jumlah lamaran. Semua angka difilter `user_id`.
6. `/workspace/plan` — empat milestone dan 12 tugas; menyelesaikan tugas memperbarui progres, menit belajar, dan streak di Turso.
7. `/workspace/chat` — chat tersimpan dalam conversation pengguna. Gemini hanya dipanggil dari server; fixture aman dipakai bila provider tidak tersedia. Lebih dari 20 pesan per menit ditolak dengan 429.
8. `/workspace/memory` — fakta profil dan catatan pengguna. Catatan dapat ditambah, diubah, dihapus, atau dihapus semua.
9. `/workspace/profile` — perubahan profil selalu menampilkan proposal terlebih dahulu. Menerapkan proposal mengarsipkan rencana lama sehingga capaian tetap tersimpan; membatalkan proposal tidak mengubah data. Pengingat harian bisa dinyalakan di sini.
10. `/workspace/jobs`, `/workspace/cv`, `/workspace/job-suggestions` — pelacak lamaran, review CV, dan saran peran.

Template rencana tersedia untuk **Frontend Developer**, **Backend Developer**, **UI/UX Designer**, dan **Data Analyst**. Masing-masing memiliki empat milestone dan tiga tugas per milestone; durasi tugas menyesuaikan jam belajar serta preferensi pengguna.

## Rute dan endpoint

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/health` | Status konfigurasi runtime tanpa membocorkan key. |
| `POST` | `/api/chat` | Memerlukan cookie session Better Auth. Menerima `{ "message": string, "conversationId"?: string }`, memverifikasi session, membatasi 20 pesan per 60 detik, memuat konteks milik pengguna, dan menyimpan kedua pesan. |
| `GET`/`POST` | `/api/cron/reminders` | Pengingat harian. Wajib header `Authorization: Bearer <CRON_SECRET>`. |

| `GET/POST` | `/api/auth/*` | Endpoint Better Auth (sign-up, sign-in, sign-out, reset password). |

Route `/workspace/*` dilindungi middleware (cookie session Better Auth). Semua akses data lewat server action `lib/navi/actions.ts` → `lib/db/navi.ts`, yang selalu memfilter `user_id` dari session server.

## Database (Turso + Drizzle)

Skema ada di `db/schema.ts` dan sudah terpasang di database Turso `morriztech` (`db/0000_init.sql`). **Jangan** menjalankan `drizzle-kit push` ke database tersebut; untuk perubahan baru gunakan `npm run db:generate`. SQL Supabase lama disimpan di `docs/legacy/` sebagai referensi. Menyalin data lama: `npm run db:migrate-supabase` (dry-run, lihat `docs/SETUP.md`).

## Environment variables

Lihat `.env.example` dan `docs/ENV.md`. Minimal: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `GEMINI_API_KEY`. Semua rahasia server-only; jangan commit `.env.local`.

## Verifikasi

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e
```

Build produksi harus selesai tanpa type error. Untuk uji manual, buat akun baru, selesaikan satu tugas, refresh halaman, kirim chat, tambahkan catatan memori, lalu ubah profil dan pilih **Terapkan perubahan** atau **Tetap pakai rencana lama**.
