import { describe, expect, it } from "vitest";
import {
  resolveTodayTemplate,
  type ScheduleEntryForResolution,
} from "@/domain/scheduling/todayTemplate";

describe("resolveTodayTemplate", () => {
  it("reports no_schedule for an empty schedule", () => {
    expect(resolveTodayTemplate([], 0, 1)).toEqual({ kind: "no_schedule" });
  });

  describe("rotation mode (no weekdays on any entry)", () => {
    const schedule: ScheduleEntryForResolution[] = [
      { templateId: "t-a", position: 0, weekdays: null },
      { templateId: "t-b", position: 1, weekdays: null },
      { templateId: "t-c", position: 2, weekdays: null },
    ];

    it("resolves to the first entry when zero sessions have completed", () => {
      expect(resolveTodayTemplate(schedule, 0, 3)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("resolves to the second entry after one completed session", () => {
      expect(resolveTodayTemplate(schedule, 1, 3)).toEqual({
        kind: "scheduled",
        templateId: "t-b",
      });
    });

    it("wraps back around to the first entry after a full cycle", () => {
      expect(resolveTodayTemplate(schedule, 3, 3)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("is not affected by the weekday argument in rotation mode", () => {
      expect(resolveTodayTemplate(schedule, 1, 7)).toEqual({
        kind: "scheduled",
        templateId: "t-b",
      });
    });

    it("sorts by position regardless of input array order", () => {
      const shuffled = [schedule[2]!, schedule[0]!, schedule[1]!];
      expect(resolveTodayTemplate(shuffled, 0, 1)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });
  });

  describe("weekday mode (at least one entry has weekdays)", () => {
    const schedule: ScheduleEntryForResolution[] = [
      { templateId: "push", position: 0, weekdays: [1, 4] },
      { templateId: "pull", position: 1, weekdays: [2, 5] },
      { templateId: "legs", position: 2, weekdays: [3, 6] },
    ];

    it("resolves to the entry scheduled for today's ISO weekday", () => {
      expect(resolveTodayTemplate(schedule, 0, 1)).toEqual({
        kind: "scheduled",
        templateId: "push",
      });
      expect(resolveTodayTemplate(schedule, 0, 5)).toEqual({
        kind: "scheduled",
        templateId: "pull",
      });
    });

    it("reports rest when no entry is scheduled for today", () => {
      expect(resolveTodayTemplate(schedule, 0, 7)).toEqual({ kind: "rest" });
    });

    it("is not affected by the completed-session-count argument in weekday mode", () => {
      expect(resolveTodayTemplate(schedule, 99, 1)).toEqual({
        kind: "scheduled",
        templateId: "push",
      });
    });
  });
});
