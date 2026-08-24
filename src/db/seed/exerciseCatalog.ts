import type { Equipment, Laterality, Mechanics } from "@/domain/exercises/schema";
import type { LeafMuscleGroupSlug } from "@/domain/exercises/muscleGroups";

// Release 2 (ADR-010): the catalog targets leaves only — a rollup slug
// (`back`) can never be a *seeded* contribution. Legacy direct `back` rows
// only ever exist as pre-v2 data, reconciled by
// `src/db/seed/reconcileContributions.ts`, never authored here.
export interface SeedContribution {
  muscleGroupId: LeafMuscleGroupSlug;
  role: "primary" | "secondary";
}

export interface SeedCatalogExercise {
  // Stable identity for idempotent reseeding (implementation-plan.md §1.4:
  // "idempotent upserts keyed by slug") — not a DB column, only used to
  // derive a deterministic row id (see slugToUuid in exercises.ts).
  slug: string;
  name: string;
  equipment: Equipment;
  mechanics: Mechanics;
  laterality?: Laterality;
  contributions: SeedContribution[];
}

// ~90 common movements and named variants across every equipment category,
// covering every canonical muscle group (domain-model.md §2). Weight
// defaults (primary 1.0 / secondary 0.5) and loadStepKg-by-equipment are
// applied by the seeding function via the same domain constants the
// create-exercise flow uses — not repeated here.
export const EXERCISE_CATALOG: SeedCatalogExercise[] = [
  // Barbell
  {
    slug: "barbell-back-squat",
    name: "Barbell Back Squat",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "barbell-front-squat",
    name: "Barbell Front Squat",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "barbell-deadlift",
    name: "Barbell Deadlift",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "primary" },
      { muscleGroupId: "upper_back", role: "secondary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-romanian-deadlift",
    name: "Barbell Romanian Deadlift",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    slug: "barbell-bench-press",
    name: "Barbell Bench Press",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "barbell-incline-bench-press",
    name: "Barbell Incline Bench Press",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "barbell-overhead-press",
    name: "Barbell Overhead Press",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "side_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "barbell-row",
    name: "Barbell Row",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-hip-thrust",
    name: "Barbell Hip Thrust",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "barbell-curl",
    name: "Barbell Curl",
    equipment: "barbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "biceps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },

  // Dumbbell
  {
    slug: "dumbbell-bench-press",
    name: "Dumbbell Bench Press",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-incline-press",
    name: "Dumbbell Incline Press",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-shoulder-press",
    name: "Dumbbell Shoulder Press",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "side_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-lateral-raise",
    name: "Dumbbell Lateral Raise",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "side_delts", role: "primary" }],
  },
  {
    slug: "dumbbell-rear-delt-fly",
    name: "Dumbbell Rear Delt Fly",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "rear_delts", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-row",
    name: "Dumbbell Row",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-curl",
    name: "Dumbbell Curl",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "biceps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-hammer-curl",
    name: "Dumbbell Hammer Curl",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-triceps-extension",
    name: "Dumbbell Triceps Extension",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "triceps", role: "primary" }],
  },
  {
    slug: "dumbbell-goblet-squat",
    name: "Dumbbell Goblet Squat",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-bulgarian-split-squat",
    name: "Dumbbell Bulgarian Split Squat",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-calf-raise",
    name: "Dumbbell Calf Raise",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "calves", role: "primary" }],
  },

  // Cable
  {
    slug: "cable-lat-pulldown",
    name: "Cable Lat Pulldown",
    equipment: "cable",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "cable-seated-row",
    name: "Cable Seated Row",
    equipment: "cable",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "cable-triceps-pushdown",
    name: "Cable Triceps Pushdown",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "triceps", role: "primary" }],
  },
  {
    slug: "cable-face-pull",
    name: "Cable Face Pull",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "rear_delts", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "side_delts", role: "secondary" },
    ],
  },
  {
    slug: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "side_delts", role: "primary" }],
  },
  {
    slug: "cable-crunch",
    name: "Cable Crunch",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "cable-chest-fly",
    name: "Cable Chest Fly",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "cable-curl",
    name: "Cable Curl",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "biceps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },

  // Machine
  {
    slug: "machine-leg-press",
    name: "Leg Press",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "machine-leg-extension",
    name: "Leg Extension",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "quads", role: "primary" }],
  },
  {
    slug: "machine-leg-curl",
    name: "Leg Curl",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "hamstrings", role: "primary" }],
  },
  {
    slug: "machine-chest-press",
    name: "Machine Chest Press",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "machine-seated-row",
    name: "Machine Seated Row",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "machine-shoulder-press",
    name: "Machine Shoulder Press",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "side_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },

  // Bodyweight
  {
    slug: "bodyweight-pull-up",
    name: "Pull-Up",
    equipment: "bodyweight",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-push-up",
    name: "Push-Up",
    equipment: "bodyweight",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-dip",
    name: "Dip",
    equipment: "bodyweight",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "triceps", role: "primary" },
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-plank",
    name: "Plank",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },

  // Phase 5.5 Light — 52 additions broadening coverage (traps had zero
  // primary coverage, calves had one entry, machine was the thinnest
  // equipment category). Purely additive: the seed ledger only ever seeds a
  // slug once per user, so none of the entries above are touched.

  // Barbell
  {
    slug: "barbell-sumo-deadlift",
    name: "Barbell Sumo Deadlift",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-close-grip-bench-press",
    name: "Barbell Close-Grip Bench Press",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "triceps", role: "primary" },
      { muscleGroupId: "chest", role: "secondary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "barbell-good-morning",
    name: "Barbell Good Morning",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "lower_back", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    slug: "barbell-shrug",
    name: "Barbell Shrug",
    equipment: "barbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "traps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-push-press",
    name: "Barbell Push Press",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "side_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
      { muscleGroupId: "quads", role: "secondary" },
    ],
  },
  {
    slug: "barbell-skull-crusher",
    name: "Barbell Skull Crusher",
    equipment: "barbell",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "triceps", role: "primary" }],
  },
  {
    slug: "barbell-preacher-curl",
    name: "Barbell Preacher Curl",
    equipment: "barbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "biceps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-walking-lunge",
    name: "Barbell Walking Lunge",
    equipment: "barbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "barbell-pendlay-row",
    name: "Pendlay Row",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },

  // Dumbbell
  {
    slug: "dumbbell-fly",
    name: "Dumbbell Fly",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-arnold-press",
    name: "Dumbbell Arnold Press",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "side_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-front-raise",
    name: "Dumbbell Front Raise",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "front_delts", role: "primary" }],
  },
  {
    slug: "dumbbell-shrug",
    name: "Dumbbell Shrug",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "traps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-step-up",
    name: "Dumbbell Step-Up",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-romanian-deadlift",
    name: "Dumbbell Romanian Deadlift",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-wrist-curl",
    name: "Dumbbell Wrist Curl",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "forearms", role: "primary" }],
  },
  {
    slug: "dumbbell-farmers-carry",
    name: "Dumbbell Farmer's Carry",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },

  // Cable
  {
    slug: "cable-crossover",
    name: "Cable Crossover",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "cable-straight-arm-pulldown",
    name: "Cable Straight-Arm Pulldown",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "cable-reverse-fly",
    name: "Cable Reverse Fly",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "rear_delts", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
    ],
  },
  {
    slug: "cable-upright-row",
    name: "Cable Upright Row",
    equipment: "cable",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "side_delts", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "biceps", role: "secondary" },
    ],
  },
  {
    slug: "cable-woodchopper",
    name: "Cable Woodchopper",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "cable-glute-kickback",
    name: "Cable Glute Kickback",
    equipment: "cable",
    mechanics: "isolation",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "cable-pull-through",
    name: "Cable Pull-Through",
    equipment: "cable",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "cable-overhead-triceps-extension",
    name: "Cable Overhead Triceps Extension",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "triceps", role: "primary" }],
  },
  {
    slug: "cable-front-raise",
    name: "Cable Front Raise",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "front_delts", role: "primary" }],
  },
  {
    slug: "cable-reverse-curl",
    name: "Cable Reverse Curl",
    equipment: "cable",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
    ],
  },

  // Machine
  {
    slug: "machine-hack-squat",
    name: "Hack Squat",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "machine-smith-machine-squat",
    name: "Smith Machine Squat",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "machine-smith-machine-bench-press",
    name: "Smith Machine Bench Press",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "machine-pec-deck",
    name: "Pec Deck",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
  {
    slug: "machine-hip-thrust",
    name: "Machine Hip Thrust",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "machine-reverse-pec-deck",
    name: "Reverse Pec Deck",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "rear_delts", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
    ],
  },
  {
    slug: "machine-lateral-raise",
    name: "Machine Lateral Raise",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "side_delts", role: "primary" }],
  },
  {
    slug: "machine-triceps-extension",
    name: "Machine Triceps Extension",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "triceps", role: "primary" }],
  },
  {
    slug: "machine-seated-leg-curl",
    name: "Seated Leg Curl",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "hamstrings", role: "primary" }],
  },
  {
    slug: "machine-lying-leg-curl",
    name: "Lying Leg Curl",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "hamstrings", role: "primary" }],
  },
  {
    // ADR-010 Release 2 — first honest adductor entry; deliberately not
    // retrofitted onto any existing compound (see the module comment above).
    slug: "machine-hip-adduction",
    name: "Hip Adduction Machine",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "adductors", role: "primary" }],
  },
  {
    slug: "machine-seated-calf-raise",
    name: "Seated Calf Raise",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "calves", role: "primary" }],
  },
  {
    slug: "machine-standing-calf-raise",
    name: "Standing Calf Raise",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "calves", role: "primary" }],
  },
  {
    slug: "machine-ab-crunch",
    name: "Ab Crunch Machine",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "machine-back-extension",
    name: "Back Extension",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "lower_back", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "machine-assisted-pull-up",
    name: "Assisted Pull-Up",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "machine-t-bar-row",
    name: "T-Bar Row",
    equipment: "machine",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },

  // Bodyweight
  {
    slug: "bodyweight-chin-up",
    name: "Chin-Up",
    equipment: "bodyweight",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "biceps", role: "primary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-sit-up",
    name: "Sit-Up",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "bodyweight-hanging-leg-raise",
    name: "Hanging Leg Raise",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "bodyweight-glute-bridge",
    name: "Glute Bridge",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-walking-lunge",
    name: "Walking Lunge",
    equipment: "bodyweight",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-calf-raise",
    name: "Calf Raise",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "calves", role: "primary" }],
  },
  {
    slug: "bodyweight-inverted-row",
    name: "Inverted Row",
    equipment: "bodyweight",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },

  // Other
  {
    slug: "other-trap-bar-deadlift",
    name: "Trap Bar Deadlift",
    equipment: "other",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "upper_back", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "other-landmine-press",
    name: "Landmine Press",
    equipment: "other",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "chest", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
];
