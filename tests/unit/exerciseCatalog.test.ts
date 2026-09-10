import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG, RECONCILED_BACK_SLUGS } from "@/db/seed";
import { EQUIPMENT_TYPES, LATERALITY_TYPES, MECHANICS_TYPES } from "@/domain/exercises/schema";
import { LEAF_MUSCLE_GROUP_SLUGS, MUSCLE_GROUP_SLUGS } from "@/domain/exercises/muscleGroups";

// The ten Release 3 athletic entries (O-10(i)/(ii)), in their approved
// authoring order — docs/reviews/athletic-measurement-profiles-release-3-
// catalog-authoring.md §4.11 / §5. Declared once so every assertion below
// that singles them out, or excludes them, shares one list.
const RELEASE_3_ATHLETIC_SLUGS = [
  "other-sled-push",
  "other-sled-drag",
  "other-farmers-carry",
  "dumbbell-suitcase-carry",
  "bodyweight-sprint",
  "bodyweight-shuttle-run",
  "other-med-ball-slam",
  "bodyweight-broad-jump",
  "bodyweight-box-jump",
  "bodyweight-side-plank",
] as const;

// Exact approved metadata and contributions, authoring §4.11 verbatim.
const RELEASE_3_ENTRIES = [
  {
    slug: "other-sled-push",
    name: "Sled Push",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_distance",
    loadBasis: "total",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "other-sled-drag",
    name: "Backward Sled Drag",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_distance",
    loadBasis: "total",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "other-farmers-carry",
    name: "Farmer's Carry",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-suitcase-carry",
    name: "Dumbbell Suitcase Carry",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-sprint",
    name: "Sprint",
    equipment: "bodyweight",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "distance_time",
    loadBasis: undefined,
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-shuttle-run",
    name: "Shuttle Run",
    equipment: "bodyweight",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "distance_time",
    loadBasis: undefined,
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "adductors", role: "secondary" },
    ],
  },
  {
    slug: "other-med-ball-slam",
    name: "Medicine Ball Slam",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_reps",
    loadBasis: "total",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-broad-jump",
    name: "Broad Jump",
    equipment: "bodyweight",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "reps",
    loadBasis: undefined,
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-box-jump",
    name: "Box Jump",
    equipment: "bodyweight",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "reps",
    loadBasis: undefined,
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-side-plank",
    name: "Side Plank",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: "unilateral",
    measurementProfile: "duration",
    loadBasis: undefined,
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
] as const;

// The 24 Catalog Expansion 1 entries (docs/reviews/exercise-catalog-expansion-
// evaluation.md §6, §10), approved after independent review and two targeted
// revision verifications, in their approved authoring order.
const CATALOG_EXPANSION_1_ENTRIES = [
  {
    slug: "barbell-rack-pull",
    name: "Barbell Rack Pull",
    equipment: "barbell",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "primary" },
      { muscleGroupId: "upper_back", role: "secondary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-power-clean",
    name: "Barbell Power Clean",
    equipment: "barbell",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "upper_back", role: "secondary" },
    ],
  },
  {
    slug: "barbell-hang-clean",
    name: "Barbell Hang Clean",
    equipment: "barbell",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "upper_back", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-lateral-lunge",
    name: "Dumbbell Lateral Lunge",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "adductors", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-reverse-lunge",
    name: "Dumbbell Reverse Lunge",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-single-leg-romanian-deadlift",
    name: "Dumbbell Single-Leg Romanian Deadlift",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-chest-supported-row",
    name: "Dumbbell Chest-Supported Row",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-pullover",
    name: "Dumbbell Pullover",
    equipment: "dumbbell",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "chest", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-thruster",
    name: "Dumbbell Thruster",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-farmers-hold",
    name: "Dumbbell Farmer's Hold",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_duration",
    loadBasis: "per_hand",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "cable-pallof-press",
    name: "Cable Pallof Press",
    equipment: "cable",
    mechanics: "isolation",
    laterality: "unilateral",
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "machine-hip-abduction",
    name: "Hip Abduction Machine",
    equipment: "machine",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [{ muscleGroupId: "glutes", role: "primary" }],
  },
  {
    slug: "machine-assisted-dip",
    name: "Assisted Dip",
    equipment: "machine",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: "assistance",
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "triceps", role: "primary" },
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-dead-hang",
    name: "Dead Hang",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: "duration",
    loadBasis: undefined,
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-ab-wheel-rollout",
    name: "Ab Wheel Rollout",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "bodyweight-wall-sit",
    name: "Wall Sit",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: "duration",
    loadBasis: undefined,
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-nordic-curl",
    name: "Nordic Hamstring Curl",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-lateral-bound",
    name: "Lateral Bound",
    equipment: "bodyweight",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "reps",
    loadBasis: undefined,
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "adductors", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-copenhagen-adduction-plank",
    name: "Copenhagen Adduction Plank",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: "unilateral",
    measurementProfile: "duration",
    loadBasis: undefined,
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "adductors", role: "primary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-tibialis-raise",
    name: "Tibialis Raise",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [{ muscleGroupId: "tibialis", role: "primary" }],
  },
  {
    slug: "other-kettlebell-swing",
    name: "Kettlebell Swing",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: undefined,
    loadBasis: undefined,
    volumeCounting: undefined,
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "other-forward-sled-drag",
    name: "Forward Sled Drag",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "other-sled-pull",
    name: "Hand-Over-Hand Sled Pull",
    equipment: "other",
    mechanics: "compound",
    laterality: undefined,
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "other-med-ball-rotational-scoop-throw",
    name: "Medicine Ball Rotational Scoop Throw",
    equipment: "other",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: "load_reps",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
] as const;

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

    it("adds machine-hip-adduction with adductors primary, and adductors is used only by five slugs across Releases 2-4 (order-insensitive)", () => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === "machine-hip-adduction");
      expect(entry?.name).toBe("Hip Adduction Machine");
      expect(entry?.contributions).toEqual([{ muscleGroupId: "adductors", role: "primary" }]);

      // bodyweight-shuttle-run (Release 3) and the three Catalog Expansion 1
      // additions are the leaf's other catalog homes — accretions, not an
      // invariant (M-2, catalog-order review; L-6, catalog-expansion review).
      // Order-insensitive by design: block order is carried by the dedicated
      // CATALOG_EXPANSION_1_ENTRIES contiguity assertion below, not here.
      const adductorSlugs = EXERCISE_CATALOG.filter((item) =>
        item.contributions.some((c) => c.muscleGroupId === "adductors"),
      ).map((item) => item.slug);
      expect(new Set(adductorSlugs)).toEqual(
        new Set([
          "machine-hip-adduction",
          "bodyweight-shuttle-run",
          "dumbbell-lateral-lunge",
          "bodyweight-lateral-bound",
          "bodyweight-copenhagen-adduction-plank",
        ]),
      );
      expect(adductorSlugs).toHaveLength(5);
    });

    it("is exactly 127 entries — the 103-entry pre-Catalog-Expansion-1 catalog plus the 24 Catalog Expansion 1 entries", () => {
      expect(EXERCISE_CATALOG).toHaveLength(127);
    });
  });

  // athletic-measurement-profiles-architecture-evaluation.md §14.4 (A-17) —
  // the three legacy entries `reconcileMeasurementProfiles` also reconciles
  // on an existing database carry their Release-2 shape explicitly here too,
  // so a fresh seed inserts them already-correctly-shaped and the reconcile
  // is a no-op on a clean database (proven end-to-end by
  // tests/integration/reconcileMeasurementProfiles.integration.test.ts).
  describe("Release 2 measurement-profile reconcile — clean-seed shape (§14.3, §14.4, A-17)", () => {
    it("bodyweight-plank seeds as duration, with no load_basis", () => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === "bodyweight-plank");
      expect(entry?.measurementProfile).toBe("duration");
      expect(entry?.loadBasis).toBeUndefined();
      expect(entry?.volumeCounting).toBe("off");
    });

    it("dumbbell-farmers-carry seeds as load_distance / per_hand, not counted as volume", () => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === "dumbbell-farmers-carry");
      expect(entry?.measurementProfile).toBe("load_distance");
      expect(entry?.loadBasis).toBe("per_hand");
      expect(entry?.volumeCounting).toBe("off");
    });

    it("machine-assisted-pull-up seeds with load_basis assistance, profile unchanged (load_reps)", () => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === "machine-assisted-pull-up");
      expect(entry?.measurementProfile).toBeUndefined(); // stays the load_reps default
      expect(entry?.loadBasis).toBe("assistance");
    });

    it("every other catalog entry still omits the three new fields (untouched, §14.4; extended, catalog-expansion-1 §11.6)", () => {
      const untouchedTargets = new Set([
        "bodyweight-plank",
        "dumbbell-farmers-carry",
        "machine-assisted-pull-up",
      ]);
      // The ten Release 3 athletic entries also carry explicit values now
      // (authoring rule, §16) — exempted here and asserted in full below, so
      // this test still proves the remaining ~90 load_reps entries untouched.
      const athleticTargets = new Set<string>(RELEASE_3_ATHLETIC_SLUGS);
      // Catalog Expansion 1's nine entries that state one or more of the
      // three fields (§11.6) — bodyweight-tibialis-raise is deliberately
      // NOT exempted: it omits all three, same as an ordinary load_reps entry.
      const catalogExpansion1Targets = new Set<string>([
        "dumbbell-farmers-hold",
        "machine-assisted-dip",
        "bodyweight-dead-hang",
        "bodyweight-wall-sit",
        "bodyweight-lateral-bound",
        "bodyweight-copenhagen-adduction-plank",
        "other-forward-sled-drag",
        "other-sled-pull",
        "other-med-ball-rotational-scoop-throw",
      ]);
      for (const item of EXERCISE_CATALOG) {
        if (
          untouchedTargets.has(item.slug) ||
          athleticTargets.has(item.slug) ||
          catalogExpansion1Targets.has(item.slug)
        )
          continue;
        expect(item.measurementProfile, item.slug).toBeUndefined();
        expect(item.loadBasis, item.slug).toBeUndefined();
        expect(item.volumeCounting, item.slug).toBeUndefined();
      }
    });
  });

  // athletic-measurement-profiles-release-3-catalog-authoring.md (O-10(ii),
  // approved after independent review and revision verification) — the ten
  // adopted slugs' exact metadata and leaf-only contributions, seeded
  // explicitly per the §16 authoring rule.
  describe("Release 3 athletic catalog (O-10(i)/(ii))", () => {
    // Restated per catalog-expansion-1 §11.5 (L-6, catalog-order review):
    // pins the block's START rather than its distance from the end, so it
    // detects an insertion after Release 3 — which appending Catalog
    // Expansion 1 after it is — rather than losing coverage to `slice(-10)`.
    it("is a contiguous block in approved order, immediately after the 93 pre-Release-3 entries", () => {
      const slugs = EXERCISE_CATALOG.map((item) => item.slug);
      const start = slugs.indexOf(RELEASE_3_ENTRIES[0]!.slug);
      expect(start).toBe(93);
      expect(slugs.slice(start, start + RELEASE_3_ENTRIES.length)).toEqual(
        RELEASE_3_ENTRIES.map((entry) => entry.slug),
      );
    });

    it.each(RELEASE_3_ENTRIES)(
      "seeds $slug with its exact approved metadata and contributions",
      (expected) => {
        const entry = EXERCISE_CATALOG.find((item) => item.slug === expected.slug);
        expect(entry, expected.slug).toBeTruthy();
        expect(entry?.name).toBe(expected.name);
        expect(entry?.equipment).toBe(expected.equipment);
        expect(entry?.mechanics).toBe(expected.mechanics);
        expect(entry?.laterality).toBe(expected.laterality);
        expect(entry?.measurementProfile).toBe(expected.measurementProfile);
        expect(entry?.loadBasis).toBe(expected.loadBasis);
        expect(entry?.volumeCounting).toBe("off");
        expect(entry?.strengthEstimate).toBeUndefined();
        expect(entry?.contributions).toEqual(expected.contributions);
      },
    );

    it("states loadBasis explicitly on exactly the five entries whose profile has a load field (R-6)", () => {
      const withLoadBasis = RELEASE_3_ENTRIES.filter((entry) => entry.loadBasis !== undefined).map(
        (entry) => entry.slug,
      );
      expect(withLoadBasis).toEqual([
        "other-sled-push",
        "other-sled-drag",
        "other-farmers-carry",
        "dumbbell-suitcase-carry",
        "other-med-ball-slam",
      ]);
      const withoutLoadBasis = RELEASE_3_ENTRIES.filter(
        (entry) => entry.loadBasis === undefined,
      ).map((entry) => entry.slug);
      expect(withoutLoadBasis).toEqual([
        "bodyweight-sprint",
        "bodyweight-shuttle-run",
        "bodyweight-broad-jump",
        "bodyweight-box-jump",
        "bodyweight-side-plank",
      ]);
    });

    it("marks laterality unilateral on exactly dumbbell-suitcase-carry and bodyweight-side-plank", () => {
      const unilateral = EXERCISE_CATALOG.filter(
        (item) =>
          (RELEASE_3_ATHLETIC_SLUGS as readonly string[]).includes(item.slug) &&
          item.laterality === "unilateral",
      ).map((item) => item.slug);
      expect(unilateral).toEqual(["dumbbell-suitcase-carry", "bodyweight-side-plank"]);
    });

    it("marks mechanics isolation on exactly bodyweight-side-plank", () => {
      const isolation = EXERCISE_CATALOG.filter(
        (item) =>
          (RELEASE_3_ATHLETIC_SLUGS as readonly string[]).includes(item.slug) &&
          item.mechanics === "isolation",
      ).map((item) => item.slug);
      expect(isolation).toEqual(["bodyweight-side-plank"]);
    });

    it("states volumeCounting off explicitly on all ten athletic entries (R-5)", () => {
      for (const slug of RELEASE_3_ATHLETIC_SLUGS) {
        const entry = EXERCISE_CATALOG.find((item) => item.slug === slug);
        expect(entry?.volumeCounting, slug).toBe("off");
      }
    });

    it("omits strengthEstimate on all ten athletic entries (R-7) — loadStepKg has no catalog field to set (R-8)", () => {
      for (const slug of RELEASE_3_ATHLETIC_SLUGS) {
        const entry = EXERCISE_CATALOG.find((item) => item.slug === slug);
        expect(entry?.strengthEstimate, slug).toBeUndefined();
      }
      // SeedCatalogExercise has no `loadStepKg` member at all (exerciseCatalog.ts),
      // so R-8 is a structural guarantee, not something a value-level assertion
      // can add to — DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[item.equipment] applies
      // to every catalog entry uniformly, athletic or not.
    });
  });

  // docs/reviews/exercise-catalog-expansion-evaluation.md (owner-selected
  // 2026-09-09; owner decisions O-1…O-5 and D-CE1-1 accepted the same day;
  // approved after independent review and two targeted revision
  // verifications) — the 24 adopted slugs' exact metadata and leaf-only
  // contributions, seeded explicitly per §10's authoring rule.
  describe("Catalog Expansion 1 (O-1…O-5, D-CE1-1)", () => {
    it("is a contiguous block in approved order, immediately after the 103 pre-Catalog-Expansion-1 entries", () => {
      const slugs = EXERCISE_CATALOG.map((item) => item.slug);
      const start = slugs.indexOf(CATALOG_EXPANSION_1_ENTRIES[0]!.slug);
      expect(start).toBe(103);
      expect(slugs.slice(start, start + CATALOG_EXPANSION_1_ENTRIES.length)).toEqual(
        CATALOG_EXPANSION_1_ENTRIES.map((entry) => entry.slug),
      );
    });

    it.each(CATALOG_EXPANSION_1_ENTRIES)(
      "seeds $slug with its exact approved metadata and contributions",
      (expected) => {
        const entry = EXERCISE_CATALOG.find((item) => item.slug === expected.slug);
        expect(entry, expected.slug).toBeTruthy();
        expect(entry?.name).toBe(expected.name);
        expect(entry?.equipment).toBe(expected.equipment);
        expect(entry?.mechanics).toBe(expected.mechanics);
        expect(entry?.laterality).toBe(expected.laterality);
        expect(entry?.measurementProfile).toBe(expected.measurementProfile);
        expect(entry?.loadBasis).toBe(expected.loadBasis);
        expect(entry?.volumeCounting).toBe(expected.volumeCounting);
        expect(entry?.strengthEstimate).toBeUndefined();
        expect(entry?.contributions).toEqual(expected.contributions);
      },
    );

    it("states loadBasis explicitly on exactly the five entries whose profile has a load field (K-5)", () => {
      const withLoadBasis = CATALOG_EXPANSION_1_ENTRIES.filter(
        (entry) => entry.loadBasis !== undefined,
      ).map((entry) => entry.slug);
      expect(withLoadBasis).toEqual([
        "dumbbell-farmers-hold",
        "machine-assisted-dip",
        "other-forward-sled-drag",
        "other-sled-pull",
        "other-med-ball-rotational-scoop-throw",
      ]);
    });

    it("marks laterality unilateral on exactly the six entries of §6 (K-9)", () => {
      const unilateral = CATALOG_EXPANSION_1_ENTRIES.filter(
        (entry) => entry.laterality === "unilateral",
      ).map((entry) => entry.slug);
      expect(unilateral).toEqual([
        "dumbbell-lateral-lunge",
        "dumbbell-reverse-lunge",
        "dumbbell-single-leg-romanian-deadlift",
        "cable-pallof-press",
        "bodyweight-copenhagen-adduction-plank",
        "other-med-ball-rotational-scoop-throw",
      ]);
    });

    it("marks mechanics isolation on exactly the nine entries of §6", () => {
      const isolation = CATALOG_EXPANSION_1_ENTRIES.filter(
        (entry) => entry.mechanics === "isolation",
      ).map((entry) => entry.slug);
      expect(isolation).toEqual([
        "dumbbell-pullover",
        "cable-pallof-press",
        "machine-hip-abduction",
        "bodyweight-dead-hang",
        "bodyweight-ab-wheel-rollout",
        "bodyweight-wall-sit",
        "bodyweight-nordic-curl",
        "bodyweight-copenhagen-adduction-plank",
        "bodyweight-tibialis-raise",
      ]);
    });

    it("states volumeCounting off explicitly on exactly the eight entries of §7", () => {
      const explicit = CATALOG_EXPANSION_1_ENTRIES.filter(
        (entry) => entry.volumeCounting !== undefined,
      ).map((entry) => entry.slug);
      expect(explicit).toEqual([
        "dumbbell-farmers-hold",
        "bodyweight-dead-hang",
        "bodyweight-wall-sit",
        "bodyweight-lateral-bound",
        "bodyweight-copenhagen-adduction-plank",
        "other-forward-sled-drag",
        "other-sled-pull",
        "other-med-ball-rotational-scoop-throw",
      ]);
      for (const slug of explicit) {
        const entry = EXERCISE_CATALOG.find((item) => item.slug === slug);
        expect(entry?.volumeCounting, slug).toBe("off");
      }
    });

    it("omits strengthEstimate on all 24 entries (O-4) — loadStepKg has no catalog field to set (K-4)", () => {
      for (const entry of CATALOG_EXPANSION_1_ENTRIES) {
        const item = EXERCISE_CATALOG.find((catalogItem) => catalogItem.slug === entry.slug);
        expect(item?.strengthEstimate, entry.slug).toBeUndefined();
      }
    });

    it("bodyweight-tibialis-raise carries exactly one tibialis primary contribution and no calves row (D-CE1-1)", () => {
      const entry = EXERCISE_CATALOG.find((item) => item.slug === "bodyweight-tibialis-raise");
      expect(entry?.contributions).toEqual([{ muscleGroupId: "tibialis", role: "primary" }]);
      expect(entry?.contributions.some((c) => c.muscleGroupId === "calves")).toBe(false);
    });
  });
});
