import {
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { blocks } from "./blocks";

// data-model.md §2.11. A manual per-week override — either a manual deload
// (`type: 'deload'`) or a non-deload modified week (`type: 'custom'`).
// Unlike `blocks.deload` (locked to `status === 'planned'`), overrides can be
// inserted "at any time" (domain-model.md §5) — no status gate here.
export const blockWeekOverrides = pgTable(
  "block_week_overrides",
  {
    id: uuid("id").primaryKey(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    weekIndex: smallint("week_index").notNull(),
    type: text("type").notNull(),
    modifiers: jsonb("modifiers").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_week_override").on(table.blockId, table.weekIndex),
    index("ix_block_week_overrides_block_id").on(table.blockId),
    check("ck_block_week_overrides_week_index", sql`${table.weekIndex} >= 1`),
    check("ck_block_week_overrides_type", sql`${table.type} in ('deload', 'custom')`),
  ],
);
