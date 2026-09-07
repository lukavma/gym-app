"use client";

// Metrics dashboard v1 — the Bodyweight card's 90-day sparkline (M-9).
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §20 step 3: "a sibling of the strength one with two behavioural
// differences: `x` is the entry's day index in [D-89, D] ... not the point
// index the strength component uses; and it draws circles only, no
// `polyline` — the strength component's connecting line across a 10-day gap
// would read as interpolation (RL-2); no deload semantics." Duplicated on
// purpose so `src/ui/strength/**` stays untouched (D-7).

import { calendarDaysBetween } from "@/domain/strength/primitives";
import { addDays } from "@/domain/volume/weekBuckets";

interface BodyweightSparklinePoint {
  date: string;
  weightKg: number;
}

interface BodyweightSparklineProps {
  points: readonly BodyweightSparklinePoint[];
  asOfLocalDate: string;
  label: string;
}

const WIDTH = 320;
const HEIGHT = 56;
const PADDING = 4;
const WINDOW_DAYS = 89; // [D-89, D]

export function BodyweightSparkline({ points, asOfLocalDate, label }: BodyweightSparklineProps) {
  // L-1 — M-9's "fewer than 2 entries -> no sparkline" is about the CHART
  // only; §13's text alternative (the summary line `BodyweightCard.tsx`
  // computes into `label`) must still render for 0 or 1 entries, not
  // disappear along with the chart it stands in for.
  const showChart = points.length >= 2;
  const windowStart = addDays(asOfLocalDate, -WINDOW_DAYS);
  const values = points.map((point) => point.weightKg);
  const min = showChart ? Math.min(...values) : 0;
  const max = showChart ? Math.max(...values) : 0;
  const span = max - min;

  const x = (dayIndex: number) => PADDING + (dayIndex / WINDOW_DAYS) * (WIDTH - 2 * PADDING);
  const y = (value: number) =>
    span === 0 ? HEIGHT / 2 : HEIGHT - PADDING - ((value - min) / span) * (HEIGHT - 2 * PADDING);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
      {showChart ? (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {points.map((point) => {
            const dayIndex = calendarDaysBetween(windowStart, point.date);
            return (
              <circle
                key={point.date}
                cx={x(dayIndex)}
                cy={y(point.weightKg)}
                r={2.5}
                fill="currentColor"
                className="text-slate-300"
              />
            );
          })}
        </svg>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
