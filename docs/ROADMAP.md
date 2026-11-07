# Roadmap Navi

Status kode di `main` setelah fase karier (#21–#27), plus sisa yang dikerjakan berikutnya:

- Fase 0–2 dan 4: selesai (Turso, Better Auth, job tracker, review CV, saran kerja).
- Fase 3: generator rencana dan fallback template selesai. Rate limit `/api/chat` (20/60 dtk, 429 + `Retry-After`) selesai.
- Fase 5: streak, `activity_log`, halaman `/workspace/dashboard`, dan cron `/api/cron/reminders` selesai di kode. Email produksi butuh `RESEND_API_KEY`.
- Fase 6: Vitest dan GitHub Actions sudah ada. Playwright (`npm run test:e2e`) mencakup daftar, masuk, rencana, dan chat. Deploy Vercel tetap langkah manual: isi env di proyek Vercel (lihat `docs/ENV.md`) dan jangan commit rahasia. `vercel.json` sudah mendaftarkan cron pengingat.
- Skrip migrasi data Supabase → Turso (#3) ada di `lib/migrate/from-supabase.ts` (`npm run db:migrate-supabase`). Default-nya dry-run dan menghitung baris sebelum/sesudah saat `--apply`. Password lama tidak disalin; setiap pengguna mendapat akun credential yang tidak bisa dipakai masuk, lalu mengatur ulang password. Menulis ke URL yang mengandung `morriztech` ditolak tanpa `--apply` dan `ALLOW_PRODUCTION=1`. Skrip ini belum dijalankan ke database produksi.

## Fase 0 — Bersih-bersih
- Hapus `.mcp.json` yang ter-commit, tambahkan ke `.gitignore`.
- Hapus folder screenshot duplikat `dokumentasi ss/` (pertahankan `docs/screenshots/`).
- Tambah `lib/env.ts` (Zod).
**Selesai jika:** repo tanpa file rahasia/duplikat, `npm run build` lulus.

## Fase 1 — Database Turso + Drizzle
- `db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`, migrasi pertama.
- Ganti semua query di `lib/supabase/navi.ts` → `lib/db/*.ts` (selalu filter `userId`).
**Selesai jika:** tidak ada import `@supabase/*`; data onboarding/plan/memory/chat tersimpan di Turso.

## Fase 2 — Better Auth
- `lib/auth.ts` (drizzleAdapter, sqlite), route `app/api/auth/[...all]/route.ts`, middleware proteksi `/workspace`.
- Halaman login, signup, forgot/update password pakai Better Auth + Resend.
**Selesai jika:** daftar, login, logout, reset password jalan; `/workspace` redirect jika belum login.

## Fase 3 — AI Gemini
- Chat mentor tetap via `@google/genai`, output divalidasi Zod, fallback fixture.
- Generator rencana belajar AI (plan → milestones → tasks) dari profil, Zod-validated, retry 1x.
- Rate limit `/api/chat` (tabel `rate_limits`, 429 + header `Retry-After`).
**Selesai jika:** rencana tersimpan sesuai skema; JSON invalid tidak crash; pesan ke-21/menit ditolak 429.

## Fase 4 — Fitur karier
- Port job tracker dari `morrispes5/sei-job-tracker` → tabel `job_applications` (status kanban).
- Review CV (upload teks/PDF → Gemini → skor + saran, simpan di `cv_reviews`).
- Saran lowongan/role berdasarkan profil & skill gap.
**Selesai jika:** CRUD lamaran per user, review CV tersimpan & tampil riwayatnya.

## Fase 5 — Engagement
- Streak harian & `activity_log`, dashboard progres (task selesai, jam belajar, streak).
- Pengingat harian via Vercel Cron + Resend (`/api/cron/reminders`, cek `CRON_SECRET`).
**Selesai jika:** streak naik saat ada aktivitas, reset bila bolos; email reminder terkirim sesuai `reminder_time`.

## Fase 6 — Kualitas & Deploy
- Vitest (lib/db, validasi Zod, rate limit), Playwright (signup→onboarding→chat).
- GitHub Actions: lint, typecheck, test, build pada PR.
- Deploy Vercel + env + cron.
**Selesai jika:** CI hijau, Preview deploy per PR, Production live.
