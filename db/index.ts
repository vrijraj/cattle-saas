import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db?: Database; pg?: ReturnType<typeof postgres> };

function createDb(): Database {
  const url = process.env.DATABASE_URL ?? "pglite:.data/pglite";
  if (url.startsWith("postgres")) {
    const client = globalForDb.pg ?? postgres(url, { max: 10 });
    if (process.env.NODE_ENV !== "production") globalForDb.pg = client;
    return drizzlePostgres(client, { schema });
  }

  const dataDir = url.startsWith("pglite:") ? url.slice("pglite:".length) : url;
  return drizzlePglite(dataDir, { schema }) as unknown as Database;
}

export function getDb() {
  if (!globalForDb.db) globalForDb.db = createDb();
  return globalForDb.db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
