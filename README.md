# Navi — AI Career & Study Companion

Navi adalah AI Career & Study Companion untuk calon developer Indonesia. Pengunjung menjawab lima pertanyaan terlebih dahulu, melihat ringkasan rencana, lalu membuat akun agar rencana tersebut tersimpan.

## Menjalankan proyek

```powershell
npm.cmd install
npm.cmd run dev
```

Salin `.env.example` menjadi `.env.local`, lalu isi nilai proyek. Jangan pernah commit `.env.local` atau key asli.

## Alur pengguna

1. `/` — landing page dan onboarding lima langkah.
2. `/signup` — ringkasan onboarding, daftar email + password, lalu seed profil, plan, milestone, tugas pertama, dan memori.
3. `/workspace` — rencana, chat, memori, serta edit profil. Halaman ini mengharuskan sesi login.
4. `/login`, `/forgot-password`, dan `/update-password` — masuk dan pemulihan akun.

## Supabase yang perlu dikonfigurasi

Di **Authentication > Sign In / Providers**, pastikan Email + Password aktif dan **Confirm email** dimatikan untuk Release 0. Anonymous sign-in harus tetap mati. Di **Authentication > URL Configuration**, masukkan URL lokal dan URL produksi sebagai Site URL/Redirect URL, termasuk:

```text
http://localhost:3000/**
https://your-domain.com/**
```

Session disimpan dan di-refresh oleh `@supabase/supabase-js` di browser. Workspace memvalidasi user melalui `getUser()`, sedangkan `/api/chat` memvalidasi access token Supabase secara terpisah. Migration inti berada di `supabase/migrations/`; semua tabel memakai RLS sehingga pengguna hanya mengakses data miliknya sendiri.

## Endpoint

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/health` | Status konfigurasi runtime tanpa membocorkan key. |
| `POST` | `/api/chat` | Memerlukan `Authorization: Bearer <Supabase access token>`. Menerima `{ "message": string, "conversationId"?: uuid }`, membaca profil dari database, menyimpan kedua pesan, lalu memakai Gemini server-side atau fixture aman bila provider gagal. |

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` aman untuk browser. `SUPABASE_SECRET_KEY` dan `GEMINI_API_KEY` hanya untuk server dan tidak boleh dipush. Sebelum deployment, rotate seluruh key asli yang pernah dibagikan.
