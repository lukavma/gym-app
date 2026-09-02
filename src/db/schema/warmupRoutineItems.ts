import { index, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { warmupRoutines } from "./warmupRoutines";

// Warm-up Routines v1 (evaluation §4.1, B-1). Pure text — `label` plus one
// optional `instruction` carrying the dose/cue ("2x15 light", "5 min easy").
// There is deliberately no `exercise_id`, not even nullable (X-4/M-8): an
// item that references nothing can never enter the volume or progression
// pipelines, which makes the boundary structural rather than policed.
//
// `uq_warmup_routine_item_position` is a PLAIN unique constraint, not the
// `DEFERRABLE INITIALLY DEFERRED` hand-patch that `exercise_prescriptions`
// and `block_schedule_entries` need. Those support in-place reorder swaps;
// items are only ever written by a full delete-and-reinsert of the whole
// list inside one transaction (`replaceWarmupRoutine`), so positions are
// never transiently duplicated and nothing has to be deferred.
export const warmupRoutineItems = pgTable(
  "warmup_routine_items",
  {
    id: uuid("id").primaryKey(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => warmupRoutines.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    label: text("label").notNull(),
    instruction: text("instruction"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_warmup_routine_item_position").on(table.routineId, table.position),
    index("ix_warmup_routine_items_routine_id").on(table.routineId),
  ],
);
