# Navi — AI Career & Study Companion

Navi membantu calon profesional teknologi Indonesia mengubah target karier menjadi rencana belajar yang kecil, terarah, dan dapat dikerjakan. Pengunjung menjawab lima pertanyaan, membuat akun untuk menyimpan rencana, lalu menjalankan tugas hari ini bersama mentor chat Navi.

## Stack

Next.js 15 · Turso (libSQL) via Drizzle ORM · Better Auth (email/password, Google opsional) · Gemini (`@google/genai`).

## Menjalankan proyek

```bash
npm install
cp .env.example .env.local   # isi nilainya, lihat docs/ENV.md
npm run dev
```

Panduan lengkap: [docs/SETUP.md](docs/SETUP.md) · env: [docs/ENV.md](docs/ENV.md) · arsitektur: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · skema: [docs/SCHEMA.md](docs/SCHEMA.md) · roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## Database (Turso `morriztech`)

Tabel sudah dibuat dari `db/0000_init.sql` (sumber kebenaran skema: `db/schema.ts`). **Jangan jalankan `drizzle-kit push` dari awal.** Perubahan berikutnya: ubah `db/schema.ts` → `npm run db:generate` → review SQL incremental → apply.

## Arsitektur data

Semua akses data lewat `lib/server/navi.ts` (server-only). Setiap fungsi menerima `userId` dari session Better Auth (`lib/auth.ts`) dan setiap query difilter `user_id`. Komponen client memanggil server actions di `app/actions/navi.ts`; chat lewat `POST /api/chat` (cookie session).

## Verifikasi

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm test` menjalankan test isolasi user terhadap SQLite lokal sementara yang dibuat dari `db/0000_init.sql` (tidak butuh Turso).
