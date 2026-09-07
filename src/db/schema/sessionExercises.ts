import {
  boolean,
  check,
  foreignKey,
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
import { LOAD_BASES, MEASUREMENT_PROFILES } from "@/domain/measurement/profile";
import { workoutSessions } from "./workoutSessions";
import { exercises } from "./exercises";

function checkInList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

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
//
// `measurementProfile` / `loadBasis` are the slot's frozen measurement shape
// (athletic-measurement-profiles-architecture-evaluation.md §8.2, H-1) —
// server-derived from `exercises` at insert (§10.1) and never patched after.
// `uq_session_exercises_id_profile` + the `fk_session_exercises_exercise_profile`
// mirror FK below (O-14) make that freeze a database guarantee: the exercise's
// `(id, measurement_profile)` pair cannot change while a slot references it,
// so `UPDATE exercises SET measurement_profile = …` fails `23503` once any
// slot exists (§10.3, I-3). `loadBasis` is deliberately excluded from the
// mirror FK — it is not locked, an edit with history is permitted (§10.3).
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
    measurementProfile: text("measurement_profile").notNull().default("load_reps"),
    loadBasis: text("load_basis").default("unspecified"),
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
    check(
      "ck_session_exercises_measurement_profile",
      sql`${table.measurementProfile} in (${checkInList(MEASUREMENT_PROFILES)})`,
    ),
    check(
      "ck_session_exercises_load_basis",
      sql`${table.loadBasis} is null or ${table.loadBasis} in (${checkInList(LOAD_BASES)})`,
    ),
    check(
      "ck_session_exercises_load_basis_presence",
      sql`(${table.measurementProfile} in ('load_reps', 'load_distance', 'load_duration')) = (${table.loadBasis} is not null)`,
    ),
    unique("uq_session_exercises_id_profile").on(table.id, table.measurementProfile),
    foreignKey({
      columns: [table.exerciseId, table.measurementProfile],
      foreignColumns: [exercises.id, exercises.measurementProfile],
      name: "fk_session_exercises_exercise_profile",
    }).onDelete("restrict"),
  ],
);
