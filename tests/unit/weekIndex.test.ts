import { describe, expect, it } from "vitest";
import { currentWeekIndex, weekIndex } from "@/domain/scheduling/weekIndex";

describe("weekIndex", () => {
  it("is week 1 on the start date", () => {
    expect(weekIndex("2026-01-01", "2026-01-01")).toBe(1);
  });

  it("is still week 1 on day 6 after start", () => {
    expect(weekIndex("2026-01-01", "2026-01-07")).toBe(1);
  });

  it("rolls over to week 2 on day 7 after start", () => {
    expect(weekIndex("2026-01-01", "2026-01-08")).toBe(2);
  });

  it("rolls over to week 3 on day 14 after start", () => {
    expect(weekIndex("2026-01-01", "2026-01-15")).toBe(3);
  });

  it("handles a month boundary", () => {
    expect(weekIndex("2026-01-25", "2026-02-01")).toBe(2);
  });

  it("returns 0 for a date one day before the start date", () => {
    expect(weekIndex("2026-01-08", "2026-01-07")).toBe(0);
  });

  it("returns a negative index for dates well before the start date", () => {
    expect(weekIndex("2026-01-15", "2026-01-01")).toBe(-1);
  });
});

// M2/M3 remediation — bounds/status handling on top of the raw weekIndex()
// arithmetic (domain-model.md §5).
describe("currentWeekIndex", () => {
  it("is null for a planned block that hasn't started yet (before-start)", () => {
    expect(currentWeekIndex("planned", "2026-06-01", "2026-01-01", null)).toBeNull();
  });

  it("is null for a planned block whose start date has already passed", () => {
    expect(currentWeekIndex("planned", "2026-01-01", "2026-06-01", null)).toBeNull();
  });

  it("floors an active block at week 1 before its start date (before-start)", () => {
    expect(currentWeekIndex("active", "2026-06-01", "2026-01-01", null)).toBe(1);
  });

  it("reports the exact final week for an active block on its last planned day", () => {
    // 4-week block starting 2026-01-01: week 4 spans days 21-27.
    expect(currentWeekIndex("active", "2026-01-01", "2026-01-27", null)).toBe(4);
  });

  it("does not cap an active block that has run beyond its planned weeks (overdue)", () => {
    // domain-model.md §5: "A block that runs past weeksPlanned stays active
    // ... calendar shows overdue" — the raw, unclamped value is correct.
    const overdue = currentWeekIndex("active", "2026-01-01", "2026-03-12", null);
    expect(overdue).toBe(weekIndex("2026-01-01", "2026-03-12"));
    expect(overdue).toBeGreaterThan(4);
  });

  it("freezes a completed block's week index at completedAt, ignoring later dates", () => {
    const completedAt = "2026-01-29";
    const muchLater = "2027-01-01";
    expect(currentWeekIndex("completed", "2026-01-01", muchLater, completedAt)).toBe(
      weekIndex("2026-01-01", completedAt),
    );
  });

  it("freezes an abandoned block's week index at completedAt, ignoring later dates", () => {
    const completedAt = "2026-01-10";
    const muchLater = "2027-01-01";
    expect(currentWeekIndex("abandoned", "2026-01-01", muchLater, completedAt)).toBe(
      weekIndex("2026-01-01", completedAt),
    );
  });

  it("floors an abandoned block at week 1 even if it was abandoned before its start date", () => {
    expect(currentWeekIndex("abandoned", "2026-06-01", "2027-01-01", "2026-01-01")).toBe(1);
  });
});
