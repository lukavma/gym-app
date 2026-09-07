// Metrics dashboard v1 — formatters not already covered by the reused
// `@/ui/strength/format` and `@/ui/volume/volumeDisplay` modules.
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §12.2 (date rendering rules — "no weekday names", the no-`Z` parse).

import { METRICS_PAGE_COPY } from "./copy";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatWeekStartName(weekStartsOn: number): string {
  return WEEKDAY_NAMES[weekStartsOn] ?? WEEKDAY_NAMES[1]!;
}

// "Sep 6" — single days via the same no-`Z` parse as `formatLocalDate`
// (`@/ui/strength/format`), but without the year (§12.2).
export function formatDayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// "07:41" — the one instant rendered as a local time-of-day (§5).
export function formatUpdatedTime(instant: string): string {
  return new Date(instant).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatCoverageCount(count: number, total: number): string {
  return `${count} of ${total} days`;
}

// L-2 — §4 M-8 / §12.2: "difference, signed" (the wireframe shows "−0.6
// kg"). A loss already stringifies with its own leading "-"; only a gain
// needs an explicit "+" (a zero change is shown bare, neither a gain nor a
// loss).
export function formatSignedKg(valueKg: number): string {
  const sign = valueKg > 0 ? "+" : "";
  return `${sign}${valueKg} kg`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// L-2 — the "highest" value dropped its unit; every value in this line now
// carries " kg" consistently. Pure (no JSX), so it lives here rather than in
// `BodyweightCard.tsx` and can be unit-tested directly.
export function bodyweightSummaryLine(
  series: readonly { date: string; weightKg: number }[],
): string {
  if (series.length === 0) {
    return `${METRICS_PAGE_COPY.bodyweightSparklineSummaryPrefix} · ${METRICS_PAGE_COPY.bodyweightSummaryNoEntries}`;
  }
  const first = series[0]!;
  const latest = series[series.length - 1]!;
  const values = series.map((point) => point.weightKg);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return (
    `${METRICS_PAGE_COPY.bodyweightSparklineSummaryPrefix} · ${series.length} ${METRICS_PAGE_COPY.bodyweightSummaryEntriesWord} · ` +
    `${METRICS_PAGE_COPY.bodyweightSummaryFirst} ${first.weightKg} kg · ${METRICS_PAGE_COPY.bodyweightLatestLabel} ${latest.weightKg} kg · ` +
    `${METRICS_PAGE_COPY.bodyweightSummaryLowest} ${lowest} kg · ${METRICS_PAGE_COPY.bodyweightSummaryHighest} ${highest} kg`
  );
}
