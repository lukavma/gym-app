import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Logger } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

// A fresh, migrated, in-memory Postgres (via PGlite/WASM) per call — no
// Docker required (ADR-003). Mirrors production schema exactly, including
// the `citext` extension the `users.email` column depends on.
export async function createTestDb(): Promise<AppDb> {
  const client = await PGlite.create({ extensions: { citext } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

// docs/reviews/metrics-dashboard-architecture-evaluation.md §11.3 — a
// statement-counting variant for A-12's exact-count assertions. The
// recorder is reset by the caller AFTER `migrate()` so only the call under
// test is counted; `drizzle`'s own `logger` option receives every SQL string
// the query builder issues against this instance.
export interface StatementLog {
  statements: string[];
  reset(): void;
}

export async function createTestDbWithStatementLog(): Promise<{ db: AppDb; log: StatementLog }> {
  const statements: string[] = [];
  const logger: Logger = {
    logQuery(query: string) {
      statements.push(query);
    },
  };
  const client = await PGlite.create({ extensions: { citext } });
  const db = drizzle(client, { schema, logger });
  await migrate(db, { migrationsFolder });
  statements.length = 0;
  return {
    db,
    log: {
      statements,
      reset: () => {
        statements.length = 0;
      },
    },
  };
}
