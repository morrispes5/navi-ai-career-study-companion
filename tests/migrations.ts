import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** All db/NNNN_*.sql migrations in order (0000_init + additive ALTERs), as one script. */
export function migrationSql() {
  const dir = join(__dirname, "../db");
  return readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/--> statement-breakpoint/g, "")).join("\n");
}

/** Hapus folder DB sementara. Di Windows libSQL kadang masih mengunci file sesaat setelah close. */
export function removeTempDir(dir: string) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
  }
}
