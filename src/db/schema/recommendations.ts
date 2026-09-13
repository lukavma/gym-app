import {
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { exercises } from "./exercises";
import { blocks } from "./blocks";
import { workoutSessions } from "./workoutSessions";
import { sessionExercises } from "./sessionExercises";

// data-model.md §2.15. `id` is client-generatable (UUIDv7) — offline
// completions compute recommendations locally and sync them up
// (`computed_by = 'client'`), so like the session tables there is no
// server-side id assignment to rely on.
//
// Decision columns are embedded, not a separate table: strictly 0..1
// decision per recommendation, appended once (domain-model.md §7) — a second
// table would be joins without integrity gain.
//
// `exercise_id` is RESTRICT: recommendations are history, and exercises with
// history are archive-only (domain-model.md §10 invariant 4).
// `block_id` is SET NULL lineage (ADR-007) — a recommendation stays fully
// interpretable from its frozen config/inputs/reason codes alone.
export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    blockId: uuid("block_id").references(() => blocks.id, { onDelete: "set null" }),
    sourceSessionId: uuid("source_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    sourceSessionExerciseId: uuid("source_session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    // set-groups-architecture-evaluation.md §5.3/D-1 — the group this
    // recommendation belongs to; NULL for an ungrouped slot. Independent
    // per-group progression (D-2) needs one pending record PER (exercise,
    // block, key), not per (exercise, block) — see `uq_recs_one_pending`
    // below.
    groupKey: text("group_key"),
    strategyId: text("strategy_id").notNull(),
    strategyVersion: smallint("strategy_version").notNull(),
    classification: text("classification").notNull(),
    config: jsonb("config").notNull(),
    inputs: jsonb("inputs").notNull(),
    action: text("action").notNull(),
    target: jsonb("target"),
    reasonCodes: text("reason_codes").array().notNull(),
    confidence: text("confidence").notNull(),
    computedBy: text("computed_by").notNull(),
    decisionStatus: text("decision_status").notNull().default("pending"),
    decisionChosen: jsonb("decision_chosen"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionSource: text("decision_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // domain-model.md §10 invariant 8 / progression-engine.md §5 — at most
    // one pending recommendation per (exercise, block, group key);
    // block-less recommendations share one slot via the zero-uuid coalesce
    // (data-model.md §2.15), and key-less (ungrouped) recommendations share
    // one slot via the empty-string coalesce, same idiom — rebuilt for Set
    // Groups Stage A (set-groups-architecture-evaluation.md §5.3/A-12) so
    // independent per-group progression (D-2) can hold one pending record
    // per group without colliding. Supersede-before-insert (now key-scoped,
    // `supersedePending`) makes this hold.
    uniqueIndex("uq_recs_one_pending")
      .on(
        table.exerciseId,
        sql`coalesce(${table.blockId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`coalesce(${table.groupKey}, '')`,
      )
      .where(sql`${table.decisionStatus} = 'pending'`),
    index("ix_recs_exercise").on(table.exerciseId, table.createdAt.desc()),
    index("ix_recs_pending")
      .on(table.userId)
      .where(sql`${table.decisionStatus} = 'pending'`),
    check(
      "ck_recommendations_classification",
      sql`${table.classification} in ('evidence_supported', 'heuristic', 'user_defined')`,
    ),
    check(
      "ck_recommendations_action",
      sql`${table.action} in ('increase_load', 'decrease_load', 'hold', 'increase_reps', 'none')`,
    ),
    check("ck_recommendations_confidence", sql`${table.confidence} in ('low', 'medium', 'high')`),
    check("ck_recommendations_computed_by", sql`${table.computedBy} in ('server', 'client')`),
    check(
      "ck_recommendations_decision_status",
      sql`${table.decisionStatus} in ('pending', 'accepted', 'modified', 'rejected', 'superseded')`,
    ),
    check(
      "ck_recommendations_decision_source",
      sql`${table.decisionSource} in ('explicit', 'implicit_first_set')`,
    ),
  ],
);
