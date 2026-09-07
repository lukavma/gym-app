import { describe, expect, it } from "vitest";
import {
  checkPrescriptionCompatibility,
  createPrescriptionSchema,
  reorderPrescriptionsSchema,
  updatePrescriptionSchema,
} from "@/domain/prescriptions/schema";

const validFixedScheme = { type: "fixed" as const, sets: 3, reps: 10 };

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    exerciseId: "00000000-0000-0000-0000-000000000001",
    scheme: { v: 1, scheme: validFixedScheme },
    progression: { strategyId: "manual" },
    ...overrides,
  };
}

describe("createPrescriptionSchema", () => {
  it("accepts a minimal valid prescription", () => {
    const result = createPrescriptionSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid exerciseId", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ exerciseId: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("accepts a baselineLoadKg that is a multiple of 0.25", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg: 62.5 }));
    expect(result.success).toBe(true);
  });

  it("rejects a baselineLoadKg that is not a multiple of 0.25", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg: 62.3 }));
    expect(result.success).toBe(false);
  });

  // LOW-2 (phase-5.5-light-remediation-verification.md) — the previous
  // `Math.round(v * 100) % 25 === 0` refine had a float-precision hole:
  // these four all passed it and were then silently rounded by the
  // numeric(6,2) column. `.multipleOf(0.25)` must reject all four.
  it.each([1.005, 82.501, 0.249, 1.001])(
    "rejects a baselineLoadKg of %s (float-noise near the 0.25 grid)",
    (baselineLoadKg) => {
      const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg }));
      expect(result.success).toBe(false);
    },
  );

  it.each([0, 0.25, 1.25, 82.5, 100.25, 1000])(
    "accepts a baselineLoadKg of %s (exact 0.25-grid value)",
    (baselineLoadKg) => {
      const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg }));
      expect(result.success).toBe(true);
    },
  );

  it("rejects a baselineLoadKg above the 1000kg ceiling", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg: 1000.25 }));
    expect(result.success).toBe(false);
  });

  it("accepts a baselineLoadKg at the 1000kg ceiling", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg: 1000 }));
    expect(result.success).toBe(true);
  });

  it("rejects a negative baselineLoadKg", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ baselineLoadKg: -0.25 }));
    expect(result.success).toBe(false);
  });

  it("rejects notes longer than 2000 characters", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ notes: "a".repeat(2001) }));
    expect(result.success).toBe(false);
  });

  it("rejects a restSeconds of zero (must be positive)", () => {
    const result = createPrescriptionSchema.safeParse(baseInput({ restSeconds: 0 }));
    expect(result.success).toBe(false);
  });
});

describe("updatePrescriptionSchema", () => {
  it("accepts a partial update", () => {
    const result = updatePrescriptionSchema.safeParse({ notes: "updated" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty patch", () => {
    const result = updatePrescriptionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts explicit nulls to clear optional fields", () => {
    const result = updatePrescriptionSchema.safeParse({
      targetRir: null,
      baselineLoadKg: null,
      restSeconds: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys (strict schema)", () => {
    const result = updatePrescriptionSchema.safeParse({ position: 3 });
    expect(result.success).toBe(false);
  });
});

describe("reorderPrescriptionsSchema", () => {
  it("accepts a non-empty array of prescription ids", () => {
    const result = reorderPrescriptionsSchema.safeParse({
      prescriptionIds: ["00000000-0000-0000-0000-000000000001"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = reorderPrescriptionsSchema.safeParse({ prescriptionIds: [] });
    expect(result.success).toBe(false);
  });
});

describe("checkPrescriptionCompatibility", () => {
  it("returns no issues for a fixed scheme with load-progression on load_reps", () => {
    const issues = checkPrescriptionCompatibility(
      validFixedScheme,
      { strategyId: "load-progression", config: {} },
      "load_reps",
    );
    expect(issues).toEqual([]);
  });

  it("requires repCap for rep-progression paired with a fixed scheme", () => {
    const issues = checkPrescriptionCompatibility(
      validFixedScheme,
      { strategyId: "rep-progression", config: {} },
      "load_reps",
    );
    expect(issues).toContain("repCap is required in rep-progression config for fixed schemes");
  });

  it("does not require repCap for rep-progression paired with a repRange scheme", () => {
    const issues = checkPrescriptionCompatibility(
      { type: "repRange", sets: 3, minReps: 8, maxReps: 12 },
      { strategyId: "rep-progression", config: {} },
      "load_reps",
    );
    expect(issues).toEqual([]);
  });

  it("passes when rep-progression's fixed scheme has an explicit repCap", () => {
    const issues = checkPrescriptionCompatibility(
      validFixedScheme,
      { strategyId: "rep-progression", config: { repCap: 15 } },
      "load_reps",
    );
    expect(issues).toEqual([]);
  });

  // §9.2's full profile × scheme × strategy table.
  it.each([
    ["load_reps", "fixed", "manual", true],
    ["load_reps", "repRange", "load-progression", true],
    ["load_reps", "distanceRounds", "manual", false],
    ["load_reps", "durationRounds", "manual", false],
    ["reps", "fixed", "manual", true],
    ["reps", "repRange", "manual", true],
    ["reps", "fixed", "load-progression", false],
    ["reps", "fixed", "rep-progression", false],
    ["reps", "distanceRounds", "manual", false],
    ["load_distance", "distanceRounds", "manual", true],
    ["load_distance", "fixed", "manual", false],
    ["load_distance", "distanceRounds", "load-progression", false],
    ["distance_time", "distanceRounds", "manual", true],
    ["distance_time", "durationRounds", "manual", false],
    ["duration", "durationRounds", "manual", true],
    ["duration", "distanceRounds", "manual", false],
    ["load_duration", "durationRounds", "manual", true],
    ["load_duration", "fixed", "manual", false],
  ] as const)(
    "profile=%s scheme=%s strategy=%s -> compatible=%s",
    (profile, schemeType, strategyId, compatible) => {
      const scheme =
        schemeType === "fixed"
          ? { type: "fixed" as const, sets: 3, reps: 10 }
          : schemeType === "repRange"
            ? { type: "repRange" as const, sets: 3, minReps: 8, maxReps: 12 }
            : schemeType === "distanceRounds"
              ? { type: "distanceRounds" as const, sets: 3, distanceM: 20 }
              : { type: "durationRounds" as const, sets: 3, durationS: 60 };
      const issues = checkPrescriptionCompatibility(scheme, { strategyId, config: {} }, profile);
      expect(issues.length === 0).toBe(compatible);
    },
  );

  // §9.3 — field rules by profile. `dims.rir`/`dims.weight` mirror
  // targetRir/baselineLoadKg exactly (see the JSDoc above the function).
  it("rejects targetRir for every profile except load_reps/reps", () => {
    for (const profile of [
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ] as const) {
      const issues = checkPrescriptionCompatibility(
        validFixedScheme,
        { strategyId: "manual", config: {} },
        profile,
        { targetRir: { min: 0, max: 2 } },
      );
      expect(issues).toContain(`targetRir is not supported for ${profile}`);
    }
  });

  it("allows targetRir for load_reps and reps", () => {
    for (const profile of ["load_reps", "reps"] as const) {
      const issues = checkPrescriptionCompatibility(
        validFixedScheme,
        { strategyId: "manual", config: {} },
        profile,
        { targetRir: { min: 0, max: 2 } },
      );
      expect(issues).toEqual([]);
    }
  });

  it("rejects baselineLoadKg for reps/distance_time/duration", () => {
    for (const profile of ["reps", "distance_time", "duration"] as const) {
      const issues = checkPrescriptionCompatibility(
        validFixedScheme,
        { strategyId: "manual", config: {} },
        profile,
        { baselineLoadKg: 50 },
      );
      expect(issues).toContain(`baselineLoadKg is not supported for ${profile}`);
    }
  });

  it("allows baselineLoadKg for load_reps/load_distance/load_duration", () => {
    const schemeFor = {
      load_reps: validFixedScheme,
      load_distance: { type: "distanceRounds" as const, sets: 3, distanceM: 20 },
      load_duration: { type: "durationRounds" as const, sets: 3, durationS: 60 },
    };
    for (const profile of ["load_reps", "load_distance", "load_duration"] as const) {
      const issues = checkPrescriptionCompatibility(
        schemeFor[profile],
        { strategyId: "manual", config: {} },
        profile,
        { baselineLoadKg: 50 },
      );
      expect(issues).toEqual([]);
    }
  });

  it("does not reject an explicit null (clearing a field), only a real value", () => {
    const issues = checkPrescriptionCompatibility(
      { type: "distanceRounds", sets: 3, distanceM: 20 },
      { strategyId: "manual", config: {} },
      "load_distance",
      { targetRir: null, baselineLoadKg: null },
    );
    expect(issues).toEqual([]);
  });

  it("does not reject an omitted field (undefined), only a supplied one", () => {
    const issues = checkPrescriptionCompatibility(
      { type: "distanceRounds", sets: 3, distanceM: 20 },
      { strategyId: "manual", config: {} },
      "load_distance",
    );
    expect(issues).toEqual([]);
  });
});
