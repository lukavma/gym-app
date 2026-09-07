// Metrics dashboard v1 — the Bodyweight card (M-6, M-7, M-8, M-9).
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §4. All windows are account-local calendar days, expressed as day offsets
// from `asOfLocalDate` via `calendarDaysBetween` — the same primitive the
// tracker uses for its own evidence window, imported rather than duplicated
// (I-12 permits it).

import { calendarDaysBetween } from "@/domain/strength/primitives";
import type { BodyweightSummaryDto } from "./types";

export interface BodyweightEntryRow {
  date: string;
  weightKg: number;
}

const NINETY_DAY_WINDOW = 89; // [D-89, D]
const SEVEN_DAY_WINDOW = 6; // [D-6, D]
const THIRTY_DAY_OFFSET_MIN = 30; // [D-36, D-30]
const THIRTY_DAY_OFFSET_MAX = 36;
const MIN_AVERAGE_ENTRIES = 3; // [P] coverage floor, calibrated to nothing (M-7)

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function meanWeightKg(entries: readonly BodyweightEntryRow[]): number {
  return entries.reduce((sum, entry) => sum + entry.weightKg, 0) / entries.length;
}

// A-4 — a future-dated entry (`date > D`) is ignored everywhere.
function daysBeforeAsOf(entry: BodyweightEntryRow, asOfLocalDate: string): number {
  return calendarDaysBetween(entry.date, asOfLocalDate);
}

export function summarizeBodyweight(
  entries: readonly BodyweightEntryRow[],
  asOfLocalDate: string,
): BodyweightSummaryDto {
  const past = entries.filter((entry) => daysBeforeAsOf(entry, asOfLocalDate) >= 0);
  const withinNinety = past.filter(
    (entry) => daysBeforeAsOf(entry, asOfLocalDate) <= NINETY_DAY_WINDOW,
  );

  const series = [...withinNinety]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((entry) => ({ date: entry.date, weightKg: entry.weightKg }));

  let latest: { date: string; weightKg: number } | null = null;
  for (const entry of withinNinety) {
    if (!latest || entry.date > latest.date) {
      latest = { date: entry.date, weightKg: entry.weightKg };
    }
  }

  const sevenDay = withinNinety.filter(
    (entry) => daysBeforeAsOf(entry, asOfLocalDate) <= SEVEN_DAY_WINDOW,
  );
  const sevenDayAverage =
    sevenDay.length >= MIN_AVERAGE_ENTRIES
      ? { kg: round1(meanWeightKg(sevenDay)), entryCount: sevenDay.length }
      : null;

  const priorWindow = withinNinety.filter((entry) => {
    const days = daysBeforeAsOf(entry, asOfLocalDate);
    return days >= THIRTY_DAY_OFFSET_MIN && days <= THIRTY_DAY_OFFSET_MAX;
  });

  const thirtyDayChange =
    sevenDay.length >= MIN_AVERAGE_ENTRIES && priorWindow.length >= MIN_AVERAGE_ENTRIES
      ? {
          kg: round1(meanWeightKg(sevenDay) - meanWeightKg(priorWindow)),
          currentEntryCount: sevenDay.length,
          priorEntryCount: priorWindow.length,
        }
      : null;

  return {
    latest,
    sevenDayAverage,
    sevenDayEntryCount: sevenDay.length,
    thirtyDayChange,
    series,
  };
}
