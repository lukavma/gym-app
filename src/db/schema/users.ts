import {
  check,
  customType,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Postgres `citext` (case-insensitive text) — data-model.md §2.1.
// Requires `CREATE EXTENSION IF NOT EXISTS citext` (added in the first migration).
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const users = pgTable(
  "users",
  {
    // Legacy Phase-0 value: this generates UUIDv4 (`gen_random_uuid()`), not
    // the UUIDv7 convention (data-model.md §1) established from Phase 1
    // onward. The production `users` table already has real rows on this
    // default, and there is exactly one such row — rewriting it offers no
    // benefit and risks a destructive migration for a cosmetic fix, so it is
    // left untouched by design. Do not copy `.defaultRandom()` onto new
    // tables; generate IDs with `newId()` from `@/domain/ids/uuidv7` instead.
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    timezone: text("timezone").notNull().default("Europe/Ljubljana"),
    weekStartsOn: smallint("week_starts_on").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_users_email").on(table.email),
    check("ck_users_week_starts_on", sql`${table.weekStartsOn} between 0 and 6`),
  ],
);
