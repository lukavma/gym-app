import { describe, expect, it } from "vitest";
import {
  LEAF_MUSCLE_GROUP_SLUGS,
  LEAF_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
  MUSCLE_GROUP_SLUGS,
  MUSCLE_GROUPS,
  ROLLUP_MEMBERS,
  ROLLUP_MUSCLE_GROUP_SLUGS,
  isLeafMuscleGroupSlug,
  isMuscleGroupSlug,
  isRollupMuscleGroupSlug,
} from "@/domain/exercises/muscleGroups";

// ADR-010 — vocabulary v2: 17 leaves + 1 rollup (`back`).
const EXPECTED_LEAVES = [
  "chest",
  "lats",
  "upper_back",
  "front_delts",
  "side_delts",
  "rear_delts",
  "traps",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
  "lower_back",
];

describe("muscle group vocabulary v2 (ADR-010)", () => {
  it("has exactly 17 leaves and exactly 1 rollup, totaling 18 slugs", () => {
    expect(LEAF_MUSCLE_GROUP_SLUGS).toHaveLength(17);
    expect(ROLLUP_MUSCLE_GROUP_SLUGS).toHaveLength(1);
    expect(MUSCLE_GROUP_SLUGS).toHaveLength(18);
  });

  it("has the exact leaf set from ADR-010", () => {
    expect([...LEAF_MUSCLE_GROUP_SLUGS]).toEqual(EXPECTED_LEAVES);
  });

  it("has exactly one rollup, back, with the exact membership [lats, upper_back]", () => {
    expect([...ROLLUP_MUSCLE_GROUP_SLUGS]).toEqual(["back"]);
    expect(ROLLUP_MEMBERS.back).toEqual(["lats", "upper_back"]);
  });

  it("lower_back displays as 'Lower Back (Erectors)'; the other 14 pre-existing leaves keep their names", () => {
    expect(MUSCLE_GROUP_DISPLAY_NAMES.lower_back).toBe("Lower Back (Erectors)");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.chest).toBe("Chest");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.front_delts).toBe("Front Delts");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.side_delts).toBe("Side Delts");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.rear_delts).toBe("Rear Delts");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.traps).toBe("Traps");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.biceps).toBe("Biceps");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.triceps).toBe("Triceps");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.forearms).toBe("Forearms");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.abs).toBe("Abs");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.quads).toBe("Quads");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.hamstrings).toBe("Hamstrings");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.glutes).toBe("Glutes");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.calves).toBe("Calves");
  });

  it("has display names for the 3 new leaves and the back rollup", () => {
    expect(MUSCLE_GROUP_DISPLAY_NAMES.lats).toBe("Lats");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.upper_back).toBe("Upper Back");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.adductors).toBe("Adductors");
    expect(MUSCLE_GROUP_DISPLAY_NAMES.back).toBe("Back");
  });

  it("MUSCLE_GROUPS has exactly one kind==='rollup' entry, the rest 'muscle'", () => {
    const rollups = MUSCLE_GROUPS.filter((g) => g.kind === "rollup");
    expect(rollups).toHaveLength(1);
    expect(rollups[0]?.slug).toBe("back");
    expect(MUSCLE_GROUPS.filter((g) => g.kind === "muscle")).toHaveLength(17);
  });

  it("LEAF_MUSCLE_GROUPS is exactly the kind==='muscle' subset, never including back", () => {
    expect(LEAF_MUSCLE_GROUPS).toHaveLength(17);
    expect(LEAF_MUSCLE_GROUPS.some((g) => g.slug === "back")).toBe(false);
    expect(LEAF_MUSCLE_GROUPS.map((g) => g.slug)).toEqual(EXPECTED_LEAVES);
  });

  it("isMuscleGroupSlug/isLeafMuscleGroupSlug/isRollupMuscleGroupSlug classify correctly", () => {
    expect(isMuscleGroupSlug("back")).toBe(true);
    expect(isMuscleGroupSlug("lats")).toBe(true);
    expect(isMuscleGroupSlug("not-a-slug")).toBe(false);

    expect(isLeafMuscleGroupSlug("lats")).toBe(true);
    expect(isLeafMuscleGroupSlug("back")).toBe(false);
    expect(isLeafMuscleGroupSlug("not-a-slug")).toBe(false);

    expect(isRollupMuscleGroupSlug("back")).toBe(true);
    expect(isRollupMuscleGroupSlug("lats")).toBe(false);
    expect(isRollupMuscleGroupSlug("not-a-slug")).toBe(false);
  });
});
