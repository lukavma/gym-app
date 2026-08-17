// prescription-model.md §4 — load prescription chain, Phase 3 subset (no
// Decision layer yet — that's Phase 4):
//   1. last completed, non-deload session's first work-set load for this
//      exercise (most recent wins)
//   2. else prescription.baselineLoadKg
//   3. else empty (null — the user types the first load themselves)
//
// Deliberately pure: the caller (server/today service) is responsible for
// querying candidate sessions and computing each one's first work-set load
// (the lowest `set_number` among non-warmup sets); this function only
// applies the ordering + fallback rule, which keeps it fully unit-testable
// without a database.
export interface CarryForwardCandidate {
  status: "in_progress" | "completed" | "discarded";
  isDeload: boolean;
  startedAt: string; // ISO 8601 — used for recency ordering
  firstWorkSetLoadKg: number | null; // null if no non-warmup set was logged
}

export function resolveCarryForwardLoadKg(
  candidates: readonly CarryForwardCandidate[],
  baselineLoadKg: number | null,
): number | null {
  const eligible = candidates
    .filter((c) => c.status === "completed" && !c.isDeload && c.firstWorkSetLoadKg !== null)
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const latest = eligible[0];
  if (latest && latest.firstWorkSetLoadKg !== null) return latest.firstWorkSetLoadKg;
  if (baselineLoadKg !== null) return baselineLoadKg;
  return null;
}
