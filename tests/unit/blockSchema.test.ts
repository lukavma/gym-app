import { describe, expect, it } from "vitest";
import {
  createBlockSchema,
  scheduleEntryInputSchema,
  updateBlockSchema,
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
