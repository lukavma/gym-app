import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

// data-model.md §2.6. `id` has no `.defaultRandom()` — server-generated
// UUIDv7 via `newId()`, same convention as exercises (see exercises.ts).
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // domain-model.md §4 — at most one active program per user.
    uniqueIndex("uq_programs_one_active")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index("ix_programs_user_id").on(table.userId),
    check("ck_programs_status", sql`${table.status} in ('active', 'archived')`),
  ],
);
