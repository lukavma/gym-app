import { describe, expect, it } from "vitest";
import { localDateToUtcInstant, userLocalDateString } from "@/server/time/userLocalDate";
import { addDays, calendarWeekWindow } from "@/domain/volume/weekBuckets";

const TZ = "Europe/Ljubljana"; // users.timezone default (data-model.md §2.1)

describe("localDateToUtcInstant", () => {
  it("round-trips through userLocalDateString for a non-DST date", () => {
    const instant = localDateToUtcInstant("2026-01-15", TZ);
    expect(userLocalDateString(TZ, instant)).toBe("2026-01-15");
  });

  it("is exactly UTC+1 (CET) in mid-January", () => {
    expect(localDateToUtcInstant("2026-01-15", TZ).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("is exactly UTC+2 (CEST) in mid-July", () => {
    expect(localDateToUtcInstant("2026-07-15", TZ).toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  // Rather than hardcoding a guessed transition date, find it empirically —
  // the day where the gap between two consecutive local midnights stops
  // being exactly 24h. This is the case a naive "add 7 days in UTC" week
  // boundary would get wrong.
  function findOffsetJump(
    year: number,
    monthDates: string[],
  ): { date: string; diffHours: number } | null {
    let prev = localDateToUtcInstant(monthDates[0]!, TZ);
    for (const date of monthDates.slice(1)) {
      const current = localDateToUtcInstant(date, TZ);
      const diffHours = (current.getTime() - prev.getTime()) / (60 * 60 * 1000);
      if (diffHours !== 24) return { date, diffHours };
      prev = current;
    }
    return null;
  }

  function daysInMonth(year: number, month: number, prefix: string): string[] {
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
  }

  it("finds a spring-forward day (23h) somewhere in March 2026", () => {
    const jump = findOffsetJump(2026, daysInMonth(2026, 3, "2026-03"));
    expect(jump).not.toBeNull();
    expect(jump!.diffHours).toBe(23);
  });

  it("finds a fall-back day (25h) somewhere in October 2026", () => {
    const jump = findOffsetJump(2026, daysInMonth(2026, 10, "2026-10"));
    expect(jump).not.toBeNull();
    expect(jump!.diffHours).toBe(25);
  });

  it("a calendar-week instant window spanning the spring DST transition is 167h, not the naive 168h", () => {
    const jump = findOffsetJump(2026, daysInMonth(2026, 3, "2026-03"));
    expect(jump).not.toBeNull();
    // `jump.date` is the day *after* the short (23h) day — the transition
    // itself falls within the previous calendar day, so anchor the week
    // lookup there to guarantee the short day lands inside the window
    // (it wouldn't if `jump.date` happened to be a Monday: the short day
    // would then be the Sunday closing the *previous* week instead).
    const shortDay = addDays(jump!.date, -1);
    const window = calendarWeekWindow(shortDay, 1); // Monday-start week containing the transition
    const startInstant = localDateToUtcInstant(window.startDate, TZ);
    const endInstant = localDateToUtcInstant(window.endDateExclusive, TZ);
    const hours = (endInstant.getTime() - startInstant.getTime()) / (60 * 60 * 1000);
    expect(hours).toBe(167);
  });
});
