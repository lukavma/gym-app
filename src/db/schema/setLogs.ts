import {
  boolean,
  check,
  foreignKey,
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
//
// `weightKg` / `reps` are nullable as of athletic-measurement-profiles
// §8.3 — required only for the profiles whose shape needs them
// (`ck_set_logs_profile_shape` below); a null here is never coerced to `0`
// or `1` by any reader (I-13, H-12). `distanceM` / `durationS` are the two
// new profile-scoped fields. `measurementProfile` is the row's frozen shape,
// copied from the parent slot at write time and locked to it by the
// composite FK. It deliberately carries no separate enum CHECK of its own
// (membership follows transitively from the shape CHECK's OR-chain and from
// the FK, §8.3) — the composite FK and the shape CHECK that together enforce
// this are the last two constraints declared below, for that reason.
export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").primaryKey(),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setNumber: smallint("set_number").notNull(),
    isWarmup: boolean("is_warmup").notNull().default(false),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2, mode: "number" }),
    reps: smallint("reps"),
    rir: smallint("rir"),
    distanceM: numeric("distance_m", { precision: 7, scale: 2, mode: "number" }),
    durationS: numeric("duration_s", { precision: 7, scale: 2, mode: "number" }),
    measurementProfile: text("measurement_profile").notNull().default("load_reps"),
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
    check(
      "ck_set_logs_distance_m_range",
      sql`${table.distanceM} > 0 and ${table.distanceM} <= 99999.99`,
    ),
    check(
      "ck_set_logs_duration_s_range",
      sql`${table.durationS} > 0 and ${table.durationS} <= 86400`,
    ),
    // §8.3 — a set's profile always equals its parent slot's; ON DELETE
    // CASCADE (not RESTRICT) matches the existing plain `sessionExerciseId`
    // FK so the composite FK never blocks the session -> session_exercises
    // -> set_logs cascade (§8.5).
    foreignKey({
      columns: [table.sessionExerciseId, table.measurementProfile],
      foreignColumns: [sessionExercises.id, sessionExercises.measurementProfile],
      name: "fk_set_logs_parent_profile",
    }).onDelete("cascade"),
    // §8.3 — deliberately the only place `measurement_profile` membership is
    // enforced on this table (no separate enum CHECK, see the file comment):
    // an unknown value matches no branch below and is rejected.
    check(
      "ck_set_logs_profile_shape",
      sql`
        (${table.measurementProfile} = 'load_reps'     and ${table.weightKg} is not null and ${table.reps} is not null and ${table.distanceM} is null     and ${table.durationS} is null)
        or (${table.measurementProfile} = 'reps'          and ${table.weightKg} is null     and ${table.reps} is not null and ${table.distanceM} is null     and ${table.durationS} is null)
        or (${table.measurementProfile} = 'load_distance' and ${table.weightKg} is not null and ${table.reps} is null     and ${table.distanceM} is not null and ${table.rir} is null)
        or (${table.measurementProfile} = 'distance_time' and ${table.weightKg} is null     and ${table.reps} is null     and ${table.distanceM} is not null and ${table.durationS} is not null and ${table.rir} is null)
        or (${table.measurementProfile} = 'duration'      and ${table.weightKg} is null     and ${table.reps} is null     and ${table.distanceM} is null     and ${table.durationS} is not null and ${table.rir} is null)
        or (${table.measurementProfile} = 'load_duration' and ${table.weightKg} is not null and ${table.reps} is null     and ${table.distanceM} is null     and ${table.durationS} is not null and ${table.rir} is null)
      `,
    ),
  ],
);
