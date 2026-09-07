import { describe, expect, it } from "vitest";
import {
  SELECTION_MAX,
  isSelectionEligible,
  putSelectionInputSchema,
} from "@/domain/metrics/selection";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §11.5 (the write contract), acceptance criteria A-28, A-29.

describe("putSelectionInputSchema", () => {
  const uuid = (n: number) => `00000000-0000-7000-8000-00000000000${n}`;

  it("accepts 0 to 5 UUIDs", () => {
    expect(putSelectionInputSchema.safeParse({ exerciseIds: [] }).success).toBe(true);
    expect(
      putSelectionInputSchema.safeParse({
        exerciseIds: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)],
      }).success,
    ).toBe(true);
  });

  it("rejects a sixth id", () => {
    const result = putSelectionInputSchema.safeParse({
      exerciseIds: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5), uuid(6)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate id", () => {
    const result = putSelectionInputSchema.safeParse({ exerciseIds: [uuid(1), uuid(1)] });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed id and an unknown key (.strict())", () => {
    expect(putSelectionInputSchema.safeParse({ exerciseIds: ["not-a-uuid"] }).success).toBe(false);
    expect(putSelectionInputSchema.safeParse({ exerciseIds: [uuid(1)], extra: true }).success).toBe(
      false,
    );
  });

  it("SELECTION_MAX is 5", () => {
    expect(SELECTION_MAX).toBe(5);
  });
});

describe("isSelectionEligible — the one eligibility rule, reused not copied", () => {
  it("accepts a barbell/dumbbell/cable/machine exercise with strengthEstimate='auto'", () => {
    for (const equipment of ["barbell", "dumbbell", "cable", "machine"]) {
      expect(isSelectionEligible({ equipment, strengthEstimate: "auto" })).toBe(true);
    }
  });

  it("rejects bodyweight/other equipment", () => {
    expect(isSelectionEligible({ equipment: "bodyweight", strengthEstimate: "auto" })).toBe(false);
    expect(isSelectionEligible({ equipment: "other", strengthEstimate: "auto" })).toBe(false);
  });

  it("rejects strengthEstimate='off' regardless of equipment", () => {
    expect(isSelectionEligible({ equipment: "barbell", strengthEstimate: "off" })).toBe(false);
  });
});
