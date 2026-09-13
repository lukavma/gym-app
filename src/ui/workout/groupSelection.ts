import type { GroupsScheme, SetGroup } from "@/domain/schemes/setScheme";
import { roundToStepKg } from "@/domain/progression/loadHelpers";
import type { ActiveSessionSetDto, RecommendationDto } from "@/sync/types";

// set-groups-architecture-evaluation.md §11.4 — the card's group-selection
// and per-group input-derivation rules, factored into two pure functions
// (no React) so they are unit-testable directly, per the design's own
// requirement ("Both live beside the card and are unit-tested without
// React", A-9).

function recordedCount(group: SetGroup, sets: readonly ActiveSessionSetDto[]): number {
  return sets.filter((s) => !s.isWarmup && s.groupKey === group.key).length;
}

// §11.4 mount row — "the first group in order whose recorded count is below
// its `max`, else the last group." Used for mount/reload/cross-device resume
// AND for the post-log recompute that produces auto-advance: after logging a
// set, the just-completed group's recorded count now equals its `max`, so
// this same rule naturally selects the next eligible group (or stays on the
// last group if none remain) — one function, not two.
export function nextGroupSelection(
  scheme: GroupsScheme,
  sets: readonly ActiveSessionSetDto[],
): string {
  for (const group of scheme.groups) {
    if (recordedCount(group, sets) < group.sets.max) return group.key;
  }
  return scheme.groups[scheme.groups.length - 1]!.key;
}

export interface DerivedGroupPrefill {
  loadKg: number | null;
  reps: number | null;
}

// Stage B (set-groups-architecture-evaluation.md §6) — the highest actually-
// logged non-warm-up load attributed to the reference group THIS SESSION;
// `null` when no such set exists yet. Performed-basis only (§19 D-4) — a pure
// function of the current local set list, re-run on every render, so an edit
// or deletion of a reference set changes this on the next render without any
// special-cased invalidation.
function referenceLoadKg(refKey: string, sets: readonly ActiveSessionSetDto[]): number | null {
  const loads = sets
    .filter((s) => !s.isWarmup && s.groupKey === refKey && s.weightKg !== null)
    .map((s) => s.weightKg!);
  return loads.length > 0 ? Math.max(...loads) : null;
}

export interface LinkedLoadResult {
  // The rounded proposal, or `null` when there is no reference load to
  // derive one from (the caller falls back to the linked group's own
  // carry-forward chain in that case — see `groupPrefill` below).
  loadKg: number | null;
  // The un-rounded reference figure, exposed so the UI can show "X% of
  // <ref load> kg" rather than only the rounded result.
  referenceLoadKg: number | null;
}

// `roundToStepKg` is the engine's existing nearest-step, half-up convention
// (domain/progression/loadHelpers.ts), reused verbatim — Stage B introduces
// no new rounding rule. A `loadStepKg` of 0/null (ad-hoc-metadata edge case)
// falls through to `roundToStepKg`'s own <= 0 branch (plain 2-decimal round).
export function resolveLinkedLoad(
  link: SetGroup["link"],
  sets: readonly ActiveSessionSetDto[],
  loadStepKg: number,
): LinkedLoadResult {
  if (!link) return { loadKg: null, referenceLoadKg: null };
  const ref = referenceLoadKg(link.ref, sets);
  if (ref === null) return { loadKg: null, referenceLoadKg: null };
  return { loadKg: roundToStepKg((ref * link.percent) / 100, loadStepKg), referenceLoadKg: ref };
}

// §11.4 — `groupPrefill(group, sets, recommendation, groupPrefills, loadStepKg)`:
// the last set logged IN THAT GROUP this session -> [Stage B: the resolved
// link proposal, for a linked group] -> that group's recommendation target
// (pending/accepted) or chosen values (modified) -> groupPrefills[key] ->
// empty. Mirrors ExerciseCard.tsx's existing `derivePrefill` load_reps chain,
// generalised per group (Set Groups is `load_reps`-only, so RIR/distance/
// duration never enter this chain).
//
// Stage B — a linked group never has a `recommendation` (L-1: it always
// resolves to `manual`, which never produces one), so the link step takes
// exactly the place the recommendation step would have. It supplies ONLY the
// first-set proposal: the "last set logged in this group" check above already
// short-circuits before this is ever consulted once one exists, which is what
// makes later sets copy the athlete's own previous load in this group rather
// than re-deriving from the link (§6.2). Reps are never part of the link
// (§19: "the percentage links weight only") — they still fall back to
// `groupPrefills[key]`, exactly as an independent group's would. A missing
// reference load falls back to `base` (this group's own carry-forward ->
// baseline -> empty), identically to an independent group with no
// recommendation — the caller (ExerciseCard) shows the fallback explanation
// via `describeGroupLink` below.
export function groupPrefill(
  group: SetGroup,
  sets: readonly ActiveSessionSetDto[],
  recommendation: RecommendationDto | null,
  groupPrefills: Record<string, DerivedGroupPrefill> | undefined,
  loadStepKg: number | null = null,
): DerivedGroupPrefill {
  // L-3 (independent review) — defense in depth: a warm-up set should never
  // carry a `groupKey` at all (§4.4 rule 1, enforced at both the client and
  // server edit paths), but excluding one here too means a stale/pre-fix row
  // that somehow still carries one can never leak a warm-up's load into the
  // "last set logged in this group" prefill chain.
  const groupSets = sets.filter((s) => !s.isWarmup && s.groupKey === group.key);
  const last = groupSets.at(-1);
  if (last) return { loadKg: last.weightKg, reps: last.reps };

  const base = groupPrefills?.[group.key] ?? { loadKg: null, reps: null };

  if (group.link) {
    const { loadKg } = resolveLinkedLoad(group.link, sets, loadStepKg ?? 0);
    return loadKg !== null ? { loadKg, reps: base.reps } : base;
  }

  if (recommendation) {
    const status = recommendation.decision.status;
    if ((status === "pending" || status === "accepted") && recommendation.target) {
      return {
        loadKg: recommendation.target.loadKg ?? base.loadKg,
        reps: recommendation.target.reps ?? base.reps,
      };
    }
    if (status === "modified" && recommendation.decision.chosen) {
      return {
        loadKg: recommendation.decision.chosen.loadKg ?? base.loadKg,
        reps: recommendation.decision.chosen.reps ?? base.reps,
      };
    }
  }
  return base;
}

// Stage B — a small, UI-facing description of a linked group's current
// resolution state, for the "80% of top set — top set not logged yet" style
// explanation (§6.2) ExerciseCard renders beside a linked group's input row.
// `null` for a group with no link at all (nothing to describe).
export interface GroupLinkDescription {
  refLabel: string;
  percent: number;
  referenceLoadKg: number | null;
  proposedLoadKg: number | null;
  // True once a real set has been logged in the LINKED group itself this
  // session — at that point the link no longer drives the input row (the
  // "last set logged in this group" rule takes over), so the explanatory
  // text should read as historical ("was") rather than as the live proposal.
  supersededByOwnLog: boolean;
  // Stage B remediation F-7 (set-groups-stage-b-review.md) — the actual
  // value the missing-reference fallback (own carry-forward -> baseline)
  // resolves to, or `null` when it resolves to nothing. The caller must not
  // unconditionally claim "using this group's own carry-forward" — that
  // claim is only true when this is non-null; when it's `null`, the input is
  // left empty and the note must say so instead.
  fallbackLoadKg: number | null;
}

export function describeGroupLink(
  group: SetGroup,
  scheme: GroupsScheme,
  sets: readonly ActiveSessionSetDto[],
  loadStepKg: number | null,
  groupPrefills?: Record<string, DerivedGroupPrefill>,
): GroupLinkDescription | null {
  if (!group.link) return null;
  const refGroup = scheme.groups.find((g) => g.key === group.link!.ref);
  const { loadKg, referenceLoadKg: refLoad } = resolveLinkedLoad(group.link, sets, loadStepKg ?? 0);
  const ownLogged = sets.some((s) => !s.isWarmup && s.groupKey === group.key);
  return {
    refLabel: refGroup?.label ?? group.link.ref,
    percent: group.link.percent,
    referenceLoadKg: refLoad,
    proposedLoadKg: loadKg,
    supersededByOwnLog: ownLogged,
    fallbackLoadKg: groupPrefills?.[group.key]?.loadKg ?? null,
  };
}
