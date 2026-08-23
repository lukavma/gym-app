import { describe, expect, it } from "vitest";
import {
  resolveTodayTemplate,
  type ScheduleEntryForResolution,
} from "@/domain/scheduling/todayTemplate";

describe("resolveTodayTemplate", () => {
  it("reports no_schedule for an empty schedule", () => {
    expect(resolveTodayTemplate([], null, 1)).toEqual({ kind: "no_schedule" });
  });

  // Active-schedule remediation — rotation resolution anchors on the
  // *template* of the latest completed session in the current ordered
  // schedule, not a completed-session count against the (now editable)
  // array length.
  describe("rotation mode (no weekdays on any entry)", () => {
    const schedule: ScheduleEntryForResolution[] = [
      { templateId: "t-a", position: 0, weekdays: null },
      { templateId: "t-b", position: 1, weekdays: null },
      { templateId: "t-c", position: 2, weekdays: null },
    ];

    it("resolves to the first entry when no session has ever completed", () => {
      expect(resolveTodayTemplate(schedule, null, 3)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("resolves to the entry after the latest completed template", () => {
      expect(resolveTodayTemplate(schedule, "t-a", 3)).toEqual({
        kind: "scheduled",
        templateId: "t-b",
      });
      expect(resolveTodayTemplate(schedule, "t-b", 3)).toEqual({
        kind: "scheduled",
        templateId: "t-c",
      });
    });

    it("wraps back around to the first entry after the latest entry", () => {
      expect(resolveTodayTemplate(schedule, "t-c", 3)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("falls back to the first entry when the latest completed template was removed from the schedule", () => {
      expect(resolveTodayTemplate(schedule, "t-removed", 3)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("is not affected by the weekday argument in rotation mode", () => {
      expect(resolveTodayTemplate(schedule, "t-a", 7)).toEqual({
        kind: "scheduled",
        templateId: "t-b",
      });
    });

    it("sorts by position regardless of input array order", () => {
      const shuffled = [schedule[2]!, schedule[0]!, schedule[1]!];
      expect(resolveTodayTemplate(shuffled, null, 1)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("reorders explainably: moving the latest-completed entry to the end still advances to its old neighbor", () => {
      // t-b was completed last; reorder to [t-a, t-c, t-b] — the entry
      // *after* t-b, cyclically, is now t-a, not t-c.
      const reordered: ScheduleEntryForResolution[] = [
        { templateId: "t-a", position: 0, weekdays: null },
        { templateId: "t-c", position: 1, weekdays: null },
        { templateId: "t-b", position: 2, weekdays: null },
      ];
      expect(resolveTodayTemplate(reordered, "t-b", 1)).toEqual({
        kind: "scheduled",
        templateId: "t-a",
      });
    });

    it("resolves to a newly added entry inserted right after the latest completed template", () => {
      const withInserted: ScheduleEntryForResolution[] = [
        { templateId: "t-a", position: 0, weekdays: null },
        { templateId: "t-b", position: 1, weekdays: null },
        { templateId: "t-d", position: 2, weekdays: null }, // newly added
        { templateId: "t-c", position: 3, weekdays: null },
      ];
      expect(resolveTodayTemplate(withInserted, "t-b", 1)).toEqual({
        kind: "scheduled",
        templateId: "t-d",
      });
    });

    it("resolves to the sole entry regardless of latest-completed template in a single-entry rotation", () => {
      const single: ScheduleEntryForResolution[] = [
        { templateId: "only", position: 0, weekdays: null },
      ];
      expect(resolveTodayTemplate(single, null, 1)).toEqual({
        kind: "scheduled",
        templateId: "only",
      });
      expect(resolveTodayTemplate(single, "only", 1)).toEqual({
        kind: "scheduled",
        templateId: "only",
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
      expect(resolveTodayTemplate(schedule, null, 1)).toEqual({
        kind: "scheduled",
        templateId: "push",
      });
      expect(resolveTodayTemplate(schedule, null, 5)).toEqual({
        kind: "scheduled",
        templateId: "pull",
      });
    });

    it("reports rest when no entry is scheduled for today", () => {
      expect(resolveTodayTemplate(schedule, null, 7)).toEqual({ kind: "rest" });
    });

    it("is not affected by the latest-completed-template argument in weekday mode", () => {
      expect(resolveTodayTemplate(schedule, "anything", 1)).toEqual({
        kind: "scheduled",
        templateId: "push",
      });
    });

    // One template may own multiple distinct weekdays in a single entry
    // (an Upper/Lower program's Upper template on Mon+Thu, for instance).
    it("resolves an entry owning multiple distinct weekdays on each of its days", () => {
      const oneTemplate: ScheduleEntryForResolution[] = [
        { templateId: "upper", position: 0, weekdays: [1, 4] },
        { templateId: "lower", position: 1, weekdays: [2, 5] },
      ];
      expect(resolveTodayTemplate(oneTemplate, null, 1)).toEqual({
        kind: "scheduled",
        templateId: "upper",
      });
      expect(resolveTodayTemplate(oneTemplate, null, 4)).toEqual({
        kind: "scheduled",
        templateId: "upper",
      });
    });
  });
});
