import { describe, expect, it } from "vitest";
import {
  bridgeUngroupedHistoryEntry,
  buildGroupEvaluationUnits,
  buildGroupHistory,
  partitionGroupSets,
  stripGroupKey,
} from "@/domain/progression/groupEvaluation";
import type { SetGroup } from "@/domain/schemes/setScheme";
import type { PerformedExercise, PerformedSet } from "@/domain/progression/engine";
import type { PrescriptionSnapshotData } from "@/domain/schemas/prescriptionSnapshot";

// set-groups-architecture-evaluation.md §5.4/§5.5/§5.6 — the pure
// partitioning/windowing/history-bridging mechanics evaluateSession.ts
// builds on. These tests exercise the CRITICAL INVARIANT directly: the
// window is the first `sets.min` ATTRIBUTED sets BY ORDER, never a
// best-performing subset.

const backoff: SetGroup = {
  key: "q9m4",
  label: "Back-off",
  sets: { min: 2, max: 3 },
  reps: { min: 6, max: 8 },
};

function set(
  weightKg: number,
  reps: number,
  rir: number | null,
  groupKey: string | null,
): PerformedSet {
  return { weightKg, reps, rir, groupKey };
}

describe("partitionGroupSets", () => {
  it("CRITICAL INVARIANT — window is the first sets.min recorded sets, in order, never the best-performing ones", () => {
    // A short first set followed by two good ones: the window is sets 1-2
    // (short, good) — NOT the two best sets (2 and 3).
    const workSets = [set(110, 5, 1, "q9m4"), set(110, 7, 2, "q9m4"), set(110, 7, 2, "q9m4")];
    const { window, extra } = partitionGroupSets(backoff, workSets);
    expect(window).toEqual([
      { weightKg: 110, reps: 5, rir: 1 },
      { weightKg: 110, reps: 7, rir: 2 },
    ]);
    expect(extra).toEqual([{ weightKg: 110, reps: 7, rir: 2 }]);
  });

  it("recorded sets beyond the window are preserved as extra, never dropped", () => {
    const workSets = [
      set(110, 7, 3, "q9m4"),
      set(110, 7, 2, "q9m4"),
      set(110, 6, 0, "q9m4"),
      set(110, 6, 0, "q9m4"),
    ];
    const { recorded, window, extra } = partitionGroupSets(backoff, workSets);
    expect(recorded).toHaveLength(4);
    expect(window).toHaveLength(2);
    expect(extra).toHaveLength(2);
  });

  it("excludes sets attributed to a different group", () => {
    const workSets = [set(140, 2, 2, "top"), set(110, 7, 2, "q9m4"), set(110, 7, 2, "q9m4")];
    const { recorded } = partitionGroupSets(backoff, workSets);
    expect(recorded).toHaveLength(2);
  });

  it("excludes unattributed sets (null groupKey) — §4.4 rule 3", () => {
    const workSets = [set(110, 7, 2, null), set(110, 7, 2, "q9m4")];
    const { recorded } = partitionGroupSets(backoff, workSets);
    expect(recorded).toEqual([{ weightKg: 110, reps: 7, rir: 2 }]);
  });

  it("zero recorded sets yields an empty window (NO_WORK_SETS_LOGGED upstream)", () => {
    const { recorded, window, extra } = partitionGroupSets(backoff, [set(140, 2, 2, "top")]);
    expect(recorded).toEqual([]);
    expect(window).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("discipline — never leaks groupKey into the returned PerformedSet objects (NC-9 precondition)", () => {
    const { window, extra, recorded } = partitionGroupSets(backoff, [
      set(110, 7, 3, "q9m4"),
      set(110, 7, 2, "q9m4"),
      set(110, 6, 0, "q9m4"),
    ]);
    for (const s of [...window, ...extra, ...recorded]) {
      expect("groupKey" in s).toBe(false);
    }
  });
});

describe("stripGroupKey", () => {
  it("removes the groupKey field, keeping only weightKg/reps/rir", () => {
    const stripped = stripGroupKey([{ weightKg: 100, reps: 5, rir: 2, groupKey: "g1" }]);
    expect(stripped).toEqual([{ weightKg: 100, reps: 5, rir: 2 }]);
    expect("groupKey" in stripped[0]!).toBe(false);
  });
});

describe("buildGroupHistory — §5.6 C-1/D-6(a) bridge and the §5.4 safety property", () => {
  const projectedTargetRir = undefined;

  function ungroupedEntry(sets: PerformedSet[]): PerformedExercise {
    return {
      sessionId: "s1",
      performedAt: "2026-08-01T00:00:00.000Z",
      isDeload: false,
      prescribed: { scheme: { type: "fixed", sets: 5, reps: 5 } },
      workSets: sets,
    };
  }

  function groupedEntry(sets: PerformedSet[]): PerformedExercise {
    return {
      sessionId: "s2",
      performedAt: "2026-08-05T00:00:00.000Z",
      isDeload: false,
      prescribed: {
        scheme: {
          type: "groups",
          groups: [
            { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
            backoff,
          ],
        },
      },
      workSets: sets,
    };
  }

  it("the FIRST group bridges an ungrouped historical entry's sets (all of them, no key filter)", () => {
    const top: SetGroup = {
      key: "top",
      label: "Top",
      sets: { min: 1, max: 1 },
      reps: { min: 1, max: 1 },
    };
    const history = [ungroupedEntry([set(100, 5, 2, null)])];
    const built = buildGroupHistory(top, true, projectedTargetRir, history);
    expect(built[0]!.workSets).toEqual([{ weightKg: 100, reps: 5, rir: 2 }]);
  });

  it("a NON-first group gets NONE of an ungrouped historical entry's sets (D-6 default: no automatic attribution beyond the first group)", () => {
    const history = [ungroupedEntry([set(100, 5, 2, null)])];
    const built = buildGroupHistory(backoff, false, projectedTargetRir, history);
    expect(built[0]!.workSets).toEqual([]);
  });

  it("a historical entry that was ITSELF grouped never bridges through the null-key path — it is filtered by key like the current session (§4.4 rule 3)", () => {
    const history = [groupedEntry([set(140, 2, 2, "top"), set(110, 7, 2, "q9m4")])];
    const builtForTop = buildGroupHistory(
      { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
      true,
      projectedTargetRir,
      history,
    );
    expect(builtForTop[0]!.workSets).toEqual([{ weightKg: 140, reps: 2, rir: 2 }]);
    const builtForBackoff = buildGroupHistory(backoff, false, projectedTargetRir, history);
    expect(builtForBackoff[0]!.workSets).toEqual([{ weightKg: 110, reps: 7, rir: 2 }]);
  });

  it("NC-7 safety property — every history entry carries the PROJECTED scheme, never the raw groups scheme", () => {
    const history = [ungroupedEntry([set(100, 6, 2, null), set(100, 7, 2, null)])];
    const built = buildGroupHistory(backoff, true, projectedTargetRir, history);
    expect(built[0]!.prescribed?.scheme).toEqual({
      type: "repRange",
      sets: 2,
      minReps: 6,
      maxReps: 8,
    });
  });

  // V-1 (independent verification) — the NC-7 test above only covers the
  // LEGACY (ungrouped-history) bridge path. A grouped historical entry that
  // simply never had THIS group's key yet (the group did not exist at that
  // time) took a different, uncovered branch — `if (!historicalGroup)
  // return { ...entry, workSets: [] }` — which emptied `workSets` but left
  // `entry.prescribed.scheme` as the RAW `groups` scheme, violating the
  // same §5.4 projected-scheme invariant NC-7 exists to guard. Inert today
  // only because `entryQualifiesForStreak` short-circuits on
  // `workSets.length === 0` before it ever reads the scheme — a second,
  // incidental guard, not the one the design relies on.
  it("NC-7 (V-1 extension) — a grouped historical entry that never had THIS group's key returns prescribed: null, never a raw groups scheme", () => {
    const history = [groupedEntry([set(140, 2, 2, "top"), set(110, 7, 2, "q9m4")])];
    const brandNewGroup: SetGroup = {
      key: "brandNew",
      label: "Brand New",
      sets: { min: 1, max: 1 },
      reps: { min: 3, max: 3 },
    };
    const built = buildGroupHistory(brandNewGroup, false, projectedTargetRir, history);
    expect(built[0]!.prescribed).toBeNull();
    expect(built[0]!.workSets).toEqual([]);
  });

  it("windows a history entry's sets the same way the current session is windowed (§5.5 rule 4)", () => {
    // 3 sets bridged to the first group; window = first `sets.min` (2).
    const history = [
      ungroupedEntry([set(100, 6, 2, null), set(100, 7, 2, null), set(100, 5, 0, null)]),
    ];
    const built = buildGroupHistory(backoff, true, projectedTargetRir, history);
    expect(built[0]!.workSets).toHaveLength(2);
  });

  it("an entry with no prescribed snapshot (ad-hoc) contributes no sets to any group", () => {
    const adhoc: PerformedExercise = {
      sessionId: "s3",
      performedAt: "2026-08-01T00:00:00.000Z",
      isDeload: false,
      prescribed: null,
      workSets: [set(100, 5, 2, null)],
    };
    const built = buildGroupHistory(backoff, true, projectedTargetRir, [adhoc]);
    expect(built[0]!.workSets).toEqual([]);
  });

  // M-1 (independent review) — a historical entry that was itself grouped
  // must be judged against ITS OWN frozen group definition, resolved by key,
  // never the CURRENT session's. These four tests reproduce the review's own
  // failure scenario directly at the `buildGroupHistory` level (the unit
  // closest to the root cause) rather than only end to end.
  describe("M-1 — a historical group is resolved from that entry's OWN frozen snapshot, never the current session's", () => {
    function frozenGroupedEntry(
      sessionId: string,
      historicalMin: number,
      recordedSets: PerformedSet[],
      targetRir?: { min: number; max: number },
    ): PerformedExercise {
      return {
        sessionId,
        performedAt: "2026-08-05T00:00:00.000Z",
        isDeload: false,
        prescribed: {
          scheme: {
            type: "groups",
            groups: [
              {
                key: "top",
                label: "Top",
                sets: { min: historicalMin, max: historicalMin },
                reps: { min: 5, max: 5 },
                ...(targetRir ? { targetRir } : {}),
              },
            ],
          },
        },
        workSets: recordedSets,
      };
    }

    it("a RAISED current min (2 -> 3) does not retroactively fail a session frozen at the old, lower min", () => {
      // Frozen historically at 2 sets, both recorded — a genuine completion
      // under its OWN definition.
      const history = [frozenGroupedEntry("s1", 2, [set(100, 5, 2, "top"), set(100, 5, 2, "top")])];
      // The CURRENT group has since been raised to 3 sets.
      const currentTop: SetGroup = {
        key: "top",
        label: "Top",
        sets: { min: 3, max: 3 },
        reps: { min: 5, max: 5 },
      };
      const built = buildGroupHistory(currentTop, true, projectedTargetRir, history);
      // Judged against its OWN frozen min (2): both recorded sets are the
      // window, in full — a real completion, not truncated to look short by
      // the CURRENT min-3 scheme's own reps target (identical here, reps
      // match) or windowed down.
      expect(built[0]!.workSets).toEqual([
        { weightKg: 100, reps: 5, rir: 2 },
        { weightKg: 100, reps: 5, rir: 2 },
      ]);
      expect(built[0]!.prescribed?.scheme).toEqual({ type: "fixed", sets: 2, reps: 5 });
    });

    it("a LOWERED current min (3 -> 2) does not retroactively pass a session frozen at the old, higher min", () => {
      // Frozen historically at 3 sets required, only 2 recorded — a genuine
      // shortfall under its OWN definition.
      const history = [frozenGroupedEntry("s1", 3, [set(100, 5, 2, "top"), set(100, 5, 2, "top")])];
      // The CURRENT group has since been lowered to 2 sets — under which 2
      // recorded sets would be a full, satisfied window.
      const currentTop: SetGroup = {
        key: "top",
        label: "Top",
        sets: { min: 2, max: 2 },
        reps: { min: 5, max: 5 },
      };
      const built = buildGroupHistory(currentTop, true, projectedTargetRir, history);
      // Still judged against its OWN frozen scheme (3 sets required) — the
      // window is min(3, 2 recorded) = 2 recorded sets, but the PRESCRIBED
      // scheme still says 3, so a completion check against it correctly
      // reads as a shortfall, not wrongly "complete".
      expect(built[0]!.prescribed?.scheme).toEqual({ type: "fixed", sets: 3, reps: 5 });
      expect(built[0]!.workSets).toHaveLength(2);
    });

    it("a group that did not exist yet in a historical grouped entry contributes nothing (never falls back to the current group's definition)", () => {
      const history = [frozenGroupedEntry("s1", 2, [set(100, 5, 2, "top"), set(100, 5, 2, "top")])];
      // A DIFFERENT current group key ("back-off"), never present in that
      // historical entry's own scheme.
      const backoffToday: SetGroup = {
        key: "back-off",
        label: "Back-off",
        sets: { min: 2, max: 2 },
        reps: { min: 8, max: 8 },
      };
      const built = buildGroupHistory(backoffToday, true, projectedTargetRir, history);
      expect(built[0]!.workSets).toEqual([]);
    });

    it("a historical group's own targetRir override is used, not the current group's or the current slot's", () => {
      const history = [frozenGroupedEntry("s1", 1, [set(100, 5, 2, "top")], { min: 0, max: 1 })];
      const currentTop: SetGroup = {
        key: "top",
        label: "Top",
        sets: { min: 1, max: 1 },
        reps: { min: 5, max: 5 },
        targetRir: { min: 3, max: 4 }, // the CURRENT group's own override — must NOT be used
      };
      const built = buildGroupHistory(currentTop, true, { min: 5, max: 6 }, history);
      expect(built[0]!.prescribed?.targetRir).toEqual({ min: 0, max: 1 });
    });

    it("falls back to the historical entry's own SLOT-level targetRir when that entry's group carried no override of its own", () => {
      const entry = frozenGroupedEntry("s1", 1, [set(100, 5, 2, "top")]);
      entry.prescribed = { ...entry.prescribed!, targetRir: { min: 1, max: 2 } };
      const currentTop: SetGroup = {
        key: "top",
        label: "Top",
        sets: { min: 1, max: 1 },
        reps: { min: 5, max: 5 },
      };
      const built = buildGroupHistory(currentTop, true, { min: 5, max: 6 }, [entry]);
      expect(built[0]!.prescribed?.targetRir).toEqual({ min: 1, max: 2 });
    });
  });
});

describe("bridgeUngroupedHistoryEntry — §5.6 reverse bridge (an ungrouped slot reading a historical entry that was itself grouped)", () => {
  it("a historical entry that was itself grouped contributes only its FIRST group's sets, never every group pooled together", () => {
    const entry: PerformedExercise = {
      sessionId: "s1",
      performedAt: "2026-08-05T00:00:00.000Z",
      isDeload: false,
      prescribed: {
        scheme: {
          type: "groups",
          groups: [
            { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
            backoff,
          ],
        },
      },
      workSets: [set(140, 2, 2, "top"), set(110, 7, 2, "q9m4"), set(110, 7, 3, "q9m4")],
    };
    expect(bridgeUngroupedHistoryEntry(entry).workSets).toEqual([
      { weightKg: 140, reps: 2, rir: 2 },
    ]);
  });

  it("the §5.4 safety property applies symmetrically — the bridged entry carries the group's own PROJECTED scheme, never the raw groups scheme", () => {
    // Regression case: a first cut of this bridge filtered `workSets` but
    // left `prescribed.scheme` as the raw `groups` scheme, which makes
    // `isCompleted`'s own groups-scheme guard (loadProgression.ts) treat
    // EVERY bridged entry as unconditionally "not completed" regardless of
    // what was actually performed, silently corrupting fail-streak counting.
    const entry: PerformedExercise = {
      sessionId: "s1",
      performedAt: "2026-08-05T00:00:00.000Z",
      isDeload: false,
      prescribed: {
        scheme: {
          type: "groups",
          groups: [
            { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
            backoff,
          ],
        },
      },
      workSets: [set(140, 2, 2, "top")],
    };
    const bridged = bridgeUngroupedHistoryEntry(entry);
    expect(bridged.prescribed?.scheme).toEqual({ type: "fixed", sets: 1, reps: 2 });
  });

  it("a bridged entry's targetRir comes from the first group's own override, falling back to the slot's frozen band", () => {
    const withGroupOverride: PerformedExercise = {
      sessionId: "s1a",
      performedAt: "2026-08-05T00:00:00.000Z",
      isDeload: false,
      prescribed: {
        scheme: {
          type: "groups",
          groups: [
            {
              key: "top",
              label: "Top",
              sets: { min: 1, max: 1 },
              reps: { min: 2, max: 2 },
              targetRir: { min: 0, max: 1 },
            },
          ],
        },
        targetRir: { min: 1, max: 3 },
      },
      workSets: [set(140, 2, 1, "top")],
    };
    expect(bridgeUngroupedHistoryEntry(withGroupOverride).prescribed?.targetRir).toEqual({
      min: 0,
      max: 1,
    });

    const withoutGroupOverride: PerformedExercise = {
      ...withGroupOverride,
      sessionId: "s1b",
      prescribed: {
        scheme: {
          type: "groups",
          groups: [
            { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
          ],
        },
        targetRir: { min: 1, max: 3 },
      },
    };
    expect(bridgeUngroupedHistoryEntry(withoutGroupOverride).prescribed?.targetRir).toEqual({
      min: 1,
      max: 3,
    });
  });

  it("an ordinarily-ungrouped historical entry is unaffected — every one of its sets already belonged to the whole slot", () => {
    const entry: PerformedExercise = {
      sessionId: "s2",
      performedAt: "2026-08-01T00:00:00.000Z",
      isDeload: false,
      prescribed: { scheme: { type: "fixed", sets: 3, reps: 5 } },
      workSets: [set(100, 5, 2, null), set(100, 5, 2, null), set(100, 5, 1, null)],
    };
    const bridged = bridgeUngroupedHistoryEntry(entry);
    expect(bridged.workSets).toEqual([
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 1 },
    ]);
    expect(bridged.prescribed?.scheme).toEqual({ type: "fixed", sets: 3, reps: 5 });
  });

  it("an entry with no prescribed snapshot (ad-hoc) is returned unfiltered, matching the pre-Stage-A default", () => {
    const entry: PerformedExercise = {
      sessionId: "s3",
      performedAt: "2026-08-01T00:00:00.000Z",
      isDeload: false,
      prescribed: null,
      workSets: [set(100, 5, 2, null)],
    };
    expect(bridgeUngroupedHistoryEntry(entry).workSets).toEqual([
      { weightKg: 100, reps: 5, rir: 2 },
    ]);
  });

  it("discipline — the returned sets never carry a groupKey field (NC-9-style precondition for the ungrouped evaluation path)", () => {
    const entry: PerformedExercise = {
      sessionId: "s4",
      performedAt: "2026-08-05T00:00:00.000Z",
      isDeload: false,
      prescribed: {
        scheme: {
          type: "groups",
          groups: [
            { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
          ],
        },
      },
      workSets: [set(140, 2, 2, "top")],
    };
    for (const s of bridgeUngroupedHistoryEntry(entry).workSets) {
      expect("groupKey" in s).toBe(false);
    }
  });
});

describe("buildGroupEvaluationUnits", () => {
  const snapshot: PrescriptionSnapshotData = {
    exerciseId: "ex1",
    exerciseName: "Trap Bar Deadlift",
    scheme: {
      type: "groups",
      groups: [
        { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        backoff,
      ],
    },
    targetRir: { min: 1, max: 3 },
    restSeconds: null,
    progression: {
      strategyId: "load-progression",
      strategyVersion: 1,
      config: {},
      classification: "heuristic",
    },
    appliedModifiers: null,
    prefill: { loadKg: null, reps: null },
    groupPrefills: { top: { loadKg: 140, reps: 2 }, q9m4: { loadKg: 110, reps: 7 } },
  };

  it("builds one context per group, each with its own projected scheme, window, and prefill", () => {
    const units = buildGroupEvaluationUnits({
      snapshot,
      scheme: snapshot.scheme as Extract<typeof snapshot.scheme, { type: "groups" }>,
      workSets: [set(140, 2, 2, "top"), set(110, 7, 3, "q9m4"), set(110, 7, 2, "q9m4")],
      history: [],
      block: null,
      exercise: { id: "ex1", loadStepKg: 2.5 },
      sessionId: "sess1",
      performedAt: "2026-08-10T00:00:00.000Z",
      isDeload: false,
    });
    expect(units).toHaveLength(2);
    const top = units.find((u) => u.group.key === "top")!;
    expect(top.ctx.prescription.scheme).toEqual({ type: "fixed", sets: 1, reps: 2 });
    expect(top.ctx.prescription.prefill).toEqual({ loadKg: 140, reps: 2 });
    expect(top.partition.window).toEqual([{ weightKg: 140, reps: 2, rir: 2 }]);

    const back = units.find((u) => u.group.key === "q9m4")!;
    expect(back.ctx.prescription.scheme).toEqual({
      type: "repRange",
      sets: 2,
      minReps: 6,
      maxReps: 8,
    });
    expect(back.partition.window).toHaveLength(2);
  });

  it("a group's own targetRir override wins over the slot band", () => {
    const overridden = {
      ...snapshot,
      scheme: {
        type: "groups" as const,
        groups: [
          {
            key: "top",
            label: "Top",
            sets: { min: 1, max: 1 },
            reps: { min: 2, max: 2 },
            targetRir: { min: 0, max: 1 },
          },
        ],
      },
    };
    const units = buildGroupEvaluationUnits({
      snapshot: overridden,
      scheme: overridden.scheme,
      workSets: [],
      history: [],
      block: null,
      exercise: { id: "ex1", loadStepKg: 2.5 },
      sessionId: "sess1",
      performedAt: "2026-08-10T00:00:00.000Z",
      isDeload: false,
    });
    expect(units[0]!.ctx.prescription.targetRir).toEqual({ min: 0, max: 1 });
  });
});
