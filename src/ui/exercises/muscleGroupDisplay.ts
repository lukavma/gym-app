import {
  MUSCLE_GROUP_DISPLAY_NAMES,
  isRollupMuscleGroupSlug,
  type MuscleGroupSlug,
} from "@/domain/exercises/muscleGroups";

// A direct contribution on a rollup group (e.g. `back`) is always legacy
// data — Release 1 never lets the app create one (ADR-010). "Unclassified "
// is presentation-only copy layered on top of the domain's canonical
// displayName ("Back"), not a change to that name itself.
//
// D-CE1-1(iii) forward hardening: `MUSCLE_GROUP_DISPLAY_NAMES` is typed
// `Record<MuscleGroupSlug, string>`, but the runtime value can be a slug this
// bundle's vocabulary doesn't recognise yet — it arrives through a cast, not
// a parse (src/server/exercises/service.ts). Falling back to the raw slug
// keeps the label visibly *set* and visibly unfamiliar instead of `undefined`.
export function contributionMuscleLabel(muscleGroupId: MuscleGroupSlug): string {
  const displayName = MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId] ?? muscleGroupId;
  return isRollupMuscleGroupSlug(muscleGroupId) ? `Unclassified ${displayName}` : displayName;
}
