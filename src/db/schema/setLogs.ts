import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sessionExercises } from "./sessionExercises";

// data-model.md §2.14. `id` is client-generated UUIDv7. `rir` is raw and
// user-entered — never derived, never silently corrected (domain-model.md
// §9/§10, mvp-scope.md F5 acceptance).
//
// `uq_set_number` is declared here as a plain unique constraint for the same
// reason as `exercise_prescriptions.uq_prescriptions_position` (see that
// file's comment) — `DEFERRABLE INITIALLY DEFERRED` is appended by hand to
// the generated migration SQL. Deferred validation is needed here because
// deleting a mid-list set and renumbering the remainder happens as
// per-row updates within one transaction, which would otherwise collide
// with sibling set numbers mid-transaction.
export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").primaryKey(),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setNumber: smallint("set_number").notNull(),
    isWarmup: boolean("is_warmup").notNull().default(false),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2, mode: "number" }).notNull(),
    reps: smallint("reps").notNull(),
    rir: smallint("rir"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_set_number").on(table.sessionExerciseId, table.setNumber),
    index("ix_set_logs_session_exercise").on(table.sessionExerciseId, table.setNumber),
    check("ck_set_logs_set_number_positive", sql`${table.setNumber} >= 1`),
    check("ck_set_logs_weight_kg_nonneg", sql`${table.weightKg} >= 0`),
    check("ck_set_logs_reps_range", sql`${table.reps} between 1 and 100`),
    check("ck_set_logs_rir_range", sql`${table.rir} between 0 and 10`),
  ],
);
