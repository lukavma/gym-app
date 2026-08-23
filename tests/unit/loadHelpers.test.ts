import { describe, expect, it } from "vitest";
import { roundToStepKg } from "@/domain/progression/loadHelpers";

// Regression coverage for the practical decimal loadStepKg values
// (Phase 5.5 Light) — 0.25/0.5/1.25/2.5 are the steps the create/edit UI is
// expected to support cleanly end-to-end.
describe("roundToStepKg with fractional steps", () => {
  it("rounds to the nearest 0.25 multiple", () => {
    expect(roundToStepKg(10.1, 0.25)).toBe(10);
    expect(roundToStepKg(10.13, 0.25)).toBe(10.25);
  });

  it("rounds to the nearest 0.5 multiple", () => {
    expect(roundToStepKg(10.2, 0.5)).toBe(10);
    expect(roundToStepKg(10.3, 0.5)).toBe(10.5);
  });

  it("rounds to the nearest 1.25 multiple", () => {
    expect(roundToStepKg(41.5, 1.25)).toBe(41.25);
    expect(roundToStepKg(43.5, 1.25)).toBe(43.75);
  });

  it("rounds to the nearest 2.5 multiple", () => {
    expect(roundToStepKg(56.25, 2.5)).toBe(57.5);
  });

  it("rounds a half-step boundary up (Math.round convention)", () => {
    // 10.125 is exactly halfway between the 10 and 10.25 multiples of 0.25.
    expect(roundToStepKg(10.125, 0.25)).toBe(10.25);
  });

  it("is exact for these steps, no floating-point drift", () => {
    for (const step of [0.25, 0.5, 1.25, 2.5]) {
      const result = roundToStepKg(100, step);
      expect(Number.isInteger(result * 100)).toBe(true);
    }
  });
});
