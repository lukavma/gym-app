// Estimated 1RM tracker — the pure module's data contract.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §5 (terminology), §7 (observation), §8 (estimate). Nothing here is
// persisted: I-1 — the feature produces no server-side fact and no outbox op;
// every value below is recomputed on read.

import type { STRENGTH_ALGORITHM } from "./constants";
import type { StrengthEstimateMode } from "./estimateMode";
import type {
  EstimateReasonCode,
  ObservationReasonCode,
  StrengthReasonCode,
  SuggestionRefusalReasonCode,
} from "./reasonCodes";

export type StrengthAlgorithmStamp = typeof STRENGTH_ALGORITHM;

// I-4 — every DTO carries the algorithm; any behaviour change bumps
// `version`, so a stored screenshot or an exported number is always
// attributable to the rules that produced it.
export type StrengthConfidence = "high" | "medium" | "low";

// --- Inputs ---------------------------------------------------------------

export interface StrengthSetInput {
  setNumber: number;
  isWarmup: boolean;
  weightKg: number;
  reps: number;
  rir: number | null;
}

export interface StrengthSessionInput {
  sessionId: string;
  // Local calendar date in the ACCOUNT timezone, resolved by the server with
  // `userLocalDateString(timezone, session.startedAt)` (V-10). The session's
  // start is the day key, matching the volume convention: a session spanning
  // midnight stays in its start day.
  performedOn: string;
  // ISO instant (`toISOString()`, UTC `Z`) — used only as the second sort
  // key of the `(performedOn, startedAt, sessionId)` tiebreak (§8.1). The
  // module compares epoch milliseconds, never strings.
  startedAt: string;
  isDeload: boolean;
  // Precondition (§6.3): the server query already bounds by
  // `status = 'completed'`, so an in-progress or discarded session never
  // reaches here. Everything else is decided in this module, not in SQL.
  sets: readonly StrengthSetInput[];
}

export interface StrengthExerciseInput {
  equipment: string;
  strengthEstimate: StrengthEstimateMode;
  loadStepKg: number;
}

export interface StrengthWhatIfInput {
  reps: number;
  rir: number;
}

export interface StrengthReportInput {
  exercise: StrengthExerciseInput;
  sessions: readonly StrengthSessionInput[];
  asOfLocalDate: string;
  whatIf?: StrengthWhatIfInput | null;
}

// --- Observation ----------------------------------------------------------

export interface StrengthExcludedSetCounts {
  warmup: number;
  zeroLoad: number;
  highRir: number;
  highRep: number;
  subModal: number;
  implausible: number;
}

// Why a group did not contribute. `admitted` = the modal group plus every
// plausible supra-modal group (§7.3). Excluded groups stay on the
// observation as provenance only — I-13: they never contribute to the
// session value or to any suggestion basis.
export type StrengthGroupStatus = "admitted" | "sub_modal" | "implausible";

export interface StrengthGroupPosition {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  rtf: number;
  e1rmKg: number;
}

export interface StrengthLoadGroup {
  loadKg: number;
  setCount: number;
  // Mode of reps over ALL the group's eligible sets, ties -> lowest (§5).
  modalReps: number;
  // Lower median of the REPORTED RIR among the group's first three sets;
  // null when none of them reports one (§5).
  medianRir: number | null;
  // True when every one of the group's first three sets reports RIR (§5).
  rirComplete: boolean;
  // V-8 — lower median of the set e1RMs of the group's first up to three
  // sets, in set-number order. Sets 4+ enter `setCount` only, which is what
  // makes the session value set-count invariant (I-12).
  e1rmKg: number;
  status: StrengthGroupStatus;
  isModal: boolean;
  isGoverning: boolean;
  positions: readonly StrengthGroupPosition[];
  // Set-quality codes derived from this group's first three sets. The
  // observation unions these over ADMITTED groups only (§7.6).
  flags: readonly ObservationReasonCode[];
}

export interface StrengthObservation {
  sessionId: string;
  performedOn: string;
  startedAt: string;
  isDeload: boolean;
  groups: readonly StrengthLoadGroup[];
  governingGroupLoadKg: number;
  governingGroupReps: number;
  governingGroupMedianRir: number | null;
  e1rmKg: number;
  flags: readonly ObservationReasonCode[];
  excludedSetCounts: StrengthExcludedSetCounts;
  // `flags` plus the `*_SETS_EXCLUDED` codes derived from
  // `excludedSetCounts`, deduplicated and in enum order — the list the UI
  // renders and the estimate propagates from (§7.6, §8.4).
  reasonCodes: readonly ObservationReasonCode[];
}

// --- Estimate -------------------------------------------------------------

export interface StrengthBest {
  e1rmKg: number;
  performedOn: string;
  sessionId: string;
  // "Unconfirmed" when no OTHER non-deload past observation reaches
  // `best x (1 - BEST_UNCONFIRMED_PCT / 100)` (§8.3).
  unconfirmed: boolean;
}

export interface StrengthEstimate {
  currentE1rmKg: number | null;
  best: StrengthBest | null;
  confidence: StrengthConfidence;
  reasonCodes: readonly StrengthReasonCode[];
  poolSessionIds: readonly string[];
  poolSpreadPct: number | null;
  // Whole calendar days between the most recent pool observation and
  // `asOfLocalDate`; null when the pool is empty.
  latestPoolAgeDays: number | null;
  // Non-deload past observations that fell outside the evidence window
  // (§8.3 — past only; a future-dated observation is never "stale", it is
  // simply not yet visible, RM-2).
  staleObservationCount: number;
  deloadObservationCount: number;
  algorithm: StrengthAlgorithmStamp;
  asOfLocalDate: string;
}

// --- What-if --------------------------------------------------------------

// The strength page's calculator (§15.1, Release A): reps + RIR -> a load
// from the CURRENT estimate, under the same target-effort bounds, finite
// guard, load-step floor and band as any other translated value. It has no
// tier and no basis — its basis IS `currentE1RM` — so the tier-selection
// caps of §9.5 steps 2-4 do not apply to it (they are properties of a
// suggestion, which is Release B).
export interface StrengthWhatIf {
  status: "ok" | "none";
  targetReps: number;
  targetRir: number;
  targetRtf: number;
  loadKg: number | null;
  rawLoadKg: number | null;
  bandKg: readonly [number, number] | null;
  reasonCodes: readonly StrengthReasonCode[];
}

export type StrengthEligibilityRefusal = Extract<
  SuggestionRefusalReasonCode,
  "EXERCISE_CATEGORY_UNSUPPORTED" | "EXERCISE_ESTIMATE_DISABLED"
>;

export type StrengthEligibility =
  { eligible: true } | { eligible: false; reasonCode: StrengthEligibilityRefusal };

export interface StrengthReport {
  eligible: boolean;
  estimate: StrengthEstimate;
  // Trend rows: the evidence window's observations (deload rows included and
  // badged, §6.3/O-10), newest first. Observations after `asOf` contribute to
  // nothing and are never listed (I-6).
  observations: readonly StrengthObservation[];
  sessionsWithoutEligibleSets: number;
  whatIf: StrengthWhatIf | null;
  algorithm: StrengthAlgorithmStamp;
}

// Re-exported so a consumer can name the narrow code unions without reaching
// past this module's public surface.
export type { EstimateReasonCode, ObservationReasonCode, StrengthReasonCode };
export type { StrengthEstimateMode };
