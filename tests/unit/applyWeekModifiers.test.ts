import { describe, expect, it } from "vitest";
import {
  applyLoadMultiplier,
  applySetMultiplier,
  applyTargetRirShift,
  applyWeekModifiersToPrescription,
} from "@/domain/prescriptions/applyWeekModifiers";
import type { SetScheme } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";

describe("applySetMultiplier", () => {
  it("is a no-op when multiplier is undefined", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    expect(applySetMultiplier(scheme, undefined)).toEqual(scheme);
  });

  it("rounds down, per prescription-model.md §5's example (5 sets -> 2)", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    expect(applySetMultiplier(scheme, 0.5).sets).toBe(2);
  });

  it("never yields fewer than one set", () => {
    const scheme: SetScheme = { type: "fixed", sets: 1, reps: 5 };
    expect(applySetMultiplier(scheme, 0.5).sets).toBe(1);
  });

  it("floors a fractional result that would otherwise round to zero", () => {
    const scheme: SetScheme = { type: "repRange", sets: 3, minReps: 8, maxReps: 12 };
    expect(applySetMultiplier(scheme, 0.34).sets).toBe(1);
  });

  it("preserves every other scheme field", () => {
    const scheme: SetScheme = { type: "repRange", sets: 4, minReps: 8, maxReps: 12 };
    expect(applySetMultiplier(scheme, 0.5)).toEqual({
      type: "repRange",
      sets: 2,
      minReps: 8,
      maxReps: 12,
    });
  });

  // M-1 regression — weekModifiersSchema now rejects setMultiplier > 2 on
  // write, but a config stored before that bound existed (or any future
  // caller that skips the schema) must still clamp here: this is what keeps
  // "effective modifier application always produces a PrescriptionSnapshot-
  // valid scheme" (1 <= sets <= 20) true unconditionally.
  it("clamps to the scheme's SETS_MAX (20) instead of overflowing on an out-of-range multiplier", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    expect(applySetMultiplier(scheme, 5).sets).toBe(20);
  });

  it("clamps exactly at the SETS_MAX boundary, not past it", () => {
    const scheme: SetScheme = { type: "fixed", sets: 20, reps: 5 };
    expect(applySetMultiplier(scheme, 1).sets).toBe(20);
    expect(applySetMultiplier(scheme, 1.5).sets).toBe(20);
  });
});

describe("applyTargetRirShift", () => {
  it("is a no-op when shift is undefined or band is null", () => {
    const band: RirBand = { min: 0, max: 2 };
    expect(applyTargetRirShift(band, undefined)).toEqual(band);
    expect(applyTargetRirShift(null, 2)).toBeNull();
  });

  it("shifts both ends by the same amount", () => {
    expect(applyTargetRirShift({ min: 0, max: 2 }, 2)).toEqual({ min: 2, max: 4 });
  });

  it("clamps the low end at 0 without breaking min <= max", () => {
    expect(applyTargetRirShift({ min: 0, max: 2 }, -5)).toEqual({ min: 0, max: 0 });
  });

  it("clamps the high end at 10 without breaking min <= max", () => {
    expect(applyTargetRirShift({ min: 0, max: 2 }, 15)).toEqual({ min: 10, max: 10 });
  });

  it("clamps a band already at an extreme", () => {
    expect(applyTargetRirShift({ min: 8, max: 10 }, 5)).toEqual({ min: 10, max: 10 });
  });
});

describe("applyLoadMultiplier", () => {
  it("is a no-op when multiplier is undefined or load is null", () => {
    expect(applyLoadMultiplier(100, undefined, 2.5)).toBe(100);
    expect(applyLoadMultiplier(null, 0.9, 2.5)).toBeNull();
  });

  it("multiplies then rounds to loadStepKg", () => {
    // 100 * 0.9 = 90 -> already a multiple of 2.5.
    expect(applyLoadMultiplier(100, 0.9, 2.5)).toBe(90);
    // 62.5 * 0.9 = 56.25 -> nearest 2.5 multiple is 57.5? no: 56.25/2.5=22.5,
    // rounds to 23 -> 57.5.
    expect(applyLoadMultiplier(62.5, 0.9, 2.5)).toBe(57.5);
  });

  it("rounds to a dumbbell-style step", () => {
    expect(applyLoadMultiplier(30, 0.5, 2)).toBe(16);
  });
});

describe("applyWeekModifiersToPrescription", () => {
  it("passes scheme/targetRir through unchanged when modifiers is null", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    const targetRir: RirBand = { min: 0, max: 2 };
    expect(applyWeekModifiersToPrescription(scheme, targetRir, null)).toEqual({
      scheme,
      targetRir,
    });
  });

  it("applies setMultiplier and targetRirShift together", () => {
    const scheme: SetScheme = { type: "fixed", sets: 5, reps: 5 };
    const targetRir: RirBand = { min: 0, max: 2 };
    const result = applyWeekModifiersToPrescription(scheme, targetRir, {
      setMultiplier: 0.5,
      targetRirShift: 2,
    });
    expect(result.scheme).toEqual({ type: "fixed", sets: 2, reps: 5 });
    expect(result.targetRir).toEqual({ min: 2, max: 4 });
  });
});
