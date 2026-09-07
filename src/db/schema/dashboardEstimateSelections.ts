import {
  check,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { exercises } from "./exercises";

// Metrics dashboard v1 (docs/reviews/metrics-dashboard-architecture-evaluation.md
// §11.5) — the feature's one write path. Dashboard *configuration* (which of
// the athlete's estimated-1RM-tracker-compatible exercises the Current
// estimates card shows, and in what order), never a fact, snapshot, or
// derived value: no column
// here stores an estimate, a name, or an eligibility flag (I-2, I-13) — those
// are read live through `exercises` and `deriveStrengthReport` on every
// request. No `id` column: `(user_id, exercise_id)` is the identity, exactly
// like `exercise_muscle_contributions`.
//
// `ck_dashboard_estimate_selections_position` plus
// `uq_dashboard_estimate_selections_position` make more than five rows per
// user impossible at the database level, independent of any service rule
// (§11.5, R-8). No deferrable constraint: the write contract replaces the
// whole list inside one transaction (delete, then insert), so no swap ever
// violates uniqueness mid-transaction.
export const dashboardEstimateSelections = pgTable(
  "dashboard_estimate_selections",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Presentation config, so hard-deleting an exercise (allowed only when it
    // has no history) removes its row; the remaining rows keep their
    // positions and render in order (gaps are fine on read).
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.exerciseId] }),
    uniqueIndex("uq_dashboard_estimate_selections_position").on(table.userId, table.position),
    check("ck_dashboard_estimate_selections_position", sql`${table.position} between 1 and 5`),
  ],
);
