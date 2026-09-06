"use client";

// Estimated 1RM tracker — the trend sparkline.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §15.1: "inline SVG sparkline (OD-04 stays open, N-7)". Hand-written SVG on
// purpose — N-7 is "no charting library decision", and OD-04 (the charting
// library for the Phase 9 dashboard) stays open precisely because this does
// not decide it. No dependency, no `style=` attribute, colours from the
// existing slate palette.
//
// Deload points are drawn but not connected into the line, matching the trend
// list: shown, badged, not counted (§6.3, O-10).
//
// The chart is decoration over data that is also present as text below it —
// the app's norm is that every number shown exists in readable form — so the
// SVG is `aria-hidden` and the section carries a text summary instead.

interface SparklinePoint {
  performedOn: string;
  e1rmKg: number;
  isDeload: boolean;
}

interface SparklineProps {
  points: readonly SparklinePoint[];
  label: string;
}

const WIDTH = 320;
const HEIGHT = 56;
const PADDING = 4;

export function Sparkline({ points, label }: SparklineProps) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.e1rmKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const x = (index: number) => PADDING + (index / (points.length - 1)) * (WIDTH - 2 * PADDING);
  // A flat series would divide by zero; draw it down the middle instead.
  const y = (value: number) =>
    span === 0 ? HEIGHT / 2 : HEIGHT - PADDING - ((value - min) / span) * (HEIGHT - 2 * PADDING);

  const counted = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => !point.isDeload);
  const linePoints = counted.map(({ point, index }) => `${x(index)},${y(point.e1rmKg)}`).join(" ");

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {counted.length >= 2 ? (
          <polyline
            points={linePoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-slate-400"
          />
        ) : null}
        {points.map(({ performedOn, e1rmKg, isDeload }, index) => (
          <circle
            key={`${performedOn}-${index}`}
            cx={x(index)}
            cy={y(e1rmKg)}
            r={isDeload ? 2 : 2.5}
            fill="currentColor"
            className={isDeload ? "text-amber-400" : "text-slate-300"}
          />
        ))}
      </svg>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
