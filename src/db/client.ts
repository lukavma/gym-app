import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

// Both `pg` (dev/prod) and PGlite (integration tests, ADR-003) produce a
// `PgDatabase` — server code is written against this common base type
// (rather than a union of the two concrete driver classes) so the query
// builder's overloaded methods (e.g. `.returning()`) resolve to a single,
// unambiguous signature instead of TypeScript's lossy union-of-overloads
// behavior.
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

let pool: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

// Lazy singleton: avoids opening a connection pool at module-import time
// (e.g. during `next build`'s static analysis), only on first real use.
export function getDb(): AppDb {
  if (!dbInstance) {
    // sslmode in the connection string (e.g. `?sslmode=require` in
    // production — ADR-009) is parsed by `pg` itself.
    pool = new Pool({ connectionString: requireDatabaseUrl() });
    // node-postgres emits `error` on a pool client that dies while idle
    // (network blip, server restart). Without a listener this is an
    // uncaught exception that crashes the whole Node process — the pool
    // itself recovers fine on its own (it discards the dead client and
    // opens a new one on next use), so logging is all that's needed here.
    pool.on("error", (err) => {
      console.error("Postgres pool idle client error", err);
    });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}
