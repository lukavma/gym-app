import { describe, expect, it } from "vitest";
import {
  applySetMultiplier,
  applyWeekModifiersToPrescription,
} from "@/domain/prescriptions/applyWeekModifiers";
import type { GroupsScheme } from "@/domain/schemes/setScheme";

// set-groups-architecture-evaluation.md §8 "Block modifiers" (A-7) —
// setMultiplier applies to each group's min/max independently, floored, and
// the total is clamped so an effective (post-modifier) scheme is always
// PrescriptionSnapshot-valid (Σ sets.max <= 20), the same invariant the
// schema's own superRefine enforces on write.

const scheme: GroupsScheme = {
  type: "groups",
  groups: [
    { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
    { key: "q9m4", label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
  ],
};

describe("applySetMultiplier — groups scheme", () => {
  it("is a no-op when multiplier is undefined", () => {
    expect(applySetMultiplier(scheme, undefined)).toEqual(scheme);
  });

  it("scales each group's min/max independently, floored, minimum 1", () => {
    const result = applySetMultiplier(scheme, 0.5);
    if (result.type !== "groups") throw new Error("expected groups scheme");
    expect(result.groups[0]).toMatchObject({ sets: { min: 1, max: 1 } }); // floor(1*0.5)=0 -> clamped to 1
    expect(result.groups[1]).toMatchObject({ sets: { min: 1, max: 1 } }); // floor(2*0.5)=1, floor(3*0.5)=1
  });

  it("preserves every other group field (label, reps, targetRir, baselineLoadKg)", () => {
    const withOverrides: GroupsScheme = {
      type: "groups",
      groups: [
        {
          key: "top",
          label: "Top",
          sets: { min: 2, max: 2 },
          reps: { min: 2, max: 2 },
          targetRir: { min: 1, max: 2 },
          baselineLoadKg: 140,
        },
      ],
    };
    const result = applySetMultiplier(withOverrides, 0.5);
    if (result.type !== "groups") throw new Error("expected groups scheme");
    expect(result.groups[0]).toEqual({
      key: "top",
      label: "Top",
      sets: { min: 1, max: 1 },
      reps: { min: 2, max: 2 },
      targetRir: { min: 1, max: 2 },
      baselineLoadKg: 140,
    });
  });

  it("clamps the total (Σ sets.max) to 20 even under a large multiplier, never breaking min <= max", () => {
    const bigScheme: GroupsScheme = {
      type: "groups",
      groups: [
        { key: "a", label: "A", sets: { min: 5, max: 8 }, reps: { min: 5, max: 5 } },
        { key: "b", label: "B", sets: { min: 5, max: 8 }, reps: { min: 5, max: 5 } },
      ],
    };
    const result = applySetMultiplier(bigScheme, 2);
    if (result.type !== "groups") throw new Error("expected groups scheme");
    const totalMax = result.groups.reduce((sum, g) => sum + g.sets.max, 0);
    expect(totalMax).toBeLessThanOrEqual(20);
    for (const g of result.groups) {
      expect(g.sets.min).toBeLessThanOrEqual(g.sets.max);
    }
  });

  it("never yields fewer than 1 set per group even at a tiny multiplier", () => {
    const result = applySetMultiplier(scheme, 0.1);
    if (result.type !== "groups") throw new Error("expected groups scheme");
    for (const g of result.groups) {
      expect(g.sets.min).toBeGreaterThanOrEqual(1);
      expect(g.sets.max).toBeGreaterThanOrEqual(1);
    }
  });
});

// L-2 (independent review) — A-7 requires "targetRirShift +2 per group";
// this was previously untested for groups entirely (only setMultiplier and
// field preservation were), and the shift was not actually applied to a
// group's own band.
describe("applyWeekModifiersToPrescription — targetRirShift and groups (A-7/L-2)", () => {
  it("shifts a group's OWN targetRir override by the same amount as the slot band, without double-shifting", () => {
    const schemeWithOverride: GroupsScheme = {
      type: "groups",
      groups: [
        {
          key: "top",
          label: "Top",
          sets: { min: 1, max: 1 },
          reps: { min: 2, max: 2 },
          targetRir: { min: 1, max: 2 },
        },
        { key: "q9m4", label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
      ],
    };
    const result = applyWeekModifiersToPrescription(
      schemeWithOverride,
      { min: 0, max: 2 },
      {
        targetRirShift: 2,
      },
    );
    if (result.scheme.type !== "groups") throw new Error("expected groups scheme");
    // Top's OWN override: shifted from {1,2} to {3,4}.
    expect(result.scheme.groups[0]!.targetRir).toEqual({ min: 3, max: 4 });
    // Back-off has no override of its own — untouched here; it inherits the
    // slot's own (also shifted) band at resolution time instead, never both.
    expect(result.scheme.groups[1]!.targetRir).toBeUndefined();
    // The slot-level band is shifted exactly the same way it always was.
    expect(result.targetRir).toEqual({ min: 2, max: 4 });
  });

  it("clamps a group's own shifted band to [0, 10], same as the slot band", () => {
    const schemeWithOverride: GroupsScheme = {
      type: "groups",
      groups: [
        {
          key: "top",
          label: "Top",
          sets: { min: 1, max: 1 },
          reps: { min: 2, max: 2 },
          targetRir: { min: 9, max: 10 },
        },
      ],
    };
    const result = applyWeekModifiersToPrescription(schemeWithOverride, null, {
      targetRirShift: 5,
    });
    if (result.scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(result.scheme.groups[0]!.targetRir).toEqual({ min: 10, max: 10 });
  });

  it("is a no-op on group bands when targetRirShift is undefined", () => {
    const schemeWithOverride: GroupsScheme = {
      type: "groups",
      groups: [
        {
          key: "top",
          label: "Top",
          sets: { min: 1, max: 1 },
          reps: { min: 2, max: 2 },
          targetRir: { min: 1, max: 2 },
        },
      ],
    };
    const result = applyWeekModifiersToPrescription(schemeWithOverride, { min: 0, max: 2 }, null);
    expect(result.scheme).toEqual(schemeWithOverride);
    expect(result.targetRir).toEqual({ min: 0, max: 2 });
  });
});
