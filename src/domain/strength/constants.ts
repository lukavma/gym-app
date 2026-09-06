// Estimated 1RM tracker — algorithmic constants.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §16 (the K-nn table), accepted by its owner-decision addendum of 2026-09-05
// and recorded architecturally in ADR-011. Every value below is a labelled
// convention, not a measurement: the tag in each comment is the revision's own
// classification ([E*] provisional evidence, [A] arithmetic, [R] repository
// convention, [P] conservative product policy). Nothing here may be presented
// to the user as a research finding (revision §15.2).
//
// The K-nn ids are quoted so a reviewer can diff this file against §16 row by
// row. Constants marked "Release B" are declared here because §16 defines the
// whole table as this module's surface; they are consumed by
// `suggestStartingLoad`, which is not part of Release A.

// K-01 [P] — stamped on every DTO (I-4). Any behaviour change bumps `version`.
export const STRENGTH_ALGORITHM = {
  id: "e1rm-epley-rir",
  version: 1,
  formula: "epley",
} as const;

export type StrengthAlgorithm = typeof STRENGTH_ALGORITHM;

// K-03 [E*] magnitude (provisional EVIDENCE-032/034/035/036) / [P] value —
// one standard deviation of individual e1RM estimation error. Every
// percentage threshold below is a stated multiple of this single number, so
// recalibrating the noise model moves them together (D-12).
export const NOISE_SD_PCT = 10;

// --- Set admissibility (revision §6.2) -------------------------------------

// K-04 [E*] (provisional EVIDENCE-033/036) / [R] — source ceiling. RTF above
// this is excluded outright; ADR-011 turns OD-06's "reps <= 12 for display"
// into this admissibility rule (same number, structural role).
export const RTF_MAX = 12;

// K-05 [E*] (provisional EVIDENCE-036) — above this an admitted set is
// degraded (`EXTENDED_REP_RANGE`), not excluded.
export const RTF_CORE_MAX = 10;

// K-06 [P] — RIR 0..2 is "near failure", full standing.
export const RIR_NEAR_FAILURE_MAX = 2;

// K-07 [P], departs from `evidence-to-design.md` row 5 — RIR 3..4 is eligible
// but degraded; RIR >= 5 is excluded as a domain rule. The departure is
// recorded in row 20 (revision §6.2, RC-15).
export const RIR_ELIGIBLE_MAX = 4;

// --- Session aggregation (revision §7) -------------------------------------

// K-08 [E*] (Senna 2011, not in the registry) — only the first three sets of a
// load group enter its value, which is what makes a session's e1RM invariant
// to sets logged later (I-12).
export const GROUP_SET_POSITIONS = 3;

// K-09 [P] calibrated (1 + 2 x noise) — a heavier group is admitted only when
// its e1RM is within this factor of the modal group's.
export const PLAUSIBILITY_FACTOR = 1 + (2 * NOISE_SD_PCT) / 100;

// --- Windows and pooling (revision §8) -------------------------------------

// K-10 [P] — data-freshness rule, in calendar days in the account timezone.
// Never a detraining claim (V-11, revision §8.2).
export const EVIDENCE_WINDOW_DAYS = 90;

// K-11 [P] — the pool is the most recent N non-deload observations in window.
export const CURRENT_SESSION_COUNT = 3;

// K-12 [P] — freshness confidence steps, calendar days.
export const FRESH_DAYS_HIGH = 21;
export const FRESH_DAYS_MEDIUM = 42;

// K-25 [P] calibrated (= one noise unit) — `best` is "unconfirmed" when no
// other non-deload observation reaches this fraction of it.
export const BEST_UNCONFIRMED_PCT = 10;

// --- Spread, disagreement, confidence (revision §9.6, §11) -----------------

// K-20 [P] calibrated (2 x noise).
export const SPREAD_MEDIUM_PCT = 2 * NOISE_SD_PCT;

// K-21 [P] calibrated (3 x noise).
export const SPREAD_LOW_PCT = 3 * NOISE_SD_PCT;

// K-22 [P] calibrated (3 x noise) — Release B: the consistency gate's refusal
// threshold.
export const DISAGREE_REFUSE_PCT = 3 * NOISE_SD_PCT;

// Revision §9.6 [P] — Release B: with n >= 3 the gate continues only on a
// unique consistent subset of at least this size that is a strict majority.
// Two independent errors that happen to agree are plausible; three are not.
export const CONSISTENT_MAJORITY_MIN = 3;

// --- Source selection and translation (revision §9) — Release B ------------

// K-13 [E*] (provisional EVIDENCE-032) / [A] — the `direct` tier.
export const SAME_REPS_TOLERANCE = 1;

// K-14 / K-15 [P] / [A] — the `nearby` tier, directional.
export const NEARBY_REPS_MAX_DOWN = 3;
export const NEARBY_REPS_MAX_UP = 2;

// K-16 / K-17 [A] — the `far` tier, directional. Beyond these the system
// refuses (`REP_DISTANCE_TOO_FAR`); the evaluation's `MAX_REP_DISTANCE = 8`
// and `FAR_REP_DISTANCE = 6` are removed, not relaxed.
export const MAX_REP_DISTANCE_DOWN = 4;
export const MAX_REP_DISTANCE_UP = 3;

// K-23 [P] calibrated (2 x noise) — Release B: pooled cross-check; the direct
// tier is exempt because same-rep evidence outranks any pooled conversion.
export const TIER_VS_POOLED_DISAGREE_PCT = 2 * NOISE_SD_PCT;

// K-24 [P] calibrated (1 + one noise unit); [E*] for the need — Release B:
// the global upward cap, applied on every tier.
export const UPWARD_LOAD_CAP_FACTOR = 1 + NOISE_SD_PCT / 100;

// --- Target effort bounds (revision §9.4) ----------------------------------
// Consumed by Release A's what-if calculator and by Release B's suggestion.

// K-18 [P] — never translate to a near-maximal target from an advisory
// surface.
export const TARGET_RTF_MIN = 3;

// K-19 [A] / [P] — 13..15 is allowed and flagged `EXTENDED_TARGET_EFFORT`;
// above 15 the target leaves the formula's usable domain. The target ceiling
// is higher than the source ceiling because a high-RTF *target* divides by a
// too-large multiplier and therefore errs light — the conservative direction
// (revision §9.4; ADR-011).
export const TARGET_RTF_CORE_MAX = 12;
export const TARGET_RTF_MAX = 15;

// --- Exercise eligibility (revision §6.1, §9.7) ----------------------------

// K-37 [E*] / [P] — `bodyweight` needs a bodyweight join and a leverage
// fraction (D-3); `other` has no load semantics.
export const STRENGTH_ELIGIBLE_EQUIPMENT = ["barbell", "dumbbell", "cable", "machine"] as const;

// K-36 [E*] (the equipment-stratified source is not in the registry) —
// Release B: rep-invariance *variance* does not cancel under translation, so
// a suggestion on these is capped at medium confidence. The tracker takes no
// penalty: a stable per-exercise bias cancels in a within-athlete trend.
export const SUGGESTION_NOISIER_EQUIPMENT = ["cable", "dumbbell", "machine"] as const;
