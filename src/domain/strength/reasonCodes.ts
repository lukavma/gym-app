// Estimated 1RM tracker — the complete reason-code vocabulary.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §15.4, which declares *exactly* these forty-eight codes grouped by the level
// that emits them. I-14: every member is emitted by at least one fixture, and
// no code outside this enum may be emitted anywhere — in code, in copy, or in
// a DTO. A-19 asserts both halves.
//
// Phrasing is owned by `src/ui/strength/copy.ts`; the grouping here fixes the
// meaning and the emitter, not the wording.
//
// Five evaluation-era codes are deliberately *not* members and must not be
// re-introduced: `SESSION_SETS_INCONSISTENT`, `REP_DISTANCE_FAR`,
// `NEARBY_POOLED_DISAGREE`, `PENDING_RECOMMENDATION_COMPATIBLE`,
// `SOURCE_CURRENT_ESTIMATE_TRANSLATED` (revision §15.4, §7.6).

// --- Observation level (revision §15.4, table 1) ---------------------------
// Flags on one session's observation. The six `*_SETS_EXCLUDED` codes are
// derived from `excludedSetCounts`; warm-up sets are counted but carry no
// code (they are not an anomaly — they are correctly classified data).
export const OBSERVATION_REASON_CODES = [
  "ZERO_LOAD_SETS_EXCLUDED",
  "HIGH_RIR_SETS_EXCLUDED",
  "HIGH_REP_SETS_EXCLUDED",
  "SUB_MODAL_SETS_EXCLUDED",
  "IMPLAUSIBLE_SETS_EXCLUDED",
  "RIR_MISSING_LOWER_BOUND",
  "RIR_MODERATE_RANGE",
  "EXTENDED_REP_RANGE",
  "MIXED_LOADS_IN_SESSION",
  "TOP_SET_GOVERNS",
  "SINGLE_SET_GROUP",
  "DELOAD_SESSION",
] as const;

// --- Estimate level (revision §15.4, table 2) ------------------------------
// Emitted by `deriveEstimate`, plus every distinct observation-level flag of
// any pool observation, propagated once.
export const ESTIMATE_REASON_CODES = [
  "NO_ELIGIBLE_SETS",
  "NO_RECENT_EVIDENCE",
  "SINGLE_SESSION_EVIDENCE",
  "TWO_SESSION_EVIDENCE",
  "EVIDENCE_AGING",
  "EVIDENCE_OLD",
  "ESTIMATE_SPREAD_WIDE",
  "ESTIMATE_SPREAD_VERY_WIDE",
  "BEST_UNCONFIRMED",
  "DELOAD_SESSIONS_EXCLUDED",
] as const;

// --- Suggestion level, refusal (revision §15.4, table 3) -------------------
// `status: "none"`. The primary code is the first one that holds in the order
// of the revision's §9.6 refusal list. `NO_ELIGIBLE_SETS` and
// `NO_RECENT_EVIDENCE` are shared with the estimate level and are declared
// once, above.
export const SUGGESTION_REFUSAL_REASON_CODES = [
  "EXERCISE_CATEGORY_UNSUPPORTED",
  "EXERCISE_ESTIMATE_DISABLED",
  "DELOAD_SESSION_NO_SUGGESTION",
  "PENDING_RECOMMENDATION_PRESENT",
  "CARRY_FORWARD_REP_COMPATIBLE",
  "OBSERVATIONS_DISAGREE",
  "REP_DISTANCE_TOO_FAR",
  "TARGET_NEAR_MAXIMAL_NOT_SUGGESTED",
  "TARGET_OUTSIDE_FORMULA_DOMAIN",
  "BELOW_MINIMUM_LOAD",
] as const;

// --- Suggestion level, informational (revision §15.4, table 4) -------------
// `status: "ok"`, plus every distinct observation-level flag of any basis
// group's observation, propagated once.
export const SUGGESTION_INFO_REASON_CODES = [
  "SOURCE_DIRECT_SAME_REPS",
  "SOURCE_NEARBY_REPS_TRANSLATED",
  "SOURCE_FAR_REPS_TRANSLATED",
  "TRANSLATION_UPWARD_IN_LOAD",
  "OBSERVATION_OUTLIER_PRESENT",
  "MIXED_RIR_BASIS_REDUCED",
  "TARGET_RIR_FROM_BAND_MAX",
  "TARGET_RIR_FROM_RECENT_EFFORT",
  "TARGET_RIR_EFFORT_MATCHED",
  "EXTENDED_TARGET_EFFORT",
  "POOLED_ESTIMATE_LOWER_USED",
  "DIRECT_EVIDENCE_CAPS_LOAD",
  "CAPPED_AT_RECENT_MAX_LOAD",
  "ROUNDED_DOWN_TO_LOAD_STEP",
  "EQUIPMENT_TRANSLATION_NOISIER",
  "CARRY_FORWARD_NO_REP_BASIS",
] as const;

export const STRENGTH_REASON_CODES = [
  ...OBSERVATION_REASON_CODES,
  ...ESTIMATE_REASON_CODES,
  ...SUGGESTION_REFUSAL_REASON_CODES,
  ...SUGGESTION_INFO_REASON_CODES,
] as const;

export type ObservationReasonCode = (typeof OBSERVATION_REASON_CODES)[number];
export type EstimateReasonCode = (typeof ESTIMATE_REASON_CODES)[number];
export type SuggestionRefusalReasonCode = (typeof SUGGESTION_REFUSAL_REASON_CODES)[number];
export type SuggestionInfoReasonCode = (typeof SUGGESTION_INFO_REASON_CODES)[number];
export type StrengthReasonCode = (typeof STRENGTH_REASON_CODES)[number];

// Release A ships the tracker only (revision §4, V-1). These eighteen codes
// are declared because §15.4 declares the enum as a whole, but nothing in
// Release A can emit them: they belong to `suggestStartingLoad`, its
// firing-condition gates, and its tier selection. A-19's reachability half is
// tagged (A+B) for exactly this reason; `tests/unit/strengthReasonCodes.test.ts`
// asserts that the set of unreachable codes is *precisely* this list, so a
// Release-A code silently losing its emitter still fails the suite.
//
// `CAPPED_AT_RECENT_MAX_LOAD` left this list on 2026-09-06: the owner decision
// on review finding F-2 applies §9.5's step-4 global cap to the what-if
// calculator, so the code is now Release-A-reachable. The other two cap codes
// stay deferred — step 2 is an identity for the calculator and step 3 has no
// basis group to cap against.
export const RELEASE_B_ONLY_REASON_CODES = [
  "DELOAD_SESSION_NO_SUGGESTION",
  "PENDING_RECOMMENDATION_PRESENT",
  "CARRY_FORWARD_REP_COMPATIBLE",
  "OBSERVATIONS_DISAGREE",
  "REP_DISTANCE_TOO_FAR",
  "SOURCE_DIRECT_SAME_REPS",
  "SOURCE_NEARBY_REPS_TRANSLATED",
  "SOURCE_FAR_REPS_TRANSLATED",
  "TRANSLATION_UPWARD_IN_LOAD",
  "OBSERVATION_OUTLIER_PRESENT",
  "MIXED_RIR_BASIS_REDUCED",
  "TARGET_RIR_FROM_BAND_MAX",
  "TARGET_RIR_FROM_RECENT_EFFORT",
  "TARGET_RIR_EFFORT_MATCHED",
  "POOLED_ESTIMATE_LOWER_USED",
  "DIRECT_EVIDENCE_CAPS_LOAD",
  "EQUIPMENT_TRANSLATION_NOISIER",
  "CARRY_FORWARD_NO_REP_BASIS",
] as const satisfies readonly StrengthReasonCode[];

export function isStrengthReasonCode(value: string): value is StrengthReasonCode {
  return (STRENGTH_REASON_CODES as readonly string[]).includes(value);
}
