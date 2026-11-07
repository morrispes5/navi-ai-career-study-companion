import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export default async function globalSetup() {
  const file = join(process.cwd(), "e2e.db");
  for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
  const dir = join(process.cwd(), "db");
  const sql = readdirSync(dir).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()
    .map((name) => readFileSync(join(dir, name), "utf8").replace(/--> statement-breakpoint/g, "")).join("\n");
  const client = createClient({ url: `file:${file}` });
  await client.executeMultiple(sql);
  client.close();
}
