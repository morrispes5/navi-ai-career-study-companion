# Navi — AI Career & Study Companion

Navi membantu calon profesional teknologi Indonesia mengubah target karier menjadi rencana belajar yang kecil, terarah, dan dapat dikerjakan. Pengunjung menjawab lima pertanyaan, membuat akun untuk menyimpan rencana, lalu menjalankan tugas hari ini bersama mentor chat Navi.

## Menjalankan proyek

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Isi `.env.local` dengan kredensial Supabase dan Gemini. Jangan pernah commit file tersebut atau key asli.

## Alur produk

1. `/` — landing menjelaskan produk, dengan tautan **Cara kerja** dan **Untukmu** yang melakukan smooth-scroll.
2. Onboarding — pengguna menjawab lima pertanyaan tanpa akun. Jawaban tersimpan sementara di browser dan dapat diubah dengan tombol kembali.
3. `/signup` — pengguna membuat akun email + password; setelah berhasil, Navi menyimpan profil dan menghasilkan rencana deterministik.
4. `/workspace` — halaman **Hari ini** berisi tugas prioritas, waktu, dan progres.
5. `/workspace/plan` — empat milestone dan 12 tugas; menyelesaikan tugas memperbarui progres dan milestone di Supabase.
6. `/workspace/chat` — chat tersimpan dalam conversation pengguna. Gemini hanya dipanggil dari server; fixture aman dipakai bila provider tidak tersedia.
7. `/workspace/memory` — fakta profil dan catatan pengguna. Catatan dapat ditambah, diubah, dihapus, atau dihapus semua.
8. `/workspace/profile` — perubahan profil selalu menampilkan proposal terlebih dahulu. Menerapkan proposal mengarsipkan rencana lama sehingga capaian tetap tersimpan; membatalkan proposal tidak mengubah data.

Template rencana tersedia untuk **Frontend Developer**, **Backend Developer**, **UI/UX Designer**, dan **Data Analyst**. Masing-masing memiliki empat milestone dan tiga tugas per milestone; durasi tugas menyesuaikan jam belajar serta preferensi pengguna.

## Rute dan endpoint

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/health` | Status konfigurasi runtime tanpa membocorkan key. |
| `POST` | `/api/chat` | Memerlukan `Authorization: Bearer <Supabase access token>`. Menerima `{ "message": string, "conversationId"?: uuid }`, memverifikasi session, memuat konteks milik pengguna, dan menyimpan kedua pesan. |

Route workspace membutuhkan session Supabase. Login, logout, refresh session, workspace, dan chat menggunakan satu client session browser yang sama. Kegagalan koneksi diberi tombol pemulihan yang jelas.

## Supabase

Jalankan migration secara berurutan:

1. `supabase/migrations/20260804072759_create_navi_core_schema.sql` — skema dasar dan RLS.
2. `supabase/migrations/20260804101500_upgrade_navi_core_loop.sql` — upgrade additive untuk rencana arsip, template key, dan kategori memori.

Jangan menjalankan migration dasar kedua kali pada database yang sudah memilikinya. Semua tabel memakai RLS; pengguna hanya dapat mengakses profile, plan, task, memory, dan conversation yang dimilikinya.

Di **Authentication → Providers**, aktifkan Email + Password dan matikan Confirm email untuk Release 0. Anonymous sign-in harus tetap mati. Pada **URL Configuration**, set URL lokal dan production, termasuk redirect pemulihan password:

```text
http://localhost:3000/**
https://your-domain.com/**
```

## Environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` memang digunakan di browser. `GEMINI_API_KEY` hanya dibaca server. Sebelum deployment atau berbagi repository, rotate key rahasia yang pernah dibagikan dan pastikan `.env.local` tetap tidak terlacak Git.

## Verifikasi

```powershell
npm.cmd run build
```

Build produksi harus selesai tanpa type error. Untuk uji manual, buat akun baru, selesaikan satu tugas, refresh halaman, kirim chat, tambahkan catatan memori, lalu ubah profil dan pilih **Terapkan perubahan** atau **Tetap pakai rencana lama**.
