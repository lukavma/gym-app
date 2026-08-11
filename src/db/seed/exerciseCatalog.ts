import type { Equipment, Laterality, Mechanics } from "@/domain/exercises/schema";
import type { MuscleGroupSlug } from "@/domain/exercises/muscleGroups";

export interface SeedContribution {
  muscleGroupId: MuscleGroupSlug;
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

// ~40 common movements, one entry per equipment category, covering every
// canonical muscle group (domain-model.md §2). Weight defaults (primary
// 1.0 / secondary 0.5) and loadStepKg-by-equipment are applied by the
// seeding function via the same domain constants the create-exercise flow
// uses — not repeated here.
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
      { muscleGroupId: "back", role: "secondary" },
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
      { muscleGroupId: "back", role: "primary" },
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
      { muscleGroupId: "back", role: "primary" },
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
      { muscleGroupId: "back", role: "primary" },
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
      { muscleGroupId: "back", role: "primary" },
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
      { muscleGroupId: "back", role: "primary" },
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
      { muscleGroupId: "back", role: "primary" },
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
];
