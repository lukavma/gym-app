import type { PerformedSet } from "./engine";

// Weights are numeric(6,2) kg in the schema — two decimals is the exact
// domain precision, so re-rounding to it after float arithmetic is lossless.
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// progression-engine.md §2 output rule — "absolute next-session targets,
// rounded to loadStepKg": nearest multiple of the step (half rounds up).
export function roundToStepKg(loadKg: number, stepKg: number): number {
  if (stepKg <= 0) return round2(loadKg);
  return round2(Math.round(loadKg / stepKg) * stepKg);
}

export interface ModalLoadResult {
  loadKg: number;
  // §8 — mixed loads within work sets are flagged in the inputs summary and
  // cap confidence at medium.
  mixed: boolean;
}

// progression-engine.md §4.1 — "modal working weight of sets # guards
// against typo outliers". Most frequent work-set weight; ties break to the
// earliest-logged occurrence (the first work set is conventionally the
// working weight), which keeps the result deterministic.
export function modalWorkingLoad(sets: readonly PerformedSet[]): ModalLoadResult {
  if (sets.length === 0) return { loadKg: 0, mixed: false };
  const counts = new Map<number, { count: number; firstIndex: number }>();
  sets.forEach((set, index) => {
    const entry = counts.get(set.weightKg);
    if (entry) entry.count += 1;
    else counts.set(set.weightKg, { count: 1, firstIndex: index });
  });
  let best: { loadKg: number; count: number; firstIndex: number } | null = null;
  for (const [loadKg, { count, firstIndex }] of counts) {
    if (!best || count > best.count || (count === best.count && firstIndex < best.firstIndex)) {
      best = { loadKg, count, firstIndex };
    }
  }
  return { loadKg: best!.loadKg, mixed: counts.size > 1 };
}
