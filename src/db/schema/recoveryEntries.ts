import {
  check,
  date,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

// data-model.md §2.19. Same id/date conventions as bodyweightEntries.ts —
// server-generated UUIDv7, `date` is the user-timezone local date. All four
// metric columns are individually optional (domain-model.md §7:
// "RecoveryEntry { ... all fields optional }"), but the row as a whole must
// carry at least one (ck_recovery_entries_has_metric) — an all-null row
// would be indistinguishable from "no entry logged today".
export const recoveryEntries = pgTable(
  "recovery_entries",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 2, mode: "number" }),
    sleepQuality: smallint("sleep_quality"),
    readiness: smallint("readiness"),
    soreness: smallint("soreness"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_recovery_day").on(table.userId, table.date),
    check("ck_recovery_entries_sleep_hours_range", sql`${table.sleepHours} between 0 and 24`),
    check("ck_recovery_entries_sleep_quality_range", sql`${table.sleepQuality} between 1 and 5`),
    check("ck_recovery_entries_readiness_range", sql`${table.readiness} between 1 and 5`),
    check("ck_recovery_entries_soreness_range", sql`${table.soreness} between 1 and 5`),
    check(
      "ck_recovery_entries_has_metric",
      sql`${table.sleepHours} is not null or ${table.sleepQuality} is not null or ${table.readiness} is not null or ${table.soreness} is not null`,
    ),
  ],
);
