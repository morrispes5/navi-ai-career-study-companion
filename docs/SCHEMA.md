# Skema Database (Turso / SQLite via Drizzle)

Sumber kebenaran: `db/schema.ts`. Semua tabel domain punya `user_id` (FK ke `user.id`, `ON DELETE CASCADE`) — **setiap query wajib filter `user_id`** (pengganti RLS Supabase).

| Tabel | Isi | Relasi |
|---|---|---|
| `user`, `session`, `account`, `verification` | Tabel Better Auth | — |
| `profiles` | Hasil onboarding: target role, level, jam/minggu, preferensi, skill, zona waktu, jam reminder | 1:1 user |
| `learning_plans` | Rencana belajar (template/gemini), status | N:1 user |
| `plan_milestones` | Tahapan per rencana (urutan, minggu) | N:1 plan |
| `plan_tasks` | Tugas per milestone, `completed_at` | N:1 milestone |
| `memory_facts` | Catatan/memori tentang user untuk konteks chat | N:1 user |
| `conversations` / `chat_messages` | Riwayat chat mentor (role, source gemini/fixture) | N:1 |
| `job_applications` | Job tracker (port dari sei-job-tracker), status kanban | N:1 user |
| `cv_reviews` | Teks CV + skor + feedback JSON | N:1 user |
| `streaks` | Streak berjalan & terpanjang | 1:1 user |
| `activity_log` | Log aktivitas harian untuk streak & dashboard | N:1 user |
| `rate_limits` | Counter rate limit `/api/chat` per jendela | — |

Catatan: timestamp disimpan sebagai unix detik (`integer mode: timestamp`); JSON di kolom `text mode: json`. Migrasi dari Supabase: `supabase/migrations/*.sql` dijadikan referensi lalu dihapus setelah Fase 1.
