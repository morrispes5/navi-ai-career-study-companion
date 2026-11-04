import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../../db/schema";
import { getDbEnv } from "../env";

let client: Client | undefined;
let instance: LibSQLDatabase<typeof schema> | undefined;

/** Lazy Turso connection: nothing connects at build/import time. */
export function getDb() {
  if (!instance) {
    const env = getDbEnv();
    client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export { schema };
