import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { VOLUME_PRESET_CLASSIFICATIONS } from "@/domain/volume/schema";
import { users } from "./users";

// See the identical helper in exercises.ts / muscleGroups.ts for why
// `sql.raw` is required here instead of `sql\`${v}\`` (which binds a
// parameter, invalid in a CHECK constraint definition).
function checkInList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

// data-model.md §2.16. `user_id` null means the builtin seed (RP General) —
// `users` also carries an FK back to this table (`default_volume_preset_id`,
// see users.ts), a deliberate two-way reference resolved the same way
// Drizzle resolves any cross-table FK pair: both `.references()` callbacks
// are lazy thunks, only invoked after both modules have finished loading.
export const volumePresets = pgTable(
  "volume_presets",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    classification: text("classification").notNull(),
    sourceRef: text("source_ref"),
    evidenceRefs: text("evidence_refs").array(),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_volume_presets_user_id").on(table.userId),
    check(
      "ck_volume_presets_classification",
      sql`${table.classification} in (${checkInList(VOLUME_PRESET_CLASSIFICATIONS)})`,
    ),
  ],
);
