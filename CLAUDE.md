# CLAUDE.md — Navi AI Career & Study Companion

## Arsitektur target
- Next.js 15 App Router, TypeScript strict, Zod v4.
- DB: **Turso (libSQL)** via `drizzle-orm/libsql` + `@libsql/client`. Schema: `db/schema.ts`, client: `lib/db/client.ts`, migrasi: `db/` (`0000_init.sql` + `db/meta/_journal.json`) (drizzle-kit, dialect `turso`). **Bukan Supabase, bukan Neon.**
- Auth: **Better Auth** (`lib/auth.ts`, drizzleAdapter provider `sqlite`, email+password, Google opsional), route `app/api/auth/[...all]`, email via Resend.
- AI: `@google/genai` (`GEMINI_API_KEY`, `GEMINI_MODEL`), semua output JSON divalidasi Zod, fallback fixture bila gagal. Chat mentor `app/api/chat`, generator rencana `app/api/plan/generate`, review CV `app/api/cv/review`.
- Fitur: job tracker (port dari `morrispes5/sei-job-tracker`), CV review, saran lowongan, streak, reminder (Vercel Cron `/api/cron/reminders` + `CRON_SECRET`), dashboard progres, rate limit `/api/chat`.
- Test: Vitest (unit), Playwright (E2E). CI: GitHub Actions (lint, typecheck, test, build). Deploy: Vercel.

## Aturan
- **Selalu filter `userId`** dari session server di setiap query/mutasi; jangan pernah percaya `userId` dari client.
- **Jangan commit rahasia.** `.env*` (kecuali `.env.example`) di `.gitignore`. Rahasia tanpa prefix `NEXT_PUBLIC_`. Env divalidasi di `lib/env.ts`.
- Hapus `.mcp.json` yang ter-commit (+ tambahkan ke `.gitignore`) dan folder screenshot duplikat `dokumentasi ss/` (simpan `docs/screenshots/`).
- Akses DB hanya lewat `lib/db/*` (server-only). Tidak ada `@supabase/*` setelah Fase 1.
- UI teks dalam Bahasa Indonesia. Commit kecil per fase, conventional commits.

## Urutan migrasi (lihat docs/ROADMAP.md)
0. Cleanup (.mcp.json, `dokumentasi ss/`, `lib/env.ts`).
1. Turso + Drizzle: schema, migrasi, ganti `lib/supabase/navi.ts` → `lib/db/*`.
2. Better Auth: ganti `lib/supabase/client.ts`/`auth-errors.ts`, halaman login/signup/forgot/update-password, middleware `/workspace`.
3. Gemini: chat + rencana AI (Zod) + rate limit.
4. Karier: job tracker, CV review, saran lowongan.
5. Streak, activity log, dashboard, reminder cron.
6. Vitest + Playwright, GitHub Actions, deploy Vercel. Lalu hapus `supabase/` dan `@supabase/supabase-js`.

Env lengkap: `docs/ENV.md`. Setup: `docs/SETUP.md`. Skema: `docs/SCHEMA.md`.
