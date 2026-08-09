import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
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
