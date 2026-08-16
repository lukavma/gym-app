import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { programs } from "./programs";

// data-model.md §2.9. `volume_preset_id` is a plain nullable uuid with no
// FK constraint — `volume_presets` doesn't exist until Phase 6. See D-02 in
// docs/architecture/deviations.md for the full rationale; Phase 6 adds the
// `REFERENCES volume_presets(id) ON DELETE SET NULL` constraint via
// ALTER TABLE once that table exists. Nothing in Phase 2 reads or writes
// this column.
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sequence: smallint("sequence").notNull(),
    goal: text("goal").notNull().default("hypertrophy"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    weeksPlanned: smallint("weeks_planned").notNull(),
    status: text("status").notNull().default("planned"),
    volumePresetId: uuid("volume_preset_id"),
    deload: jsonb("deload"),
    plannedProgression: jsonb("planned_progression"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // domain-model.md §5 — at most one active block per program.
    uniqueIndex("uq_blocks_one_active")
      .on(table.programId)
      .where(sql`${table.status} = 'active'`),
    unique("uq_blocks_sequence").on(table.programId, table.sequence),
    index("ix_blocks_program_id").on(table.programId),
    check("ck_blocks_goal", sql`${table.goal} in ('hypertrophy', 'strength', 'general')`),
    check(
      "ck_blocks_status",
      sql`${table.status} in ('planned', 'active', 'completed', 'abandoned')`,
    ),
    check("ck_blocks_weeks_planned_range", sql`${table.weeksPlanned} between 1 and 16`),
  ],
);
