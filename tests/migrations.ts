import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** All db/NNNN_*.sql migrations in order (0000_init + additive ALTERs), as one script. */
export function migrationSql() {
  const dir = join(__dirname, "../db");
  return readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/--> statement-breakpoint/g, "")).join("\n");
}
