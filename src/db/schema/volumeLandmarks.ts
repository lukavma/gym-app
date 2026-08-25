import { boolean, check, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { volumePresets } from "./volumePresets";
import { muscleGroups } from "./muscleGroups";

// data-model.md §2.17. No `created_at`/`updated_at` — the table's own spec
// row lists none, the same documented exception already established for
// `block_schedule_entries` (data-model.md §2.10) and
// `exercise_muscle_contributions` (only `updated_at`, §2.5): the §1 global
// timestamp convention yields to the specific table's own column list,
// which is column-level authority (implementation-plan.md §0).
//
// `muscle_group_id` may reference a rollup row (`back`) — RP's "Back"
// landmark attaches to the rollup only, never duplicated onto its member
// leaves (volume-model.md §4). That's a seed/UI rule, not a constraint:
// nothing here restricts which `kind` a landmark may target.
export const volumeLandmarks = pgTable(
  "volume_landmarks",
  {
    id: uuid("id").primaryKey(),
    presetId: uuid("preset_id")
      .notNull()
      .references(() => volumePresets.id, { onDelete: "cascade" }),
    muscleGroupId: text("muscle_group_id")
      .notNull()
      .references(() => muscleGroups.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    valueMin: numeric("value_min", { precision: 5, scale: 1, mode: "number" }),
    valueMax: numeric("value_max", { precision: 5, scale: 1, mode: "number" }),
    openEnded: boolean("open_ended").notNull().default(false),
    note: text("note"),
  },
  (table) => [
    unique("uq_landmark").on(table.presetId, table.muscleGroupId, table.key),
    check("ck_volume_landmarks_value_min_nonneg", sql`${table.valueMin} >= 0`),
    check(
      "ck_volume_landmarks_value_max_gte_min",
      sql`${table.valueMax} is null or ${table.valueMin} is null or ${table.valueMax} >= ${table.valueMin}`,
    ),
    check(
      "ck_volume_landmarks_value_present",
      sql`${table.valueMin} is not null or ${table.valueMax} is not null`,
    ),
  ],
);
