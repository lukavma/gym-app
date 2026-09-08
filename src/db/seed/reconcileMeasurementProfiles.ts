import { and, eq, exists, notExists } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { exercisePrescriptions, exercises, sessionExercises, users } from "@/db/schema";
import { seededExerciseId } from "./exercises";

// athletic-measurement-profiles-architecture-evaluation.md §14.3 (owner
// decision O-5) — the Release-2-only, one-shot reconcile that carries the
// three legacy seeded catalog entries whose measurement shape or load basis
// was decided AFTER they were first seeded to their Release-2 shape, for
// rows seeded before `src/db/seed/exerciseCatalog.ts` carried the matching
// explicit values (§14.4). Same pattern as
// `src/db/seed/reconcileStrengthEstimates.ts` (ADR-011 / ADR-010's
// reconciliation mechanism): deterministic, id-keyed through
// `seededExerciseId(userId, slug)`, and STATE-PREDICATED so every later run
// (including the one this same deploy's `runSeed` just performed) touches
// zero rows.
//
// Release 1 ships none of this (§14.1): a profile conversion there would
// produce a seeded exercise no Release-1 client can log, and the deploy
// order (`db:seed` before the app swap) would run it while the Release-1
// build still serves. It ships with Release 2, which ships the logging UI,
// and its brief deploy-window exposure (a still-serving Release-1 client
// touching a freshly-reconciled row) is disclosed, not mitigated — the
// composite FK from Release 1 already guarantees no mis-frozen slot can
// result (§14.3).
//
// Six predicates, verbatim from §14.3's table (the original four plus L-5 /
// L-6, added 2026-09-08):
//
//   machine-assisted-pull-up            -> load_basis = 'assistance'
//     when is_seeded AND load_basis = 'unspecified'
//     (allowed WITH history — a gate, not a lock; only its rendered Strength
//     refusal code changes, §11.6, A-15)
//
//   dumbbell-farmers-carry (unreferenced) -> measurement_profile =
//   'load_distance', load_basis = 'per_hand', volume_counting = 'off'
//     when is_seeded AND measurement_profile = 'load_reps'
//       AND NOT EXISTS session_exercises AND NOT EXISTS exercise_prescriptions
//     (both absent — a row referenced by ONLY an exercise_prescriptions row,
//     no session_exercises, matches NEITHER this predicate NOR the referenced
//     one below and is therefore untouched: X-16 forbids converting a
//     profile with ANY history, and a template reference is history.
//     `volume_counting` is set to 'off' alongside the profile/basis fields —
//     L-6 (Release-2 review) — so a reconciled row ends in byte-identical
//     state to a fresh seed of the same catalog entry, which already sets
//     `volumeCounting: "off"` explicitly, §14.3/L-6)
//
//   dumbbell-farmers-carry (referenced)  -> volume_counting = 'off'
//     when is_seeded AND measurement_profile = 'load_reps'
//       AND volume_counting = 'auto' AND EXISTS session_exercises
//     (current-convention, H-3 — allowed with history; the profile itself is
//     NEVER touched once referenced, only its hypertrophy-volume counting)
//
//   bodyweight-plank (unreferenced)      -> measurement_profile = 'duration'
//     same unreferenced predicate as the carry
//
//   bodyweight-plank (referenced)        -> volume_counting = 'off'
//     when is_seeded AND measurement_profile = 'load_reps'
//       AND volume_counting = 'auto' AND EXISTS session_exercises
//     (L-5, Release-2 review — the same "fabricated reps keep counting
//     toward volume" rationale §11.4 already applies to the referenced
//     carry above; mirrors that branch's exact predicate shape for plank's
//     slug. Mutually exclusive with the unreferenced branch above by the
//     same EXISTS/NOT EXISTS construction as the farmers-carry pair: both
//     require the still-untouched `measurement_profile = 'load_reps'`, one
//     requires NOT EXISTS session_exercises, the other EXISTS, so at most
//     one can ever fire for a given plank row in a given run. The profile
//     itself is never touched once referenced, only volume_counting)
//
// No historical row is ever reinterpreted: every predicate above either
// requires the row still be unreferenced, or (the "allowed with history"
// cases) changes only a field that is a gate/switch, never the profile
// itself.
export const MEASUREMENT_PROFILE_RECONCILE_SLUGS = {
  assistedPullUp: "machine-assisted-pull-up",
  farmersCarry: "dumbbell-farmers-carry",
  plank: "bodyweight-plank",
} as const;

export interface MeasurementProfileReconciliationSummary {
  users: number;
  // Rows this run actually changed. Zero on every run after the first, and
  // zero for a database seeded after `exerciseCatalog.ts` carried these three
  // entries' explicit values (A-17: a no-op on a clean database).
  updated: number;
  // Predicate checks (6 per user) that matched nothing — the steady state.
  noop: number;
}

// node-postgres exposes `rowCount` (`number | null`); PGlite exposes
// `affectedRows` and leaves `rowCount` undefined. Same portability shim as
// `reconcileStrengthEstimates.ts` / `reconcileContributions.ts`.
type PortableUpdateResult = { rowCount?: number | null; affectedRows?: number };

function rowsAffected(result: PortableUpdateResult): number {
  return result.rowCount ?? result.affectedRows ?? 0;
}

// The whole run is one transaction (the `reconcileContributions.ts`
// precedent): under READ COMMITTED this does not make the returned counts a
// snapshot of a single instant, but it does keep a rolled-back run from ever
// reporting a partial summary — no predicate here re-reads a value it wrote
// earlier in the same run, so no ordering within the transaction is
// load-bearing beyond "the unreferenced and referenced checks for a given
// exercise are mutually exclusive by construction" (one requires `NOT
// EXISTS session_exercises`, the other `EXISTS session_exercises`; both also
// require the still-untouched `measurement_profile = 'load_reps'`, so at
// most one of the two can ever fire for a given exercise in a given run) —
// true for both the farmers-carry pair and the plank pair.
export async function reconcileMeasurementProfiles(
  db: AppDb,
): Promise<MeasurementProfileReconciliationSummary> {
  return db.transaction(async (tx) => {
    const allUsers = await tx.select({ id: users.id }).from(users);
    let updated = 0;
    let noop = 0;

    for (const user of allUsers) {
      // machine-assisted-pull-up -> load_basis = 'assistance'.
      {
        const exerciseId = seededExerciseId(
          user.id,
          MEASUREMENT_PROFILE_RECONCILE_SLUGS.assistedPullUp,
        );
        const result = (await tx
          .update(exercises)
          .set({ loadBasis: "assistance", updatedAt: new Date() })
          .where(
            and(
              eq(exercises.id, exerciseId),
              eq(exercises.userId, user.id),
              eq(exercises.isSeeded, true),
              eq(exercises.loadBasis, "unspecified"),
            ),
          )) as PortableUpdateResult;
        const rows = rowsAffected(result);
        if (rows > 0) updated += rows;
        else noop += 1;
      }

      const farmersCarryId = seededExerciseId(
        user.id,
        MEASUREMENT_PROFILE_RECONCILE_SLUGS.farmersCarry,
      );

      // dumbbell-farmers-carry, UNREFERENCED -> load_distance / per_hand,
      // volume_counting = 'off' (L-6 — matches a fresh seed of this entry
      // exactly, which already sets volumeCounting: "off").
      {
        const result = (await tx
          .update(exercises)
          .set({
            measurementProfile: "load_distance",
            loadBasis: "per_hand",
            volumeCounting: "off",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(exercises.id, farmersCarryId),
              eq(exercises.userId, user.id),
              eq(exercises.isSeeded, true),
              eq(exercises.measurementProfile, "load_reps"),
              notExists(
                tx
                  .select({ id: sessionExercises.id })
                  .from(sessionExercises)
                  .where(eq(sessionExercises.exerciseId, farmersCarryId)),
              ),
              notExists(
                tx
                  .select({ id: exercisePrescriptions.id })
                  .from(exercisePrescriptions)
                  .where(eq(exercisePrescriptions.exerciseId, farmersCarryId)),
              ),
            ),
          )) as PortableUpdateResult;
        const rows = rowsAffected(result);
        if (rows > 0) updated += rows;
        else noop += 1;
      }

      // dumbbell-farmers-carry, REFERENCED (by a session) -> volume_counting
      // = 'off'. Mutually exclusive with the unreferenced branch above (see
      // the function-level comment) — never both, on the same row, in the
      // same run.
      {
        const result = (await tx
          .update(exercises)
          .set({ volumeCounting: "off", updatedAt: new Date() })
          .where(
            and(
              eq(exercises.id, farmersCarryId),
              eq(exercises.userId, user.id),
              eq(exercises.isSeeded, true),
              eq(exercises.measurementProfile, "load_reps"),
              eq(exercises.volumeCounting, "auto"),
              exists(
                tx
                  .select({ id: sessionExercises.id })
                  .from(sessionExercises)
                  .where(eq(sessionExercises.exerciseId, farmersCarryId)),
              ),
            ),
          )) as PortableUpdateResult;
        const rows = rowsAffected(result);
        if (rows > 0) updated += rows;
        else noop += 1;
      }

      const plankId = seededExerciseId(user.id, MEASUREMENT_PROFILE_RECONCILE_SLUGS.plank);

      // bodyweight-plank, UNREFERENCED -> duration. Same unreferenced
      // predicate as the carry.
      {
        const result = (await tx
          .update(exercises)
          .set({ measurementProfile: "duration", loadBasis: null, updatedAt: new Date() })
          .where(
            and(
              eq(exercises.id, plankId),
              eq(exercises.userId, user.id),
              eq(exercises.isSeeded, true),
              eq(exercises.measurementProfile, "load_reps"),
              notExists(
                tx
                  .select({ id: sessionExercises.id })
                  .from(sessionExercises)
                  .where(eq(sessionExercises.exerciseId, plankId)),
              ),
              notExists(
                tx
                  .select({ id: exercisePrescriptions.id })
                  .from(exercisePrescriptions)
                  .where(eq(exercisePrescriptions.exerciseId, plankId)),
              ),
            ),
          )) as PortableUpdateResult;
        const rows = rowsAffected(result);
        if (rows > 0) updated += rows;
        else noop += 1;
      }

      // bodyweight-plank, REFERENCED (by a session) -> volume_counting =
      // 'off' (L-5). Mirrors the farmers-carry-referenced branch's exact
      // predicate shape for plank's slug; mutually exclusive with the
      // unreferenced branch above (see the function-level comment) — never
      // both, on the same row, in the same run.
      {
        const result = (await tx
          .update(exercises)
          .set({ volumeCounting: "off", updatedAt: new Date() })
          .where(
            and(
              eq(exercises.id, plankId),
              eq(exercises.userId, user.id),
              eq(exercises.isSeeded, true),
              eq(exercises.measurementProfile, "load_reps"),
              eq(exercises.volumeCounting, "auto"),
              exists(
                tx
                  .select({ id: sessionExercises.id })
                  .from(sessionExercises)
                  .where(eq(sessionExercises.exerciseId, plankId)),
              ),
            ),
          )) as PortableUpdateResult;
        const rows = rowsAffected(result);
        if (rows > 0) updated += rows;
        else noop += 1;
      }
    }

    return { users: allUsers.length, updated, noop };
  });
}
