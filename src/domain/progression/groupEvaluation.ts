import { projectGroup, type GroupsScheme, type SetGroup } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type {
  EvaluationBlockContext,
  EvaluationContext,
  PerformedExercise,
  PerformedSet,
} from "./engine";
import type { PrescriptionSnapshotData } from "../schemas/prescriptionSnapshot";

// set-groups-architecture-evaluation.md §5.4/§5.5 — the per-group projection
// and evaluation-window mechanics, factored out of evaluateSession.ts so the
// partitioning/windowing/history-bridging rules have one pure, unit-testable
// home. `evaluateLoadProgression`/`evaluateRepProgression` themselves are
// NEVER modified (§5.4) — this module only builds the projected, windowed
// `EvaluationContext` those strategies already understand.
//
// Discipline: `PerformedSet.groupKey` is an EPHEMERAL tag callers attach to
// an exercise's raw work-set/history arrays so this module can partition
// them; every array this module hands to an `EvaluationContext` (and thus,
// eventually, to a persisted record's `inputs.workSets`/`extraWorkSets`) has
// had `groupKey` stripped again by `stripGroupKey` below. `performedSetSchema`
// (domain/schemas/recommendation.ts) is `.strict()` with no such field —
// leaking it through would fail every persisted grouped record at the sync
// boundary. Callers must NEVER attach `groupKey` to an ungrouped exercise's
// sets (not even `null`) — see evaluateSession.ts's own ungrouped path,
// which is untouched by this module and must stay byte-identical.
export function stripGroupKey(sets: readonly PerformedSet[]): PerformedSet[] {
  return sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, rir: s.rir }));
}

export interface GroupPartition {
  // Every attributed (non-warm-up) set of this group, in set-number order —
  // a persisted audit fact regardless of window membership.
  recorded: PerformedSet[];
  // §5.5 — "the first `sets.min` recorded sets, in set-number order. Chosen
  // by order, never by performance." Fed to the (unmodified) strategy as
  // `ctx.performance.workSets`.
  window: PerformedSet[];
  // Recorded sets after the window — audit facts that never gate.
  extra: PerformedSet[];
}

// CRITICAL INVARIANT — evaluate exactly the first `sets.min` attributed work
// sets by order; never the best-performing ones. `workSets` must already be
// warm-up-excluded and set-number ordered (the pre-existing contract every
// PerformedSet[] consumer relies on).
export function partitionGroupSets(
  group: SetGroup,
  workSets: readonly PerformedSet[],
): GroupPartition {
  const recorded = stripGroupKey(workSets.filter((s) => s.groupKey === group.key));
  const window = recorded.slice(0, group.sets.min);
  const extra = recorded.slice(window.length);
  return { recorded, window, extra };
}

// §5.6/C-1/D-6(a) — the FIRST group in scheme order bridges an ungrouped
// historical entry's sets (that session was never grouped, so its sets carry
// no group key at all — every one of them belonged to the whole slot); every
// other group gets none of that legacy history. A historical entry that was
// itself a `groups` scheme never bridges through this path (§4.4 rule 3 — an
// unattributed set inside a grouped session belongs to no group), it is
// simply filtered by key like the current session.
function historySetsForGroup(
  group: SetGroup,
  isFirstGroup: boolean,
  entry: PerformedExercise,
): PerformedSet[] {
  const scheme = entry.prescribed?.scheme;
  if (!scheme) return [];
  if (scheme.type === "groups") {
    return entry.workSets.filter((s) => s.groupKey === group.key);
  }
  return isFirstGroup ? entry.workSets : [];
}

// §5.4 safety property — a per-group history entry ALWAYS carries the
// PROJECTED scheme, never the raw `groups` scheme (a raw `groups` scheme
// reaching `targetRepsPerSet`/`schemeMinReps` would return `null`,
// `isCompleted` would return `false`, and `entryQualifiesForStreak` would
// count a real completed session as a failure — NC-7). Each entry is also
// windowed the same way the current session is (§5.5 rule 4).
//
// M-1 (independent review) — a historical entry that was itself a `groups`
// scheme must be judged against ITS OWN frozen group definition, resolved BY
// KEY from `entry.prescribed.scheme.groups`, never against the CURRENT
// session's group (`group`, this function's own parameter). Raising or
// lowering a group's `sets.min` — by a template edit, or by a `setMultiplier`
// week override applied only to the CURRENT session's snapshot — must never
// retroactively change whether an already-completed session reads as
// complete: ADR-007's snapshot-on-use discipline and §4.3/§4.5's "historical
// attribution is frozen by each session's own snapshot" apply to a group's
// definition exactly as they do to everything else about that session. The
// reverse bridge (`bridgeUngroupedHistoryEntry` below) already got this
// right; this was the one place in the module that didn't.
//
// The CURRENT group's own projection/`targetRir` is used ONLY for a legacy,
// UNGROUPED historical entry (no frozen group exists there at all) — the
// C-1/D-6(a) bridge, first group only, unchanged. A historical entry that WAS
// grouped but never had this exact key (the group did not exist yet at that
// time) contributes nothing: there is no faithful definition to judge it
// against, and falling back to the current group's would reintroduce the
// same bug for that entry.
export function buildGroupHistory(
  group: SetGroup,
  isFirstGroup: boolean,
  effectiveTargetRir: RirBand | undefined,
  history: readonly PerformedExercise[],
): PerformedExercise[] {
  return history.map((entry) => {
    const entryScheme = entry.prescribed?.scheme;
    if (entryScheme?.type === "groups") {
      const historicalGroup = entryScheme.groups.find((g) => g.key === group.key);
      // V-1 (independent verification) — this group did not exist yet in
      // that historical session's own frozen scheme, so there is no
      // faithful definition to judge it against. `prescribed: null` (not
      // merely an empty `workSets`) is what the §5.4 projected-scheme
      // invariant requires: leaving the raw, unprojected `groups` scheme on
      // `entry.prescribed.scheme` here would violate NC-7 (every entry
      // `evaluateLoadProgression`/`evaluateRepProgression` ever sees must
      // carry the group's own PROJECTED scheme, never a raw `groups`
      // scheme) even though it is inert today only because
      // `entryQualifiesForStreak` already short-circuits on an empty
      // `workSets` before it would ever read the scheme — a second,
      // incidental guard, not the one the design actually relies on.
      // `entryQualifiesForStreak`'s own `!entry.prescribed` check is the
      // correct, self-documenting reason this entry never counts.
      if (!historicalGroup) return { ...entry, prescribed: null, workSets: [] };
      const sets = historySetsForGroup(group, isFirstGroup, entry);
      const window = stripGroupKey(sets.slice(0, historicalGroup.sets.min));
      const historicalTargetRir = historicalGroup.targetRir ?? entry.prescribed?.targetRir;
      return {
        ...entry,
        prescribed: {
          scheme: projectGroup(historicalGroup),
          ...(historicalTargetRir ? { targetRir: historicalTargetRir } : {}),
        },
        workSets: window,
      };
    }
    // Legacy fallback (C-1/D-6(a)) — an ungrouped historical entry has no
    // frozen group of its own; only the FIRST group bridges it, judged
    // against the CURRENT group's own definition (there is nothing else to
    // judge it against).
    const sets = historySetsForGroup(group, isFirstGroup, entry);
    const window = stripGroupKey(sets.slice(0, group.sets.min));
    return {
      ...entry,
      prescribed: {
        scheme: projectGroup(group),
        ...(effectiveTargetRir ? { targetRir: effectiveTargetRir } : {}),
      },
      workSets: window,
    };
  });
}

// §5.6 reverse bridge — the SYMMETRIC direction to `historySetsForGroup`/
// `buildGroupHistory` above: an UNGROUPED slot's own evaluation history
// reading a historical entry that was itself a `groups` scheme. "First
// group" is resolved from THAT ENTRY'S OWN frozen snapshot
// (`entry.prescribed.scheme`) — there is no current group list to fall back
// to, since the CURRENT slot isn't grouped — and only that group's sets are
// used; every other group of that historical entry contributes nothing
// (never pooled together, which would corrupt a streak/history computation
// with back-off performance that was never the "main" lift the now-ungrouped
// slot is progressing).
//
// The §5.4 safety property applies here exactly as it does to the forward
// bridge: the returned entry's `prescribed.scheme` is the group's own
// PROJECTED scheme, never the raw `groups` scheme. Passing the raw scheme
// through (workSets alone, filtered, but `prescribed.scheme` left as
// `groups`) would make `isCompleted`'s own groups-scheme guard (`if
// (scheme.type === "groups") return false`) treat every bridged entry as
// unconditionally "not completed" regardless of what was actually performed —
// silently corrupting `entryQualifiesForStreak`'s fail-streak count. Found
// and fixed during this remediation pass while constructing a decisive test
// for the reverse bridge (a first implementation stripped `groupKey` from
// `workSets` but left `prescribed.scheme` untouched).
//
// An entry that was itself ungrouped (or unparseable) is returned unchanged
// apart from `stripGroupKey` — every one of its sets already belonged to the
// whole slot, exactly as before Stage A. This never mutates a stored row
// (D-6 — "no rewrite of historical rows"); it only changes how an
// already-stored row's sets are READ for this one evaluation.
export function bridgeUngroupedHistoryEntry(entry: PerformedExercise): PerformedExercise {
  const scheme = entry.prescribed?.scheme;
  if (scheme?.type === "groups") {
    const firstGroup = scheme.groups[0];
    if (!firstGroup) return { ...entry, workSets: [] };
    const effectiveTargetRir = firstGroup.targetRir ?? entry.prescribed?.targetRir;
    return {
      ...entry,
      prescribed: {
        scheme: projectGroup(firstGroup),
        ...(effectiveTargetRir ? { targetRir: effectiveTargetRir } : {}),
      },
      workSets: stripGroupKey(entry.workSets.filter((s) => s.groupKey === firstGroup.key)),
    };
  }
  return { ...entry, workSets: stripGroupKey(entry.workSets) };
}

export interface GroupEvaluationUnit {
  group: SetGroup;
  groupIndex: number;
  partition: GroupPartition;
  ctx: EvaluationContext;
}

// Builds one projected/windowed EvaluationContext per group, ready to feed
// into the existing (unmodified) `evaluateLoadProgression`/
// `evaluateRepProgression`. `workSets` is the CURRENT session's full,
// unfiltered, groupKey-tagged work-set array for the slot; `history` is the
// per-exercise history array evaluateSession already assembles, likewise
// groupKey-tagged on every entry's own `workSets`.
export function buildGroupEvaluationUnits(args: {
  snapshot: PrescriptionSnapshotData;
  scheme: GroupsScheme;
  workSets: readonly PerformedSet[];
  history: readonly PerformedExercise[];
  block: EvaluationBlockContext | null;
  exercise: { id: string; loadStepKg: number };
  sessionId: string;
  performedAt: string;
  isDeload: boolean;
}): GroupEvaluationUnit[] {
  const { snapshot, scheme, workSets, history, block, exercise, sessionId, performedAt, isDeload } =
    args;
  return scheme.groups.map((group, groupIndex) => {
    const partition = partitionGroupSets(group, workSets);
    const projected = projectGroup(group);
    const effectiveTargetRir = group.targetRir ?? snapshot.targetRir ?? undefined;
    const groupHistory = buildGroupHistory(group, groupIndex === 0, effectiveTargetRir, history);
    const groupPrefill = snapshot.groupPrefills?.[group.key] ?? { loadKg: null, reps: null };
    const ctx: EvaluationContext = {
      prescription: {
        scheme: projected,
        targetRir: effectiveTargetRir ?? null,
        prefill: groupPrefill,
      },
      performance: {
        sessionId,
        performedAt,
        isDeload,
        prescribed: {
          scheme: projected,
          ...(effectiveTargetRir ? { targetRir: effectiveTargetRir } : {}),
        },
        workSets: partition.window,
      },
      history: groupHistory,
      block,
      exercise,
    };
    return { group, groupIndex, partition, ctx };
  });
}

// M-2 (independent review) — the single shared "is this slot worth
// evaluating at all" check, used by BOTH candidate pre-filters
// (`server/progression/service.ts`'s `assembleAndEvaluate` and
// `sync/activeSession.ts`'s `buildClientRecommendationOps`) so they can never
// again diverge from `evaluateSession.ts`'s own dispatch, which they exist to
// approximate. Before this fix, both pre-filters dropped a slot whenever its
// SLOT-level `strategyId` was `manual`, even for a `groups` scheme where one
// or more groups override the slot default with a non-manual strategy —
// `evaluateSession`'s own `groups` branch runs BEFORE its manual skip
// specifically so an overriding group still progresses (progression-engine.md
// §5.1's "independent of the slot-level strategyId"), but neither caller ever
// gave it the chance: the whole exercise was filtered out one line earlier.
// A slot whose EFFECTIVE strategy is manual everywhere (ungrouped-manual, or
// grouped-manual with no group override) still correctly returns `false`.
export function hasEvaluableStrategy(snapshot: PrescriptionSnapshotData): boolean {
  if (snapshot.scheme.type === "groups") {
    return snapshot.scheme.groups.some(
      (g) =>
        (snapshot.progression.groups?.[g.key]?.strategyId ?? snapshot.progression.strategyId) !==
        "manual",
    );
  }
  return snapshot.progression.strategyId !== "manual";
}
