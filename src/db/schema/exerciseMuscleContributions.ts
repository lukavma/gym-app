import { check, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { CONTRIBUTION_ROLES } from "@/domain/exercises/schema";
import { exercises } from "./exercises";
import { muscleGroups } from "./muscleGroups";

// See the identical helper in `exercises.ts` for why `sql.raw` is required
// here instead of `sql\`${v}\`` (which binds a parameter, invalid in a
// CHECK constraint definition).
function checkInList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

// data-model.md §2.5. CASCADE on the exercise FK is safe because exercises
// with history are archive-only (RESTRICT FKs from history tables enforce
// that) — an exercise with no history can be hard-deleted, which is the
// only path that reaches this cascade.
export const exerciseMuscleContributions = pgTable(
  "exercise_muscle_contributions",
  {
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    muscleGroupId: text("muscle_group_id")
      .notNull()
      .references(() => muscleGroups.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    weight: numeric("weight", { precision: 3, scale: 2, mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.muscleGroupId] }),
    check("ck_emc_role", sql`${table.role} in (${checkInList(CONTRIBUTION_ROLES)})`),
    check("ck_emc_weight_range", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
  ],
);
