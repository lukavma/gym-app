import { z } from "zod";
import { rirBandSchema } from "../schemes/rirBand";
import { setSchemeEnvelopeSchema, type SetScheme } from "../schemes/setScheme";
import { strategyIdSchema, supportsScheme, type StrategyId } from "../progression/registry";

// prescription-model.md §6 — 0 <= x <= 1000, multiple of 0.25. (The
// `numeric(6,2)` column could hold up to 9999.99; this is a narrower,
// doc-specified application ceiling, same pattern as exercises'
// MAX_LOAD_STEP_KG vs. its column ceiling.)
export const MAX_BASELINE_LOAD_KG = 1000;

const baselineLoadKgSchema = z
  .number()
  .min(0)
  .max(MAX_BASELINE_LOAD_KG)
  .refine((v) => Math.round(v * 100) % 25 === 0, {
    message: "must be a multiple of 0.25",
  });

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

// domain-model.md §4 invariant: "progression.strategyId must exist in the
// code registry; strategy must support the scheme type." Plus
// prescription-model.md §2's compatibility table footnote: rep-progression
// requires an explicit `repCap` in config for `fixed` schemes (repRange
// schemes infer it from `maxReps` — progression-engine.md §4.2).
//
// This runs in the service layer (not a Zod .superRefine) because on
// PATCH, `scheme` and `progression` can each be omitted independently — the
// service merges the patch onto the existing row and validates the
// *effective* combination, which only it can assemble.
export function checkPrescriptionCompatibility(
  scheme: SetScheme,
  progression: { strategyId: StrategyId; config: Record<string, unknown> },
): string[] {
  const issues: string[] = [];
  if (!supportsScheme(progression.strategyId, scheme.type)) {
    issues.push(`${progression.strategyId} does not support ${scheme.type} schemes`);
  }
  if (progression.strategyId === "rep-progression" && scheme.type === "fixed") {
    if (typeof progression.config.repCap !== "number") {
      issues.push("repCap is required in rep-progression config for fixed schemes");
    }
  }
  return issues;
}
