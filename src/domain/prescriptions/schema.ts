import { z } from "zod";
import { rirBandSchema } from "../schemes/rirBand";
import { setSchemeEnvelopeSchema, type SetScheme } from "../schemes/setScheme";
import { strategyIdSchema, type StrategyId } from "../progression/registry";
import { profileSupportsScheme, strategySupportsProfile } from "../measurement/compatibility";
import { dimensionsOf, type MeasurementProfile } from "../measurement/profile";

// prescription-model.md §6 — 0 <= x <= 1000, multiple of 0.25. (The
// `numeric(6,2)` column could hold up to 9999.99; this is a narrower,
// doc-specified application ceiling, same pattern as exercises'
// MAX_LOAD_STEP_KG vs. its column ceiling.)
export const MAX_BASELINE_LOAD_KG = 1000;

// LOW-2 (phase-5.5-light-remediation-verification.md) — the previous
// `Math.round(v * 100) % 25 === 0` refine had a real floating-point hole:
// raw `v * 100` arithmetic on e.g. 1.005 can itself already be imprecise
// (IEEE 754), so values within ~0.005 of the grid (1.005, 82.501, 0.249,
// 1.001) passed and were then silently rounded by the numeric(6,2) column.
// `.multipleOf(0.25)` uses zod's string-decimal-based comparison instead of
// raw float arithmetic (the same mechanism already proven float-safe for
// loadStepKg's `.multipleOf(0.01)`), so it rejects all four correctly.
const baselineLoadKgSchema = z.number().min(0).max(MAX_BASELINE_LOAD_KG).multipleOf(0.25);

const progressionInputSchema = z.object({
  strategyId: strategyIdSchema,
  config: z.record(z.string(), z.unknown()).optional(),
});
export type ProgressionInput = z.infer<typeof progressionInputSchema>;

const prescriptionFieldsSchema = {
  exerciseId: z.string().uuid(),
  scheme: setSchemeEnvelopeSchema,
  targetRir: rirBandSchema.optional(),
  baselineLoadKg: baselineLoadKgSchema.optional(),
  restSeconds: z.number().int().positive().optional(),
  progression: progressionInputSchema,
  notes: z.string().trim().max(2000).optional(),
};

// domain-model.md §4 — ExercisePrescription. `position` is service-managed.
export const createPrescriptionSchema = z.object(prescriptionFieldsSchema);
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = z
  .object({
    exerciseId: prescriptionFieldsSchema.exerciseId.optional(),
    scheme: prescriptionFieldsSchema.scheme.optional(),
    targetRir: prescriptionFieldsSchema.targetRir.nullable().optional(),
    baselineLoadKg: prescriptionFieldsSchema.baselineLoadKg.nullable().optional(),
    restSeconds: prescriptionFieldsSchema.restSeconds.nullable().optional(),
    progression: prescriptionFieldsSchema.progression.optional(),
    notes: prescriptionFieldsSchema.notes.nullable().optional(),
  })
  .strict();
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;

export const reorderPrescriptionsSchema = z.object({
  prescriptionIds: z.array(z.string().uuid()).min(1),
});
export type ReorderPrescriptionsInput = z.infer<typeof reorderPrescriptionsSchema>;

// Presence-only: a field is flagged when the *effective* value carries an
// actual value and the profile forbids the field — never based on the value
// itself. `undefined` ("not part of this effective combination") and
// `null` ("explicitly unset") both mean "nothing to reject"; only a real
// value on a forbidden field is an issue.
export interface PrescriptionCompatibilityFields {
  targetRir?: unknown;
  baselineLoadKg?: unknown;
}

// domain-model.md §4 invariant: "progression.strategyId must exist in the
// code registry; strategy must support the scheme type." Plus
// prescription-model.md §2's compatibility table footnote: rep-progression
// requires an explicit `repCap` in config for `fixed` schemes (repRange
// schemes infer it from `maxReps` — progression-engine.md §4.2). Plus
// measurement-profiles-architecture-evaluation.md §9.2 (profile × scheme ×
// strategy — both issue kinds) and §9.3 (targetRir/baselineLoadKg allowed
// only where the profile has an rir/weight field — reusing `dimensionsOf`
// rather than re-deriving that table here, so the two can't drift).
//
// This runs in the service layer (not a Zod .superRefine) because on
// PATCH, `scheme`, `progression`, `targetRir` and `baselineLoadKg` can each
// be omitted independently — the service merges the patch onto the
// existing row and validates the *effective* combination, which only it can
// assemble.
export function checkPrescriptionCompatibility(
  scheme: SetScheme,
  progression: { strategyId: StrategyId; config: Record<string, unknown> },
  profile: MeasurementProfile,
  fields: PrescriptionCompatibilityFields = {},
): string[] {
  const issues: string[] = [];
  if (!profileSupportsScheme(profile, scheme.type)) {
    issues.push(`${profile} does not support ${scheme.type} schemes`);
  }
  if (!strategySupportsProfile(progression.strategyId, profile)) {
    issues.push(`${progression.strategyId} does not support ${profile}`);
  }
  if (progression.strategyId === "rep-progression" && scheme.type === "fixed") {
    if (typeof progression.config.repCap !== "number") {
      issues.push("repCap is required in rep-progression config for fixed schemes");
    }
  }
  const dims = dimensionsOf(profile);
  if (fields.targetRir !== undefined && fields.targetRir !== null && dims.rir === "forbidden") {
    issues.push(`targetRir is not supported for ${profile}`);
  }
  if (
    fields.baselineLoadKg !== undefined &&
    fields.baselineLoadKg !== null &&
    dims.weight === "forbidden"
  ) {
    issues.push(`baselineLoadKg is not supported for ${profile}`);
  }
  return issues;
}
