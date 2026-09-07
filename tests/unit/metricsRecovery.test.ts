import { describe, expect, it } from "vitest";
import { summarizeRecovery } from "@/domain/metrics/recovery";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §4 (M-10, M-11, M-12), acceptance criterion A-5, invariant I-7.

const AS_OF_LOCAL_DATE = "2026-09-06";

describe("summarizeRecovery (M-10, M-11, M-12)", () => {
  it("always returns 7 day rows, ascending, D-6 to D", () => {
    const result = summarizeRecovery([], AS_OF_LOCAL_DATE);
    expect(result.days).toHaveLength(7);
    expect(result.days[0]?.date).toBe("2026-08-31");
    expect(result.days[6]?.date).toBe(AS_OF_LOCAL_DATE);
    expect(result.days.every((day) => day.entry === null)).toBe(true);
    expect(result.daysLogged).toBe(0);
    expect(result.meanSleepHours).toBeNull();
  });

  it("a missing day is entry: null; a null metric stays null", () => {
    const result = summarizeRecovery(
      [{ date: "2026-09-05", sleepHours: 7, sleepQuality: null, readiness: 3, soreness: null }],
      AS_OF_LOCAL_DATE,
    );
    const day = result.days.find((d) => d.date === "2026-09-05");
    expect(day?.entry).toEqual({ sleepHours: 7, sleepQuality: null, readiness: 3, soreness: null });
    const missing = result.days.find((d) => d.date === "2026-09-04");
    expect(missing?.entry).toBeNull();
  });

  it("daysLogged counts rows with any entry", () => {
    const result = summarizeRecovery(
      [
        { date: "2026-09-05", sleepHours: null, sleepQuality: null, readiness: null, soreness: 2 },
        { date: "2026-09-03", sleepHours: 6, sleepQuality: null, readiness: null, soreness: null },
      ],
      AS_OF_LOCAL_DATE,
    );
    expect(result.daysLogged).toBe(2);
  });

  it("meanSleepHours averages only non-null sleepHours and carries its OWN count, distinct from daysLogged", () => {
    const result = summarizeRecovery(
      [
        { date: "2026-09-06", sleepHours: 8, sleepQuality: null, readiness: null, soreness: null },
        { date: "2026-09-05", sleepHours: 6, sleepQuality: 4, readiness: null, soreness: null },
        { date: "2026-09-04", sleepHours: null, sleepQuality: null, readiness: 3, soreness: null },
        { date: "2026-09-03", sleepHours: null, sleepQuality: null, readiness: null, soreness: 2 },
        { date: "2026-09-02", sleepHours: null, sleepQuality: 5, readiness: null, soreness: null },
      ],
      AS_OF_LOCAL_DATE,
    );
    expect(result.daysLogged).toBe(5);
    expect(result.meanSleepHours).toEqual({ hours: 7, count: 2 });
  });

  it("is null when no row has sleepHours", () => {
    const result = summarizeRecovery(
      [{ date: "2026-09-05", sleepHours: null, sleepQuality: null, readiness: 3, soreness: null }],
      AS_OF_LOCAL_DATE,
    );
    expect(result.meanSleepHours).toBeNull();
  });

  it("I-7: combines nothing — the DTO carries only these three derived shapes, no cross-field value", () => {
    const result = summarizeRecovery(
      [{ date: AS_OF_LOCAL_DATE, sleepHours: 7, sleepQuality: 4, readiness: 3, soreness: 2 }],
      AS_OF_LOCAL_DATE,
    );
    expect(Object.keys(result).sort()).toEqual(["days", "daysLogged", "meanSleepHours"]);
  });
});
