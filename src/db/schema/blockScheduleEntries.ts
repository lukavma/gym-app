import { index, pgTable, smallint, unique, uuid } from "drizzle-orm/pg-core";
import { blocks } from "./blocks";
import { workoutTemplates } from "./workoutTemplates";

// data-model.md §2.10. `template_id` is RESTRICT — a template referenced by
// a block's schedule cannot be archived or (if ever supported) deleted
// while scheduled. `weekdays` null means rotation mode (no fixed weekday);
// non-null holds ISO weekday ints 1-7.
//
// `uq_schedule_position` is a plain unique constraint here for the same
// reason as `exercise_prescriptions.uq_prescriptions_position` (see that
// file's comment) — `DEFERRABLE INITIALLY DEFERRED` is appended by hand to
// the generated migration SQL.
export const blockScheduleEntries = pgTable(
  "block_schedule_entries",
  {
    id: uuid("id").primaryKey(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
    weekdays: smallint("weekdays").array(),
  },
  (table) => [
    unique("uq_schedule_position").on(table.blockId, table.position),
    index("ix_block_schedule_entries_block_id").on(table.blockId),
    index("ix_block_schedule_entries_template_id").on(table.templateId),
  ],
);
