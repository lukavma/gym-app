// Estimated 1RM tracker — every user-facing string on the strength surface.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §15.2 (copy rules), §15.3 (the new copy requirements from the research and
// review) and §15.4 (the reason-code table, whose right-hand column "fixes
// the meaning, not the final wording" — the wording is owned here).
//
// Every sentence the athlete can read lives in this module as data, so the
// copy rules are checkable in one place (`tests/unit/strengthCopy.test.ts`).
//
// Rules this file is written against, restated so an editor cannot lose them:
//   * never "1RM" or "max" without "estimated"; never "PR" or "personal
//     record" for an estimated value; never an invitation to test a maximum;
//   * never "predicted", "will lift", "you can lift";
//   * never a word claiming accuracy or precision, and never "research
//     shows" — §15.4's own draft phrasings "less precise" are re-worded to
//     "less certain" here so no form of the claim survives even as a denial;
//   * never the vocabulary of the progression card for this feature's own
//     output (which is also why no string here contains that word at all);
//   * never a detraining explanation of a window — the 90 days are a
//     DATA-FRESHNESS rule, not a physiological claim (V-11);
//   * never a claim that the number IS the athlete's strength, or that a
//     change in it is a change in strength;
//   * never blaming the imprecision mainly on RIR (V-28: formula
//     misspecification and individual variation dominate).
//
// I-14 / A-19: this map's keys are EXACTLY the forty-eight members of
// `@/domain/strength/reasonCodes`, asserted in both directions by
// `tests/unit/strengthReasonCodes.test.ts`.

import { STRENGTH_REASON_CODES } from "@/domain/strength/reasonCodes";
import type { StrengthReasonCode } from "@/domain/strength/reasonCodes";

export const STRENGTH_REASON_COPY: Record<StrengthReasonCode, string> = {
  // --- Observation level (§15.4, table 1) ---
  ZERO_LOAD_SETS_EXCLUDED: "0 kg sets not used",
  HIGH_RIR_SETS_EXCLUDED: "Sets at RIR 5+ not used",
  HIGH_REP_SETS_EXCLUDED: "Sets beyond 12 reps to failure not used",
  SUB_MODAL_SETS_EXCLUDED: "Lighter sets treated as warm-up or back-off",
  IMPLAUSIBLE_SETS_EXCLUDED: "A much heavier set was left out as implausible",
  RIR_MISSING_LOWER_BOUND: "RIR not logged — at least this much, by this estimate",
  RIR_MODERATE_RANGE: "Some sets were far from failure",
  EXTENDED_REP_RANGE: "High-rep sets used — less certain",
  MIXED_LOADS_IN_SESSION: "Mixed loads in a session",
  TOP_SET_GOVERNS: "Based on the heavier set",
  SINGLE_SET_GROUP: "Based on a single set",
  DELOAD_SESSION: "Deload session — shown, not counted",

  // --- Estimate level (§15.4, table 2) ---
  NO_ELIGIBLE_SETS: "No eligible sets yet",
  // "counted", not "logged": the code fires when no NON-DELOAD observation is
  // in the window, so a window holding only deload sessions emits it while the
  // trend below still shows those sessions. The earlier wording ("No sessions
  // in the last 90 days") contradicted what was on the same screen (review
  // F-3).
  NO_RECENT_EVIDENCE: "No counted sessions in the last 90 days",
  SINGLE_SESSION_EVIDENCE: "Based on one session",
  TWO_SESSION_EVIDENCE: "Based on two sessions",
  EVIDENCE_AGING: "Most recent session more than three weeks ago",
  EVIDENCE_OLD: "Most recent session more than six weeks ago",
  ESTIMATE_SPREAD_WIDE: "Recent sessions vary",
  ESTIMATE_SPREAD_VERY_WIDE: "Recent sessions vary a lot",
  BEST_UNCONFIRMED: "Unconfirmed — no second session near it",
  DELOAD_SESSIONS_EXCLUDED: "Deload sessions not counted",

  // --- Suggestion level, refusal (§15.4, table 3) ---
  // Only the first two are reachable in Release A; the rest belong to
  // `suggestStartingLoad` and are declared so the map's membership matches
  // the enum exactly.
  EXERCISE_CATEGORY_UNSUPPORTED: "Not available for this equipment type",
  EXERCISE_ESTIMATE_DISABLED: "Strength estimate turned off for this exercise",
  DELOAD_SESSION_NO_SUGGESTION: "Deload session — no starting load offered",
  PENDING_RECOMMENDATION_PRESENT: "A pending progression card governs this exercise today",
  CARRY_FORWARD_REP_COMPATIBLE: "The prefilled load already matches today's reps",
  OBSERVATIONS_DISAGREE: "Recent sessions disagree too much",
  REP_DISTANCE_TOO_FAR: "No logged rep range close enough to today's target",
  TARGET_NEAR_MAXIMAL_NOT_SUGGESTED: "Nothing offered for near-maximal targets",
  TARGET_OUTSIDE_FORMULA_DOMAIN: "Target reps and reserve too high to estimate",
  BELOW_MINIMUM_LOAD: "The result is below the smallest load that can be shown",

  // --- Suggestion level, informational (§15.4, table 4) ---
  SOURCE_DIRECT_SAME_REPS: "From your recent sessions at these reps",
  SOURCE_NEARBY_REPS_TRANSLATED: "Estimated from nearby rep counts",
  SOURCE_FAR_REPS_TRANSLATED: "Estimated from a distant rep count",
  TRANSLATION_UPWARD_IN_LOAD: "Translated to a heavier load than logged",
  OBSERVATION_OUTLIER_PRESENT: "One recent session was left out as an outlier",
  MIXED_RIR_BASIS_REDUCED: "Only sessions with RIR logged were used",
  TARGET_RIR_FROM_BAND_MAX: "Assumes the top of the target RIR band",
  TARGET_RIR_FROM_RECENT_EFFORT: "Assumes your recent effort",
  TARGET_RIR_EFFORT_MATCHED: "Assumes the same effort as logged",
  EXTENDED_TARGET_EFFORT: "Target reserve is beyond the usual range — likely light",
  POOLED_ESTIMATE_LOWER_USED: "Lowered to match your overall estimate",
  DIRECT_EVIDENCE_CAPS_LOAD: "Capped at the load you actually lifted for these reps",
  CAPPED_AT_RECENT_MAX_LOAD: "Capped near your heaviest recent working load",
  ROUNDED_DOWN_TO_LOAD_STEP: "Rounded down to the load step",
  EQUIPMENT_TRANSLATION_NOISIER: "Less certain on this equipment type",
  CARRY_FORWARD_NO_REP_BASIS: "The prefilled load is a baseline, not from a session",
};

export function reasonCopy(code: string): string {
  return STRENGTH_REASON_COPY[code as StrengthReasonCode] ?? code;
}

export const CONFIDENCE_COPY: Record<string, string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence",
};

export function confidenceCopy(confidence: string): string {
  return CONFIDENCE_COPY[confidence] ?? confidence;
}

// Static page strings. Kept as data for the same reason as the map above.
export const STRENGTH_PAGE_COPY = {
  heading: "Strength estimate",
  currentLabel: "Current",
  bestLabel: "Best",
  trendLabel: "Trend",
  whatIfLabel: "What if I train at…",
  whatIfRepsLabel: "Reps",
  whatIfRirLabel: "RIR",
  whatIfSubmit: "Show the load",
  whatIfResultLabel: "Working load for that set",
  // §15.3 — the freshness wording. A data rule, never a physiological one.
  freshness: "Based on the last 90 days of training.",
  // §15.3's second freshness example is an actual age ("most recent session 6
  // weeks ago"), so the age is stated rather than bucketed — the estimate
  // already carries it. Still a statement about the DATA's age, never about
  // the athlete.
  latestSessionAgePrefix: "Most recent counted session",
  // §15.3 — the unit convention (review O-7). Comparisons only ever happen
  // inside one exercise, so a stable logging convention cancels; a change of
  // convention cannot be detected from the data.
  unitConvention: "In the numbers you log for this exercise — per hand, per stack, as entered.",
  // §15.1 — the footer, verbatim.
  footer: "Estimates only — not tested maxes.",
  // §15.2's structural rule, said out loud once on the page.
  estimateDisclaimer:
    "An estimate from your logged sets, not a measured value. Treat a change as a change in the estimate.",
  // §15.3 — B6 / EVIDENCE-025, the one evidence-backed sentence here.
  deloadNote: "Deload sessions are shown but not counted. A dip after one is expected.",
  emptyTrend: "No sessions with eligible sets in the last 90 days.",
  loading: "Loading…",
  loadFailed: "Failed to load the strength estimate.",
  notFound: "Exercise not found.",
  excludedGroupsLabel: "Not used",
  // A ±10 % CONVENTION, said as one. K-03 tags the noise magnitude [E*]
  // (provisional registry items) and the value 10 [P]; §2 forbids anything
  // [E*] from reaching copy as evidence, and row 20's not-justified column
  // forbids presenting the band as calibrated to anything. "One standard
  // deviation of estimation error" read as a measurement (review F-4).
  bandNote: "The range is a ±10 % convention, not a measured error.",
  algorithmLabel: "Algorithm",
  sparklineLabel: "Estimate over the last 90 days",
} as const;

// Every user-facing string this module can produce, for the copy test. The
// forbidden-substring list itself lives in `tests/unit/strengthCopy.test.ts`
// rather than here, so this file contains none of the words it bans and the
// test can scan it whole.
export function allCopyStrings(): string[] {
  return [
    ...STRENGTH_REASON_CODES.map((code) => STRENGTH_REASON_COPY[code]),
    ...Object.values(CONFIDENCE_COPY),
    ...Object.values(STRENGTH_PAGE_COPY),
  ];
}
