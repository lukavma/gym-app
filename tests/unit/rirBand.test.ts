import { describe, expect, it } from "vitest";
import { DEFAULT_HYPERTROPHY_TARGET_RIR, rirBandSchema } from "@/domain/schemes/rirBand";

describe("rirBandSchema", () => {
  it("accepts a valid band", () => {
    const result = rirBandSchema.safeParse({ min: 1, max: 3 });
    expect(result.success).toBe(true);
  });

  it("accepts min === max", () => {
    const result = rirBandSchema.safeParse({ min: 2, max: 2 });
    expect(result.success).toBe(true);
  });

  it("rejects min > max", () => {
    const result = rirBandSchema.safeParse({ min: 5, max: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects a value below 0", () => {
    const result = rirBandSchema.safeParse({ min: -1, max: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects a value above 10", () => {
    const result = rirBandSchema.safeParse({ min: 0, max: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer values", () => {
    const result = rirBandSchema.safeParse({ min: 0.5, max: 2 });
    expect(result.success).toBe(false);
  });

  it("accepts the boundary values 0 and 10", () => {
    const result = rirBandSchema.safeParse({ min: 0, max: 10 });
    expect(result.success).toBe(true);
  });
});

describe("DEFAULT_HYPERTROPHY_TARGET_RIR", () => {
  it("is itself a valid band", () => {
    expect(rirBandSchema.safeParse(DEFAULT_HYPERTROPHY_TARGET_RIR).success).toBe(true);
  });
});
