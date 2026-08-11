import { pgTable, smallint, text } from "drizzle-orm/pg-core";

// data-model.md §2.3 — seeded reference data, text slug PK (domain-model §2).
export const muscleGroups = pgTable("muscle_groups", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  position: smallint("position").notNull(),
});
