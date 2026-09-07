import { describe, expect, it, vi } from "vitest";
import { evaluateSession } from "@/domain/progression/evaluateSession";
import * as loadProgressionModule from "@/domain/progression/loadProgression";
import * as repProgressionModule from "@/domain/progression/repProgression";
import type { PerformedSet } from "@/domain/progression/engine";
import type { PrescriptionSnapshotData } from "@/domain/schemas/prescriptionSnapshot";

// athletic-measurement-profiles-architecture-evaluation.md §11.2/§11.3 site
// #1, NC-9 — progression strategies are load_reps-only in v1 (N-13); a
// non-load_reps slot must be skipped BEFORE the strategy dispatch, provably
// (not just "no output" — the strategy function itself must never run).
// Wrapping the real implementations in `vi.fn(actual)` (pass-through) lets
// this file assert non-invocation without faking the strategies' behavior.
vi.mock("@/domain/progression/loadProgression", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/progression/loadProgression")>();
  return { ...actual, evaluateLoadProgression: vi.fn(actual.evaluateLoadProgression) };
});
vi.mock("@/domain/progression/repProgression", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/progression/repProgression")>();
  return { ...actual, evaluateRepProgression: vi.fn(actual.evaluateRepProgression) };
});

const loadSpy = loadProgressionModule.evaluateLoadProgression as unknown as ReturnType<
  typeof vi.fn
>;
const repSpy = repProgressionModule.evaluateRepProgression as unknown as ReturnType<typeof vi.fn>;

const EXERCISE_ID = "6a1f0a3e-0000-7000-8000-000000000001";
const OTHER_EXERCISE_ID = "6a1f0a3e-0000-7000-8000-000000000002";

function workSet(weightKg: number, reps: number, rir: number | null = null): PerformedSet {
  return { weightKg, reps, rir };
}

function straightSets(n: number, weightKg: number, reps: number, finalRir: number | null) {
  return Array.from({ length: n }, (_, i) => workSet(weightKg, reps, i === n - 1 ? finalRir : 2));
}

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

describe("evaluateSession measurement-profile gate (NC-9)", () => {
  it("skips a non-load_reps slot before any strategy runs, while a load_reps slot in the SAME session still evaluates", () => {
    const results = evaluateSession({
      sessionId: "s",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [
        {
          // A non-load_reps, non-manual slot — must be skipped by the
          // measurement-profile gate, not by supportsScheme's scheme-type
          // check (a distanceRounds scheme is structurally correct for
          // load_distance, so a mismatch-based skip would never fire here).
          sessionExerciseId: "6a1f0a3e-0000-7000-8000-0000000000aa",
          exerciseId: OTHER_EXERCISE_ID,
          skipped: false,
          prescription: snapshot({
            exerciseId: OTHER_EXERCISE_ID,
            scheme: { type: "distanceRounds", sets: 4, distanceM: 20 },
            measurement: { profile: "load_distance", loadBasis: "unspecified" },
            progression: {
              strategyId: "rep-progression",
              strategyVersion: 1,
              config: {},
              classification: "heuristic",
            },
          }),
          workSets: straightSets(4, 0, 0, null),
          history: [],
          loadStepKg: 2.5,
        },
        {
          // A normal load_reps slot — evaluated exactly as before.
          sessionExerciseId: "6a1f0a3e-0000-7000-8000-0000000000bb",
          exerciseId: EXERCISE_ID,
          skipped: false,
          prescription: snapshot(),
          workSets: straightSets(5, 112.5, 5, 2),
          history: [],
          loadStepKg: 2.5,
        },
      ],
    });

    // No row, no draft for the non-load_reps slot; the load_reps slot's
    // recommendation is the only one produced.
    expect(results).toHaveLength(1);
    expect(results[0]!.exerciseId).toBe(EXERCISE_ID);
    expect(results[0]!.draft.action).toBe("increase_load");

    // Provable non-invocation (not just "no output"): rep-progression, the
    // strategy the skipped slot named, was never called at all.
    expect(repSpy).not.toHaveBeenCalled();
    // load-progression ran exactly once — for the load_reps slot only.
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it("skips every non-load_reps profile individually (not just one example)", () => {
    const profiles = [
      "reps",
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ] as const;
    for (const profile of profiles) {
      loadSpy.mockClear();
      repSpy.mockClear();
      const results = evaluateSession({
        sessionId: "s",
        startedAt: "2026-08-20T10:00:00.000Z",
        isDeload: false,
        block: null,
        exercises: [
          {
            sessionExerciseId: "6a1f0a3e-0000-7000-8000-0000000000cc",
            exerciseId: EXERCISE_ID,
            skipped: false,
            prescription: snapshot({ measurement: { profile, loadBasis: null } }),
            workSets: straightSets(5, 112.5, 5, 2),
            history: [],
            loadStepKg: 2.5,
          },
        ],
      });
      expect(results).toEqual([]);
      expect(loadSpy).not.toHaveBeenCalled();
      expect(repSpy).not.toHaveBeenCalled();
    }
  });

  it("a load_reps slot with no measurement key (pre-existing snapshot shape) still evaluates normally", () => {
    const results = evaluateSession({
      sessionId: "s",
      startedAt: "2026-08-20T10:00:00.000Z",
      isDeload: false,
      block: null,
      exercises: [
        {
          sessionExerciseId: "6a1f0a3e-0000-7000-8000-0000000000dd",
          exerciseId: EXERCISE_ID,
          skipped: false,
          prescription: snapshot(), // no `measurement` key at all
          workSets: straightSets(5, 112.5, 5, 2),
          history: [],
          loadStepKg: 2.5,
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
