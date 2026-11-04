# Setup Navi (Turso + Better Auth + Gemini)

## 1. Turso: buat group, database, token
Org `kenzyplay` belum punya group, jadi buat dulu.
```bash
curl -sSfL https://get.tur.so/install.sh | bash   # install CLI
turso auth login
turso org switch kenzyplay
turso group create default --location sin         # Singapura
# (sudah dibuat) turso db create morriztech --group default
turso db show morriztech --url                 # -> TURSO_DATABASE_URL
turso db tokens create morriztech              # -> TURSO_AUTH_TOKEN
```
(Alternatif: dashboard https://app.turso.tech → Groups → Create "default" region Singapore.)

## 2. Lokal
```bash
git pull
cp .env.example .env.local      # isi nilai (lihat docs/ENV.md)
npm i @libsql/client drizzle-orm better-auth resend
npm i -D drizzle-kit vitest @playwright/test
npm uninstall @supabase/supabase-js
npx drizzle-kit generate        # dari db/schema.ts
npx drizzle-kit migrate         # apply ke Turso
npx @better-auth/cli generate   # cek tabel auth cocok dengan schema
npm run dev
```
`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./db/schema.ts", out: "./db/migrations", dialect: "turso",
  dbCredentials: { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN },
});
```
Tes: `npm run test` (Vitest), `npx playwright test` (E2E).

## 3. Vercel
```bash
npm i -g vercel && vercel link
vercel env add TURSO_DATABASE_URL production   # ulangi untuk tiap var & environment
vercel env rm NEXT_PUBLIC_SUPABASE_URL production   # hapus var Supabase lama jika ada
```
- Isi semua var Wajib di Production + Preview. `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` = domain Vercel.
- Cron di `vercel.json`: `{"crons":[{"path":"/api/cron/reminders","schedule":"0 0 * * *"}]}` (07:00 WIB).
- Integrasi GitHub: push ke `main` → deploy otomatis, PR → Preview.

## 4. GitHub Actions
Tambah secrets repo hanya jika E2E butuh DB: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (pakai DB terpisah, mis. `morriztech-ci`). Unit test pakai libSQL in-memory (`file::memory:`).
