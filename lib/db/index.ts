import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../../db/schema";

let client: Client | undefined;
let instance: LibSQLDatabase<typeof schema> | undefined;

/** Lazy Turso connection: nothing connects at build/import time. */
export function getDb() {
  if (!instance) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL belum diset.");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export { schema };
