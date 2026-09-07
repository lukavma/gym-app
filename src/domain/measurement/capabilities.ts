// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §11.1
// (principle: structural refusals first, switches last and disable-only)
// and §11.2 (the consumer matrix).
//
// May import only from `./profile` and `./compatibility` (I-10). Each
// consumer gets its own narrowly-named predicate rather than one generic
// untyped "capability(profile, loadBasis, equipment, switches)" bag, so a
// call site reads as what it is. Equipment and per-exercise switches are
// NOT this module's concern — those stay in the caller (e.g.
// `domain/strength/eligibility.ts`, which applies them, in that order, per
// O-17's amended "profile → basis → equipment → switch" sequence), and this
// module never attaches a `STRENGTH_REASON_CODES` or any other
// `domain/strength` symbol — reason codes are the caller's job.
import { profileSupportsScheme } from "./compatibility";
import type { LoadBasis, MeasurementProfile } from "./profile";

// §11.2's e1RM row: `profile = load_reps` AND `load_basis ≠ assistance`.
// Equipment and the `strength_estimate` switch are evaluated afterwards, by
// the caller.
export function isProfileEligibleForE1rm(
  profile: MeasurementProfile,
  loadBasis: LoadBasis | null,
): boolean {
  return profile === "load_reps" && loadBasis !== "assistance";
}

// §11.2's muscle-volume row's structural rule: `profile ∈ {load_reps, reps}`.
// The `volume_counting` switch is a separate, later-applied gate (§11.4),
// not this function's job.
export function isProfileEligibleForVolume(profile: MeasurementProfile): boolean {
  return profile === "load_reps" || profile === "reps";
}

// §11.2's load-progression/rep-progression row's structural rule. Kept as a
// named wrapper here — rather than having every consumer reach into
// `./compatibility` directly — because §11.1 frames every consumer gate as
// living in `capabilities.ts`; see judgmentCalls for why a thin re-export
// was chosen over inlining the table a second time.
export function isProfileEligibleForProgression(
  profile: MeasurementProfile,
  schemeType: string,
): boolean {
  return profileSupportsScheme(profile, schemeType);
}
