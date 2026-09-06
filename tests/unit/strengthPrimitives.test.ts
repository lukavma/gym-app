import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  ceilToStepKg,
  floorToStepKg,
  localDateToDayNumber,
  lowerMedian,
  modeTiesLow,
  repMultiplier,
  round2,
  roundToNearestStepKg,
  setE1rm,
  spreadPct,
} from "@/domain/strength/primitives";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §5, §8.5, §9.5, §13. Acceptance criterion A-1 plus the rounding and
// ordering properties every later fixture rests on.

describe("setE1rm — Epley with f(1) = 1 (A-1)", () => {
  it("reproduces the document's worked set values", () => {
    expect(setE1rm(110, 5)).toBe(128.33);
    expect(setE1rm(110, 6)).toBe(132.0);
    expect(setE1rm(110, 7)).toBe(135.67);
    expect(setE1rm(110, 8)).toBe(139.33);
    expect(setE1rm(95, 12)).toBe(133.0);
    expect(setE1rm(100, 1)).toBe(100);
  });

  it("treats a true single as the load itself, not Epley's raw 1.0333", () => {
    // ADR-011's observed-single convention. Epley's raw multiplier would
    // report 103.33 for a 100 kg single — a 3.3 % inflation of a value the
    // athlete actually lifted.
    expect(repMultiplier(1)).toBe(1);
    expect(repMultiplier(0)).toBe(1);
    expect(setE1rm(100, 1)).toBe(100);
    expect(setE1rm(100, 2)).toBe(106.67);
  });

  // Independent fixtures, computed from `w x (1 + rtf/30)` by hand — not
  // copied from the document's worked examples.
  it.each([
    [82.5, 6, 99.0],
    [47.5, 10, 63.33],
    [140, 4, 158.67],
    [60, 3, 66.0],
    [22.5, 11, 30.75],
    [102.5, 9, 133.25],
  ])("setE1rm(%s, %s) = %s", (weight, rtf, expected) => {
    expect(setE1rm(weight, rtf)).toBe(expected);
  });
});

describe("lowerMedian — asymmetric by design (§7.7)", () => {
  it("takes index floor((n - 1) / 2) of the ascending sort", () => {
    expect(lowerMedian([3])).toBe(3);
    expect(lowerMedian([5, 1])).toBe(1);
    expect(lowerMedian([9, 1, 5])).toBe(5);
    expect(lowerMedian([4, 1, 3, 2])).toBe(2);
  });

  it("is robust to ONE HIGH outlier at n = 3 and NOT to a low one", () => {
    // Stated, not hidden: a mistyped-low session drags the estimate one rank,
    // a mistyped-high one does not. Copy may never claim "outlier-proof".
    expect(lowerMedian([130, 132, 300])).toBe(132);
    expect(lowerMedian([130, 132, 13])).toBe(130);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    lowerMedian(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("spreadPct — a range over a low centre (§11)", () => {
  it("is (max - min) / lowerMedian, as a percentage", () => {
    expect(spreadPct([139.33, 133.0])).toBeCloseTo(4.7594, 4);
    expect(spreadPct([136, 180])).toBeCloseTo(32.3529, 4);
    expect(spreadPct([136, 64])).toBe(112.5);
    expect(spreadPct([100, 100, 100])).toBe(0);
  });

  it("returns the EXACT ratio, leaving rounding to the caller that displays it", () => {
    // Review F-1: `deriveEstimate` compares this value against 20 % and 30 %,
    // and rounding before the comparison silences a threshold at a knife
    // edge. `[133.33, 133.33, 160.00]` is over 20 % by three thousandths of a
    // percentage point; `round2` erases exactly that.
    const spread = spreadPct([133.33, 133.33, 160.0]);
    expect(spread).toBeGreaterThan(20);
    expect(spread).toBeCloseTo(20.003, 3);
    expect(round2(spread)).toBe(20);
    // NEGATIVE CONTROL: were this pre-rounded, the strict comparison would
    // read false.
    expect(round2(spread) > 20).toBe(false);
  });

  it("degrades to 0 rather than Infinity for a non-positive centre", () => {
    expect(spreadPct([0, 10])).toBe(0);
    expect(spreadPct([])).toBe(0);
  });
});

describe("grid rounding — three roundings for three different claims", () => {
  it("floors a translated load, never rounds it up", () => {
    expect(floorToStepKg(104.5, 2.5)).toBe(102.5);
    expect(floorToStepKg(88.67, 2.5)).toBe(87.5);
    expect(floorToStepKg(24, 5)).toBe(20);
    // NEGATIVE CONTROL for §9.5 step 6: rounding to NEAREST would give 25 on
    // the last case and 105 on the first — the one direction this design
    // refuses (X-12 rejected capping the discount for exactly this reason).
    expect(floorToStepKg(24, 5)).not.toBe(25);
    expect(floorToStepKg(104.5, 2.5)).not.toBe(105);
  });

  it("keeps an exact multiple on the grid rather than dropping a whole step", () => {
    expect(floorToStepKg(110, 2.5)).toBe(110);
    expect(floorToStepKg(20, 5)).toBe(20);
    expect(ceilToStepKg(110, 2.5)).toBe(110);
    expect(ceilToStepKg(20, 5)).toBe(20);
  });

  it("rounds the band outward", () => {
    // 139.33 on a 2.5 kg step: ±10 % is [125.397, 153.263].
    expect(floorToStepKg(139.33 * 0.9, 2.5)).toBe(125);
    expect(ceilToStepKg(139.33 * 1.1, 2.5)).toBe(155);
  });

  it("rounds a displayed estimate to the NEAREST grid value", () => {
    expect(roundToNearestStepKg(139.33, 2.5)).toBe(140);
    expect(roundToNearestStepKg(133.0, 2.5)).toBe(132.5);
    expect(roundToNearestStepKg(50.67, 5)).toBe(50);
  });

  it("degrades to exact-value rounding for a non-positive or non-finite step (A-18)", () => {
    expect(floorToStepKg(101.24, 0)).toBe(101.24);
    expect(ceilToStepKg(101.24, -1)).toBe(101.24);
    expect(roundToNearestStepKg(101.244, Number.NaN)).toBe(101.24);
    expect(Number.isNaN(floorToStepKg(Number.POSITIVE_INFINITY, 2.5))).toBe(true);
    expect(Number.isNaN(ceilToStepKg(Number.NaN, 2.5))).toBe(true);
  });

  it("never inverts the band, even on a coarse grid (§9.5 step 8)", () => {
    for (const step of [0.5, 1, 2.5, 5]) {
      for (const raw of [3.2, 12.4, 24, 47.5, 133, 512.75]) {
        expect(floorToStepKg(raw * 0.9, step)).toBeLessThanOrEqual(ceilToStepKg(raw * 1.1, step));
        expect(floorToStepKg(raw * 0.9, step)).toBeLessThanOrEqual(floorToStepKg(raw, step));
      }
    }
  });
});

describe("modeTiesLow — the group's rep basis (§5)", () => {
  it("breaks ties to the LOWEST rep count", () => {
    expect(modeTiesLow([8, 8, 5])).toBe(8);
    expect(modeTiesLow([8, 5])).toBe(5);
    expect(modeTiesLow([12, 10, 10, 12])).toBe(10);
    expect(modeTiesLow([6])).toBe(6);
  });

  it("is independent of input order", () => {
    expect(modeTiesLow([5, 8, 8])).toBe(modeTiesLow([8, 8, 5]));
    expect(modeTiesLow([9, 3, 9, 3, 7])).toBe(modeTiesLow([7, 3, 9, 9, 3]));
  });
});

describe("calendar-day arithmetic (§8.1)", () => {
  it("counts whole local calendar days, timezone-agnostically", () => {
    expect(calendarDaysBetween("2026-09-05", "2026-09-06")).toBe(1);
    expect(calendarDaysBetween("2026-06-08", "2026-09-06")).toBe(90);
    expect(calendarDaysBetween("2026-09-07", "2026-09-06")).toBe(-1);
  });

  it("crosses a DST transition without gaining or losing a day", () => {
    // Europe/Ljubljana springs forward on 2026-03-29 and falls back on
    // 2026-10-25. Calendar-day arithmetic on date STRINGS must be blind to
    // both — which is exactly why the window is expressed in local dates and
    // the instant conversion stays at the server boundary.
    expect(calendarDaysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(calendarDaysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(localDateToDayNumber("2026-01-01")).toBe(localDateToDayNumber("2026-01-01"));
  });
});

describe("round2 — the schema's own precision", () => {
  it("keeps two decimals", () => {
    expect(round2(1 / 3)).toBe(0.33);
    expect(round2(135.665)).toBe(135.67);
    expect(round2(110)).toBe(110);
  });
});
