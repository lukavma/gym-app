import { index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { programs } from "./programs";

// data-model.md §2.7. No unique constraint on `position` — unlike
// prescriptions/schedule entries, template reordering has no sibling
// uniqueness invariant to protect, so a plain sequential update loop
// suffices (no deferred-constraint machinery needed).
export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: uuid("id").primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: smallint("position").notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Allows re-using a name after archiving, same pattern as exercises.
    uniqueIndex("uq_templates_active_name")
      .on(table.programId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    index("ix_workout_templates_program_id").on(table.programId),
  ],
);
