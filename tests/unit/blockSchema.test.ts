import { describe, expect, it } from "vitest";
import {
  createBlockSchema,
  scheduleEntryInputSchema,
  updateBlockSchema,
  weekModifiersSchema,
} from "@/domain/blocks/schema";

const templateId = "00000000-0000-0000-0000-000000000001";

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Block 1",
    startDate: "2026-01-01",
    weeksPlanned: 4,
    schedule: [{ templateId, weekdays: [1, 3, 5] }],
    ...overrides,
  };
}

describe("createBlockSchema", () => {
  it("accepts a minimal valid block", () => {
    const result = createBlockSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("defaults goal to hypertrophy when omitted", () => {
    const result = createBlockSchema.parse(baseInput());
    expect(result.goal).toBe("hypertrophy");
  });

  it("rejects weeksPlanned below 1", () => {
    const result = createBlockSchema.safeParse(baseInput({ weeksPlanned: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects weeksPlanned above 16", () => {
    const result = createBlockSchema.safeParse(baseInput({ weeksPlanned: 17 }));
    expect(result.success).toBe(false);
  });

  it("accepts weeksPlanned at the boundaries (1 and 16)", () => {
    expect(createBlockSchema.safeParse(baseInput({ weeksPlanned: 1 })).success).toBe(true);
    expect(createBlockSchema.safeParse(baseInput({ weeksPlanned: 16 })).success).toBe(true);
  });

  it("rejects an empty schedule", () => {
    const result = createBlockSchema.safeParse(baseInput({ schedule: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a malformed startDate", () => {
    const result = createBlockSchema.safeParse(baseInput({ startDate: "01/01/2026" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown goal value", () => {
    const result = createBlockSchema.safeParse(baseInput({ goal: "endurance" }));
    expect(result.success).toBe(false);
  });

  it("accepts a scheduled deload config", () => {
    const result = createBlockSchema.safeParse(
      baseInput({
        deload: { mode: "scheduled", weekIndex: "last", modifiers: { setMultiplier: 0.5 } },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("updateBlockSchema", () => {
  it("accepts a partial update", () => {
    const result = updateBlockSchema.safeParse({ name: "Renamed block" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty patch", () => {
    const result = updateBlockSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects startDate as an editable field (strict schema)", () => {
    const result = updateBlockSchema.safeParse({ startDate: "2026-02-01" });
    expect(result.success).toBe(false);
  });

  it("accepts an explicit null to clear deload", () => {
    const result = updateBlockSchema.safeParse({ deload: null });
    expect(result.success).toBe(true);
  });

  it("rejects weeksPlanned above 16 on update", () => {
    const result = updateBlockSchema.safeParse({ weeksPlanned: 20 });
    expect(result.success).toBe(false);
  });
});

// M-1 regression — docs/reviews/phase-5-review.md: entering `5` where the
// pre-filled default reads `0.5` (a plausible typo, both UIs pre-fill 0.5)
// must be rejected here, at the API boundary, rather than only surfacing
// later as a silent "Start workout" failure downstream.
describe("weekModifiersSchema", () => {
  it("accepts the documented heuristic defaults", () => {
    const result = weekModifiersSchema.safeParse({
      setMultiplier: 0.5,
      loadMultiplier: 0.9,
      targetRirShift: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (no axis modified)", () => {
    expect(weekModifiersSchema.safeParse({}).success).toBe(true);
  });

  it("rejects setMultiplier above 2 (the '5 instead of 0.5' typo)", () => {
    expect(weekModifiersSchema.safeParse({ setMultiplier: 5 }).success).toBe(false);
  });

  it("rejects loadMultiplier above 2", () => {
    expect(weekModifiersSchema.safeParse({ loadMultiplier: 5 }).success).toBe(false);
  });

  it("rejects a zero or negative multiplier", () => {
    expect(weekModifiersSchema.safeParse({ setMultiplier: 0 }).success).toBe(false);
    expect(weekModifiersSchema.safeParse({ loadMultiplier: -1 }).success).toBe(false);
  });

  it("accepts multipliers at the (0, 2] boundaries", () => {
    expect(weekModifiersSchema.safeParse({ setMultiplier: 0.01 }).success).toBe(true);
    expect(weekModifiersSchema.safeParse({ setMultiplier: 2 }).success).toBe(true);
    expect(weekModifiersSchema.safeParse({ loadMultiplier: 2 }).success).toBe(true);
  });

  it("rejects a targetRirShift outside [-10, 10]", () => {
    expect(weekModifiersSchema.safeParse({ targetRirShift: 11 }).success).toBe(false);
    expect(weekModifiersSchema.safeParse({ targetRirShift: -11 }).success).toBe(false);
  });

  it("accepts a targetRirShift at the [-10, 10] boundaries", () => {
    expect(weekModifiersSchema.safeParse({ targetRirShift: 10 }).success).toBe(true);
    expect(weekModifiersSchema.safeParse({ targetRirShift: -10 }).success).toBe(true);
  });
});

describe("scheduleEntryInputSchema", () => {
  it("accepts an entry with no weekdays (rotation mode)", () => {
    const result = scheduleEntryInputSchema.safeParse({ templateId });
    expect(result.success).toBe(true);
  });

  it("accepts up to 7 distinct weekdays", () => {
    const result = scheduleEntryInputSchema.safeParse({
      templateId,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate weekdays", () => {
    const result = scheduleEntryInputSchema.safeParse({ templateId, weekdays: [1, 1, 2] });
    expect(result.success).toBe(false);
  });

  it("rejects a weekday outside the 1-7 range", () => {
    const result = scheduleEntryInputSchema.safeParse({ templateId, weekdays: [0] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 7 weekdays", () => {
    const result = scheduleEntryInputSchema.safeParse({
      templateId,
      weekdays: [1, 2, 3, 4, 5, 6, 7, 1],
    });
    expect(result.success).toBe(false);
  });
});
