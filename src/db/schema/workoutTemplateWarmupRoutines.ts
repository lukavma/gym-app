import {
  boolean,
  index,
  pgTable,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { warmupRoutines } from "./warmupRoutines";
import { workoutTemplates } from "./workoutTemplates";

// Warm-up Routines v1, owner decision O-1/O-2 (the dated addendum at the top
// of docs/reviews/warmup-routines-architecture-evaluation.md, which
// supersedes §4.2's single-FK recommendation): a curated many-to-many link
// between workout templates and reusable warm-up routines. A template may
// link zero, one, or many routines; at most one link may be the default; and
// the in-workout switcher offers ONLY the routines linked here — never the
// user's whole library.
//
// There is deliberately no `workout_templates.warmup_routine_id` column: the
// default is an attribute of a link, so "the default must be one of the
// linked routines" is a database fact, not a service-level convention.
//
// Cascades: a template dies with its program, and every link dies with the
// template; deleting a routine (hard delete, no archive) removes its links
// from every template. Neither direction can leave a dangling reference, and
// no execution row anywhere references either side.
//
// Both position and default uniqueness are plain/partial-plain (not
// DEFERRABLE): associations are only ever written by a full
// delete-and-reinsert of the template's entire link set inside one
// transaction (`setTemplateWarmupRoutines`), so no intermediate state ever
// duplicates a position or a default.
export const workoutTemplateWarmupRoutines = pgTable(
  "workout_template_warmup_routines",
  {
    id: uuid("id").primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => warmupRoutines.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A routine may be linked to a template at most once...
    unique("uq_template_warmup_routine").on(table.templateId, table.routineId),
    // ...and the link order is deterministic, never "whatever came back".
    unique("uq_template_warmup_routine_position").on(table.templateId, table.position),
    // At most one default per template, enforced by the database rather than
    // by service code (O-1: "a database-enforced maximum of one default
    // association per workout template").
    uniqueIndex("uq_template_warmup_routine_default")
      .on(table.templateId)
      .where(sql`${table.isDefault}`),
    index("ix_workout_template_warmup_routines_template_id").on(table.templateId),
    index("ix_workout_template_warmup_routines_routine_id").on(table.routineId),
  ],
);
