# Roadmap Navi

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
