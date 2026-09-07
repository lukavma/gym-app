import { z } from "zod";
import { STRENGTH_ESTIMATE_MODES } from "@/domain/strength/estimateMode";
import {
  DEFAULT_MEASUREMENT_PROFILE,
  LOAD_BASES,
  MEASUREMENT_PROFILES,
  VOLUME_COUNTING_MODES,
  loadBasisRequired,
  type LoadBasis,
  type MeasurementProfile,
} from "@/domain/measurement/profile";
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

// ADR-011 / revision §14.4 (owner decision O-2) — the per-exercise strength
// estimate opt-out. The vocabulary itself lives in
// `@/domain/strength/estimateMode` because the pure strength module may not
// import `@/domain/exercises/**` (revision §14.5); this re-export keeps the
// exercise aggregate's Zod surface in one place all the same.
export const strengthEstimateSchema = z.enum(STRENGTH_ESTIMATE_MODES);
export { STRENGTH_ESTIMATE_MODES };
export type { StrengthEstimateMode } from "@/domain/strength/estimateMode";

// athletic-measurement-profiles-architecture-evaluation.md §5.3 / §12.1 — the
// vocabulary lives in `@/domain/measurement/profile` (that module may not
// import `@/domain/exercises/**`, I-10); this re-export keeps the exercise
// aggregate's Zod surface in one place, the same pattern as
// `strengthEstimateSchema` above.
export const measurementProfileSchema = z.enum(MEASUREMENT_PROFILES);
export { MEASUREMENT_PROFILES };
export type { MeasurementProfile } from "@/domain/measurement/profile";

export const loadBasisSchema = z.enum(LOAD_BASES);
export { LOAD_BASES };
export type { LoadBasis } from "@/domain/measurement/profile";

export const volumeCountingSchema = z.enum(VOLUME_COUNTING_MODES);
export { VOLUME_COUNTING_MODES };
export type { VolumeCounting } from "@/domain/measurement/profile";

// §7.1 / §8.1's presence rule ("a load field exists on exactly the three
// load-bearing profiles") applied to a caller-supplied `loadBasis`: resolves
// to `'unspecified'` for a load-bearing profile the caller didn't classify,
// `null` for a profile with no load field, and an explicit caller value
// passes through unchanged (callers of this must have already rejected an
// explicit value on a load-less profile — see the `.superRefine`s below).
export function resolveLoadBasis(
  profile: MeasurementProfile,
  loadBasis: LoadBasis | undefined,
): LoadBasis | null {
  return loadBasisRequired(profile) ? (loadBasis ?? "unspecified") : null;
}

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
    // athletic-measurement-profiles-architecture-evaluation.md §12.1 (I-9,
    // MEDIUM-2) — optional with a default so a cached pre-upgrade client
    // posting today's body still gets `201`. `volumeCounting` is deliberately
    // NOT accepted here: §11.4 makes its default depend on the resolved
    // profile, which only src/server/exercises/service.ts can apply.
    measurementProfile: measurementProfileSchema.default(DEFAULT_MEASUREMENT_PROFILE),
    loadBasis: loadBasisSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // §7.1 / §8.1's presence rule, enforced here rather than left to
    // `ck_exercises_load_basis_presence` — an explicit mismatch is a 400,
    // not an unmapped `23514`.
    if (data.loadBasis !== undefined && !loadBasisRequired(data.measurementProfile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loadBasis"],
        message: `loadBasis is not supported for measurement profile "${data.measurementProfile}"`,
      });
    }
  })
  .transform((data) => ({
    ...data,
    loadStepKg: data.loadStepKg ?? DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[data.equipment],
    loadBasis: resolveLoadBasis(data.measurementProfile, data.loadBasis),
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
    // ADR-011 / revision §14.4 — the estimate opt-out is editable metadata
    // like every other field here, so it is `.optional()` in the same
    // omission-means-unchanged sense: `updateExerciseSchema` is `.strict()`,
    // so without this key the toggle's PATCH would be a blanket 400.
    // Deliberately NOT added to `createExerciseSchema`: §14.4 and O-4 place
    // the toggle in the EDIT form only, and a new row takes the column's
    // `'auto'` default.
    strengthEstimate: strengthEstimateSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    contributions: updateContributionsListSchema
      .transform((contributions) => contributions.map(withDefaultWeight))
      .optional(),
    // athletic-measurement-profiles-architecture-evaluation.md §10.3 / §12.1.
    // `measurementProfile`'s §10.3 lock (once referenced) and the
    // `loadBasis` presence rule against an *unchanged* profile are
    // service-layer checks (src/server/exercises/service.ts) — Zod has no DB
    // access to the exercise's current profile or reference state.
    measurementProfile: measurementProfileSchema.optional(),
    loadBasis: loadBasisSchema.optional(),
    volumeCounting: volumeCountingSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Only the case both fields land in the same patch is checkable here;
    // see the comment above.
    if (
      data.measurementProfile !== undefined &&
      data.loadBasis !== undefined &&
      !loadBasisRequired(data.measurementProfile)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loadBasis"],
        message: `loadBasis is not supported for measurement profile "${data.measurementProfile}"`,
      });
    }
  });

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export const archiveActionSchema = z.enum(["archive", "unarchive"]);
export type ArchiveAction = z.infer<typeof archiveActionSchema>;
