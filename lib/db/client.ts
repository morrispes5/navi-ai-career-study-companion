import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../../db/schema";
import { getDbEnv } from "../env";

export type NaviDb = LibSQLDatabase<typeof schema> & { $client: Client };

export function createDb(url: string, authToken?: string): NaviDb {
  return drizzle(createClient({ url, authToken: authToken || undefined }), { schema });
}

let cached: NaviDb | undefined;

/** Server-only Turso/libSQL connection. Jangan pernah impor dari komponen client. */
export function getDb(): NaviDb {
  if (!cached) {
    const env = getDbEnv();
    cached = createDb(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  }
  return cached;
}
