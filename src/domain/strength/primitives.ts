// Estimated 1RM tracker — arithmetic primitives.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §5 (definitions), §9.5 (operation order), §13 (formula), §16 K-01/K-02.
// Pure and deterministic: no DB, no framework, no clock, no `Date`.
//
// Operation order is **normative** so that the server and any future client
// caller produce byte-identical output (I-5): `setE1rm` rounds once, medians
// operate on already-rounded set values, a translation divides the rounded
// basis by `repMultiplier(targetRtf)`, and grid rounding is always the last
// step.
//
// These live here rather than in `@/domain/progression/loadHelpers` on
// purpose: §14.5 forbids `src/domain/strength/**` from importing
// `src/domain/progression/**`, and the two modules round in opposite
// directions (the engine rounds to the *nearest* step for a prescribed
// target; a strength estimate floors, so it can never suggest more than the
// evidence supports).

// Weights are `numeric(6,2)` kg in the schema — two decimals is the exact
// domain precision, so re-rounding to it after float arithmetic is lossless.
// Same helper body as `loadHelpers.ts`'s private `round2`, duplicated rather
// than imported for the boundary reason above.
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// K-02 — Epley with the observed-single convention `f(1) = 1`. Epley's raw
// `f(1) = 1.0333` would inflate a true single by 3.3 %; ADR-011 records the
// convention. `f(r) = 1 + r/30` for r >= 2.
export function repMultiplier(rtf: number): number {
  return rtf <= 1 ? 1 : 1 + rtf / 30;
}

// A per-set intermediate; never displayed alone (revision §5).
export function setE1rm(weightKg: number, rtf: number): number {
  return round2(weightKg * repMultiplier(rtf));
}

// Revision §5 — sort ascending, take index floor((n - 1) / 2).
// Integer-preserving and conservative for even n. Robust to ONE HIGH outlier
// for n >= 3 and deliberately **not** robust to a low one (§7.7): `[130, 132,
// 13]` yields 130. Copy must never call this "outlier-proof".
// Callers must pass a non-empty array.
export function lowerMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] as number;
}

// Revision §11 — a *range* relative to a low centre, so it reads
// systematically larger than a dispersion measure. Stated so "<= 20 %" is
// read correctly. Returns 0 for a non-positive centre rather than Infinity.
//
// Returned UNROUNDED. §11 defines the quantity as `(max - min) / lowerMedian`
// and the caps as firing at "> SPREAD_MEDIUM_PCT" / "> SPREAD_LOW_PCT"; it
// defines no rounding, and rounding before the comparison silences the
// threshold at a knife edge — `[133.33, 133.33, 160.00]` is 20.003 %, which
// `round2` turns into exactly 20.00 and therefore into no code and a higher
// confidence word (review F-1). Callers that DISPLAY the spread round it
// themselves; callers that COMPARE it must not. Same lesson as the
// plausibility ceiling in `observation.ts` (R-1).
export function spreadPct(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const centre = lowerMedian(values);
  if (centre <= 0) return 0;
  return ((Math.max(...values) - Math.min(...values)) / centre) * 100;
}

// Revision §9.5 step 6 — floor, never nearest. The `1e-9` epsilon absorbs
// binary-float error so an exact multiple is not pushed a whole step down.
// Consequence stated in the revision (RL-12): for sub-cent inputs the floor
// can exceed the raw value by less than 0.01 kg; after `round2` this is
// immaterial, and "rounding never increases" is asserted only for `round2`
// inputs. `stepKg <= 0` degrades to exact-value rounding (RL-11/A-18).
export function floorToStepKg(loadKg: number, stepKg: number): number {
  if (!Number.isFinite(loadKg)) return Number.NaN;
  if (!Number.isFinite(stepKg) || stepKg <= 0) return round2(loadKg);
  return round2(Math.floor(loadKg / stepKg + 1e-9) * stepKg);
}

// The band's upper edge is rounded **outward** (§8.5), so it needs the
// mirror of `floorToStepKg` with the epsilon in the other direction — an
// exact multiple must not be pushed a whole step up.
export function ceilToStepKg(loadKg: number, stepKg: number): number {
  if (!Number.isFinite(loadKg)) return Number.NaN;
  if (!Number.isFinite(stepKg) || stepKg <= 0) return round2(loadKg);
  return round2(Math.ceil(loadKg / stepKg - 1e-9) * stepKg);
}

// Display only (§8.5, O-18): the estimate itself is shown on the exercise's
// `loadStepKg` grid, nearest. The *band* around it rounds outward, and a
// *suggested load* floors — three different roundings for three different
// claims, which is why they are three functions.
export function roundToNearestStepKg(loadKg: number, stepKg: number): number {
  if (!Number.isFinite(loadKg)) return Number.NaN;
  if (!Number.isFinite(stepKg) || stepKg <= 0) return round2(loadKg);
  return round2(Math.round(loadKg / stepKg) * stepKg);
}

// Mode of a non-empty integer list, ties broken to the LOWEST value
// (revision §5, "modalReps (mode of reps, ties -> lowest)"). Deterministic
// regardless of input order.
export function modeTiesLow(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let bestValue = Number.POSITIVE_INFINITY;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value < bestValue)) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Revision §8.1 — all windows and ages are **calendar days in the account
// timezone**. The pure module only ever sees `YYYY-MM-DD` strings the server
// already resolved with `userLocalDateString`; it never sees an instant or a
// timezone. Same shape as `@/domain/scheduling/weekIndex`'s `parseDateOnly`,
// duplicated for the §14.5 import boundary.
export function localDateToDayNumber(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

// Whole calendar days between two local dates (`to - from`).
export function calendarDaysBetween(from: string, to: string): number {
  return localDateToDayNumber(to) - localDateToDayNumber(from);
}
