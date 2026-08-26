import { check, date, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

// data-model.md §2.18. Server-generated UUIDv7 id (`newId()` from
// `@/domain/ids/uuidv7`) — bodyweight entries are plain online REST, not one
// of the offline-outbox tables (§1's client-generated list is
// workout_sessions/session_exercises/set_logs/recommendations only).
// `date` is the user-timezone local date (§1 global convention), resolved
// server-side via `userLocalDateString` — never the client's own clock.
export const bodyweightEntries = pgTable(
  "bodyweight_entries",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2, mode: "number" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_bodyweight_day").on(table.userId, table.date),
    check("ck_bodyweight_entries_weight_kg_range", sql`${table.weightKg} between 20 and 400`),
  ],
);
