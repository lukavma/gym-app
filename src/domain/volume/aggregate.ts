import {
  LEAF_MUSCLE_GROUP_SLUGS,
  ROLLUP_MEMBERS,
  ROLLUP_MUSCLE_GROUP_SLUGS,
  isLeafMuscleGroupSlug,
  isRollupMuscleGroupSlug,
  type LeafMuscleGroupSlug,
  type MuscleGroupSlug,
  type RollupMuscleGroupSlug,
} from "@/domain/exercises/muscleGroups";
import type { ContributionRole } from "@/domain/exercises/schema";

// volume-model.md §2's aggregation pseudocode, implemented literally. Pure,
// deterministic, no DB/framework/network/clock — the caller (server layer)
// is responsible for querying the qualifying rows and for turning calendar-
// or block-week date windows into the UTC instant windows this function
// bucket-compares against.
//
// One row per (work-or-warmup set, muscle contribution of its exercise) —
// i.e. already the join of set_logs x exercise_muscle_contributions (using
// *current* contribution rows, never a snapshot — volume-model.md §3). A
// set with N contribution rows appears N times, once per row; `setId` is
// what lets the rollup's raw dedup collapse those back to "once per set".
export interface WorkSetContributionRow {
  setId: string;
  // ISO instant of the owning session's `startedAt` (domain-model.md §7 —
  // sessions are atomic for volume; a session spanning midnight stays in
  // its start week).
  sessionStartedAt: string;
  isDeload: boolean;
  isWarmup: boolean;
  muscleGroupId: MuscleGroupSlug;
  role: ContributionRole;
  weight: number;
}

// Half-open instant window `[startInstant, endInstant)`, already resolved
// from a local calendar-date window against the user's timezone (or a block
// week's date arithmetic) — see `@/server/time/userLocalDate`'s
// `localDateToUtcInstant`. `startDate`/`endDateExclusive` are carried
// through only as report labels.
export interface InstantWeekWindow {
  startDate: string;
  endDateExclusive: string;
  startInstant: string;
  endInstant: string;
}

export interface MuscleVolume {
  effective: number;
  raw: number;
}

export interface RollupVolume extends MuscleVolume {
  // volume-model.md §1 — weight of legacy *direct* rollup contributions
  // (e.g. a user-created exercise still carrying a direct `back` row).
  // Always a component of `effective`, never folded into a leaf.
  unclassified: number;
}

export interface WeekVolumeReport {
  startDate: string;
  endDateExclusive: string;
  // domain-model.md §7 / volume-model.md §2 — true when any session with a
  // work set counted in this week has `isDeload = true`. The week's data is
  // never excluded or reduced for this — it's a display flag only.
  isDeload: boolean;
  leaves: Record<LeafMuscleGroupSlug, MuscleVolume>;
  rollups: Record<RollupMuscleGroupSlug, RollupVolume>;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function emptyLeafTotals(): Record<LeafMuscleGroupSlug, MuscleVolume> {
  return Object.fromEntries(
    LEAF_MUSCLE_GROUP_SLUGS.map((slug) => [slug, { effective: 0, raw: 0 }]),
  ) as Record<LeafMuscleGroupSlug, MuscleVolume>;
}

function aggregateWeek(
  workRows: readonly WorkSetContributionRow[],
  window: InstantWeekWindow,
): WeekVolumeReport {
  const startMs = Date.parse(window.startInstant);
  const endMs = Date.parse(window.endInstant);
  const inWindow = workRows.filter((row) => {
    const t = Date.parse(row.sessionStartedAt);
    return t >= startMs && t < endMs;
  });

  const leaves = emptyLeafTotals();
  const unclassified = Object.fromEntries(
    ROLLUP_MUSCLE_GROUP_SLUGS.map((slug) => [slug, 0]),
  ) as Record<RollupMuscleGroupSlug, number>;

  for (const row of inWindow) {
    if (isLeafMuscleGroupSlug(row.muscleGroupId)) {
      const leaf = leaves[row.muscleGroupId];
      leaf.effective += row.weight;
      if (row.role === "primary") leaf.raw += 1;
    } else if (isRollupMuscleGroupSlug(row.muscleGroupId)) {
      // Legacy direct rollup row (e.g. an unclassified `back` contribution)
      // — counted regardless of role, per volume-model.md §1's definition
      // of Unclassified Back.
      unclassified[row.muscleGroupId] += row.weight;
    }
  }
  for (const leaf of LEAF_MUSCLE_GROUP_SLUGS) {
    leaves[leaf] = { effective: round2(leaves[leaf].effective), raw: leaves[leaf].raw };
  }

  // Raw rollup dedup — "once per set, never per contribution"
  // (volume-model.md §2), and only from a *primary* contribution on a
  // member leaf or directly on the rollup (ADR-010 "Aggregation": "raw(back)
  // counts a set at most once if it has a primary contribution on any
  // member leaf or directly on the rollup"). A set whose exercise is
  // primary on two member leaves of the same rollup (e.g. `lats` and
  // `upper_back`) must still count once — that's exactly what grouping by
  // `setId` in a Set achieves.
  const rawRollupSets: Record<RollupMuscleGroupSlug, Set<string>> = Object.fromEntries(
    ROLLUP_MUSCLE_GROUP_SLUGS.map((slug) => [slug, new Set<string>()]),
  ) as Record<RollupMuscleGroupSlug, Set<string>>;
  for (const row of inWindow) {
    if (row.role !== "primary") continue;
    for (const rollup of ROLLUP_MUSCLE_GROUP_SLUGS) {
      const isMember =
        isLeafMuscleGroupSlug(row.muscleGroupId) &&
        (ROLLUP_MEMBERS[rollup] as readonly string[]).includes(row.muscleGroupId);
      const isDirect = row.muscleGroupId === rollup;
      if (isMember || isDirect) rawRollupSets[rollup].add(row.setId);
    }
  }

  const rollups = Object.fromEntries(
    ROLLUP_MUSCLE_GROUP_SLUGS.map((rollup) => {
      // ADR-010 / volume-model.md §2 — "effective(back) = effective(lats) +
      // effective(upper_back) + unclassifiedBack". Never persisted, derived
      // fresh every read from the leaf totals just computed above.
      const memberEffective = ROLLUP_MEMBERS[rollup].reduce(
        (sum, leaf) => sum + leaves[leaf].effective,
        0,
      );
      const volume: RollupVolume = {
        effective: round2(memberEffective + unclassified[rollup]),
        raw: rawRollupSets[rollup].size,
        unclassified: round2(unclassified[rollup]),
      };
      return [rollup, volume];
    }),
  ) as Record<RollupMuscleGroupSlug, RollupVolume>;

  return {
    startDate: window.startDate,
    endDateExclusive: window.endDateExclusive,
    isDeload: inWindow.some((row) => row.isDeload),
    leaves,
    rollups,
  };
}

// implementation-plan.md Phase 6 — "current week plus the previous four
// weeks"; the caller supplies however many windows it wants (5 for the MVP
// volume screen), most-recent-first or otherwise — order is preserved.
export function aggregateVolume(
  rows: readonly WorkSetContributionRow[],
  windows: readonly InstantWeekWindow[],
): WeekVolumeReport[] {
  // volume-model.md §1 — "Work set: a logged SetLog with isWarmup = false".
  // Filtered here (not by the caller) so the Work Set definition is a
  // domain behavior, provable directly against a fixture, not a query-level
  // side effect.
  const workRows = rows.filter((row) => !row.isWarmup);
  return windows.map((window) => aggregateWeek(workRows, window));
}
