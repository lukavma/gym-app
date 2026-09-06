import { describe, expect, it } from "vitest";
import {
  STRENGTH_ESTIMATE_MODES,
  createExerciseSchema,
  strengthEstimateSchema,
  updateExerciseSchema,
} from "@/domain/exercises/schema";
import { DEFAULT_STRENGTH_ESTIMATE_MODE } from "@/domain/strength/estimateMode";
import { EXERCISE_CATALOG } from "@/db/seed/exerciseCatalog";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §14.4 (owner decision O-2) and ADR-011. Kept in its own file so
// `tests/unit/exerciseSchema.test.ts` stays untouched.

describe("the strength_estimate vocabulary (O-2)", () => {
  it("is an enum of exactly 'auto' and 'off', defaulting to 'auto'", () => {
    expect([...STRENGTH_ESTIMATE_MODES]).toEqual(["auto", "off"]);
    expect(DEFAULT_STRENGTH_ESTIMATE_MODE).toBe("auto");
    expect(strengthEstimateSchema.safeParse("auto").success).toBe(true);
    expect(strengthEstimateSchema.safeParse("off").success).toBe(true);
    expect(strengthEstimateSchema.safeParse("on").success).toBe(false);
    expect(strengthEstimateSchema.safeParse(true).success).toBe(false);
  });
});

describe("updateExerciseSchema (§14.4)", () => {
  it("accepts the new key — without it, the toggle's PATCH would be a blanket 400", () => {
    const parsed = updateExerciseSchema.safeParse({ strengthEstimate: "off" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.strengthEstimate).toBe("off");
  });

  it("rejects a value outside the enum", () => {
    expect(updateExerciseSchema.safeParse({ strengthEstimate: "auto " }).success).toBe(false);
    expect(updateExerciseSchema.safeParse({ strengthEstimate: null }).success).toBe(false);
  });

  it("treats omission as 'leave unchanged', like every other field here", () => {
    const parsed = updateExerciseSchema.safeParse({ name: "Front Squat" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "strengthEstimate" in parsed.data).toBe(false);
  });

  it("stays strict about unknown keys", () => {
    expect(updateExerciseSchema.safeParse({ strengthEstimateMode: "off" }).success).toBe(false);
  });
});

describe("createExerciseSchema deliberately does NOT take it (§14.4, O-4)", () => {
  it("rejects the key on create, because the toggle lives in the edit form", () => {
    const parsed = createExerciseSchema.safeParse({
      name: "Front Squat",
      equipment: "barbell",
      mechanics: "compound",
      strengthEstimate: "off",
      contributions: [{ muscleGroupId: "quads", role: "primary" }],
    });
    // `createExerciseSchema` is not `.strict()`, so an unknown key is
    // stripped rather than rejected — the meaningful assertion is that it
    // never reaches the insert.
    expect(parsed.success).toBe(true);
    expect(parsed.success && "strengthEstimate" in parsed.data).toBe(false);
  });
});

describe("the seed catalog's own opt-outs (§6.1, §14.4)", () => {
  it("ships 'off' for exactly the two exercises whose load cannot be read as a load", () => {
    const off = EXERCISE_CATALOG.filter((item) => item.strengthEstimate === "off").map(
      (item) => item.slug,
    );
    expect(off.sort()).toEqual(["dumbbell-farmers-carry", "machine-assisted-pull-up"]);
  });

  it("leaves every other catalog entry on the column default", () => {
    const explicit = EXERCISE_CATALOG.filter((item) => item.strengthEstimate !== undefined);
    expect(explicit).toHaveLength(2);
    for (const item of explicit) expect(item.strengthEstimate).toBe("off");
  });

  it("keeps the two opt-outs on categories that would otherwise be eligible", () => {
    // NEGATIVE CONTROL for the reason they need an explicit 'off' at all: an
    // assisted pull-up is `machine` and a farmer's carry is `dumbbell`, both
    // eligible categories, so nothing but the switch would suppress them.
    const assisted = EXERCISE_CATALOG.find((item) => item.slug === "machine-assisted-pull-up");
    const carry = EXERCISE_CATALOG.find((item) => item.slug === "dumbbell-farmers-carry");
    expect(assisted?.equipment).toBe("machine");
    expect(carry?.equipment).toBe("dumbbell");
  });
});
