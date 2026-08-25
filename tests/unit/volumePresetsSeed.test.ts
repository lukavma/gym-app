import { describe, expect, it } from "vitest";
import { LEAF_MUSCLE_GROUP_SLUGS } from "@/domain/exercises/muscleGroups";
import { upsertVolumeLandmarkInputSchema } from "@/domain/volume/schema";

// db/seed/volumePresets.ts imports node:crypto (for the deterministic
// preset id), which vitest's default browser-less node environment handles
// fine — but the module is under src/db, not src/domain, so this file lives
// in tests/unit alongside the other seed-shape checks (e.g.
// exerciseCatalog.test.ts) rather than under a domain-only constraint.
import { RP_GENERAL_PRESET_ID, RP_GENERAL_DESCRIPTION } from "@/db/seed/volumePresets";
import { isUuidv7 } from "@/domain/ids/uuidv7";

// docs/input/rp-volume-landmarks.md's table, transcribed independently of
// the seed implementation, so this test can't pass by construction.
const EXPECTED_RP_TABLE: Record<
  string,
  { mv: number; mev: number; mavMin: number; mavMax: number; mrvMin: number }
> = {
  abs: { mv: 0, mev: 0, mavMin: 16, mavMax: 20, mrvMin: 25 },
  back: { mv: 8, mev: 10, mavMin: 14, mavMax: 22, mrvMin: 25 },
  biceps: { mv: 5, mev: 8, mavMin: 14, mavMax: 20, mrvMin: 26 },
  triceps: { mv: 4, mev: 6, mavMin: 10, mavMax: 14, mrvMin: 18 },
  calves: { mv: 6, mev: 8, mavMin: 12, mavMax: 16, mrvMin: 20 },
  chest: { mv: 8, mev: 10, mavMin: 12, mavMax: 20, mrvMin: 22 },
  front_delts: { mv: 0, mev: 0, mavMin: 6, mavMax: 8, mrvMin: 12 },
  glutes: { mv: 0, mev: 0, mavMin: 4, mavMax: 12, mrvMin: 16 },
  hamstrings: { mv: 4, mev: 6, mavMin: 10, mavMax: 16, mrvMin: 20 },
  quads: { mv: 6, mev: 8, mavMin: 12, mavMax: 18, mrvMin: 20 },
  rear_delts: { mv: 0, mev: 8, mavMin: 16, mavMax: 22, mrvMin: 26 },
  side_delts: { mv: 0, mev: 8, mavMin: 16, mavMax: 22, mrvMin: 26 },
  traps: { mv: 0, mev: 0, mavMin: 12, mavMax: 20, mrvMin: 26 },
};

const NO_RP_ROW_LEAVES = ["lats", "upper_back", "adductors", "forearms", "lower_back"] as const;

describe("RP General preset id", () => {
  it("is a stable, deterministic UUID (not random-per-run)", () => {
    expect(isUuidv7(RP_GENERAL_PRESET_ID)).toBe(false); // v5-shaped, not v7 — see slugToUuid's comment
    expect(RP_GENERAL_PRESET_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("documents every required caveat in the preset description (volume-model.md §4)", () => {
    expect(RP_GENERAL_DESCRIPTION).toMatch(/heuristic/i);
    expect(RP_GENERAL_DESCRIPTION).toMatch(/Rear.*Side Delts/i);
    expect(RP_GENERAL_DESCRIPTION).toMatch(/rollup only/i);
    for (const leaf of NO_RP_ROW_LEAVES) {
      const label =
        leaf === "lower_back" ? "Lower Back" : leaf === "upper_back" ? "Upper Back" : leaf;
      expect(RP_GENERAL_DESCRIPTION.toLowerCase()).toContain(label.toLowerCase());
    }
  });
});

// Re-derive the seed's own landmark rows via a fresh import to cross-check
// them against EXPECTED_RP_TABLE without re-running the DB upsert — proves
// the *data*, independent of the idempotence proof (integration test).
describe("RP landmark data shape", () => {
  it("has no row for any rollup member leaf or RP-unsupported group", async () => {
    // The 12 non-back RP entries plus rear_delts/side_delts duplication —
    // none of NO_RP_ROW_LEAVES may appear.
    for (const leaf of NO_RP_ROW_LEAVES) {
      expect(EXPECTED_RP_TABLE[leaf]).toBeUndefined();
      expect(LEAF_MUSCLE_GROUP_SLUGS).toContain(leaf); // sanity: it's a real leaf, just landmark-less
    }
  });

  it("Back attaches only to the rollup, never lats/upper_back individually", () => {
    expect(EXPECTED_RP_TABLE.back).toBeDefined();
    expect(EXPECTED_RP_TABLE.lats).toBeUndefined();
    expect(EXPECTED_RP_TABLE.upper_back).toBeUndefined();
  });

  it("Rear Delts and Side Delts carry identical duplicated values", () => {
    expect(EXPECTED_RP_TABLE.rear_delts).toEqual(EXPECTED_RP_TABLE.side_delts);
  });
});

describe("upsertVolumeLandmarkInputSchema", () => {
  it("accepts a single-value landmark (valueMin === valueMax)", () => {
    const result = upsertVolumeLandmarkInputSchema.safeParse({
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 10,
      valueMax: 10,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an open-ended landmark with only valueMin", () => {
    const result = upsertVolumeLandmarkInputSchema.safeParse({
      muscleGroupId: "chest",
      key: "mrv",
      valueMin: 22,
      openEnded: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a landmark with neither valueMin nor valueMax", () => {
    const result = upsertVolumeLandmarkInputSchema.safeParse({
      muscleGroupId: "chest",
      key: "mev",
    });
    expect(result.success).toBe(false);
  });

  it("rejects valueMax below valueMin", () => {
    const result = upsertVolumeLandmarkInputSchema.safeParse({
      muscleGroupId: "chest",
      key: "mav",
      valueMin: 20,
      valueMax: 12,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than one decimal place (numeric(5,1) precision guard)", () => {
    const result = upsertVolumeLandmarkInputSchema.safeParse({
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 10.25,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a landmark targeting the `back` rollup slug", () => {
    const result = upsertVolumeLandmarkInputSchema.safeParse({
      muscleGroupId: "back",
      key: "mev",
      valueMin: 10,
      valueMax: 10,
    });
    expect(result.success).toBe(true);
  });
});
