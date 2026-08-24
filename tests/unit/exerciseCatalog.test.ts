import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG, RECONCILED_BACK_SLUGS } from "@/db/seed";
import { EQUIPMENT_TYPES, LATERALITY_TYPES, MECHANICS_TYPES } from "@/domain/exercises/schema";
import { LEAF_MUSCLE_GROUP_SLUGS, MUSCLE_GROUP_SLUGS } from "@/domain/exercises/muscleGroups";

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

  // ADR-010 Release 2 — the catalog remap. Structural checks only; the
  // reconciliation mechanism itself is covered by
  // tests/integration/reconcileContributions.integration.test.ts.
  describe("muscle taxonomy v2 Release 2 remap", () => {
    it("uses only leaf muscle-group slugs — no direct back contribution anywhere", () => {
      for (const item of EXERCISE_CATALOG) {
        for (const contribution of item.contributions) {
          expect(contribution.muscleGroupId).not.toBe("back");
          expect(LEAF_MUSCLE_GROUP_SLUGS).toContain(contribution.muscleGroupId);
        }
      }
    });

    it("has exactly 14 mapped slugs, and every one exists in the catalog targeting exactly its ADR-010 leaf", () => {
      const mappedEntries = Object.entries(RECONCILED_BACK_SLUGS);
      expect(mappedEntries).toHaveLength(14);

      for (const [slug, target] of mappedEntries) {
        const item = EXERCISE_CATALOG.find((entry) => entry.slug === slug);
        expect(item, `catalog is missing mapped slug "${slug}"`).toBeTruthy();
        const contribution = item?.contributions.find((c) => c.muscleGroupId === target);
        expect(
          contribution,
          `"${slug}" does not carry a "${target}" contribution after the Release 2 remap`,
        ).toBeTruthy();
      }
    });

    it("preserves role exactly as ADR-010's mapping table specifies (12 primary, 2 secondary)", () => {
      const primarySlugs = [
        "cable-lat-pulldown",
        "bodyweight-pull-up",
        "bodyweight-chin-up",
        "machine-assisted-pull-up",
        "cable-straight-arm-pulldown",
        "barbell-row",
        "dumbbell-row",
        "cable-seated-row",
        "machine-seated-row",
        "barbell-pendlay-row",
        "machine-t-bar-row",
        "bodyweight-inverted-row",
      ];
      const secondarySlugs = ["barbell-deadlift", "other-trap-bar-deadlift"];
      expect(primarySlugs).toHaveLength(12);
      expect(secondarySlugs).toHaveLength(2);
      expect(new Set([...primarySlugs, ...secondarySlugs])).toEqual(
        new Set(Object.keys(RECONCILED_BACK_SLUGS)),
      );

      for (const slug of primarySlugs) {
        const target = RECONCILED_BACK_SLUGS[slug];
        const item = EXERCISE_CATALOG.find((entry) => entry.slug === slug);
        const contribution = item?.contributions.find((c) => c.muscleGroupId === target);
        expect(contribution?.role).toBe("primary");
      }
      for (const slug of secondarySlugs) {
        const target = RECONCILED_BACK_SLUGS[slug];
        const item = EXERCISE_CATALOG.find((entry) => entry.slug === slug);
        const contribution = item?.contributions.find((c) => c.muscleGroupId === target);
        expect(contribution?.role).toBe("secondary");
      }
    });

    it("adds machine-hip-adduction with adductors primary, and no other entry uses adductors", () => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === "machine-hip-adduction");
      expect(entry?.name).toBe("Hip Adduction Machine");
      expect(entry?.contributions).toEqual([{ muscleGroupId: "adductors", role: "primary" }]);

      const adductorSlugs = EXERCISE_CATALOG.filter((item) =>
        item.contributions.some((c) => c.muscleGroupId === "adductors"),
      ).map((item) => item.slug);
      expect(adductorSlugs).toEqual(["machine-hip-adduction"]);
    });

    it("is exactly 93 entries — the 92-entry Release 1 catalog plus machine-hip-adduction", () => {
      expect(EXERCISE_CATALOG).toHaveLength(93);
    });
  });
});
