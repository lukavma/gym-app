import { z } from "zod";
import { MUSCLE_GROUP_SLUGS, muscleGroupSlugSchema } from "./muscleGroups";

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

const contributionInputSchema = z.object({
  muscleGroupId: muscleGroupSlugSchema,
  role: contributionRoleSchema,
  // Editable, but defaults by role when omitted (domain-model.md §3).
  weight: z.number().gt(0).lte(1).optional(),
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;

export interface ResolvedContribution {
  muscleGroupId: z.infer<typeof muscleGroupSlugSchema>;
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
const contributionsListSchema = z
  .array(contributionInputSchema)
  .min(1, "at least one muscle contribution is required")
  .max(MUSCLE_GROUP_SLUGS.length)
  .refine((contributions) => contributions.some((c) => c.role === "primary"), {
    message: "at least one primary muscle contribution is required",
  })
  .refine(
    (contributions) =>
      new Set(contributions.map((c) => c.muscleGroupId)).size === contributions.length,
    { message: "duplicate muscle group in contributions" },
  );

export const createExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    equipment: equipmentSchema,
    movementPattern: z.string().trim().min(1).max(100).optional(),
    mechanics: mechanicsSchema,
    laterality: lateralitySchema.default("bilateral"),
    loadStepKg: z.number().gt(0).max(1000).optional(),
    notes: z.string().trim().max(2000).optional(),
    contributions: contributionsListSchema,
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
    loadStepKg: z.number().gt(0).max(1000).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    contributions: contributionsListSchema
      .transform((contributions) => contributions.map(withDefaultWeight))
      .optional(),
  })
  .strict();

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export const archiveActionSchema = z.enum(["archive", "unarchive"]);
export type ArchiveAction = z.infer<typeof archiveActionSchema>;
