import type { Equipment, Laterality, Mechanics } from "@/domain/exercises/schema";
import type { StrengthEstimateMode } from "@/domain/strength/estimateMode";
import type { LeafMuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import type { LoadBasis, MeasurementProfile, VolumeCounting } from "@/domain/measurement/profile";

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
  // ADR-011 / estimated-1RM revision §14.4 — omitted means the column's
  // `'auto'` default. Set to `'off'` only for catalog entries whose stored
  // load cannot be fed to a 1RM equation: an inverted assistance load, or
  // fabricated reps for time/distance work. Rows already seeded are
  // unreachable from here — the seed is ledger-gated and insert-if-absent —
  // so `src/db/seed/reconcileStrengthEstimates.ts` carries the matching
  // one-shot, id-keyed reconcile for them (ADR-010's mechanism).
  strengthEstimate?: StrengthEstimateMode;
  // athletic-measurement-profiles-architecture-evaluation.md §14.4 — omitted
  // means the column's `load_reps` default (the ~90 pre-existing entries,
  // untouched: §14.4's "not touched" clause). Set EXPLICITLY only for the
  // three legacy catalog entries `src/db/seed/reconcileMeasurementProfiles.ts`
  // also reconciles on an EXISTING database (`bodyweight-plank`,
  // `dumbbell-farmers-carry`, `machine-assisted-pull-up`) — the fresh-seed
  // half of the same fact, so `pnpm db:seed` on a clean database inserts them
  // already-correctly-shaped and the reconcile is a no-op there (A-17).
  measurementProfile?: MeasurementProfile;
  // Omitted resolves the same way `resolveLoadBasis` does for a caller that
  // didn't classify it: `'unspecified'` when the profile carries a load
  // field, `null` when it doesn't. Set EXPLICITLY only for the same three
  // legacy entries as `measurementProfile` above.
  loadBasis?: LoadBasis;
  // Omitted resolves to the same profile-dependent default
  // `createExercise` applies (§11.4, O-4(i)/(ii)): `'auto'` for `load_reps`,
  // `'off'` otherwise. Set EXPLICITLY only for the same three legacy entries.
  volumeCounting?: VolumeCounting;
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
    // A held isometric — no load, no reps, just time (§14.4, Release 2).
    // `loadBasis` is omitted: `duration` has no load field, so it resolves to
    // `null`, never a value the `ck_exercises_load_basis_presence` CHECK
    // would reject.
    measurementProfile: "duration",
    volumeCounting: "off",
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
    // Time/distance work: the reps logged against a carry are fabricated, so
    // no reps-to-failure input exists (revision §6.1, PI-005).
    strengthEstimate: "off",
    // §14.4, Release 2 — a carry's load is per hand, not total, and it has no
    // rep count worth counting as hypertrophy volume.
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    volumeCounting: "off",
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
    // The logged load is the ASSISTANCE, a non-negative number whose meaning
    // is inverted and unmodelled — a larger number is an easier set, so no
    // equation can consume it (revision §6.1). `strengthEstimate: 'off'` is
    // now redundant with `loadBasis: 'assistance'` below (both structurally
    // refuse the same exercise) and is left in place rather than removed
    // (athletic-measurement-profiles-architecture-evaluation.md §11.6).
    strengthEstimate: "off",
    // §14.4, Release 2 — profile stays `load_reps` (a rep IS real here); only
    // the basis changes, so its rendered Strength refusal becomes
    // LOAD_BASIS_UNSUPPORTED instead of EXERCISE_ESTIMATE_DISABLED (§11.6).
    loadBasis: "assistance",
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

  // Athletic (Release 3) — athletic-measurement-profiles-architecture-evaluation.md
  // §16, O-10(i) (slugs and shapes) and O-10(ii) (contributions, approved at
  // the Release-3 authored-list gate:
  // docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md,
  // independently reviewed and, after revision, verified — see
  // docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md and
  // docs/reviews/athletic-measurement-profiles-release-3-catalog-revision-verification.md).
  //
  // Authoring rule for every entry in this block: explicit `measurementProfile`,
  // explicit `loadBasis` iff the profile has a load field, and explicit
  // `volumeCounting`. `strengthEstimate` is deliberately omitted — the
  // structural gate in `src/domain/strength/eligibility.ts` refuses all ten on
  // profile, basis or equipment, so the switch has nothing to add.
  //
  // Placement is a constraint, not a preference: this block must stay
  // appended after the entire catalog above. Filing these ten under their
  // equipment groupings would shift `EXERCISE_CATALOG.slice(0, 40)` in
  // tests/integration/reconcileContributions.integration.test.ts and break
  // its pre-v2 scenario assertions for reasons unrelated to this change.
  {
    slug: "other-sled-push",
    name: "Sled Push",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // Bounded to the BACKWARD drag (facing the sled, walking backwards, arms
    // straight, no hand-over-hand) — the definition these contributions are
    // authored against, accepted by the owner as D-R3-1 (a). A forward
    // harness drag is a different exercise and assigns differently; see the
    // authoring document §4.2 and §7.
    slug: "other-sled-drag",
    name: "Backward Sled Drag",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    // Deliberately distinct from `dumbbell-farmers-carry` (implement, load
    // scale and history series), with deliberately IDENTICAL contributions:
    // same movement, one convention.
    slug: "other-farmers-carry",
    name: "Farmer's Carry",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // O-12 / §7.2: one row per set records ONE side, both sides performed.
    slug: "dumbbell-suitcase-carry",
    name: "Dumbbell Suitcase Carry",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    // `distance_time` has no load field, so `loadBasis` is omitted and
    // resolves to null — the `bodyweight-plank` precedent.
    slug: "bodyweight-sprint",
    name: "Sprint",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "distance_time",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // Distance logged is the TOTAL covered, not the shuttle length.
    slug: "bodyweight-shuttle-run",
    name: "Shuttle Run",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "distance_time",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "adductors", role: "secondary" },
    ],
  },
  {
    // The PI-005 example for O-4(i): a rep-like `load_reps` set that must not
    // count as hypertrophy volume. `volumeCounting: "off"` is load-bearing
    // here, unlike on the entries whose profile excludes them anyway.
    slug: "other-med-ball-slam",
    name: "Medicine Ball Slam",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_reps",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    // `reps` records ATTEMPTS; jump distance is not a stored field in v1.
    slug: "bodyweight-broad-jump",
    name: "Broad Jump",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "reps",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    // A-14 / A-17 (R3) name this slug as the witness that a seeded `reps`
    // athletic entry carries `volume_counting = 'off'`.
    slug: "bodyweight-box-jump",
    name: "Box Jump",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "reps",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    // Mirrors the seeded `Plank` convention (abs primary, lower_back
    // secondary) and adds glutes for the lateral hold. O-12: one row per set
    // records one side, both sides performed.
    slug: "bodyweight-side-plank",
    name: "Side Plank",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: "unilateral",
    measurementProfile: "duration",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
];
