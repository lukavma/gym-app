import { describe, expect, it } from "vitest";
import { resolveWorkingTargets } from "@/domain/progression/workingTargets";
import type { CarryForwardCandidate } from "@/domain/progression/carryForward";
import type { SetScheme } from "@/domain/schemes/setScheme";

// prescription-model.md §4 — the Phase 4 head of the working-target chain:
// chosen values of the latest accepted/modified Decision, then the Phase 3
// carry-forward chain (history → baseline → empty).

const scheme: SetScheme = { type: "repRange", sets: 3, minReps: 8, maxReps: 12 };

const historyCandidate: CarryForwardCandidate = {
  status: "completed",
  isDeload: false,
  startedAt: "2026-08-13T10:00:00.000Z",
  firstWorkSetLoadKg: 100,
};

describe("resolveWorkingTargets", () => {
  it("decision chosen values win over history and scheme defaults", () => {
    expect(
      resolveWorkingTargets({
        decisionChosen: { loadKg: 102.5, reps: 11 },
        candidates: [historyCandidate],
        baselineLoadKg: 60,
        scheme,
      }),
    ).toEqual({ loadKg: 102.5, reps: 11 });
  });

  it("a load-only decision still defaults reps from the scheme", () => {
    expect(
      resolveWorkingTargets({
        decisionChosen: { loadKg: 102.5 },
        candidates: [historyCandidate],
        baselineLoadKg: null,
        scheme,
      }),
    ).toEqual({ loadKg: 102.5, reps: 8 });
  });

  it("no decision (or a rejected one, which callers pass as null) → carry-forward chain", () => {
    expect(
      resolveWorkingTargets({
        decisionChosen: null,
        candidates: [historyCandidate],
        baselineLoadKg: 60,
        scheme,
      }),
    ).toEqual({ loadKg: 100, reps: 8 });
  });

  it("empty history falls to baseline, then to empty", () => {
    expect(
      resolveWorkingTargets({ decisionChosen: null, candidates: [], baselineLoadKg: 60, scheme }),
    ).toEqual({ loadKg: 60, reps: 8 });
    expect(
      resolveWorkingTargets({ decisionChosen: null, candidates: [], baselineLoadKg: null, scheme }),
    ).toEqual({ loadKg: null, reps: 8 });
  });

  it("fixed schemes default reps to the fixed rep count", () => {
    expect(
      resolveWorkingTargets({
        decisionChosen: null,
        candidates: [],
        baselineLoadKg: null,
        scheme: { type: "fixed", sets: 5, reps: 5 },
      }),
    ).toEqual({ loadKg: null, reps: 5 });
  });
});
