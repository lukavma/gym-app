// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §15.4
// (the eight example lines) and O-8 (duration's additional `m:ss` display at
// or above 60 s).
//
// May import only from `./profile` (I-10) — zero framework/React import, so
// it stays callable from a Node context, a test, and a client component
// alike. This is the one shared formatter `ExerciseCard.tsx`,
// `HistoryDetail.tsx` and the bundle-rendered previous sets all replace their
// inline templates with.
//
// Numbers are printed in their own JS string form, matching the house
// convention (`src/ui/strength/format.ts`'s `formatKg`, and the inline
// `{set.weightKg} kg × {set.reps}` templates this function replaces) — never
// `toFixed`, so a whole number never grows a trailing `.00`.
import type { LoadBasis, MeasurementProfile } from "./profile";

export interface FormattableSet {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
}

// §7.1's display column: `total`/`unspecified` render as `kg`, `per_hand` as
// `kg/hand`, `assistance` as `kg assist`. Applies to every load-bearing
// profile (`load_reps`, `load_distance`, `load_duration`) — §15.4 only shows
// the basis variants against `load_reps`, but §7.1 itself scopes the
// convention to "profiles with a load field", not to one profile.
function formatLoad(weightKg: number, loadBasis: LoadBasis | null): string {
  switch (loadBasis) {
    case "per_hand":
      return `${weightKg} kg/hand`;
    case "assistance":
      return `${weightKg} kg assist`;
    case "total":
    case "unspecified":
    case null:
      return `${weightKg} kg`;
  }
}

// O-8, accepted: at or above 60 s an `m:ss` form is additionally shown
// beside the plain seconds figure. The `m:ss` half floors to whole seconds —
// `numeric(7,2)` durations carry hundredths that a clock face can't render.
// Exported (not just used by `formatDurationS` below) so §15.3's workout-card
// input/edit context can show the same secondary rendering beside a
// logged-or-prefilled duration input without re-deriving this arithmetic —
// "check format.ts for a reusable helper before writing a new one for the
// input/edit context" (§15.3). Returns `null` under 60 s, matching the
// "additionally shown" wording: there is nothing extra to render there.
export function minutesSecondsLabel(durationS: number): string | null {
  if (durationS < 60) return null;
  const wholeSeconds = Math.floor(durationS);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// workout-prescription-context-architecture-evaluation.md §5.1 — the
// PRESCRIBED rest target, rendered for the workout card's existing
// prescription subtitle (`3 × 5 @ RIR 1-2 · Rest 2:30`). Reuses
// `minutesSecondsLabel` above rather than re-deriving the floor/divide
// arithmetic, per that helper's own instruction.
//
// Deliberately NOT `formatDurationS`'s dual `"150 s · 2:30"` form: that form
// exists so a *logged* set shows its stored figure beside a clock reading,
// whereas a prescribed rest target is only ever read as a clock, and the
// dual form would bloat a compact phone subtitle for no gain. Under 60 s
// `minutesSecondsLabel` returns null, so the plain-seconds form is the
// fallback: 45 -> "45 s", 60 -> "1:00".
export function formatRestSeconds(restSeconds: number): string {
  return minutesSecondsLabel(restSeconds) ?? `${restSeconds} s`;
}

function formatDurationS(durationS: number): string {
  const secondsLabel = `${durationS} s`;
  const mmss = minutesSecondsLabel(durationS);
  return mmss === null ? secondsLabel : `${secondsLabel} · ${mmss}`;
}

// §6.2 guarantees these are non-null on the profiles that reach each branch
// below; the cast documents that guarantee rather than re-deriving it here
// (matching `primitives.ts`'s `as number` on its own guaranteed-defined
// array access).
export function formatSetLine(
  profile: MeasurementProfile,
  loadBasis: LoadBasis | null,
  set: FormattableSet,
): string {
  switch (profile) {
    case "load_reps": {
      const line = `${formatLoad(set.weightKg as number, loadBasis)} × ${set.reps}`;
      return set.rir === null ? line : `${line} @ RIR ${set.rir}`;
    }
    case "reps":
      return `${set.reps} reps`;
    case "load_distance": {
      const line = `${formatLoad(set.weightKg as number, loadBasis)} · ${set.distanceM} m`;
      return set.durationS === null ? line : `${line} · ${formatDurationS(set.durationS)}`;
    }
    case "distance_time":
      return `${set.distanceM} m · ${formatDurationS(set.durationS as number)}`;
    case "duration":
      return formatDurationS(set.durationS as number);
    case "load_duration":
      return `${formatLoad(set.weightKg as number, loadBasis)} · ${formatDurationS(set.durationS as number)}`;
  }
}
