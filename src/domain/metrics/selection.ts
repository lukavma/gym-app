// Metrics dashboard v1 — the selection's write contract and eligibility gate
// (O-3, O-8, §11.5).
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §11.5, §16 I-12: "`src/domain/metrics/selection.ts` may import
// `evaluateExerciseEligibility` and `STRENGTH_ELIGIBLE_EQUIPMENT` from
// `src/domain/strength/**` (the one eligibility rule, never copied)" — the
// one deliberate widening of the metrics domain module's otherwise narrow
// import boundary.

import { z } from "zod";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";
import { evaluateExerciseEligibility } from "@/domain/strength/eligibility";
import type { StrengthEstimateMode } from "@/domain/strength/types";

// §11.5 — the check constraint, the unique position index, and this Zod
// bound all enforce the same five-item limit independently (defence in
// depth, R-8).
export const SELECTION_MAX = 5;

export const putSelectionInputSchema = z
  .object({
    exerciseIds: z.array(z.string().uuid()).max(SELECTION_MAX),
  })
  .strict()
  .refine((value) => new Set(value.exerciseIds).size === value.exerciseIds.length, {
    message: "duplicate exercise id",
    path: ["exerciseIds"],
  });

export type PutSelectionInput = z.infer<typeof putSelectionInputSchema>;

// The candidate filter (§11.5's read contract): "every exercise of the user
// that `evaluateExerciseEligibility` accepts ... and is not archived." Kept
// here so the one eligibility rule is never copied into the server layer —
// `loadStepKg` plays no part in eligibility, so a placeholder value is
// supplied to satisfy the shared function's input shape. `measurementProfile`
// and `loadBasis` get no such placeholder (§11.2's "reuses the e1RM
// structural gate ... with measurementProfile and loadBasis threaded through
// selectionService.ts"): unlike `loadStepKg`, they are gate fields, so the
// caller must supply the exercise's real current values.
export function isSelectionEligible(exercise: {
  equipment: string;
  strengthEstimate: StrengthEstimateMode;
  measurementProfile: MeasurementProfile;
  loadBasis: LoadBasis | null;
}): boolean {
  return evaluateExerciseEligibility({ ...exercise, loadStepKg: 0 }).eligible;
}
