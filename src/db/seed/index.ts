import type { AppDb } from "@/db/client";
import { seedMuscleGroups } from "./muscleGroups";
import { seedExerciseCatalogForAllUsers } from "./exercises";
import { reconcileContributions } from "./reconcileContributions";

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

// Entry point for `pnpm db:seed` (run.ts) and the deploy pipeline. Idempotent
// and safe to rerun on every deploy (implementation-plan.md §1.4).
//
// Order is load-bearing (ADR-010): `reconcileContributions` must run after
// `seedMuscleGroups` (the `lats`/`upper_back` FK targets must already exist)
// and before `seedExerciseCatalogForAllUsers` (so a not-yet-applied user's
// pre-existing seeded `back` rows are handled before any new leaf-targeting
// catalog entries are inserted for them).
export async function runSeed(db: AppDb): Promise<void> {
  await seedMuscleGroups(db);
  await reconcileContributions(db);
  await seedExerciseCatalogForAllUsers(db);
}
