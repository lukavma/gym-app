import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

// Warm-up Routines v1 (docs/reviews/warmup-routines-architecture-evaluation.md
// §4.1, B-1/B-3). A planning-world definition: a user-authored, named,
// ordered checklist of pure-text items. It is NOT the `set_logs.is_warmup`
// concept (warm-up SETS of a loaded lift) and never becomes one — see I-8.
//
// `id` has no `.defaultRandom()`: rows get a server-generated UUIDv7
// (`newId()`), the house convention for every table except the legacy
// `users.id`. CRUD is online-only, so no client ever mints one of these.
//
// Hard delete, no `archived_at` (X-8): nothing historical references a
// routine — execution state lives only in the device-local active-session
// aggregate and dies with it — so the archive lifecycle used for
// exercises/templates/programs would be weight with no invariant to protect.
// That is also why the name uniqueness index is plain rather than partial.
export const warmupRoutines = pgTable(
  "warmup_routines",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_warmup_routines_name").on(table.userId, sql`lower(${table.name})`),
    index("ix_warmup_routines_user_id").on(table.userId),
  ],
);
