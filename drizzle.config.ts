import { defineConfig } from "drizzle-kit";

// PERHATIAN: database `morriztech` sudah berisi semua tabel (db/0000_init.sql).
// Jangan jalankan `drizzle-kit push` ke production. Gunakan `generate` untuk migrasi baru.
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "turso",
  dbCredentials: { url: process.env.TURSO_DATABASE_URL ?? "file:local.db", authToken: process.env.TURSO_AUTH_TOKEN },
});
