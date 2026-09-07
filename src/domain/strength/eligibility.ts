// Estimated 1RM tracker — exercise and set admissibility.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §6.1 (V-3, exercise level) and §6.2 (V-4, set level). Applied in the pure
// domain, not in SQL (the volume precedent): the server query bounds by user,
// exercise and `status = 'completed'` only, so every rule below is provable
// directly against a fixture.

import { RIR_ELIGIBLE_MAX, RTF_MAX, STRENGTH_ELIGIBLE_EQUIPMENT } from "./constants";
import type { StrengthEligibility, StrengthExerciseInput, StrengthSetInput } from "./types";

// V-3, amended by `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md`
// §11.6 (O-17, accepted, option (a)): an exercise is eligible when ALL FOUR
// hold, checked in this order — its `measurementProfile` is `load_reps`, its
// `loadBasis` is not `assistance`, its CURRENT `equipment` is one of
// barbell / dumbbell / cable / machine, and `strength_estimate` is not
// `'off'`.
//
// The refusal order is now PROFILE -> BASIS -> EQUIPMENT -> SWITCH — the
// profile is the more fundamental fact (§11.6): a `duration` Plank is refused
// for its *shape*, not for its equipment category, so the first two checks
// run ahead of the pre-existing pair rather than after them. This is an
// explicit amendment of the previously closed "category code wins" ordering,
// not a reinterpretation of it.
//
// `equipment` is an eligibility GATE, not a reinterpretation weight (review
// RC-25): editing it makes a whole series appear or vanish on the next read.
// Nothing is lost — flipping it back restores the series. The same is true of
// `measurementProfile` and `loadBasis` (§10.3's lock aside, both flow through
// this same read-time gate).
//
// `bodyweight` is excluded because it needs a bodyweight join and a leverage
// fraction (D-3); `other` has no load semantics. Assisted movements (the
// seeded Assisted Pull-Up, reconciled to `loadBasis = 'assistance'` in
// Release 2) and time/distance work (Farmer's Carry, reconciled to a
// non-`load_reps` profile) are refused structurally now, by profile/basis
// rather than by the `strength_estimate = 'off'` switch that carried the
// refusal until this amendment — in Release 1 neither reconcile has run yet,
// so this branch is unreachable and the switch still carries them (§11.6's
// "unobservable until Release 2" note).
//
// `isProfileEligibleForE1rm` (`@/domain/measurement/capabilities`) is NOT
// used here: it collapses profile-wrong and basis-wrong into one boolean,
// but O-17 requires two DISTINCT reason codes at two DISTINCT ordering
// positions, so the profile and basis checks are inlined directly against
// the same vocabulary that function itself is built from (see
// judgmentCalls).
export function evaluateExerciseEligibility(exercise: StrengthExerciseInput): StrengthEligibility {
  if (exercise.measurementProfile !== "load_reps") {
    return { eligible: false, reasonCode: "MEASUREMENT_PROFILE_UNSUPPORTED" };
  }
  if (exercise.loadBasis === "assistance") {
    return { eligible: false, reasonCode: "LOAD_BASIS_UNSUPPORTED" };
  }
  if (!(STRENGTH_ELIGIBLE_EQUIPMENT as readonly string[]).includes(exercise.equipment)) {
    return { eligible: false, reasonCode: "EXERCISE_CATEGORY_UNSUPPORTED" };
  }
  if (exercise.strengthEstimate === "off") {
    return { eligible: false, reasonCode: "EXERCISE_ESTIMATE_DISABLED" };
  }
  return { eligible: true };
}

// The bucket an ineligible set is counted under. Warm-up sets are counted but
// carry no reason code — a marked warm-up is correctly classified data, not
// an anomaly (§15.4).
export type ExcludedSetBucket = "warmup" | "zeroLoad" | "highRir" | "highRep";

export type SetClassification =
  { eligible: true; rtf: number } | { eligible: false; bucket: ExcludedSetBucket };

// V-4 — applied in the order of the §6.2 table, which is normative when a set
// fails more than one rule.
//
//  * `isWarmup`      excluded. `set_logs.is_warmup` is the PRIMARY work-set
//                    classifier for this feature, exactly as it already is
//                    for the engine, volume and carry-forward. The modal-load
//                    rule (§7.3) is defence in depth, not a substitute.
//  * `weightKg <= 0` excluded — `data-model.md:230`: 0 means bodyweight-only,
//                    and the column's CHECK is `>= 0`, so 0 is legal data
//                    this feature cannot interpret.
//  * `rir >= 5`      excluded. A DOMAIN rule that DEPARTS from
//                    `evidence-to-design.md` row 5 ("discarding high-RIR data
//                    entirely" is listed as not justified); the departure is
//                    recorded in row 20. Re-justified because with
//                    `RTF_MAX = 12` it bites only when `reps <= 7`, i.e. on
//                    low-rep sets far from failure — the longest
//                    extrapolations, furthest from where RIR accuracy has
//                    ever been measured.
//  * `RTF > 12`      excluded (`RTF_MAX`, ADR-011's source ceiling).
//
// A null `rir` is ELIGIBLE with `RTF = reps` — a lower bound on the ESTIMATE,
// never on the athlete's 1RM (§15.3's copy rule).
export function classifySet(set: StrengthSetInput): SetClassification {
  if (set.isWarmup) return { eligible: false, bucket: "warmup" };
  if (!(set.weightKg > 0)) return { eligible: false, bucket: "zeroLoad" };
  if (set.rir !== null && set.rir > RIR_ELIGIBLE_MAX) {
    return { eligible: false, bucket: "highRir" };
  }
  const rtf = set.reps + (set.rir ?? 0);
  if (rtf > RTF_MAX) return { eligible: false, bucket: "highRep" };
  return { eligible: true, rtf };
}
