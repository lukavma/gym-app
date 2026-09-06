// Estimated 1RM tracker — exercise and set admissibility.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §6.1 (V-3, exercise level) and §6.2 (V-4, set level). Applied in the pure
// domain, not in SQL (the volume precedent): the server query bounds by user,
// exercise and `status = 'completed'` only, so every rule below is provable
// directly against a fixture.

import { RIR_ELIGIBLE_MAX, RTF_MAX, STRENGTH_ELIGIBLE_EQUIPMENT } from "./constants";
import type { StrengthEligibility, StrengthExerciseInput, StrengthSetInput } from "./types";

// V-3 — an exercise is eligible when BOTH hold: its CURRENT `equipment` is
// one of barbell / dumbbell / cable / machine, and `strength_estimate` is not
// `'off'`.
//
// `equipment` is an eligibility GATE, not a reinterpretation weight (review
// RC-25): editing it makes a whole series appear or vanish on the next read.
// Nothing is lost — flipping it back restores the series.
//
// `bodyweight` is excluded because it needs a bodyweight join and a leverage
// fraction (D-3); `other` has no load semantics. Assisted movements (the
// seeded Assisted Pull-Up) and time/distance work (Farmer's Carry) are
// switched `'off'` by the migration that introduced the column, because their
// stored load is inverted-but-unmodelled or fabricated respectively — no
// equation can consume either.
//
// When both fail, the category code wins: §9.6's refusal list is ordered and
// `EXERCISE_CATEGORY_UNSUPPORTED` is listed first.
export function evaluateExerciseEligibility(exercise: StrengthExerciseInput): StrengthEligibility {
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
