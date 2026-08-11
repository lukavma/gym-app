import type { AppDb } from "@/db/client";
import { seedMuscleGroups } from "./muscleGroups";
import { seedExerciseCatalogForAllUsers } from "./exercises";

export { seedMuscleGroups } from "./muscleGroups";
export {
  seedExerciseCatalogForUser,
  seedExerciseCatalogForAllUsers,
  seededExerciseId,
} from "./exercises";
export { EXERCISE_CATALOG } from "./exerciseCatalog";

// Entry point for `pnpm db:seed` (run.ts) and the deploy pipeline. Idempotent
// and safe to rerun on every deploy (implementation-plan.md §1.4).
export async function runSeed(db: AppDb): Promise<void> {
  await seedMuscleGroups(db);
  await seedExerciseCatalogForAllUsers(db);
}
