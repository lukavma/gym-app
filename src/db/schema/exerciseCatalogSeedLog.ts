import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// Records every catalog slug ever applied to a user, independent of whether
// the resulting exercise row still exists. `exercises.ts`'s seed is
// insert-if-absent keyed by a deterministic id derived from (user, slug); a
// hard-deleted seeded exercise leaves no row for that id to conflict on, so
// without a durable ledger a reseed would recreate it. No FK to
// `exercises.id` — this must outlive the row it seeded (Phase 1 review H1).
export const exerciseCatalogSeedLog = pgTable(
  "exercise_catalog_seed_log",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    slug: text("slug").notNull(),
    seededAt: timestamp("seeded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.slug] })],
);
