import { describe, expect, it } from "vitest";
import { formatScheme, setSchemeEnvelopeSchema, setSchemeSchema } from "@/domain/schemes/setScheme";

describe("setSchemeSchema", () => {
  it("accepts a minimal fixed scheme", () => {
    const result = setSchemeSchema.safeParse({ type: "fixed", sets: 3, reps: 10 });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal repRange scheme", () => {
    const result = setSchemeSchema.safeParse({
      type: "repRange",
      sets: 4,
      minReps: 8,
      maxReps: 12,
    });
    expect(result.success).toBe(true);
  });

  it("rejects sets below the minimum", () => {
    const result = setSchemeSchema.safeParse({ type: "fixed", sets: 0, reps: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects sets above the maximum (20)", () => {
    const result = setSchemeSchema.safeParse({ type: "fixed", sets: 21, reps: 10 });
    expect(result.success).toBe(false);
  });

  it("accepts sets at the boundary (20)", () => {
    const result = setSchemeSchema.safeParse({ type: "fixed", sets: 20, reps: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects reps above the maximum (100)", () => {
    const result = setSchemeSchema.safeParse({ type: "fixed", sets: 3, reps: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects repRange where maxReps < minReps", () => {
    const result = setSchemeSchema.safeParse({
      type: "repRange",
      sets: 3,
      minReps: 12,
      maxReps: 8,
    });
    expect(result.success).toBe(false);
  });

  it("accepts repRange where maxReps === minReps", () => {
    const result = setSchemeSchema.safeParse({
      type: "repRange",
      sets: 3,
      minReps: 8,
      maxReps: 8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a repRange span greater than 30", () => {
    const result = setSchemeSchema.safeParse({
      type: "repRange",
      sets: 3,
      minReps: 1,
      maxReps: 32,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a repRange span of exactly 30", () => {
    const result = setSchemeSchema.safeParse({
      type: "repRange",
      sets: 3,
      minReps: 1,
      maxReps: 31,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown scheme type", () => {
    const result = setSchemeSchema.safeParse({ type: "perSet", sets: 3, reps: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer reps", () => {
    const result = setSchemeSchema.safeParse({ type: "fixed", sets: 3, reps: 10.5 });
    expect(result.success).toBe(false);
  });
});

describe("setSchemeEnvelopeSchema", () => {
  it("requires the v:1 version literal", () => {
    const result = setSchemeEnvelopeSchema.safeParse({
      v: 2,
      scheme: { type: "fixed", sets: 3, reps: 10 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed envelope", () => {
    const result = setSchemeEnvelopeSchema.safeParse({
      v: 1,
      scheme: { type: "fixed", sets: 3, reps: 10 },
    });
    expect(result.success).toBe(true);
  });
});

describe("formatScheme", () => {
  it("renders a fixed scheme as 'sets × reps'", () => {
    expect(formatScheme({ type: "fixed", sets: 5, reps: 5 })).toBe("5 × 5");
  });

  it("renders a repRange scheme as 'sets × min–max' (en dash)", () => {
    expect(formatScheme({ type: "repRange", sets: 3, minReps: 8, maxReps: 12 })).toBe("3 × 8–12");
  });
});
