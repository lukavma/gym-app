import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workoutSessions } from "./workoutSessions";
import { exercises } from "./exercises";

// data-model.md §2.13. `id` is client-generated UUIDv7, same rationale as
// `workout_sessions.id`. `prescription` is a versioned PrescriptionSnapshot
// (`@/domain/schemas/prescriptionSnapshot`), frozen once at session start
// (ADR-007 snapshot-on-use) — null only for free ad-hoc exercises that were
// never prescribed anything to snapshot.
//
// `uq_session_exercise_position` is declared here as a plain unique
// constraint for the same reason as `exercise_prescriptions.uq_prescriptions_position`
// (see that file's comment) — `DEFERRABLE INITIALLY DEFERRED` is appended by
// hand to the generated migration SQL.
export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
    source: text("source").notNull(),
    prescription: jsonb("prescription"),
    skipped: boolean("skipped").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_session_exercise_position").on(table.sessionId, table.position),
    index("ix_session_exercises_exercise").on(table.exerciseId, table.createdAt.desc()),
    index("ix_session_exercises_session_id").on(table.sessionId),
    check("ck_session_exercises_source", sql`${table.source} in ('template', 'adhoc')`),
  ],
);
