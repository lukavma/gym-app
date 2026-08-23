import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  isRollupMuscleGroupSlug,
  type MuscleGroupSlug,
} from "@/domain/exercises/muscleGroups";

// A direct contribution on a rollup group (e.g. `back`) is always legacy
// data — Release 1 never lets the app create one (ADR-010). "Unclassified "
// is presentation-only copy layered on top of the domain's canonical
// displayName ("Back"), not a change to that name itself.
export function contributionMuscleLabel(muscleGroupId: MuscleGroupSlug): string {
  const displayName = MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId];
  return isRollupMuscleGroupSlug(muscleGroupId) ? `Unclassified ${displayName}` : displayName;
}
