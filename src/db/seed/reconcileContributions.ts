import { and, eq, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppDb } from "@/db/client";
import { exerciseMuscleContributions, exercises, users } from "@/db/schema";
import type { LeafMuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import { EXERCISE_CATALOG } from "./exerciseCatalog";
import { seededExerciseId } from "./exercises";

// ADR-010 authoritative mapping — the 14 `back`-carrying slugs of the
// pre-Release-2 92-entry catalog and their exact leaf target. Binding: a row
// here may change only by amending ADR-010. Vertical pulls / shoulder-
// extension arcs -> `lats`; horizontal rows and hinge-family isometric
// mid-back involvement -> `upper_back`.
export const RECONCILED_BACK_SLUGS: Record<string, LeafMuscleGroupSlug> = {
  "cable-lat-pulldown": "lats",
  "bodyweight-pull-up": "lats",
  "bodyweight-chin-up": "lats",
  "machine-assisted-pull-up": "lats",
  "cable-straight-arm-pulldown": "lats",
  "barbell-row": "upper_back",
  "dumbbell-row": "upper_back",
  "cable-seated-row": "upper_back",
  "machine-seated-row": "upper_back",
  "barbell-pendlay-row": "upper_back",
  "machine-t-bar-row": "upper_back",
  "bodyweight-inverted-row": "upper_back",
  "barbell-deadlift": "upper_back",
  "other-trap-bar-deadlift": "upper_back",
};

export interface ReconciliationSummary {
  users: number;
  mapped: number;
  updated: number;
  noop: number;
  conflicts: number;
  customDirectBack: number;
  seededDirectBackUnmapped: number;
}

// GitHub Actions run-annotation syntax — surfaces as a warning on the
// workflow run regardless of log level (ADR-010 "Reporting is mandatory").
function githubWarning(message: string): void {
  console.log(`::warning::${message}`);
}

// Reverse lookup for a warning line's benefit only (never load-bearing for
// the reconciliation predicate itself): given a seeded exercise id that
// wasn't produced by one of the 14 mapped slugs, find which of the other 78
// catalog slugs it actually is, by recomputing the same deterministic hash
// the seed uses. O(catalog length) and only ever run for a row this
// function is already about to report, so cost is a non-issue at this
// scale (single-user app, sizing sanity check in data-model.md §6).
function findCatalogSlugForExerciseId(userId: string, exerciseId: string): string | undefined {
  return EXERCISE_CATALOG.find((item) => seededExerciseId(userId, item.slug) === exerciseId)?.slug;
}

interface ReconcileResult {
  summary: ReconciliationSummary;
  conflictWarnings: string[];
  unmappedWarnings: string[];
  customDirectBackLines: string[];
}

// `AppDb` unifies the node-postgres and PGlite drivers behind one generic
// result type, so an `UPDATE`'s awaited result isn't statically shaped —
// only their actual, differing result objects are: node-postgres exposes
// `rowCount` (`number | null`), PGlite exposes `affectedRows` (`number`)
// and leaves `rowCount` undefined. This is the minimal shape both satisfy.
interface PortableUpdateResult {
  rowCount?: number | null;
  affectedRows?: number;
}

// ADR-010 "Reconciliation mechanism" — state-predicated, idempotent, no
// ledger, no name matching, no pgcrypto, no SQL data migration. For every
// user x each of the 14 mapped slugs, re-point a seeded exercise's direct
// `back` contribution to its ADR-010 leaf target, only when the exercise
// exists (`is_seeded = true`), still carries `back`, and doesn't already
// carry the target leaf. Only `muscle_group_id` and `updated_at` change —
// role and weight are never touched, so this is a pure identity move.
//
// The mutating step is ADR-010's literal mechanism: the target-leaf
// `notExists(...)` guard is part of the `UPDATE`'s own `.where()`, built
// via Drizzle's query builder (`alias()` for the self-referencing subquery)
// rather than raw SQL — same generated statement shape, evaluated against
// one statement-level snapshot by Postgres, so it cannot raise a
// primary-key violation even if a concurrent transaction commits a row on
// the target leaf between this loop's preliminary classification `SELECT`s
// and the `UPDATE` itself (release-2-review.md §3, Probe A/B — a classify-
// then-act version without this guard was proven to raise SQLSTATE 23505
// and abort the whole reconciliation transaction under exactly that
// interleaving; ADR-010's literal statement was proven immune under the
// identical forced interleave). `updated` is incremented only from the
// UPDATE's actual affected-row count — never unconditionally — so a save
// that races the guard into a no-op is correctly classified as a
// (sticky, re-reported) conflict instead of a phantom "success" that
// leaves a direct `back` row uncounted (release-2-review.md M-2). Portable
// affected-row read: node-postgres exposes `rowCount`, PGlite exposes
// `affectedRows` and leaves `rowCount` undefined.
//
// The whole run — every user x slug decision, plus both reporting-only
// queries below — still executes inside one transaction: under READ
// COMMITTED this does not make the returned counts a snapshot of a single
// instant (each statement takes its own fresh snapshot), but it does keep
// a rolled-back run from ever printing a partial summary, and — now that
// the mutating statement itself cannot fail on this interleaving — a
// single pair's raced outcome can no longer abort every other user's
// reconciliation in the same run.
async function reconcile(db: AppDb): Promise<ReconcileResult> {
  const mappedEntries = Object.entries(RECONCILED_BACK_SLUGS);
  // Self-referencing subquery target for the atomic conditional UPDATE's
  // `notExists(...)` guard below — a plain second reference to the same
  // table needs its own alias inside a statement that also updates it.
  const targetProbe = alias(exerciseMuscleContributions, "target_probe");

  return db.transaction(async (tx) => {
    const allUsers = await tx.select({ id: users.id }).from(users);

    let updated = 0;
    let noop = 0;
    let conflicts = 0;
    const conflictWarnings: string[] = [];
    const mappedExerciseIds = new Set<string>();

    for (const user of allUsers) {
      for (const [slug, target] of mappedEntries) {
        const exerciseId = seededExerciseId(user.id, slug);
        mappedExerciseIds.add(exerciseId);

        const [exerciseRow] = await tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(
            and(
              eq(exercises.id, exerciseId),
              eq(exercises.userId, user.id),
              eq(exercises.isSeeded, true),
            ),
          );
        // noop: seeded row missing (removed, hard-deleted, never applied, or
        // name-collided at seed time).
        if (!exerciseRow) {
          noop++;
          continue;
        }

        const [backRow] = await tx
          .select({ muscleGroupId: exerciseMuscleContributions.muscleGroupId })
          .from(exerciseMuscleContributions)
          .where(
            and(
              eq(exerciseMuscleContributions.exerciseId, exerciseId),
              eq(exerciseMuscleContributions.muscleGroupId, "back"),
            ),
          );
        // noop: already reconciled (a prior run, or this run for a
        // different mapped slug that happens to share this exercise —
        // impossible today since each mapped slug is a distinct exercise,
        // but the check is what makes this correct regardless) — or the
        // user removed the contribution.
        if (!backRow) {
          noop++;
          continue;
        }

        const [targetRow] = await tx
          .select({ muscleGroupId: exerciseMuscleContributions.muscleGroupId })
          .from(exerciseMuscleContributions)
          .where(
            and(
              eq(exerciseMuscleContributions.exerciseId, exerciseId),
              eq(exerciseMuscleContributions.muscleGroupId, target),
            ),
          );
        // Conflict (defensive): reachable through a deliberate Release-1
        // editor update that carries the legacy `back` row through while
        // adding the target leaf as a sibling contribution in the same
        // save (architecture-review M-1) — not through the reconciliation
        // itself or through creation. The `back` row is left exactly in
        // place (it displays as Unclassified Back); nothing is merged,
        // dropped, or double-written. The predicate is never consumed, so
        // this is sticky: every later run re-detects the same state and
        // re-emits the same warning until the user resolves it by hand in
        // the editor.
        if (targetRow) {
          conflicts++;
          conflictWarnings.push(
            `taxonomy-v2 reconciliation conflict: user=${user.id} slug=${slug} exercise=${exerciseId} target=${target}`,
          );
          continue;
        }

        const moveResult = (await tx
          .update(exerciseMuscleContributions)
          .set({ muscleGroupId: target, updatedAt: new Date() })
          .where(
            and(
              eq(exerciseMuscleContributions.exerciseId, exerciseId),
              eq(exerciseMuscleContributions.muscleGroupId, "back"),
              notExists(
                tx
                  .select({ exerciseId: targetProbe.exerciseId })
                  .from(targetProbe)
                  .where(
                    and(
                      eq(targetProbe.exerciseId, exerciseId),
                      eq(targetProbe.muscleGroupId, target),
                    ),
                  ),
              ),
            ),
          )) as PortableUpdateResult;
        const moved = moveResult.rowCount ?? moveResult.affectedRows ?? 0;
        if (moved === 1) {
          updated++;
        } else {
          // The preliminary target-row check above passed (target absent at
          // that read), but this statement's own `notExists` guard found
          // otherwise by the time it ran — a target-leaf row committed
          // concurrently, or the `back` row itself was concurrently
          // replaced by the same edit. Either way zero rows moved, no error
          // was raised, and the state left behind is the same honest
          // conflict shape a synchronously-detected one leaves: report it
          // identically. Sticky — the next run's classification `SELECT`s
          // will see it and re-report it.
          conflicts++;
          conflictWarnings.push(
            `taxonomy-v2 reconciliation conflict: user=${user.id} slug=${slug} exercise=${exerciseId} target=${target}`,
          );
        }
      }
    }

    // Architecture-review M-2: the loop above only ever looks at the 14
    // mapped slugs, so a direct `back` row hand-added (pre-Release-1) to
    // some OTHER seeded exercise is invisible to every counter above and
    // silently falsifies "no `back` row on a seeded exercise". Find it
    // explicitly. `mappedExerciseIds` excludes every id the loop already
    // classified, so a mapped conflict is never double-counted here.
    const seededBackRows = await tx
      .select({ exerciseId: exercises.id, userId: exercises.userId })
      .from(exerciseMuscleContributions)
      .innerJoin(exercises, eq(exercises.id, exerciseMuscleContributions.exerciseId))
      .where(
        and(eq(exerciseMuscleContributions.muscleGroupId, "back"), eq(exercises.isSeeded, true)),
      );

    let seededDirectBackUnmapped = 0;
    const unmappedWarnings: string[] = [];
    for (const row of seededBackRows) {
      if (mappedExerciseIds.has(row.exerciseId)) continue;
      seededDirectBackUnmapped++;
      const slug = findCatalogSlugForExerciseId(row.userId, row.exerciseId);
      unmappedWarnings.push(
        `taxonomy-v2 reconciliation: seeded exercise outside the mapped 14 still holds a direct back contribution — user=${row.userId} slug=${slug ?? "unknown"} exercise=${row.exerciseId}`,
      );
    }

    // `customDirectBack` — user-created (is_seeded = false) exercises still
    // holding a direct `back` row. Informational only: the owner's
    // reclassification backlog, never auto-remapped (ADR-010 explicitly
    // rejects inferring a leaf on the user's behalf).
    const customBackRows = await tx
      .select({ exerciseId: exercises.id, userId: exercises.userId })
      .from(exerciseMuscleContributions)
      .innerJoin(exercises, eq(exercises.id, exerciseMuscleContributions.exerciseId))
      .where(
        and(eq(exerciseMuscleContributions.muscleGroupId, "back"), eq(exercises.isSeeded, false)),
      );

    const customDirectBackLines = customBackRows.map(
      (row) =>
        `taxonomy-v2 reconciliation: customDirectBack exercise user=${row.userId} exercise=${row.exerciseId}`,
    );

    return {
      summary: {
        users: allUsers.length,
        mapped: mappedEntries.length,
        updated,
        noop,
        conflicts,
        customDirectBack: customBackRows.length,
        seededDirectBackUnmapped,
      },
      conflictWarnings,
      unmappedWarnings,
      customDirectBackLines,
    };
  });
}

// Entry point wired into `runSeed` (`seedMuscleGroups -> reconcileContributions
// -> seedExerciseCatalogForAllUsers`). Prints deployment-output reporting
// only after the transaction has committed, so a rolled-back run never
// prints a misleading partial summary.
export async function reconcileContributions(db: AppDb): Promise<ReconciliationSummary> {
  const { summary, conflictWarnings, unmappedWarnings, customDirectBackLines } =
    await reconcile(db);

  console.log(
    `taxonomy-v2 reconciliation: users=${summary.users} mapped=${summary.mapped} updated=${summary.updated} noop=${summary.noop} conflicts=${summary.conflicts} customDirectBack=${summary.customDirectBack}`,
  );
  console.log(
    `taxonomy-v2 reconciliation: seededDirectBackUnmapped=${summary.seededDirectBackUnmapped}`,
  );
  for (const line of conflictWarnings) githubWarning(line);
  for (const line of unmappedWarnings) githubWarning(line);
  for (const line of customDirectBackLines) console.log(line);

  return summary;
}
