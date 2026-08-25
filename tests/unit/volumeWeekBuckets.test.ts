import { describe, expect, it } from "vitest";
import {
  addDays,
  blockWeekWindow,
  blockWeekWindows,
  calendarWeekStart,
  calendarWeekWindow,
  calendarWeekWindows,
} from "@/domain/volume/weekBuckets";

describe("calendarWeekStart / calendarWeekWindow", () => {
  it("returns the same date when it is already the week start (Monday, weekStartsOn=1)", () => {
    // 2026-08-03 is a Monday.
    expect(calendarWeekStart("2026-08-03", 1)).toBe("2026-08-03");
  });

  it("finds the most recent Monday for a mid-week date", () => {
    // 2026-08-06 is a Thursday in the same ISO week as 2026-08-03.
    expect(calendarWeekStart("2026-08-06", 1)).toBe("2026-08-03");
  });

  it("does not roll into the next week on the last day (Sunday) of a Monday-start week", () => {
    // 2026-08-09 is the Sunday closing the week that started 2026-08-03.
    expect(calendarWeekStart("2026-08-09", 1)).toBe("2026-08-03");
  });

  it("rolls into the next week on the following Monday", () => {
    expect(calendarWeekStart("2026-08-10", 1)).toBe("2026-08-10");
  });

  it("supports a Sunday week start (weekStartsOn=0)", () => {
    // 2026-08-02 is a Sunday; 2026-08-03 (Monday) belongs to that same
    // Sunday-started week under weekStartsOn=0.
    expect(calendarWeekStart("2026-08-03", 0)).toBe("2026-08-02");
  });

  it("produces a half-open [start, end) 7-day window", () => {
    expect(calendarWeekWindow("2026-08-06", 1)).toEqual({
      startDate: "2026-08-03",
      endDateExclusive: "2026-08-10",
    });
  });

  it("a date exactly on endDateExclusive belongs to the NEXT window, not this one", () => {
    const window = calendarWeekWindow("2026-08-06", 1);
    const nextWeekStart = calendarWeekStart(window.endDateExclusive, 1);
    expect(nextWeekStart).toBe(window.endDateExclusive);
  });
});

describe("calendarWeekWindows — current week plus previous four", () => {
  const windows = calendarWeekWindows("2026-08-06", 1, 5);

  it("returns exactly 5 windows, most recent first", () => {
    expect(windows).toHaveLength(5);
    expect(windows[0]).toEqual({ startDate: "2026-08-03", endDateExclusive: "2026-08-10" });
    expect(windows[4]).toEqual({ startDate: "2026-07-06", endDateExclusive: "2026-07-13" });
  });

  it("every window is contiguous with no gap or overlap", () => {
    for (let i = 0; i < windows.length - 1; i++) {
      expect(windows[i]!.startDate).toBe(windows[i + 1]!.endDateExclusive);
    }
  });
});

describe("blockWeekWindow / blockWeekWindows", () => {
  it("week 1 starts exactly on the block's start date", () => {
    expect(blockWeekWindow("2026-08-03", 1)).toEqual({
      startDate: "2026-08-03",
      endDateExclusive: "2026-08-10",
    });
  });

  it("week n starts 7*(n-1) days after the block start date", () => {
    expect(blockWeekWindow("2026-08-03", 3)).toEqual({
      startDate: "2026-08-17",
      endDateExclusive: "2026-08-24",
    });
  });

  it("returns the requested count, floored at week 1", () => {
    const windows = blockWeekWindows("2026-08-03", 2, 5);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toEqual({ startDate: "2026-08-10", endDateExclusive: "2026-08-17" });
    expect(windows[1]).toEqual({ startDate: "2026-08-03", endDateExclusive: "2026-08-10" });
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-28", 5)).toBe("2026-02-02");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2025-12-30", 3)).toBe("2026-01-02");
  });

  it("supports negative offsets", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
