import { describe, expect, it } from "vitest";
import {
  buildPrescriptionSnapshotData,
  type GroupSnapshotInputs,
} from "@/domain/prescriptions/buildSnapshot";
import type { GroupsScheme } from "@/domain/schemes/setScheme";
import type { ResolvedProgression } from "@/domain/progression/registry";

// set-groups-architecture-evaluation.md §5.3 — one resolved {loadKg, reps}
// prefill per group, through the identical decision -> carry-forward ->
// baseline chain every existing prefill already uses; `prefill` itself
// keeps the FIRST group's values so every existing (pre-Stage-A) reader
// stays correct.

const scheme: GroupsScheme = {
  type: "groups",
  groups: [
    { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
    {
      key: "q9m4",
      label: "Back-off",
      sets: { min: 2, max: 3 },
      reps: { min: 6, max: 8 },
      baselineLoadKg: 90,
    },
  ],
};

const progression: ResolvedProgression = {
  strategyId: "load-progression",
  config: { incrementKg: 2.5 },
  classification: "heuristic",
};

function buildFor(groupInputs?: ReadonlyMap<string, GroupSnapshotInputs>) {
  return buildPrescriptionSnapshotData(
    { id: "ex1", name: "Trap Bar Deadlift" },
    { scheme, targetRir: null, restSeconds: null, progression, baselineLoadKg: 100 },
    [],
    null,
    null,
    2.5,
    groupInputs,
  );
}

describe("buildPrescriptionSnapshotData — groups scheme", () => {
  it("resolves an independent prefill per group", () => {
    const groupInputs = new Map<string, GroupSnapshotInputs>([
      [
        "top",
        {
          carryForwardCandidates: [
            {
              status: "completed",
              isDeload: false,
              startedAt: "2026-08-01T00:00:00.000Z",
              firstWorkSetLoadKg: 140,
            },
          ],
          decisionChosen: null,
        },
      ],
      ["q9m4", { carryForwardCandidates: [], decisionChosen: null }],
    ]);
    const data = buildFor(groupInputs);
    expect(data.groupPrefills?.top).toEqual({ loadKg: 140, reps: 2 });
    // Back-off has no carry-forward candidate — falls to its OWN
    // baselineLoadKg (90), never the slot's (100).
    expect(data.groupPrefills?.q9m4).toEqual({ loadKg: 90, reps: 6 });
  });

  it("prefill (the slot-level field) keeps the FIRST group's resolved values", () => {
    const groupInputs = new Map<string, GroupSnapshotInputs>([
      [
        "top",
        {
          carryForwardCandidates: [
            {
              status: "completed",
              isDeload: false,
              startedAt: "2026-08-01T00:00:00.000Z",
              firstWorkSetLoadKg: 140,
            },
          ],
          decisionChosen: null,
        },
      ],
      ["q9m4", { carryForwardCandidates: [], decisionChosen: null }],
    ]);
    const data = buildFor(groupInputs);
    expect(data.prefill).toEqual({ loadKg: 140, reps: 2 });
  });

  it("a group's own decision (accepted/modified) heads its own carry-forward chain independently of its sibling", () => {
    const groupInputs = new Map<string, GroupSnapshotInputs>([
      ["top", { carryForwardCandidates: [], decisionChosen: { loadKg: 145 } }],
      ["q9m4", { carryForwardCandidates: [], decisionChosen: null }],
    ]);
    const data = buildFor(groupInputs);
    expect(data.groupPrefills?.top?.loadKg).toBe(145);
    expect(data.groupPrefills?.q9m4?.loadKg).toBe(90); // untouched by Top's decision
  });

  it("falls back to empty when a group has no candidates, no decision, and no baseline", () => {
    const schemeNoBaseline: GroupsScheme = {
      type: "groups",
      groups: [{ key: "solo", label: "Work", sets: { min: 3, max: 3 }, reps: { min: 5, max: 5 } }],
    };
    const data = buildPrescriptionSnapshotData(
      { id: "ex1", name: "Squat" },
      {
        scheme: schemeNoBaseline,
        targetRir: null,
        restSeconds: null,
        progression,
        baselineLoadKg: null,
      },
      [],
      null,
      null,
      2.5,
      new Map([["solo", { carryForwardCandidates: [], decisionChosen: null }]]),
    );
    expect(data.groupPrefills?.solo).toEqual({ loadKg: null, reps: 5 });
  });

  it("mirrors the per-group resolved progression, with strategyVersion frozen", () => {
    const withGroups: ResolvedProgression = {
      ...progression,
      groups: {
        top: {
          strategyId: "load-progression",
          config: { incrementKg: 2.5 },
          classification: "heuristic",
        },
        q9m4: { strategyId: "manual", config: {}, classification: "heuristic" },
      },
    };
    const data = buildPrescriptionSnapshotData(
      { id: "ex1", name: "Trap Bar Deadlift" },
      { scheme, targetRir: null, restSeconds: null, progression: withGroups, baselineLoadKg: 100 },
      [],
      null,
      null,
      2.5,
      new Map([
        ["top", { carryForwardCandidates: [], decisionChosen: null }],
        ["q9m4", { carryForwardCandidates: [], decisionChosen: null }],
      ]),
    );
    expect(data.progression.groups?.top).toEqual({
      strategyId: "load-progression",
      strategyVersion: 1,
      config: { incrementKg: 2.5 },
      classification: "heuristic",
    });
    expect(data.progression.groups?.q9m4?.strategyId).toBe("manual");
  });

  it("an ungrouped scheme never gets a groupPrefills key at all", () => {
    const data = buildPrescriptionSnapshotData(
      { id: "ex1", name: "Bench" },
      {
        scheme: { type: "fixed", sets: 3, reps: 5 },
        targetRir: null,
        restSeconds: null,
        progression,
        baselineLoadKg: 60,
      },
      [],
      null,
      null,
      2.5,
    );
    expect("groupPrefills" in data).toBe(false);
  });
});
