# Variabel Environment Navi

Hasil scan repo (read-only): kode saat ini memakai `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `.env.example` lama juga mencantumkan `SUPABASE_SECRET_KEY`.

| Variabel | Fungsi | Dapat dari mana | Wajib? | Lokal | Vercel |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | URL publik app (link email, redirect) | `http://localhost:3000` / domain Vercel | Wajib | ✅ | ✅ (Production & Preview beda nilai) |
| `TURSO_DATABASE_URL` | Koneksi database libSQL | `turso db show morriztech --url` | Wajib | ✅ | ✅ |
| `TURSO_AUTH_TOKEN` | Token akses database (rahasia) | `turso db tokens create morriztech` | Wajib | ✅ | ✅ (Sensitive) |
| `BETTER_AUTH_SECRET` | Enkripsi/sign session | `openssl rand -base64 32` | Wajib | ✅ | ✅ (Sensitive, beda dari lokal) |
| `BETTER_AUTH_URL` | Base URL Better Auth | sama dengan APP_URL | Wajib | ✅ | ✅ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login dengan Google | Google Cloud Console → Credentials → OAuth client | Opsional | ✅ | ✅ |
| `GEMINI_API_KEY` | Chat mentor, rencana belajar AI, review CV | https://aistudio.google.com/apikey | Wajib (tanpa ini pakai fixture) | ✅ | ✅ (Sensitive) |
| `GEMINI_MODEL` | Nama model Gemini | default `gemini-3.6-flash` (sudah ada) | Opsional | ✅ | ✅ |
| `RESEND_API_KEY` | Kirim email reset password & pengingat | https://resend.com/api-keys | Wajib untuk email | ✅ | ✅ (Sensitive) |
| `EMAIL_FROM` | Alamat pengirim | domain terverifikasi di Resend | Wajib jika email aktif | ✅ | ✅ |
| `CRON_SECRET` | Mengamankan endpoint `/api/cron/reminders` | `openssl rand -hex 32` | Wajib di production | opsional | ✅ |
| `CHAT_RATE_LIMIT_MAX` | Maks pesan chat per jendela | default 20 | Opsional | ✅ | ✅ |
| `CHAT_RATE_LIMIT_WINDOW_SECONDS` | Panjang jendela rate limit | default 60 | Opsional | ✅ | ✅ |
| ~~`NEXT_PUBLIC_SUPABASE_URL`~~ | Supabase lama | — | **HAPUS** | ❌ | ❌ hapus |
| ~~`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`~~ | Supabase lama | — | **HAPUS** | ❌ | ❌ hapus |
| ~~`SUPABASE_SECRET_KEY`~~ | Supabase lama | — | **HAPUS** | ❌ | ❌ hapus |

Skrip sekali jalan `npm run db:migrate-supabase` membaca `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dari shell, plus `TURSO_DATABASE_URL` saat `--apply`. Jangan menulis service role key ke `.env.local` atau env Vercel. Aplikasi Next tidak memakai variabel itu.

Aturan: semua rahasia **server-only** (tanpa `NEXT_PUBLIC_`). Jangan pernah commit `.env.local`. Validasi env di `lib/env.ts` pakai Zod supaya app gagal cepat kalau ada yang kosong.
