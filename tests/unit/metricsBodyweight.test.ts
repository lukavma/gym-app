import { describe, expect, it } from "vitest";
import { summarizeBodyweight } from "@/domain/metrics/bodyweight";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §4 (M-6, M-7, M-8, M-9), acceptance criterion A-4.

const AS_OF_LOCAL_DATE = "2026-09-06";

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

describe("summarizeBodyweight (M-6, M-7, M-8, M-9)", () => {
  it("computes the 7-day average and its entry count when 5 of 7 days are logged", () => {
    const entries = [0, 1, 2, 3, 4].map((offset) => ({
      date: shiftDate(AS_OF_LOCAL_DATE, -offset),
      weightKg: 80 + offset,
    }));
    const result = summarizeBodyweight(entries, AS_OF_LOCAL_DATE);
    // (80+81+82+83+84)/5 = 82.
    expect(result.sevenDayAverage).toEqual({ kg: 82, entryCount: 5 });
    expect(result.sevenDayEntryCount).toBe(5);
  });

  it("is null with 2 of 7 days logged, but still reports the entry count", () => {
    const entries = [
      { date: shiftDate(AS_OF_LOCAL_DATE, 0), weightKg: 80 },
      { date: shiftDate(AS_OF_LOCAL_DATE, -3), weightKg: 81 },
    ];
    const result = summarizeBodyweight(entries, AS_OF_LOCAL_DATE);
    expect(result.sevenDayAverage).toBeNull();
    expect(result.sevenDayEntryCount).toBe(2);
  });

  it("the 30-day change equals the difference of the two 7-day means, with both entry counts", () => {
    const current = [0, 1, 2].map((offset) => ({
      date: shiftDate(AS_OF_LOCAL_DATE, -offset),
      weightKg: 80,
    }));
    const prior = [30, 31, 32].map((offset) => ({
      date: shiftDate(AS_OF_LOCAL_DATE, -offset),
      weightKg: 82,
    }));
    const result = summarizeBodyweight([...current, ...prior], AS_OF_LOCAL_DATE);
    expect(result.thirtyDayChange).toEqual({ kg: -2, currentEntryCount: 3, priorEntryCount: 3 });
  });

  it("the 30-day change is null unless BOTH windows have at least 3 entries", () => {
    const current = [0, 1, 2].map((offset) => ({
      date: shiftDate(AS_OF_LOCAL_DATE, -offset),
      weightKg: 80,
    }));
    const priorOnlyTwo = [30, 31].map((offset) => ({
      date: shiftDate(AS_OF_LOCAL_DATE, -offset),
      weightKg: 82,
    }));
    const result = summarizeBodyweight([...current, ...priorOnlyTwo], AS_OF_LOCAL_DATE);
    expect(result.thirtyDayChange).toBeNull();
  });

  it("a future-dated entry (date > D) is ignored everywhere", () => {
    const future = { date: shiftDate(AS_OF_LOCAL_DATE, 5), weightKg: 999 };
    const withFuture = summarizeBodyweight([future], AS_OF_LOCAL_DATE);
    expect(withFuture.latest).toBeNull();
    expect(withFuture.series).toEqual([]);
    expect(withFuture.sevenDayEntryCount).toBe(0);
  });

  it("series is ascending and excludes dates before D-89", () => {
    const inWindow = { date: shiftDate(AS_OF_LOCAL_DATE, -89), weightKg: 70 };
    const outOfWindow = { date: shiftDate(AS_OF_LOCAL_DATE, -90), weightKg: 999 };
    const latest = { date: AS_OF_LOCAL_DATE, weightKg: 75 };
    const result = summarizeBodyweight([latest, outOfWindow, inWindow], AS_OF_LOCAL_DATE);
    expect(result.series).toEqual([
      { date: inWindow.date, weightKg: 70 },
      { date: latest.date, weightKg: 75 },
    ]);
    expect(result.latest).toEqual({ date: AS_OF_LOCAL_DATE, weightKg: 75 });
  });

  it("latest orders by date, not by array/receipt order (A-14)", () => {
    const older = { date: shiftDate(AS_OF_LOCAL_DATE, -1), weightKg: 80 };
    const newer = { date: AS_OF_LOCAL_DATE, weightKg: 79 };
    const result = summarizeBodyweight([newer, older], AS_OF_LOCAL_DATE);
    expect(result.latest).toEqual({ date: AS_OF_LOCAL_DATE, weightKg: 79 });
  });
});
