import { defineConfig } from "drizzle-kit";

// BASELINE NOTE: the tables in Turso db "morriztech" were created from db/0000_init.sql.
// Do NOT run `drizzle-kit push` or `generate` + `migrate` from scratch — it would try to recreate them.
// For future changes: edit db/schema.ts, run `npm run db:generate`, review the SQL, and only apply the
// new incremental migration. To verify drift, run `npx drizzle-kit pull` into a scratch folder and diff.
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: { url: process.env.TURSO_DATABASE_URL ?? "", authToken: process.env.TURSO_AUTH_TOKEN },
});
