import type { VolumeLandmarkDto } from "./types";

const KEY_LABELS: Record<string, string> = { mv: "MV", mev: "MEV", mav: "MAV", mrv: "MRV" };
const KEY_ORDER = ["mv", "mev", "mav", "mrv"];

// volume-model.md §4 — single values (`valueMin === valueMax`), ranges, and
// open-ended ceilings ("22+": `valueMin` set, `openEnded`, `valueMax` null)
// each render distinctly, matching how they're stored.
function formatLandmarkValue(landmark: VolumeLandmarkDto): string {
  if (landmark.openEnded) return `${landmark.valueMin}+`;
  if (
    landmark.valueMin !== null &&
    landmark.valueMax !== null &&
    landmark.valueMin !== landmark.valueMax
  ) {
    return `${landmark.valueMin}–${landmark.valueMax}`;
  }
  return `${landmark.valueMin ?? landmark.valueMax}`;
}

// "Show RP reference bands only where landmark rows exist" (implementation-
// plan.md Phase 6) — null when there are none, so the caller renders no
// band and no invented range (volume-model.md §4).
export function formatLandmarkSummary(landmarks: VolumeLandmarkDto[]): string | null {
  if (landmarks.length === 0) return null;
  const sorted = [...landmarks].sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));
  return sorted
    .map(
      (landmark) =>
        `${KEY_LABELS[landmark.key] ?? landmark.key.toUpperCase()} ${formatLandmarkValue(landmark)}`,
    )
    .join(" · ");
}

export function formatWeekRangeLabel(startDate: string, endDateExclusive: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const endInclusive = new Date(`${endDateExclusive}T00:00:00`);
  endInclusive.setDate(endInclusive.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(endInclusive)}`;
}
