import { check, pgTable, smallint, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { MUSCLE_GROUP_KINDS } from "@/domain/exercises/muscleGroups";

// See the identical helper in `exercises.ts` / `exerciseMuscleContributions.ts`
// for why `sql.raw` is required here instead of `sql\`${v}\`` (which binds a
// parameter, invalid in a CHECK constraint definition).
function checkInList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

// data-model.md §2.3 — seeded reference data, text slug PK (domain-model §2).
// `kind` (ADR-010, vocabulary v2): `'rollup'` only for `back`; rollup
// membership is the domain constant ROLLUP_MEMBERS, deliberately not a table
// or `parent_id`.
export const muscleGroups = pgTable(
  "muscle_groups",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    position: smallint("position").notNull(),
    kind: text("kind").notNull().default("muscle"),
  },
  (table) => [
    check("ck_muscle_groups_kind", sql`${table.kind} in (${checkInList(MUSCLE_GROUP_KINDS)})`),
  ],
);
