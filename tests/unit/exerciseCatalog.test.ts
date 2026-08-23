import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG } from "@/db/seed";
import { EQUIPMENT_TYPES, LATERALITY_TYPES, MECHANICS_TYPES } from "@/domain/exercises/schema";
import { MUSCLE_GROUP_SLUGS } from "@/domain/exercises/muscleGroups";

// Structural validation of the seed data itself (not the seeding mechanism,
// covered separately by tests/integration/seed.integration.test.ts). A
// generic assertion here catches a malformed future addition before it ever
// reaches a real deploy.
describe("EXERCISE_CATALOG structure", () => {
  it("is materially broader than the pre-Phase-5.5 ~40-entry catalog", () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(80);
  });

  it("has unique slugs", () => {
    const slugs = EXERCISE_CATALOG.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique names, case-insensitively", () => {
    const names = EXERCISE_CATALOG.map((item) => item.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses only valid equipment/mechanics/laterality enum values", () => {
    for (const item of EXERCISE_CATALOG) {
      expect(EQUIPMENT_TYPES).toContain(item.equipment);
      expect(MECHANICS_TYPES).toContain(item.mechanics);
      if (item.laterality !== undefined) {
        expect(LATERALITY_TYPES).toContain(item.laterality);
      }
    }
  });

  it("uses only canonical muscle-group slugs in contributions", () => {
    for (const item of EXERCISE_CATALOG) {
      for (const contribution of item.contributions) {
        expect(MUSCLE_GROUP_SLUGS).toContain(contribution.muscleGroupId);
      }
    }
  });

  it("gives every entry at least one primary contribution", () => {
    for (const item of EXERCISE_CATALOG) {
      expect(item.contributions.some((c) => c.role === "primary")).toBe(true);
    }
  });

  it("never repeats a muscle group within one entry's contributions", () => {
    for (const item of EXERCISE_CATALOG) {
      const muscleIds = item.contributions.map((c) => c.muscleGroupId);
      expect(new Set(muscleIds).size).toBe(muscleIds.length);
    }
  });

  // L-9 (phase-5.5-light-review.md) — walking lunges load one leg at a time
  // like the catalog's other single-leg variants (dumbbell-bulgarian-split-
  // squat, dumbbell-step-up); they were seeded defaulting to bilateral.
  it.each(["barbell-walking-lunge", "bodyweight-walking-lunge"])(
    "marks %s as unilateral",
    (slug) => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === slug);
      expect(entry?.laterality).toBe("unilateral");
    },
  );
});
