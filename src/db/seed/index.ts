import type { AppDb } from "@/db/client";
import { seedMuscleGroups } from "./muscleGroups";
import { seedExerciseCatalogForAllUsers } from "./exercises";
import { reconcileContributions } from "./reconcileContributions";
import { reconcileStrengthEstimates } from "./reconcileStrengthEstimates";
import { reconcileMeasurementProfiles } from "./reconcileMeasurementProfiles";
import { seedVolumePresets } from "./volumePresets";

export { seedMuscleGroups } from "./muscleGroups";
export {
  seedExerciseCatalogForUser,
  seedExerciseCatalogForAllUsers,
  seededExerciseId,
} from "./exercises";
export { EXERCISE_CATALOG } from "./exerciseCatalog";
export {
  reconcileContributions,
  RECONCILED_BACK_SLUGS,
  type ReconciliationSummary,
} from "./reconcileContributions";
export { seedVolumePresets, RP_GENERAL_PRESET_ID } from "./volumePresets";
export {
  reconcileStrengthEstimates,
  STRENGTH_ESTIMATE_OFF_SLUGS,
  type StrengthEstimateReconciliationSummary,
} from "./reconcileStrengthEstimates";
export {
  reconcileMeasurementProfiles,
  MEASUREMENT_PROFILE_RECONCILE_SLUGS,
  type MeasurementProfileReconciliationSummary,
} from "./reconcileMeasurementProfiles";

// Entry point for `pnpm db:seed` (run.ts) and the deploy pipeline. Idempotent
// and safe to rerun on every deploy (implementation-plan.md §1.4).
//
// Order is load-bearing (ADR-010): `reconcileContributions` must run after
// `seedMuscleGroups` (the `lats`/`upper_back` FK targets must already exist)
// and before `seedExerciseCatalogForAllUsers` (so a not-yet-applied user's
// pre-existing seeded `back` rows are handled before any new leaf-targeting
// catalog entries are inserted for them). `seedVolumePresets` only depends on
// `seedMuscleGroups` (its landmarks FK muscle_groups) and `users` (its
// default-preset init); it has no ordering dependency on the taxonomy
// reconciliation or catalog steps, so it runs alongside `seedMuscleGroups`.
//
// `reconcileStrengthEstimates` (ADR-011) and `reconcileMeasurementProfiles`
// (athletic-measurement-profiles §14.3, O-5, Release 2 only) both run LAST:
// each only ever touches rows that already exist, so both must see whatever
// the catalog step just inserted, and neither depends on anything the
// earlier steps produce — nor on each other (they touch disjoint columns and
// their predicates never overlap), so their relative order here is
// arbitrary.
export async function runSeed(db: AppDb): Promise<void> {
  await seedMuscleGroups(db);
  await seedVolumePresets(db);
  await reconcileContributions(db);
  await seedExerciseCatalogForAllUsers(db);
  await reconcileStrengthEstimates(db);
  await reconcileMeasurementProfiles(db);
}
