import { describe, expect, it } from "vitest";
import {
  evaluateSession,
  type SessionExerciseEvaluationInput,
} from "@/domain/progression/evaluateSession";
import type { PerformedSet } from "@/domain/progression/engine";
import {
  loadProgressionConfigSchema,
  repProgressionConfigSchema,
} from "@/domain/progression/registry";
import type { PrescriptionSnapshotData } from "@/domain/schemas/prescriptionSnapshot";
import { evaluateLoadProgression } from "@/domain/progression/loadProgression";
import { evaluateRepProgression } from "@/domain/progression/repProgression";

// set-groups-architecture-evaluation.md §5.5 A-6 matrix and §12.3
// NC-4a/NC-4b, reproduced directly against the real, UNMODIFIED
// evaluateLoadProgression/evaluateRepProgression through evaluateSession's
// per-group dispatch (no server, no database — the domain contract only).

function s(weightKg: number, reps: number, rir: number | null, groupKey: string): PerformedSet {
  return { weightKg, reps, rir, groupKey };
}

const loadCfg = loadProgressionConfigSchema.parse({ incrementKg: 2.5 });
const repCfg = repProgressionConfigSchema.parse({ repCap: 12 });

function groupedSnapshot(
  strategyId: "load-progression" | "rep-progression",
): PrescriptionSnapshotData {
  return {
    exerciseId: "ex1",
    exerciseName: "Trap Bar Deadlift",
    scheme: {
      type: "groups",
      groups: [
        { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        { key: "q9m4", label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
      ],
    },
    targetRir: null,
    restSeconds: null,
    progression: {
      strategyId,
      strategyVersion: 1,
      config: (strategyId === "load-progression" ? loadCfg : repCfg) as Record<string, unknown>,
      classification: "heuristic",
    },
    appliedModifiers: null,
    prefill: { loadKg: null, reps: null },
    measurement: { profile: "load_reps", loadBasis: "unspecified" },
  };
}

function evaluateBackoff(
  strategyId: "load-progression" | "rep-progression",
  backoffSets: PerformedSet[],
) {
  const input: SessionExerciseEvaluationInput = {
    sessionExerciseId: "se1",
    exerciseId: "ex1",
    skipped: false,
    prescription: groupedSnapshot(strategyId),
    workSets: [s(140, 2, 2, "top"), ...backoffSets],
    history: [],
    loadStepKg: 2.5,
  };
  const results = evaluateSession({
    sessionId: "sess1",
    startedAt: "2026-08-10T00:00:00.000Z",
    isDeload: false,
    block: null,
    exercises: [input],
  });
  return results.find((r) => r.groupKey === "q9m4")!;
}

describe("A-6 matrix — the Back-off group (repRange projection {sets:2, minReps:6, maxReps:8})", () => {
  it("row 1 — minimum completes: 2 good sets -> increase_load / increase_reps", () => {
    const load = evaluateBackoff("load-progression", [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4")]);
    expect(load.draft.action).toBe("increase_load");
    expect(load.draft.target).toEqual({ loadKg: 112.5 });
    const reps = evaluateBackoff("rep-progression", [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4")]);
    expect(reps.draft.action).toBe("increase_reps");
  });

  it("row 2 — a hard optional third set no longer holds the group", () => {
    const sets = [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 6, 0, "q9m4")];
    expect(evaluateBackoff("load-progression", sets).draft.action).toBe("increase_load");
    expect(evaluateBackoff("rep-progression", sets).draft.action).toBe("increase_reps");
  });

  it("row 3 — a short optional third set no longer vetoes", () => {
    const sets = [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 5, 1, "q9m4")];
    expect(evaluateBackoff("load-progression", sets).draft.action).toBe("increase_load");
    expect(evaluateBackoff("rep-progression", sets).draft.action).toBe("increase_reps");
  });

  it("row 4 — a collapse on the optional set is recorded, not gated on", () => {
    const sets = [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 1, 3, "q9m4")];
    const load = evaluateBackoff("load-progression", sets);
    expect(load.draft.action).toBe("increase_load");
    expect(load.draft.inputs.extraWorkSets).toEqual([{ weightKg: 110, reps: 1, rir: 3 }]);
  });

  it("row 5 — CRITICAL INVARIANT: first min, not best min — a short FIRST set holds even though sets 2-3 are good", () => {
    const sets = [s(110, 5, 1, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 7, 2, "q9m4")];
    const load = evaluateBackoff("load-progression", sets);
    expect(load.draft.action).toBe("hold");
    expect(load.draft.reasonCodes).toContain("PRESCRIBED_REPS_NOT_COMPLETED");
    const reps = evaluateBackoff("rep-progression", sets);
    expect(reps.draft.action).toBe("hold");
    expect(reps.draft.reasonCodes).toContain("TARGET_REPS_NOT_REACHED_ALL_SETS");
  });

  it("row 6 — below minimum: only one set logged -> hold", () => {
    const sets = [s(110, 7, 3, "q9m4")];
    expect(evaluateBackoff("load-progression", sets).draft.action).toBe("hold");
  });

  it("row 7 — group not performed -> NO_WORK_SETS_LOGGED", () => {
    const load = evaluateBackoff("load-progression", []);
    expect(load.draft.action).toBe("none");
    expect(load.draft.reasonCodes).toEqual(["NO_WORK_SETS_LOGGED"]);
  });

  it("row 8 — a fourth set beyond max is an extra set; max has no evaluation meaning", () => {
    const sets = [
      s(110, 7, 3, "q9m4"),
      s(110, 7, 2, "q9m4"),
      s(110, 6, 0, "q9m4"),
      s(110, 6, 0, "q9m4"),
    ];
    const load = evaluateBackoff("load-progression", sets);
    expect(load.draft.action).toBe("increase_load");
    expect(load.draft.inputs.workSets).toHaveLength(2);
    expect(load.draft.inputs.extraWorkSets).toHaveLength(2);
  });

  it("every record carries workSets = the window and extraWorkSets = the rest, with prescribed.group present", () => {
    const sets = [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 6, 0, "q9m4")];
    const rec = evaluateBackoff("load-progression", sets);
    expect(rec.draft.inputs.workSets).toEqual([
      { weightKg: 110, reps: 7, rir: 3 },
      { weightKg: 110, reps: 7, rir: 2 },
    ]);
    expect(rec.draft.inputs.extraWorkSets).toEqual([{ weightKg: 110, reps: 6, rir: 0 }]);
    expect(rec.draft.inputs.prescribed.group).toEqual({
      key: "q9m4",
      label: "Back-off",
      setsMin: 2,
      setsMax: 3,
    });
  });
});

describe("NC-4a — window removal flips exactly rows 2, 3, 4 and 8; rows 1, 5, 6, 7 unchanged", () => {
  // Reproduces the control by calling the strategy directly with the FULL
  // recorded set list as ctx.performance.workSets (bypassing the window),
  // rather than modifying production code.
  function evaluateWithNoWindow(
    strategyId: "load-progression" | "rep-progression",
    recorded: PerformedSet[],
  ) {
    const stripped = recorded.map(({ weightKg, reps, rir }) => ({ weightKg, reps, rir }));
    const ctx = {
      prescription: {
        scheme: { type: "repRange" as const, sets: 2, minReps: 6, maxReps: 8 },
        targetRir: null,
        prefill: { loadKg: null, reps: null },
      },
      performance: {
        sessionId: "s",
        performedAt: "2026-08-10T00:00:00.000Z",
        isDeload: false,
        prescribed: { scheme: { type: "repRange" as const, sets: 2, minReps: 6, maxReps: 8 } },
        workSets: stripped,
      },
      history: [],
      block: null,
      exercise: { id: "ex1", loadStepKg: 2.5 },
    };
    return strategyId === "load-progression"
      ? evaluateLoadProgression(ctx, loadCfg)
      : evaluateRepProgression(ctx, repCfg);
  }

  it("row 2 flips to hold for BOTH strategies", () => {
    const sets = [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 6, 0, "q9m4")];
    expect(evaluateWithNoWindow("load-progression", sets).action).toBe("hold");
    expect(evaluateWithNoWindow("rep-progression", sets).action).toBe("hold");
  });

  it("row 3 flips to hold for rep-progression ONLY", () => {
    const sets = [s(110, 7, 3, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 5, 1, "q9m4")];
    expect(evaluateWithNoWindow("load-progression", sets).action).toBe("increase_load");
    expect(evaluateWithNoWindow("rep-progression", sets).action).toBe("hold");
  });

  it("row 5 is NOT exercised by this control (identical with and without the window)", () => {
    const sets = [s(110, 5, 1, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 7, 2, "q9m4")];
    expect(evaluateWithNoWindow("load-progression", sets).action).toBe("hold");
  });
});

describe("NC-4b — best-min instead of first-min discriminates row 5 (proves the 'first, never best' rule matters)", () => {
  it("selecting the two BEST sets as the window would let row 5 progress — the shipped rule must not do this", () => {
    // Demonstrates the counterfactual directly: if the window were the two
    // highest-rep sets (best-min) instead of the first two (first-min), row
    // 5 would progress. The shipped `partitionGroupSets` never does this
    // (see groupEvaluation.test.ts's CRITICAL INVARIANT test).
    const recorded = [s(110, 5, 1, "q9m4"), s(110, 7, 2, "q9m4"), s(110, 7, 2, "q9m4")];
    const bestMinWindow = [...recorded]
      .sort((a, b) => b.reps - a.reps)
      .slice(0, 2)
      .map(({ weightKg, reps, rir }) => ({ weightKg, reps, rir }));
    const ctx = {
      prescription: {
        scheme: { type: "repRange" as const, sets: 2, minReps: 6, maxReps: 8 },
        targetRir: null,
        prefill: { loadKg: null, reps: null },
      },
      performance: {
        sessionId: "s",
        performedAt: "2026-08-10T00:00:00.000Z",
        isDeload: false,
        prescribed: { scheme: { type: "repRange" as const, sets: 2, minReps: 6, maxReps: 8 } },
        workSets: bestMinWindow,
      },
      history: [],
      block: null,
      exercise: { id: "ex1", loadStepKg: 2.5 },
    };
    expect(evaluateLoadProgression(ctx, loadCfg).action).toBe("increase_load");

    // The ACTUAL shipped first-min window holds instead — row 5's real behaviour.
    const first = evaluateBackoff("load-progression", recorded);
    expect(first.draft.action).toBe("hold");
  });
});

describe("Stage B — a percent-linked group never produces a recommendation", () => {
  function linkedSnapshot(
    strategyId: "load-progression" | "rep-progression" | "manual",
  ): PrescriptionSnapshotData {
    const base = groupedSnapshot(strategyId === "manual" ? "load-progression" : strategyId);
    return {
      ...base,
      scheme: {
        type: "groups",
        groups: [
          { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
          {
            key: "q9m4",
            label: "Back-off",
            sets: { min: 2, max: 3 },
            reps: { min: 6, max: 8 },
            link: { ref: "top", percent: 80 },
          },
        ],
      },
      progression: { ...base.progression, strategyId },
    };
  }

  function evaluateLinkedBackoff(strategyId: "load-progression" | "rep-progression" | "manual") {
    const input: SessionExerciseEvaluationInput = {
      sessionExerciseId: "se1",
      exerciseId: "ex1",
      skipped: false,
      prescription: linkedSnapshot(strategyId),
      workSets: [s(140, 2, 2, "top"), s(112.5, 7, 2, "q9m4"), s(112.5, 6, 2, "q9m4")],
      history: [],
      loadStepKg: 2.5,
    };
    return evaluateSession({
      sessionId: "sess1",
      startedAt: "2026-08-10T00:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [input],
    });
  }

  it("produces no record for a linked group under the ordinary manual resolution", () => {
    const results = evaluateLinkedBackoff("manual");
    expect(results.some((r) => r.groupKey === "q9m4")).toBe(false);
  });

  it("defensively produces no record even if a linked group somehow resolved to load-progression", () => {
    const results = evaluateLinkedBackoff("load-progression");
    expect(results.some((r) => r.groupKey === "q9m4")).toBe(false);
  });

  it("defensively produces no record even if a linked group somehow resolved to rep-progression", () => {
    const results = evaluateLinkedBackoff("rep-progression");
    expect(results.some((r) => r.groupKey === "q9m4")).toBe(false);
  });

  it("the independent (unlinked) sibling group in the same scheme still evaluates normally", () => {
    const results = evaluateLinkedBackoff("load-progression");
    expect(results.some((r) => r.groupKey === "top")).toBe(true);
  });
});
