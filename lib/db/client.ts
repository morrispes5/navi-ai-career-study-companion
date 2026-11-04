import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../../db/schema";

export type NaviDb = LibSQLDatabase<typeof schema> & { $client: Client };

export function createDb(url: string, authToken?: string): NaviDb {
  return drizzle(createClient({ url, authToken: authToken || undefined }), { schema });
}

let cached: NaviDb | undefined;

/** Server-only Turso/libSQL connection. Jangan pernah impor dari komponen client. */
export function getDb(): NaviDb {
  if (!cached) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL belum diisi.");
    cached = createDb(url, process.env.TURSO_AUTH_TOKEN);
  }
  return cached;
}
