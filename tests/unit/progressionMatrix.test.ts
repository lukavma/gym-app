import { describe, expect, it } from "vitest";
import {
  loadProgressionConfigSchema,
  repProgressionConfigSchema,
  supportsScheme,
  STRATEGY_IDS,
} from "@/domain/progression/registry";
import { evaluateLoadProgression } from "@/domain/progression/loadProgression";
import { evaluateRepProgression } from "@/domain/progression/repProgression";
import { evaluateSession } from "@/domain/progression/evaluateSession";
import { checkRir, type EvaluationContext, type PerformedSet } from "@/domain/progression/engine";
import { modalWorkingLoad, roundToStepKg } from "@/domain/progression/loadHelpers";
import { SCHEME_TYPES, type SetScheme } from "@/domain/schemes/setScheme";
import type { PrescriptionSnapshotData } from "@/domain/schemas/prescriptionSnapshot";

// progression-engine.md §9 — the required unit-level testing contract:
// every case is a plain-object fixture → evaluate() → asserted draft. The
// fourteen numbered cases below are the matrix, implemented literally.

const EXERCISE_ID = "6a1f0a3e-0000-7000-8000-000000000001";

function workSet(weightKg: number, reps: number, rir: number | null = null): PerformedSet {
  return { weightKg, reps, rir };
}

// n sets of the same weight/reps; `finalRir` applies to the last set only.
function straightSets(
  n: number,
  weightKg: number,
  reps: number,
  finalRir: number | null,
): PerformedSet[] {
  return Array.from({ length: n }, (_, i) => workSet(weightKg, reps, i === n - 1 ? finalRir : 2));
}

function makeCtx(overrides: {
  scheme?: SetScheme;
  prefillReps?: number | null;
  workSets: PerformedSet[];
  history?: EvaluationContext["history"];
  loadStepKg?: number;
}): EvaluationContext {
  const scheme = overrides.scheme ?? { type: "fixed", sets: 5, reps: 5 };
  return {
    prescription: {
      scheme,
      targetRir: { min: 0, max: 2 },
      prefill: {
        loadKg: null,
        reps:
          overrides.prefillReps !== undefined
            ? overrides.prefillReps
            : scheme.type === "fixed"
              ? scheme.reps
              : scheme.minReps,
      },
    },
    performance: {
      sessionId: "6a1f0a3e-0000-7000-8000-00000000aaaa",
      performedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      prescribed: { scheme, targetRir: { min: 0, max: 2 } },
      workSets: overrides.workSets,
    },
    history: overrides.history ?? [],
    block: { weekIndex: 2, isDeload: false, goal: "hypertrophy" },
    exercise: { id: EXERCISE_ID, loadStepKg: overrides.loadStepKg ?? 2.5 },
  };
}

const loadCfg = (over: Record<string, unknown> = {}) => loadProgressionConfigSchema.parse(over);
const repCfg = (over: Record<string, unknown> = {}) => repProgressionConfigSchema.parse(over);

function snapshot(over: Partial<PrescriptionSnapshotData> = {}): PrescriptionSnapshotData {
  return {
    exerciseId: EXERCISE_ID,
    exerciseName: "Bench Press",
    scheme: { type: "fixed", sets: 5, reps: 5 },
    targetRir: { min: 0, max: 2 },
    restSeconds: null,
    progression: {
      strategyId: "load-progression",
      strategyVersion: 1,
      config: {},
      classification: "heuristic",
    },
    appliedModifiers: null,
    prefill: { loadKg: 112.5, reps: 5 },
    ...over,
  };
}

describe("progression-engine §9 matrix", () => {
  it("case 1 — 5×5 completed, final RIR 2 → increase_load +2.5, high confidence", () => {
    const draft = evaluateLoadProgression(
      makeCtx({ workSets: straightSets(5, 112.5, 5, 2) }),
      loadCfg(),
    );
    expect(draft.action).toBe("increase_load");
    expect(draft.target).toEqual({ loadKg: 115 });
    expect(draft.reasonCodes).toEqual([
      "ALL_PRESCRIBED_REPS_COMPLETED",
      "FINAL_SET_RIR_IN_PROGRESS_ZONE",
    ]);
    expect(draft.confidence).toBe("high");
  });

  it("case 2 — 5×5 completed, final RIR 0, holdAtRirZero → hold with AT_LIMIT code", () => {
    const draft = evaluateLoadProgression(
      makeCtx({ workSets: straightSets(5, 112.5, 5, 0) }),
      loadCfg({ holdAtRirZero: true }),
    );
    expect(draft.action).toBe("hold");
    expect(draft.target).toEqual({ loadKg: 112.5 });
    expect(draft.reasonCodes).toContain("FINAL_SET_RIR_AT_LIMIT");
  });

  it("case 3 — 5×5 incomplete (4×5 + 1×4) → hold, PRESCRIBED_REPS_NOT_COMPLETED", () => {
    const workSets = [...straightSets(4, 112.5, 5, 2), workSet(112.5, 4, 1)];
    const draft = evaluateLoadProgression(makeCtx({ workSets }), loadCfg());
    expect(draft.action).toBe("hold");
    expect(draft.target).toEqual({ loadKg: 112.5 });
    expect(draft.reasonCodes).toEqual(["PRESCRIBED_REPS_NOT_COMPLETED"]);
  });

  it("case 4 — completed, RIR missing, reps_only → increase_load, medium, RIR_MISSING code", () => {
    const workSets = Array.from({ length: 5 }, () => workSet(112.5, 5, null));
    const draft = evaluateLoadProgression(
      makeCtx({ workSets }),
      loadCfg({ onMissingRir: "reps_only" }),
    );
    expect(draft.action).toBe("increase_load");
    expect(draft.target).toEqual({ loadKg: 115 });
    expect(draft.reasonCodes).toContain("RIR_MISSING_REPS_ONLY_EVALUATION");
    expect(draft.confidence).toBe("medium");
  });

  it("case 5 — completed, RIR missing, hold policy → hold", () => {
    const workSets = Array.from({ length: 5 }, () => workSet(112.5, 5, null));
    const draft = evaluateLoadProgression(makeCtx({ workSets }), loadCfg({ onMissingRir: "hold" }));
    expect(draft.action).toBe("hold");
    expect(draft.target).toEqual({ loadKg: 112.5 });
    expect(draft.reasonCodes).toContain("RIR_MISSING_HOLD_POLICY");
    expect(draft.confidence).toBe("medium");
  });

  it("case 6 — two consecutive incomplete at same load, failureAction decrease → decrease 10% rounded to step", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    const incompleteSets = [...straightSets(4, 102.5, 5, 1), workSet(102.5, 3, 0)];
    const draft = evaluateLoadProgression(
      makeCtx({
        scheme,
        workSets: incompleteSets,
        history: [
          {
            sessionId: "6a1f0a3e-0000-7000-8000-00000000bbbb",
            performedAt: "2026-08-13T10:00:00.000Z",
            isDeload: false,
            prescribed: { scheme },
            workSets: [...straightSets(4, 102.5, 5, 1), workSet(102.5, 4, 0)],
          },
        ],
      }),
      loadCfg({ failureAction: "decrease", decreaseAfterConsecutiveFailures: 2 }),
    );
    expect(draft.action).toBe("decrease_load");
    // 102.5 × 0.9 = 92.25 → nearest 2.5 multiple = 92.5
    expect(draft.target).toEqual({ loadKg: 92.5 });
    expect(draft.reasonCodes).toEqual(["REPEATED_INCOMPLETE_AT_LOAD", "DECREASE_APPLIED"]);
    expect(draft.confidence).toBe("medium");
  });

  it("case 7 — rep-range 3×8–12 at 10s, RIR ok → increase_reps to 11", () => {
    const scheme: SetScheme = { type: "repRange", sets: 3, minReps: 8, maxReps: 12 };
    const draft = evaluateRepProgression(
      makeCtx({ scheme, prefillReps: 10, workSets: straightSets(3, 100, 10, 2) }),
      repCfg({ repCap: 12 }),
    );
    expect(draft.action).toBe("increase_reps");
    expect(draft.target).toEqual({ reps: 11, loadKg: 100 });
    expect(draft.reasonCodes).toContain("REP_TARGET_INCREASED");
  });

  it("case 8 — rep progression at cap, hold → REP_CAP_REACHED + hold", () => {
    const scheme: SetScheme = { type: "repRange", sets: 3, minReps: 8, maxReps: 12 };
    const draft = evaluateRepProgression(
      makeCtx({ scheme, prefillReps: 12, workSets: straightSets(3, 100, 12, 2) }),
      repCfg({ repCap: 12, onCapReached: "hold" }),
    );
    expect(draft.action).toBe("hold");
    expect(draft.target).toEqual({ loadKg: 100, reps: 12 });
    expect(draft.reasonCodes).toEqual(["REP_CAP_REACHED", "HOLD_POLICY"]);
  });

  it("case 9 — rep progression at cap, suggest_load_increase → load +step, reps reset to schemeMin", () => {
    const scheme: SetScheme = { type: "repRange", sets: 3, minReps: 8, maxReps: 12 };
    const draft = evaluateRepProgression(
      makeCtx({ scheme, prefillReps: 12, workSets: straightSets(3, 100, 12, 2) }),
      repCfg({ repCap: 12, onCapReached: "suggest_load_increase" }),
    );
    expect(draft.action).toBe("increase_load");
    expect(draft.target).toEqual({ loadKg: 102.5, reps: 8 });
    expect(draft.reasonCodes).toEqual(["REP_CAP_REACHED", "LOAD_INCREASE_WITH_REP_RESET"]);
  });

  it("case 10 — deload session → no evaluation", () => {
    const results = evaluateSession({
      sessionId: "6a1f0a3e-0000-7000-8000-00000000cccc",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: true,
      block: null,
      exercises: [
        {
          sessionExerciseId: "6a1f0a3e-0000-7000-8000-00000000dddd",
          exerciseId: EXERCISE_ID,
          skipped: false,
          prescription: snapshot(),
          workSets: straightSets(5, 112.5, 5, 2),
          history: [],
          loadStepKg: 2.5,
        },
      ],
    });
    expect(results).toEqual([]);
  });

  it("case 11 — reported RIR 8 against a narrowed gate → hold + SUSPECT code, low confidence", () => {
    const draft = evaluateLoadProgression(
      makeCtx({ workSets: straightSets(5, 112.5, 5, 8) }),
      loadCfg({ progressRirGate: { min: 1, max: 4 } }),
    );
    expect(draft.action).toBe("hold");
    expect(draft.reasonCodes).toEqual(["FINAL_SET_RIR_ABOVE_PROGRESS_ZONE_SUSPECT"]);
    expect(draft.confidence).toBe("low");
  });

  it("case 12 — rounding: increment lands on loadStepKg multiples (dumbbell 2.0)", () => {
    // Off-step working load 22.5 with a 2.0 kg dumbbell step: 22.5 + 2.0 =
    // 24.5 → nearest multiple of 2.0 is 24.
    const draft = evaluateLoadProgression(
      makeCtx({ workSets: straightSets(5, 22.5, 5, 2), loadStepKg: 2.0 }),
      loadCfg(),
    );
    expect(draft.action).toBe("increase_load");
    expect(draft.target).toEqual({ loadKg: 24 });
    expect((draft.target!.loadKg! * 10) % (2.0 * 10)).toBe(0);
  });

  it("case 12b — rounding: fractional loadStepKg (1.25 kg) regression (Phase 5.5 Light)", () => {
    // Off-grid working load 99 with a 1.25 kg step: 99 + 1.25 increment =
    // 100.25 -> nearest 1.25 multiple is 100 (100.25/1.25 = 80.2, rounds
    // down to 80 -> 100).
    const draft = evaluateLoadProgression(
      makeCtx({ workSets: straightSets(5, 99, 5, 2), loadStepKg: 1.25 }),
      loadCfg(),
    );
    expect(draft.action).toBe("increase_load");
    expect(draft.target).toEqual({ loadKg: 100 });
  });

  it("case 13 — determinism: identical context evaluated twice ⇒ deep-equal drafts", () => {
    const build = () =>
      makeCtx({
        workSets: [...straightSets(4, 112.5, 5, 2), workSet(112.5, 5, 1)],
        history: [
          {
            sessionId: "6a1f0a3e-0000-7000-8000-00000000eeee",
            performedAt: "2026-08-13T10:00:00.000Z",
            isDeload: false,
            prescribed: { scheme: { type: "fixed", sets: 5, reps: 5 } },
            workSets: straightSets(5, 110, 5, 1),
          },
        ],
      });
    const first = evaluateLoadProgression(build(), loadCfg());
    const second = evaluateLoadProgression(build(), loadCfg());
    expect(second).toEqual(first);
  });

  it("case 14 — exhaustiveness: every scheme type × every strategy is supported or cleanly UNSUPPORTED_SCHEME", () => {
    // MVP truth table (prescription-model.md §2): every shipped strategy
    // supports every shipped scheme type.
    for (const strategyId of STRATEGY_IDS) {
      for (const schemeType of SCHEME_TYPES) {
        expect(supportsScheme(strategyId, schemeType)).toBe(true);
      }
    }
    // Defensive path: an unknown (future) scheme variant reaching the
    // engine yields action none + UNSUPPORTED_SCHEME, never a crash.
    const futureScheme = { type: "perSet", sets: 3 } as unknown as SetScheme;
    const results = evaluateSession({
      sessionId: "6a1f0a3e-0000-7000-8000-00000000ffff",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [
        {
          sessionExerciseId: "6a1f0a3e-0000-7000-8000-000000001111",
          exerciseId: EXERCISE_ID,
          skipped: false,
          prescription: snapshot({ scheme: futureScheme }),
          workSets: straightSets(3, 100, 8, 2),
          history: [],
          loadStepKg: 2.5,
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.draft.action).toBe("none");
    expect(results[0]!.draft.reasonCodes).toEqual(["UNSUPPORTED_SCHEME"]);
  });
});

describe("degenerate-data behavior (progression-engine §8)", () => {
  it("no work sets logged → action none, NO_WORK_SETS_LOGGED, low confidence", () => {
    const draft = evaluateLoadProgression(makeCtx({ workSets: [] }), loadCfg());
    expect(draft.action).toBe("none");
    expect(draft.reasonCodes).toEqual(["NO_WORK_SETS_LOGGED"]);
    expect(draft.confidence).toBe("low");
    const repDraft = evaluateRepProgression(makeCtx({ workSets: [] }), repCfg({ repCap: 12 }));
    expect(repDraft.action).toBe("none");
    expect(repDraft.reasonCodes).toEqual(["NO_WORK_SETS_LOGGED"]);
  });

  it("decrease configured with no history → INSUFFICIENT_HISTORY noted, medium confidence", () => {
    const workSets = [...straightSets(4, 100, 5, 1), workSet(100, 3, 0)];
    const draft = evaluateLoadProgression(
      makeCtx({ workSets }),
      loadCfg({ failureAction: "decrease" }),
    );
    expect(draft.action).toBe("hold");
    expect(draft.reasonCodes).toEqual(["PRESCRIBED_REPS_NOT_COMPLETED", "INSUFFICIENT_HISTORY"]);
    expect(draft.confidence).toBe("medium");
  });

  it("mixed loads → modal load used, flagged in inputs, confidence capped at medium", () => {
    const workSets = [
      workSet(100, 5, 2),
      workSet(100, 5, 2),
      workSet(1000, 5, 2), // typo outlier
      workSet(100, 5, 2),
      workSet(100, 5, 2),
    ];
    const draft = evaluateLoadProgression(makeCtx({ workSets }), loadCfg());
    expect(draft.inputs.derived.workingLoadKg).toBe(100);
    expect(draft.inputs.derived.mixedLoads).toBe(true);
    expect(draft.action).toBe("increase_load");
    expect(draft.target).toEqual({ loadKg: 102.5 });
    expect(draft.confidence).toBe("medium");
  });

  it("deload history entries neither trigger nor reset the failure streak (skipped over)", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    const incomplete = [...straightSets(4, 100, 5, 1), workSet(100, 3, 0)];
    const draft = evaluateLoadProgression(
      makeCtx({
        scheme,
        workSets: incomplete,
        history: [
          {
            sessionId: "6a1f0a3e-0000-7000-8000-000000002221",
            performedAt: "2026-08-17T10:00:00.000Z",
            isDeload: true, // deload in between — skipped, does not reset
            prescribed: { scheme },
            workSets: straightSets(2, 50, 5, 5),
          },
          {
            sessionId: "6a1f0a3e-0000-7000-8000-000000002222",
            performedAt: "2026-08-13T10:00:00.000Z",
            isDeload: false,
            prescribed: { scheme },
            workSets: [...straightSets(4, 100, 5, 1), workSet(100, 4, 0)],
          },
        ],
      }),
      loadCfg({ failureAction: "decrease", decreaseAfterConsecutiveFailures: 2 }),
    );
    expect(draft.action).toBe("decrease_load");
    expect(draft.target).toEqual({ loadKg: 90 });
  });
});

describe("evaluateSession skip rules (progression-engine §5)", () => {
  const baseExercise = {
    sessionExerciseId: "6a1f0a3e-0000-7000-8000-000000003333",
    exerciseId: EXERCISE_ID,
    workSets: straightSets(5, 112.5, 5, 2),
    history: [],
    loadStepKg: 2.5,
  };

  it("manual strategy → no record", () => {
    const results = evaluateSession({
      sessionId: "s",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [
        {
          ...baseExercise,
          skipped: false,
          prescription: snapshot({
            progression: {
              strategyId: "manual",
              strategyVersion: 1,
              config: {},
              classification: "heuristic",
            },
          }),
        },
      ],
    });
    expect(results).toEqual([]);
  });

  it("skipped exercise → no record", () => {
    const results = evaluateSession({
      sessionId: "s",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [{ ...baseExercise, skipped: true, prescription: snapshot() }],
    });
    expect(results).toEqual([]);
  });

  it("ad-hoc exercise without prescription → no record (implicitly manual)", () => {
    const results = evaluateSession({
      sessionId: "s",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [{ ...baseExercise, skipped: false, prescription: null }],
    });
    expect(results).toEqual([]);
  });

  it("eligible exercise → one record carrying frozen config, version, and classification", () => {
    const results = evaluateSession({
      sessionId: "s",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: { weekIndex: 1, isDeload: false, goal: "hypertrophy" },
      exercises: [{ ...baseExercise, skipped: false, prescription: snapshot() }],
    });
    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.strategyId).toBe("load-progression");
    expect(result.strategyVersion).toBe(1);
    expect(result.classification).toBe("heuristic");
    expect(result.draft.action).toBe("increase_load");
    // The evaluated config is the Zod-materialized shape (defaults filled).
    expect(result.config).toMatchObject({ progressRirGate: { min: 1, max: 10 } });
  });
});

describe("checkRir bands (progression-engine §3)", () => {
  it("maps null → unknown, below-min → below, above-max → above, in-band → met", () => {
    const gate = { min: 1, max: 4 };
    expect(checkRir(null, gate)).toBe("unknown");
    expect(checkRir(0, gate)).toBe("below");
    expect(checkRir(1, gate)).toBe("met");
    expect(checkRir(4, gate)).toBe("met");
    expect(checkRir(5, gate)).toBe("above");
  });
});

describe("load helpers", () => {
  it("roundToStepKg rounds to the nearest step multiple with 2-decimal precision", () => {
    expect(roundToStepKg(92.25, 2.5)).toBe(92.5);
    expect(roundToStepKg(24.5, 2.0)).toBe(24);
    expect(roundToStepKg(101.24, 0)).toBe(101.24);
    expect(roundToStepKg(103.75, 2.5)).toBe(105); // half rounds up
  });

  it("modalWorkingLoad picks the most frequent load; ties break to the earliest set", () => {
    expect(modalWorkingLoad([workSet(100, 5), workSet(102.5, 5), workSet(102.5, 5)])).toEqual({
      loadKg: 102.5,
      mixed: true,
    });
    expect(modalWorkingLoad([workSet(100, 5), workSet(102.5, 5)])).toEqual({
      loadKg: 100,
      mixed: true,
    });
    expect(modalWorkingLoad([workSet(100, 5), workSet(100, 5)])).toEqual({
      loadKg: 100,
      mixed: false,
    });
    expect(modalWorkingLoad([])).toEqual({ loadKg: 0, mixed: false });
  });
});
