import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { EQUIPMENT_TYPES, LATERALITY_TYPES, MECHANICS_TYPES } from "@/domain/exercises/schema";
import { STRENGTH_ESTIMATE_MODES } from "@/domain/strength/estimateMode";
import { users } from "./users";

// `sql\`${v}\`` binds a parameter placeholder ($1, $2, ...) rather than
// inlining the literal, which is invalid inside a CHECK constraint
// definition — `sql.raw` embeds the literal text directly. Safe here since
// `values` are our own hardcoded const arrays, never user input.
function checkInList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

// data-model.md §2.4. `id` has no `.defaultRandom()` — new rows get a
// server-generated UUIDv7 (`newId()` from `@/domain/ids/uuidv7`) applied
// before insert, not Postgres's UUIDv4 `gen_random_uuid()` (see the note on
// `users.id`, the one legacy exception to this convention).
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    equipment: text("equipment").notNull(),
    movementPattern: text("movement_pattern"),
    mechanics: text("mechanics").notNull(),
    laterality: text("laterality").notNull().default("bilateral"),
    loadStepKg: numeric("load_step_kg", { precision: 4, scale: 2, mode: "number" }).notNull(),
    // ADR-011 / estimated-1RM revision §14.4 (owner decision O-2) — planning-
    // world metadata, mutable, never snapshotted into a PrescriptionSnapshot.
    // `'auto'` means "estimate if the equipment category allows"; `'off'`
    // suppresses the estimate entirely. An enum rather than a boolean leaves
    // room for the deferred D-3 / D-11 values without a second migration.
    strengthEstimate: text("strength_estimate").notNull().default("auto"),
    isSeeded: boolean("is_seeded").notNull().default(false),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Allows re-using a name after archiving (data-model.md §2.4).
    uniqueIndex("uq_exercises_active_name")
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    index("ix_exercises_user_id").on(table.userId),
    check("ck_exercises_equipment", sql`${table.equipment} in (${checkInList(EQUIPMENT_TYPES)})`),
    check("ck_exercises_mechanics", sql`${table.mechanics} in (${checkInList(MECHANICS_TYPES)})`),
    check(
      "ck_exercises_laterality",
      sql`${table.laterality} in (${checkInList(LATERALITY_TYPES)})`,
    ),
    check("ck_exercises_load_step_kg_positive", sql`${table.loadStepKg} > 0`),
    check(
      "ck_exercises_strength_estimate",
      sql`${table.strengthEstimate} in (${checkInList(STRENGTH_ESTIMATE_MODES)})`,
    ),
  ],
);
