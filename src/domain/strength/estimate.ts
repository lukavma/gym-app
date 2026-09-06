// Estimated 1RM tracker — current, best, and the estimate's reason codes.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §8 (V-10 time semantics, V-11 freshness, V-12 derivation), §8.4 (the
// estimate-level code carrier the evaluation lacked — review RM-4), §11
// (confidence), §15.4 (the estimate-level code table).
//
// Everything recomputes on read. Editing or deleting a set moves `current`
// and `best` alike on the next request; nothing is cached and nothing is
// persisted (I-1).

import {
  BEST_UNCONFIRMED_PCT,
  CURRENT_SESSION_COUNT,
  EVIDENCE_WINDOW_DAYS,
  FRESH_DAYS_HIGH,
  FRESH_DAYS_MEDIUM,
  SPREAD_LOW_PCT,
  SPREAD_MEDIUM_PCT,
  STRENGTH_ALGORITHM,
} from "./constants";
import { minConfidence } from "./confidence";
import { calendarDaysBetween, lowerMedian, round2, spreadPct } from "./primitives";
import { ESTIMATE_REASON_CODES, OBSERVATION_REASON_CODES } from "./reasonCodes";
import type { ObservationReasonCode, StrengthReasonCode } from "./reasonCodes";
import type {
  StrengthBest,
  StrengthConfidence,
  StrengthEligibilityRefusal,
  StrengthEstimate,
  StrengthObservation,
} from "./types";

// V-11 — the six observation flags that cap the estimate's confidence at
// medium. Deliberately NOT the whole observation-level enum: an exclusion
// count and a deload badge are provenance, not a reason to distrust the
// number that remains.
const CONFIDENCE_CAPPING_FLAGS = new Set<ObservationReasonCode>([
  "RIR_MISSING_LOWER_BOUND",
  "RIR_MODERATE_RANGE",
  "EXTENDED_REP_RANGE",
  "MIXED_LOADS_IN_SESSION",
  "TOP_SET_GOVERNS",
  "SINGLE_SET_GROUP",
]);

// §8.1 — the ordering tiebreak, used EVERYWHERE, so the result cannot depend
// on input order (I-5, A-5). The instant is compared as epoch milliseconds,
// never as a string; the server's precondition is that every `startedAt` it
// passes came from `toISOString()`.
export function compareObservations(a: StrengthObservation, b: StrengthObservation): number {
  if (a.performedOn !== b.performedOn) return a.performedOn < b.performedOn ? -1 : 1;
  const aMs = Date.parse(a.startedAt);
  const bMs = Date.parse(b.startedAt);
  if (aMs !== bMs) return aMs - bMs;
  if (a.sessionId === b.sessionId) return 0;
  return a.sessionId < b.sessionId ? -1 : 1;
}

const CODE_ORDER = new Map<string, number>([
  ...ESTIMATE_REASON_CODES.map((code, index) => [code, index] as const),
  ...OBSERVATION_REASON_CODES.map(
    (code, index) => [code, ESTIMATE_REASON_CODES.length + index] as const,
  ),
]);

function orderCodes(codes: Iterable<StrengthReasonCode>): StrengthReasonCode[] {
  return [...new Set(codes)].sort(
    (a, b) =>
      (CODE_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (CODE_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

export interface DeriveEstimateInput {
  observations: readonly StrengthObservation[];
  asOfLocalDate: string;
}

export interface DerivedEstimate {
  estimate: StrengthEstimate;
  // The evidence-window observations (deload rows included, §6.3/O-10), in
  // ascending order — the trend's source. Observations after `asOf` are not
  // here, because they contribute to nothing (I-6).
  windowObservations: readonly StrengthObservation[];
}

// A-30 — an ineligible exercise refuses "everywhere": the estimate itself
// carries the refusal code, so the page, the endpoint and the what-if all
// speak with one voice instead of the UI inventing a second rule.
export function disabledEstimate(
  reasonCode: StrengthEligibilityRefusal,
  asOfLocalDate: string,
): StrengthEstimate {
  return {
    currentE1rmKg: null,
    best: null,
    confidence: "low",
    reasonCodes: [reasonCode],
    poolSessionIds: [],
    poolSpreadPct: null,
    latestPoolAgeDays: null,
    staleObservationCount: 0,
    deloadObservationCount: 0,
    algorithm: STRENGTH_ALGORITHM,
    asOfLocalDate,
  };
}

export function deriveEstimate({
  observations,
  asOfLocalDate,
}: DeriveEstimateInput): DerivedEstimate {
  const sorted = [...observations].sort(compareObservations);

  // I-6 — an observation dated after `asOf` affects neither `current`, `best`,
  // `staleObservationCount`, nor the trend (A-6, review RM-2). A future date
  // is not "stale"; it is simply not yet visible.
  const past = sorted.filter((o) => calendarDaysBetween(o.performedOn, asOfLocalDate) >= 0);
  const nonDeloadPast = past.filter((o) => !o.isDeload);
  const deloadObservationCount = past.length - nonDeloadPast.length;

  // V-10 — `performedOn ∈ [asOf − (EVIDENCE_WINDOW_DAYS − 1), asOf]`, in
  // ACCOUNT-TIMEZONE calendar days. A session on `asOf − 89` is in; `asOf − 90`
  // is out (A-7). This is a data-FRESHNESS rule, never a detraining claim
  // (V-11): no copy derived from it may say the athlete's strength declined.
  const inWindow = nonDeloadPast.filter(
    (o) => calendarDaysBetween(o.performedOn, asOfLocalDate) <= EVIDENCE_WINDOW_DAYS - 1,
  );
  const windowObservations = past.filter(
    (o) => calendarDaysBetween(o.performedOn, asOfLocalDate) <= EVIDENCE_WINDOW_DAYS - 1,
  );
  const staleObservationCount = nonDeloadPast.length - inWindow.length;

  // V-12 — the pool is the most recent CURRENT_SESSION_COUNT (3) non-deload
  // observations in the window; `current` is their lower median. Three is the
  // minimum count at which a median rejects one outlier — no evidence
  // identifies any count, so this is a labelled convention (D-10 keeps the
  // widening trigger).
  const pool = inWindow.slice(-CURRENT_SESSION_COUNT);
  const poolValues = pool.map((o) => o.e1rmKg);
  const currentE1rmKg = poolValues.length > 0 ? lowerMedian(poolValues) : null;
  // Two values, deliberately: the EXACT ratio drives every threshold
  // comparison below, and only the DTO field is rounded for display. Comparing
  // the rounded value silences a 20.003 % spread at exactly 20.00 (review
  // F-1).
  const poolSpreadExactPct = poolValues.length > 0 ? spreadPct(poolValues) : null;
  const poolSpreadPct = poolSpreadExactPct === null ? null : round2(poolSpreadExactPct);

  // §8.3 — `best` is bounded by `asOf` too (review RM-2), and ties break to
  // the EARLIEST observation, which `sorted` already gives us by scanning
  // ascending with a strict `>`.
  let bestObservation: StrengthObservation | null = null;
  for (const observation of nonDeloadPast) {
    if (!bestObservation || observation.e1rmKg > bestObservation.e1rmKg) {
      bestObservation = observation;
    }
  }
  let best: StrengthBest | null = null;
  if (bestObservation) {
    const winner = bestObservation;
    // §8.3 — "unconfirmed" when no OTHER non-deload past observation reaches
    // 90 % of it. 10 % is one noise unit, the best-calibrated threshold in
    // the family; it is still a convention, not a measurement.
    //
    // The product is compared UNROUNDED. §8.3 writes the test as
    // "e1rmKg >= best x (1 - BEST_UNCONFIRMED_PCT / 100)" and defines no
    // rounding; rounding the threshold first lowers it by up to half a cent
    // and can call a best CONFIRMED that the rule leaves unconfirmed —
    // 139.36's threshold is 125.424, which `round2` turns into 125.42, exactly
    // the value of the only other observation (review F-1). e1RMs sit on a
    // 0.01 kg grid, so this knife edge is reachable, and it errs in the
    // non-conservative direction.
    const threshold = winner.e1rmKg * (1 - BEST_UNCONFIRMED_PCT / 100);
    const confirmed = nonDeloadPast.some(
      (o) => o.sessionId !== winner.sessionId && o.e1rmKg >= threshold,
    );
    best = {
      e1rmKg: winner.e1rmKg,
      performedOn: winner.performedOn,
      sessionId: winner.sessionId,
      unconfirmed: !confirmed,
    };
  }

  const latest = pool.at(-1) ?? null;
  const latestPoolAgeDays = latest ? calendarDaysBetween(latest.performedOn, asOfLocalDate) : null;

  const codes = new Set<StrengthReasonCode>();
  if (past.length === 0) codes.add("NO_ELIGIBLE_SETS");
  else if (inWindow.length === 0) codes.add("NO_RECENT_EVIDENCE");
  if (pool.length === 1) codes.add("SINGLE_SESSION_EVIDENCE");
  if (pool.length === 2) codes.add("TWO_SESSION_EVIDENCE");
  // §15.4 gives EVIDENCE_AGING and EVIDENCE_OLD disjoint day ranges
  // (22-42 / 43-90), so only the stronger of the two is emitted.
  if (latestPoolAgeDays !== null && latestPoolAgeDays > FRESH_DAYS_MEDIUM)
    codes.add("EVIDENCE_OLD");
  else if (latestPoolAgeDays !== null && latestPoolAgeDays > FRESH_DAYS_HIGH) {
    codes.add("EVIDENCE_AGING");
  }
  // Same treatment for the spread pair: "> 20 %" and "> 30 %" are read as the
  // two levels of one signal, so a 34 % spread says VERY_WIDE once rather
  // than saying WIDE and VERY_WIDE together (A-8's `[136, 180]` fixture).
  if (poolSpreadExactPct !== null && poolSpreadExactPct > SPREAD_LOW_PCT) {
    codes.add("ESTIMATE_SPREAD_VERY_WIDE");
  } else if (poolSpreadExactPct !== null && poolSpreadExactPct > SPREAD_MEDIUM_PCT) {
    codes.add("ESTIMATE_SPREAD_WIDE");
  }
  if (best?.unconfirmed) codes.add("BEST_UNCONFIRMED");
  if (deloadObservationCount > 0) codes.add("DELOAD_SESSIONS_EXCLUDED");
  // §8.4 — plus every distinct observation-level flag of any POOL
  // observation, propagated once.
  for (const observation of pool) for (const code of observation.reasonCodes) codes.add(code);

  const caps: StrengthConfidence[] = [];
  if (pool.length === 0) caps.push("low");
  if (pool.length === 1) caps.push("low");
  if (pool.length === 2) caps.push("medium");
  if (latestPoolAgeDays !== null && latestPoolAgeDays > FRESH_DAYS_MEDIUM) caps.push("low");
  else if (latestPoolAgeDays !== null && latestPoolAgeDays > FRESH_DAYS_HIGH) caps.push("medium");
  if (poolSpreadExactPct !== null && poolSpreadExactPct > SPREAD_LOW_PCT) caps.push("low");
  else if (poolSpreadExactPct !== null && poolSpreadExactPct > SPREAD_MEDIUM_PCT)
    caps.push("medium");
  if (pool.some((o) => o.flags.some((flag) => CONFIDENCE_CAPPING_FLAGS.has(flag)))) {
    caps.push("medium");
  }

  return {
    estimate: {
      currentE1rmKg,
      best,
      confidence: minConfidence(...caps),
      reasonCodes: orderCodes(codes),
      poolSessionIds: pool.map((o) => o.sessionId),
      poolSpreadPct,
      latestPoolAgeDays,
      staleObservationCount,
      deloadObservationCount,
      algorithm: STRENGTH_ALGORITHM,
      asOfLocalDate,
    },
    windowObservations,
  };
}
