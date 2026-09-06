// Estimated 1RM tracker — the one formatter every displayed value passes
// through.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §8.5 (V-13: the exercise's `loadStepKg` grid, ALWAYS followed by a
// ±NOISE_SD_PCT band rounded outward to the same grid) and §15.2's structural
// rule: "every rendered value passes through one formatter (`formatEstimate`)
// that applies the grid, prepends '≈', appends the band and 'est.' — a value
// cannot reach the screen without its label."
//
// Why the grid and not a bare kilogram: a 1 kg figure is a precision claim
// the evidence does not license. The individual error on an estimated maximum
// is around ±10 % (one SD), roughly three times a measured maximum's
// test-retest variation, so the band is REQUIRED copy, not optional
// decoration (O-18, research C-24/C-33).

import { NOISE_SD_PCT } from "@/domain/strength/constants";
import { ceilToStepKg, floorToStepKg, roundToNearestStepKg } from "@/domain/strength/primitives";

// Weights are printed raw everywhere else in this app (`{set.weightKg} kg`),
// so the grid value is printed the same way — its own JS string form, no
// `toFixed`, no thousands separator. Grid values are multiples of
// `loadStepKg` after `round2`, so this never produces a float tail.
export function formatKg(value: number): string {
  return String(value);
}

export interface EstimateBand {
  lowKg: number;
  highKg: number;
}

// The band brackets the RAW value, then rounds OUTWARD to the grid, so it can
// never be narrower than the evidence supports and can never invert.
export function estimateBand(valueKg: number, loadStepKg: number): EstimateBand {
  return {
    lowKg: floorToStepKg(valueKg * (1 - NOISE_SD_PCT / 100), loadStepKg),
    highKg: ceilToStepKg(valueKg * (1 + NOISE_SD_PCT / 100), loadStepKg),
  };
}

export function formatBand(band: EstimateBand): string {
  // En dash for a range, matching `formatScheme`'s "3 × 8–12".
  return `(likely ${formatKg(band.lowKg)}–${formatKg(band.highKg)})`;
}

// `≈ 140 kg (likely 125–155) est.` for 139.33 on a 2.5 kg step.
export function formatEstimate(valueKg: number, loadStepKg: number): string {
  const gridValue = roundToNearestStepKg(valueKg, loadStepKg);
  return `≈ ${formatKg(gridValue)} kg ${formatBand(estimateBand(valueKg, loadStepKg))} est.`;
}

// A translated load (the what-if calculator) is already ON the grid — it was
// floored, not rounded to nearest — and carries a band around the RAW
// translation, which §15.3 forbids re-centring on the shown load. On a coarse
// grid the shown load can therefore sit exactly on the band's lower edge:
// `loadStepKg = 5`, raw 24 renders "≈ 20 kg (likely 20–30) est.".
export function formatTranslatedLoad(loadKg: number, bandKg: readonly [number, number]): string {
  return `≈ ${formatKg(loadKg)} kg (likely ${formatKg(bandKg[0])}–${formatKg(bandKg[1])}) est.`;
}

// "110 kg × 5 @ RIR 2" — the app's canonical set line (`HistoryDetail.tsx`,
// `ExerciseCard.tsx`): `×` U+00D7, RIR omitted entirely when null.
export function formatGoverningSet(loadKg: number, reps: number, rir: number | null): string {
  return `${formatKg(loadKg)} kg × ${reps}${rir !== null ? ` @ RIR ${rir}` : ""}`;
}

// "today" / "3 days ago" / "6 weeks ago" — §15.3's freshness wording, stated
// as the DATA's age. Weeks once the count passes a fortnight, because that is
// how the document's own example reads and because a two-digit day count
// reads as more precision than a calendar-day rule carries.
export function formatSessionAge(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks ago`;
}

// `YYYY-MM-DD` rendered in the reader's locale without inventing a timezone —
// the same `T00:00:00` (no `Z`) parse `volumeDisplay.ts` uses for week labels.
export function formatLocalDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
