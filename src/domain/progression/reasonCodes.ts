// progression-engine.md §6 — the explainability contract. A stable string
// enum, ordered most-important-first inside each draft; the UI owns human
// phrasing (src/ui/recommendations/copy.ts), these codes are the API.
// §4.2's pseudocode shorthand "RIR_IN_PROGRESS_ZONE" maps to this enum's
// FINAL_SET_RIR_IN_PROGRESS_ZONE — the §6 table is the canonical vocabulary.
export const REASON_CODES = [
  "ALL_PRESCRIBED_REPS_COMPLETED",
  "PRESCRIBED_REPS_NOT_COMPLETED",
  "NO_WORK_SETS_LOGGED",
  "FINAL_SET_RIR_IN_PROGRESS_ZONE",
  "FINAL_SET_RIR_AT_LIMIT",
  "RIR_MISSING_REPS_ONLY_EVALUATION",
  "RIR_MISSING_HOLD_POLICY",
  "FINAL_SET_RIR_ABOVE_PROGRESS_ZONE_SUSPECT",
  "TARGET_REPS_NOT_REACHED_ALL_SETS",
  "ALL_SETS_AT_TARGET_REPS",
  "REP_TARGET_INCREASED",
  "REP_CAP_REACHED",
  "HOLD_POLICY",
  "LOAD_INCREASE_WITH_REP_RESET",
  "REPEATED_INCOMPLETE_AT_LOAD",
  "DECREASE_APPLIED",
  "UNSUPPORTED_SCHEME",
  "INSUFFICIENT_HISTORY",
  "DELOAD_SESSION_NOT_EVALUATED",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
