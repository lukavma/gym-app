// Metrics dashboard v1 — the Recovery card (M-10, M-11, M-12).
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §4, I-7. Recovery stays informational: the only derived values here are a
// count of days logged and a mean of `sleep_hours` — nothing combines two
// recovery fields, or any recovery field with any other card's data.

import { addDays } from "@/domain/volume/weekBuckets";
import type { RecoveryDayDto, RecoverySummaryDto } from "./types";

export interface RecoveryEntryRow {
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  readiness: number | null;
  soreness: number | null;
}

const WINDOW_DAYS = 6; // [D-6, D], 7 days total

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeRecovery(
  entries: readonly RecoveryEntryRow[],
  asOfLocalDate: string,
): RecoverySummaryDto {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));

  const days: RecoveryDayDto[] = [];
  for (let offset = WINDOW_DAYS; offset >= 0; offset--) {
    const date = addDays(asOfLocalDate, -offset);
    const entry = byDate.get(date);
    days.push({
      date,
      entry: entry
        ? {
            sleepHours: entry.sleepHours,
            sleepQuality: entry.sleepQuality,
            readiness: entry.readiness,
            soreness: entry.soreness,
          }
        : null,
    });
  }

  const daysLogged = days.filter((day) => day.entry !== null).length;

  const sleepValues = days
    .map((day) => day.entry?.sleepHours ?? null)
    .filter((value): value is number => value !== null);
  const meanSleepHours =
    sleepValues.length > 0
      ? {
          hours: round1(sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length),
          count: sleepValues.length,
        }
      : null;

  return { days, daysLogged, meanSleepHours };
}
