import type { SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { ResolvedProgression } from "../progression/registry";
import type { CarryForwardCandidate } from "../progression/carryForward";
import { resolveWorkingTargets, type DecisionChosen } from "../progression/workingTargets";
import { STRATEGY_VERSIONS, type PrescriptionSnapshotData } from "../schemas/prescriptionSnapshot";
import type { WeekModifiers } from "../blocks/schema";
import { applyLoadMultiplier, applyWeekModifiersToPrescription } from "./applyWeekModifiers";

export interface SnapshotExercise {
  id: string;
  name: string;
}

export interface SnapshotPrescription {
  scheme: SetScheme;
  targetRir: RirBand | null;
  restSeconds: number | null;
  progression: ResolvedProgression;
  baselineLoadKg: number | null;
}

// Assembles EffectivePrescription (domain-model.md §6) into a
// PrescriptionSnapshotData: scheme + RIR band + rest, as prescribed, then
// deload/WeekOverride modifiers (prescription-model.md §5 — setMultiplier on
// the scheme, targetRirShift on the band), then the working-target prefill —
// headed by the chosen values of the latest accepted/modified recommendation
// Decision for this exercise in the current block (prescription-model.md §4
// step 1), then the carry-forward chain, with `loadMultiplier` applied last
// to the *resolved* prefill number (§4: "applies to the prefill at
// effective-prescription time"), rounded to the exercise's `loadStepKg`. A
// *pending* recommendation never reaches this prefill — it isn't a decision
// yet; the UI shows it alongside as the proposed target.
export function buildPrescriptionSnapshotData(
  exercise: SnapshotExercise,
  prescription: SnapshotPrescription,
  carryForwardCandidates: readonly CarryForwardCandidate[],
  decisionChosen: DecisionChosen | null,
  weekModifiers: WeekModifiers | null,
  loadStepKg: number,
): PrescriptionSnapshotData {
  const { scheme, targetRir } = applyWeekModifiersToPrescription(
    prescription.scheme,
    prescription.targetRir,
    weekModifiers,
  );
  const rawPrefill = resolveWorkingTargets({
    decisionChosen,
    candidates: carryForwardCandidates,
    baselineLoadKg: prescription.baselineLoadKg,
    scheme,
  });
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    scheme,
    targetRir,
    restSeconds: prescription.restSeconds,
    progression: {
      strategyId: prescription.progression.strategyId,
      strategyVersion: STRATEGY_VERSIONS[prescription.progression.strategyId],
      config: prescription.progression.config,
      classification: prescription.progression.classification,
    },
    appliedModifiers: weekModifiers,
    prefill: {
      loadKg: applyLoadMultiplier(rawPrefill.loadKg, weekModifiers?.loadMultiplier, loadStepKg),
      reps: rawPrefill.reps,
    },
  };
}
