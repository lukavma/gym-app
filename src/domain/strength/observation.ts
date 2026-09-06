// Estimated 1RM tracker — one completed session becomes one observation.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §7 (V-6 load groups and the modal group, V-7 sub-modal exclusion and the
// plausibility band, V-8 the set-count-invariant group e1RM, V-9 the
// governing group), §7.6 (flags), §15.4 (the observation-level code table).
//
// Why one observation per session at all: within-session sets are a
// fatigue-decayed, correlated sequence, not independent observations. What
// changed from the evaluation is the statistic, not the granularity.

import {
  GROUP_SET_POSITIONS,
  PLAUSIBILITY_FACTOR,
  RIR_NEAR_FAILURE_MAX,
  RTF_CORE_MAX,
} from "./constants";
import { classifySet } from "./eligibility";
import { lowerMedian, modeTiesLow, setE1rm } from "./primitives";
import { OBSERVATION_REASON_CODES } from "./reasonCodes";
import type { ObservationReasonCode } from "./reasonCodes";
import type {
  StrengthExcludedSetCounts,
  StrengthGroupPosition,
  StrengthLoadGroup,
  StrengthObservation,
  StrengthSessionInput,
} from "./types";

export interface BuildObservationResult {
  // Null when the session has zero eligible sets — the session then produces
  // no observation and is counted in `sessionsWithoutEligibleSets` (§6.3).
  observation: StrengthObservation | null;
  excludedSetCounts: StrengthExcludedSetCounts;
}

function emptyCounts(): StrengthExcludedSetCounts {
  return { warmup: 0, zeroLoad: 0, highRir: 0, highRep: 0, subModal: 0, implausible: 0 };
}

// §7.6 — the six `*_SETS_EXCLUDED` codes are DERIVED from the counts rather
// than emitted alongside them, so every one of them is reachable by
// construction (review RM-5) and none can drift out of step with the number
// the UI shows.
function exclusionCodes(counts: StrengthExcludedSetCounts): ObservationReasonCode[] {
  const codes: ObservationReasonCode[] = [];
  if (counts.zeroLoad > 0) codes.push("ZERO_LOAD_SETS_EXCLUDED");
  if (counts.highRir > 0) codes.push("HIGH_RIR_SETS_EXCLUDED");
  if (counts.highRep > 0) codes.push("HIGH_REP_SETS_EXCLUDED");
  if (counts.subModal > 0) codes.push("SUB_MODAL_SETS_EXCLUDED");
  if (counts.implausible > 0) codes.push("IMPLAUSIBLE_SETS_EXCLUDED");
  return codes;
}

const ENUM_ORDER = new Map(OBSERVATION_REASON_CODES.map((code, index) => [code, index]));

function orderCodes(codes: Iterable<ObservationReasonCode>): ObservationReasonCode[] {
  return [...new Set(codes)].sort((a, b) => (ENUM_ORDER.get(a) ?? 0) - (ENUM_ORDER.get(b) ?? 0));
}

interface DraftGroup {
  loadKg: number;
  positions: StrengthGroupPosition[];
  allReps: number[];
  setCount: number;
}

// V-8 — the group's value comes from its FIRST UP TO THREE sets in
// set-number order. Sets 4+ enter `setCount` only. This is what makes the
// evaluation's claim "set count feeds confidence, not the value" true by
// construction instead of false: `110x5` at RIR 3,3,2,2,1 yields 139.33
// whether three sets or five were logged (I-12, A-3). The value depends on
// set ORDER, which is the point — the first three sets are the freshest,
// which is what a 1RM estimate should measure.
function finishGroup(
  draft: DraftGroup,
): Omit<StrengthLoadGroup, "status" | "isModal" | "isGoverning"> {
  const first = draft.positions.slice(0, GROUP_SET_POSITIONS);
  const reportedRir = first.map((p) => p.rir).filter((rir): rir is number => rir !== null);
  const flags: ObservationReasonCode[] = [];
  if (first.some((p) => p.rir === null)) flags.push("RIR_MISSING_LOWER_BOUND");
  if (first.some((p) => p.rir !== null && p.rir > RIR_NEAR_FAILURE_MAX)) {
    flags.push("RIR_MODERATE_RANGE");
  }
  if (first.some((p) => p.rtf > RTF_CORE_MAX)) flags.push("EXTENDED_REP_RANGE");
  return {
    loadKg: draft.loadKg,
    setCount: draft.setCount,
    modalReps: modeTiesLow(draft.allReps),
    medianRir: reportedRir.length > 0 ? lowerMedian(reportedRir) : null,
    rirComplete: reportedRir.length === first.length,
    e1rmKg: lowerMedian(first.map((p) => p.e1rmKg)),
    positions: first,
    flags,
  };
}

export function buildObservation(session: StrengthSessionInput): BuildObservationResult {
  const counts = emptyCounts();
  // I-5 — set order comes from `setNumber`, never from input order.
  const ordered = [...session.sets].sort((a, b) => a.setNumber - b.setNumber);

  const drafts = new Map<number, DraftGroup>();
  for (const set of ordered) {
    const classification = classifySet(set);
    if (!classification.eligible) {
      counts[classification.bucket] += 1;
      continue;
    }
    const draft = drafts.get(set.weightKg) ?? {
      loadKg: set.weightKg,
      positions: [],
      allReps: [],
      setCount: 0,
    };
    draft.setCount += 1;
    draft.allReps.push(set.reps);
    if (draft.positions.length < GROUP_SET_POSITIONS) {
      draft.positions.push({
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        rir: set.rir,
        rtf: classification.rtf,
        e1rmKg: setE1rm(set.weightKg, classification.rtf),
      });
    }
    drafts.set(set.weightKg, draft);
  }

  if (drafts.size === 0) return { observation: null, excludedSetCounts: counts };

  const finished = [...drafts.values()].sort((a, b) => a.loadKg - b.loadKg).map(finishGroup);

  // V-6 — the modal group has the most sets; TIES BREAK TO THE HEAVIEST LOAD.
  // Deliberately NOT the engine's `modalWorkingLoad` (ties -> earliest, which
  // stays unchanged): for the engine "the first work set is conventionally
  // the working weight", but for a strength estimate the freshest, heaviest,
  // lowest-rep set is the least biased observation available. So when nothing
  // repeats — an ascending pyramid, or a single top set after an unflagged
  // ramp — the heaviest group anchors the session.
  //
  // Trade-off, accepted and stated: in a two-set session with an
  // order-of-magnitude typo (`110x5, 1100x5`) the typo anchors. It is visible
  // on the trend, editable from History, and labelled "unconfirmed" as `best`.
  let modal = finished[0] as (typeof finished)[number];
  for (const group of finished) {
    if (group.setCount > modal.setCount) modal = group;
    else if (group.setCount === modal.setCount && group.loadKg > modal.loadKg) modal = group;
  }

  // V-7 — sub-modal groups are excluded outright (ramp, back-off, drop set).
  // A supra-modal group is admitted only when its e1RM is within
  // PLAUSIBILITY_FACTOR (1.20 = two noise units) of the modal group's.
  //
  // The admission filter is by LOAD, not by implied e1RM. A sub-modal group
  // whose e1RM exceeds the modal group's is still discarded: `100x12 @ RIR 0`
  // (140.00) logged alongside `3 x 110x5 @ RIR 2` (135.67) yields 135.67,
  // because a lighter group is presumed to be a ramp, back-off or drop set
  // regardless of what it implies. This is the deliberate mirror of V-9's "do
  // not silently prefer the back-off": heavier evidence may govern when
  // plausible, lighter evidence never does.
  // V-7 states the test as "at most `PLAUSIBILITY_FACTOR × (modal group
  // e1RM)`" and defines no rounding of the ceiling, so the product is used
  // unrounded. Rounding it to two decimals first would raise the ceiling by
  // up to 0.005 kg whenever the product's third decimal is 5-9, admitting a
  // group the rule excludes — and because an admitted supra-modal group then
  // GOVERNS under V-9, that 0.005 kg can move the whole session's value by
  // twenty per cent. §22's printed ceilings (162.80 for a modal 135.67) are
  // the exact product shown to two decimals, not a rounded input to the
  // comparison.
  const ceiling = modal.e1rmKg * PLAUSIBILITY_FACTOR;
  const classified: StrengthLoadGroup[] = finished.map((group) => {
    if (group === modal) {
      return { ...group, status: "admitted", isModal: true, isGoverning: false };
    }
    if (group.loadKg < modal.loadKg) {
      counts.subModal += group.setCount;
      return { ...group, status: "sub_modal", isModal: false, isGoverning: false };
    }
    if (group.e1rmKg > ceiling) {
      counts.implausible += group.setCount;
      return { ...group, status: "implausible", isModal: false, isGoverning: false };
    }
    return { ...group, status: "admitted", isModal: false, isGoverning: false };
  });

  const admitted = classified.filter((group) => group.status === "admitted");

  // V-9 — among admitted groups the observation's value is the MAXIMUM group
  // e1RM. Ties break to the heaviest load, then to the earliest set number,
  // so the choice is deterministic for any input order (I-5).
  let governing = admitted[0] as StrengthLoadGroup;
  for (const group of admitted) {
    if (group.e1rmKg > governing.e1rmKg) governing = group;
    else if (group.e1rmKg === governing.e1rmKg && group.loadKg > governing.loadKg)
      governing = group;
  }
  const governingIndex = classified.indexOf(governing);
  classified[governingIndex] = { ...governing, isGoverning: true };
  governing = classified[governingIndex] as StrengthLoadGroup;

  const flags: ObservationReasonCode[] = [];
  // §7.6 — the set-quality flags come from ADMITTED groups' first three sets
  // only; an excluded group's sets never speak for the session.
  for (const group of admitted) flags.push(...group.flags);
  if (admitted.length > 1) flags.push("MIXED_LOADS_IN_SESSION");
  if (!governing.isModal) flags.push("TOP_SET_GOVERNS");
  if (governing.setCount === 1) flags.push("SINGLE_SET_GROUP");
  if (session.isDeload) flags.push("DELOAD_SESSION");

  const orderedFlags = orderCodes(flags);

  return {
    observation: {
      sessionId: session.sessionId,
      performedOn: session.performedOn,
      startedAt: session.startedAt,
      isDeload: session.isDeload,
      groups: classified,
      governingGroupLoadKg: governing.loadKg,
      governingGroupReps: governing.modalReps,
      governingGroupMedianRir: governing.medianRir,
      e1rmKg: governing.e1rmKg,
      flags: orderedFlags,
      excludedSetCounts: counts,
      reasonCodes: orderCodes([...orderedFlags, ...exclusionCodes(counts)]),
    },
    excludedSetCounts: counts,
  };
}
