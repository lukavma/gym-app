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

// O-8, accepted: seconds are always shown; at or above 60 s an `m:ss` form
// is additionally shown beside it. The `m:ss` half floors to whole seconds —
// `numeric(7,2)` durations carry hundredths that a clock face can't render.
function formatDurationS(durationS: number): string {
  const secondsLabel = `${durationS} s`;
  if (durationS < 60) return secondsLabel;
  const wholeSeconds = Math.floor(durationS);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${secondsLabel} · ${minutes}:${String(seconds).padStart(2, "0")}`;
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
