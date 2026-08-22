import { describe, expect, it } from "vitest";
import { buildPrescriptionSnapshotData } from "@/domain/prescriptions/buildSnapshot";
import type { SnapshotPrescription } from "@/domain/prescriptions/buildSnapshot";
import type { CarryForwardCandidate } from "@/domain/progression/carryForward";
import type { ResolvedProgression } from "@/domain/progression/registry";

const exercise = { id: "ex-1", name: "Bench Press" };

const manualProgression: ResolvedProgression = {
  strategyId: "manual",
  config: {},
  classification: "heuristic",
};

function prescription(overrides: Partial<SnapshotPrescription> = {}): SnapshotPrescription {
  return {
    scheme: { type: "fixed", sets: 5, reps: 5 },
    targetRir: { min: 0, max: 2 },
    restSeconds: null,
    progression: manualProgression,
    baselineLoadKg: 100,
    ...overrides,
  };
}

describe("buildPrescriptionSnapshotData — week modifiers (Phase 5)", () => {
  it("appliedModifiers is null and scheme/targetRir/prefill are unmodified when no modifiers apply", () => {
    const result = buildPrescriptionSnapshotData(exercise, prescription(), [], null, null, 2.5);
    expect(result.appliedModifiers).toBeNull();
    expect(result.scheme).toEqual({ type: "fixed", sets: 5, reps: 5 });
    expect(result.targetRir).toEqual({ min: 0, max: 2 });
    expect(result.prefill.loadKg).toBe(100);
  });

  it("applies setMultiplier/targetRirShift to the static prescription and records appliedModifiers", () => {
    const modifiers = { setMultiplier: 0.5, targetRirShift: 2 };
    const result = buildPrescriptionSnapshotData(
      exercise,
      prescription(),
      [],
      null,
      modifiers,
      2.5,
    );
    expect(result.scheme).toEqual({ type: "fixed", sets: 2, reps: 5 });
    expect(result.targetRir).toEqual({ min: 2, max: 4 });
    expect(result.appliedModifiers).toEqual(modifiers);
  });

  it("applies loadMultiplier to the resolved prefill (carry-forward), not the raw baseline", () => {
    const candidates: CarryForwardCandidate[] = [
      {
        status: "completed",
        isDeload: false,
        startedAt: "2026-01-08T09:00:00.000Z",
        firstWorkSetLoadKg: 120,
      },
    ];
    // baseline (100) would round to 90 at 0.9x; carry-forward (120) rounds to
    // 107.5 (120*0.9=108 -> nearest 2.5 is 107.5) — proves the multiplier is
    // applied after the chain resolves, not to baselineLoadKg directly.
    const result = buildPrescriptionSnapshotData(
      exercise,
      prescription({ baselineLoadKg: 100 }),
      candidates,
      null,
      { loadMultiplier: 0.9 },
      2.5,
    );
    expect(result.prefill.loadKg).toBe(107.5);
  });

  it("applies loadMultiplier on top of a decision's chosen load", () => {
    const result = buildPrescriptionSnapshotData(
      exercise,
      prescription(),
      [],
      { loadKg: 100 },
      { loadMultiplier: 0.9 },
      2.5,
    );
    // 100 * 0.9 = 90, already a 2.5 multiple.
    expect(result.prefill.loadKg).toBe(90);
  });

  it("leaves prefill.reps untouched by loadMultiplier", () => {
    const result = buildPrescriptionSnapshotData(
      exercise,
      prescription(),
      [],
      { loadKg: 100, reps: 8 },
      { loadMultiplier: 0.9 },
      2.5,
    );
    expect(result.prefill.reps).toBe(8);
  });
});
