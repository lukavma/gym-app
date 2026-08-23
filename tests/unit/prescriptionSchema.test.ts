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
  it("returns no issues for a fixed scheme with load-progression", () => {
    const issues = checkPrescriptionCompatibility(validFixedScheme, {
      strategyId: "load-progression",
      config: {},
    });
    expect(issues).toEqual([]);
  });

  it("requires repCap for rep-progression paired with a fixed scheme", () => {
    const issues = checkPrescriptionCompatibility(validFixedScheme, {
      strategyId: "rep-progression",
      config: {},
    });
    expect(issues).toContain("repCap is required in rep-progression config for fixed schemes");
  });

  it("does not require repCap for rep-progression paired with a repRange scheme", () => {
    const issues = checkPrescriptionCompatibility(
      { type: "repRange", sets: 3, minReps: 8, maxReps: 12 },
      { strategyId: "rep-progression", config: {} },
    );
    expect(issues).toEqual([]);
  });

  it("passes when rep-progression's fixed scheme has an explicit repCap", () => {
    const issues = checkPrescriptionCompatibility(validFixedScheme, {
      strategyId: "rep-progression",
      config: { repCap: 15 },
    });
    expect(issues).toEqual([]);
  });
});
