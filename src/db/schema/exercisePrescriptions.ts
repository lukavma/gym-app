import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workoutTemplates } from "./workoutTemplates";
import { exercises } from "./exercises";

// data-model.md §2.8. `exercise_id` is RESTRICT (never CASCADE) — an
// exercise referenced by a prescription cannot be hard-deleted, only
// archived (domain-model.md §10 invariant 4).
//
// `uq_prescriptions_position` is declared here as a plain unique
// constraint; drizzle-kit's pg-core `unique()` builder has no `.deferrable()`
// API (checked against drizzle-orm 0.44.2's typings), so
// `DEFERRABLE INITIALLY DEFERRED` is appended by hand to the generated
// migration SQL after `pnpm db:generate` (see the migration file itself).
// This is safe against future `db:generate` drift because drizzle-kit
// diffs its own TS-schema snapshot (drizzle/meta/*.json), not live SQL —
// the TS declaration below is the full, accurate source of truth for that
// snapshot even though it doesn't spell "deferrable". A reorder swap needs
// no explicit `SET CONSTRAINTS ... DEFERRED`; Postgres defers validation of
// a `DEFERRABLE INITIALLY DEFERRED` constraint to COMMIT automatically.
export const exercisePrescriptions = pgTable(
  "exercise_prescriptions",
  {
    id: uuid("id").primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
    scheme: jsonb("scheme").notNull(),
    targetRir: jsonb("target_rir"),
    baselineLoadKg: numeric("baseline_load_kg", { precision: 6, scale: 2, mode: "number" }),
    restSeconds: smallint("rest_seconds"),
    progression: jsonb("progression").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_prescriptions_position").on(table.templateId, table.position),
    index("ix_exercise_prescriptions_template_id").on(table.templateId),
    index("ix_exercise_prescriptions_exercise_id").on(table.exerciseId),
    check("ck_exercise_prescriptions_baseline_load_kg_nonneg", sql`${table.baselineLoadKg} >= 0`),
    check("ck_exercise_prescriptions_rest_seconds_positive", sql`${table.restSeconds} > 0`),
  ],
);
