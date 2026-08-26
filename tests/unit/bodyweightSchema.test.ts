import { describe, expect, it } from "vitest";
import { logBodyweightInputSchema, updateBodyweightInputSchema } from "@/domain/bodyweight/schema";

describe("logBodyweightInputSchema", () => {
  it("accepts a minimal valid input with date omitted", () => {
    const result = logBodyweightInputSchema.safeParse({ weightKg: 83.5 });
    expect(result.success).toBe(true);
  });

  it("accepts an explicit date and note", () => {
    const result = logBodyweightInputSchema.safeParse({
      date: "2026-08-20",
      weightKg: 83.5,
      note: "post-vacation",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    const result = logBodyweightInputSchema.safeParse({ date: "20-08-2026", weightKg: 83.5 });
    expect(result.success).toBe(false);
  });

  // phase-7-review.md MEDIUM-3 — the regex alone accepted calendar-
  // impossible dates, which reached PostgreSQL as an unmapped 500
  // (SQLSTATE 22008) instead of the route's documented 400.
  it.each(["2026-13-01", "2026-01-32", "2026-02-30", "2026-04-31", "2026-00-10", "2026-01-00"])(
    "rejects the calendar-impossible date %s",
    (date) => {
      const result = logBodyweightInputSchema.safeParse({ date, weightKg: 83.5 });
      expect(result.success).toBe(false);
    },
  );

  it("rejects Feb 29 in a non-leap year", () => {
    const result = logBodyweightInputSchema.safeParse({ date: "2026-02-29", weightKg: 83.5 });
    expect(result.success).toBe(false);
  });

  it("accepts Feb 29 in a leap year", () => {
    const result = logBodyweightInputSchema.safeParse({ date: "2028-02-29", weightKg: 83.5 });
    expect(result.success).toBe(true);
  });

  it("accepts ordinary calendar-valid dates at month/day boundaries", () => {
    for (const date of ["2026-01-31", "2026-12-31", "2026-02-28", "2026-06-30"]) {
      expect(logBodyweightInputSchema.safeParse({ date, weightKg: 83.5 }).success).toBe(true);
    }
  });

  // data-model.md §2.18 — numeric(5,2), ck between 20 and 400.
  it.each([19.99, 400.01])("rejects a weight outside the 20–400 range (%s)", (weightKg) => {
    const result = logBodyweightInputSchema.safeParse({ weightKg });
    expect(result.success).toBe(false);
  });

  it.each([20, 400])("accepts a weight at the range boundary (%s)", (weightKg) => {
    const result = logBodyweightInputSchema.safeParse({ weightKg });
    expect(result.success).toBe(true);
  });

  // Guards against numeric(5,2) silently rounding an over-precise value
  // (same convention as loadStepKg / contribution weight elsewhere).
  it("rejects a weight with more than 2 decimal places", () => {
    const result = logBodyweightInputSchema.safeParse({ weightKg: 83.455 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty note", () => {
    const result = logBodyweightInputSchema.safeParse({ weightKg: 83.5, note: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = logBodyweightInputSchema.safeParse({ weightKg: 83.5, extra: true });
    expect(result.success).toBe(false);
  });
});

describe("updateBodyweightInputSchema", () => {
  it("accepts an empty patch", () => {
    expect(updateBodyweightInputSchema.parse({})).toEqual({});
  });

  it("accepts clearing the note explicitly", () => {
    const result = updateBodyweightInputSchema.parse({ note: null });
    expect(result).toEqual({ note: null });
  });

  it("rejects a date field (immutable via edit)", () => {
    const result = updateBodyweightInputSchema.safeParse({ date: "2026-08-20" });
    expect(result.success).toBe(false);
  });
});
