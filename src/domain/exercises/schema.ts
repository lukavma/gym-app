import { z } from "zod";
import {
  LEAF_MUSCLE_GROUP_SLUGS,
  MUSCLE_GROUP_SLUGS,
  leafMuscleGroupSlugSchema,
  muscleGroupSlugSchema,
  type MuscleGroupSlug,
} from "./muscleGroups";

// domain-model.md §3 — Exercise (aggregate root).
export const EQUIPMENT_TYPES = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT_TYPES)[number];
export const equipmentSchema = z.enum(EQUIPMENT_TYPES);

export const MECHANICS_TYPES = ["compound", "isolation"] as const;
export type Mechanics = (typeof MECHANICS_TYPES)[number];
export const mechanicsSchema = z.enum(MECHANICS_TYPES);

export const LATERALITY_TYPES = ["bilateral", "unilateral"] as const;
export type Laterality = (typeof LATERALITY_TYPES)[number];
export const lateralitySchema = z.enum(LATERALITY_TYPES);

// domain-model.md §3 — MuscleContribution (child of Exercise).
export const CONTRIBUTION_ROLES = ["primary", "secondary"] as const;
export type ContributionRole = (typeof CONTRIBUTION_ROLES)[number];
export const contributionRoleSchema = z.enum(CONTRIBUTION_ROLES);

// Labeled heuristic convention (EVIDENCE-004), not a biological constant —
// stored per row so it stays tunable without a schema change.
export const DEFAULT_CONTRIBUTION_WEIGHT: Record<ContributionRole, number> = {
  primary: 1,
  secondary: 0.5,
};

export const DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2.0,
  machine: 5.0,
  cable: 2.5,
  bodyweight: 2.5,
  other: 2.5,
};

// `exercises.load_step_kg` is `numeric(4,2)` (data-model.md §2.4), so 99.99
// is the largest value the column can actually store. Kept as one constant
// so domain validation, the API, and the UI all share the same ceiling as
// persistence (Phase 1 review L1).
export const MAX_LOAD_STEP_KG = 99.99;

// Parametrized by which muscle-group slug schema an item accepts, so create
// (leaf-only) and update (full vocabulary, for legacy rollup carry-through —
// src/server/exercises/service.ts validates the carry-through rule itself,
// since Zod has no DB access) can share this shape without duplicating it.
function contributionInputSchemaFor<S extends z.ZodTypeAny>(muscleGroupId: S) {
  return z.object({
    muscleGroupId,
    role: contributionRoleSchema,
    // Editable, but defaults by role when omitted (domain-model.md §3).
    // M-1(new) (phase-5.5-light-remediation-verification.md) —
    // exercise_muscle_contributions.weight is `numeric(3,2)`; without
    // `.multipleOf(0.01)` (same guard as loadStepKg's L-7 fix) the column
    // silently rounds e.g. 0.555 to 0.56 instead of rejecting it.
    weight: z.number().gt(0).lte(1).multipleOf(0.01).optional(),
  });
}

// Not derived via z.infer from a schema instance — the wider (18-value)
// shape is needed here as a pure type (see contributionsListSchemaFor
// below for why create and update use different-width schema instances),
// and a runtime-unused schema binding just to hang a `typeof` off of would
// trip `no-unused-vars`.
export interface ContributionInput {
  muscleGroupId: MuscleGroupSlug;
  role: ContributionRole;
  weight?: number;
}

export interface ResolvedContribution {
  muscleGroupId: MuscleGroupSlug;
  role: ContributionRole;
  weight: number;
}

function withDefaultWeight(contribution: ContributionInput): ResolvedContribution {
  return {
    muscleGroupId: contribution.muscleGroupId,
    role: contribution.role,
    weight: contribution.weight ?? DEFAULT_CONTRIBUTION_WEIGHT[contribution.role],
  };
}

// Invariant (domain-model.md §10.5): every exercise has >=1 primary
// contribution, and one row per (exercise, muscle) — i.e. no duplicate
// muscle group across an exercise's contribution list.
function contributionsListSchemaFor<S extends z.ZodTypeAny>(muscleGroupId: S, maxLength: number) {
  return z
    .array(contributionInputSchemaFor(muscleGroupId))
    .min(1, "at least one muscle contribution is required")
    .max(maxLength)
    .refine((contributions) => contributions.some((c) => c.role === "primary"), {
      message: "at least one primary muscle contribution is required",
    })
    .refine(
      (contributions) =>
        new Set(contributions.map((c) => c.muscleGroupId)).size === contributions.length,
      { message: "duplicate muscle group in contributions" },
    );
}

// Create rejects a rollup slug outright (ADR-010 "leaf-only for new rows") —
// enforced entirely by Zod here, no service-layer check needed since create
// has no prior state to consult.
const createContributionsListSchema = contributionsListSchemaFor(
  leafMuscleGroupSlugSchema,
  LEAF_MUSCLE_GROUP_SLUGS.length,
);

// Update deliberately still permits a rollup slug syntactically — Zod can't
// know whether it's carry-through of a row the exercise already had, so
// that check is pushed to src/server/exercises/service.ts.
const updateContributionsListSchema = contributionsListSchemaFor(
  muscleGroupSlugSchema,
  MUSCLE_GROUP_SLUGS.length,
);

export const createExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    equipment: equipmentSchema,
    movementPattern: z.string().trim().min(1).max(100).optional(),
    mechanics: mechanicsSchema,
    laterality: lateralitySchema.default("bilateral"),
    // L-7 (phase-5.5-light-review.md) — `numeric(4,2)` stores at most 2
    // decimal places; without this the column silently truncates e.g. 1.234
    // to 1.23 instead of rejecting it.
    loadStepKg: z.number().gt(0).max(MAX_LOAD_STEP_KG).multipleOf(0.01).optional(),
    notes: z.string().trim().max(2000).optional(),
    contributions: createContributionsListSchema,
  })
  .transform((data) => ({
    ...data,
    loadStepKg: data.loadStepKg ?? DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[data.equipment],
    contributions: data.contributions.map(withDefaultWeight),
  }));

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

// All Exercise metadata is mutable at any time (domain-model.md §9); only
// identity (id) and provenance (isSeeded) are not editable. Renaming is
// allowed by the identity policy — repurposing an exercise into a
// genuinely different movement is discouraged by convention (UI copy),
// not blocked here.
export const updateExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    equipment: equipmentSchema.optional(),
    movementPattern: z.string().trim().min(1).max(100).nullable().optional(),
    mechanics: mechanicsSchema.optional(),
    laterality: lateralitySchema.optional(),
    loadStepKg: z.number().gt(0).max(MAX_LOAD_STEP_KG).multipleOf(0.01).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    contributions: updateContributionsListSchema
      .transform((contributions) => contributions.map(withDefaultWeight))
      .optional(),
  })
  .strict();

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export const archiveActionSchema = z.enum(["archive", "unarchive"]);
export type ArchiveAction = z.infer<typeof archiveActionSchema>;
