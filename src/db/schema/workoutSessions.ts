import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { blocks } from "./blocks";
import { workoutTemplates } from "./workoutTemplates";

// data-model.md §2.12. `id` is client-generated UUIDv7 (`newId()` from
// `@/domain/ids/uuidv7`) — sessions can be created offline, so unlike most
// other tables there is no server-side id assignment to rely on.
//
// `block_id`/`template_id` are `ON DELETE SET NULL` and lineage-only:
// per ADR-007, interpreting a completed session never depends on these FKs
// still resolving — `template_name`/`week_index`/`is_deload` and each
// session_exercise's `prescription` snapshot carry the full meaning.
//
// `is_deload` is frozen at session start from the block's resolved
// DeloadConfig/WeekOverride for the current week (implementation-plan.md
// Phase 5 — src/domain/scheduling/effectiveModifiers.ts). It gates
// progression evaluation and carry-forward (progression-engine.md §5/§8).
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    blockId: uuid("block_id").references(() => blocks.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => workoutTemplates.id, {
      onDelete: "set null",
    }),
    templateName: text("template_name"),
    weekIndex: smallint("week_index"),
    isDeload: boolean("is_deload").notNull().default(false),
    status: text("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    clientId: text("client_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // pwa-offline-strategy.md — at most one in-progress session per user;
    // this is the DB-level backstop behind the sync layer's takeover flow.
    uniqueIndex("uq_sessions_one_in_progress")
      .on(table.userId)
      .where(sql`${table.status} = 'in_progress'`),
    index("ix_sessions_user_started").on(table.userId, table.startedAt.desc()),
    index("ix_sessions_block").on(table.blockId, table.startedAt),
    check("ck_sessions_status", sql`${table.status} in ('in_progress', 'completed', 'discarded')`),
  ],
);
