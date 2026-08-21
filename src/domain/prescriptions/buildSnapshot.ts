import type { SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { ResolvedProgression } from "../progression/registry";
import type { CarryForwardCandidate } from "../progression/carryForward";
import { resolveWorkingTargets, type DecisionChosen } from "../progression/workingTargets";
import { STRATEGY_VERSIONS, type PrescriptionSnapshotData } from "../schemas/prescriptionSnapshot";

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

// Assembles the Phase 3+4 subset of EffectivePrescription (domain-model.md
// §6) into a PrescriptionSnapshotData: scheme + RIR band + rest, as
// prescribed, plus the working-target prefill — headed by the chosen values
// of the latest accepted/modified recommendation Decision for this exercise
// in the current block (prescription-model.md §4 step 1, Phase 4), then the
// Phase 3 carry-forward chain. No deload/week modifiers (Phase 5) are
// applied here. A *pending* recommendation never reaches this prefill — it
// isn't a decision yet; the UI shows it alongside as the proposed target.
export function buildPrescriptionSnapshotData(
  exercise: SnapshotExercise,
  prescription: SnapshotPrescription,
  carryForwardCandidates: readonly CarryForwardCandidate[],
  decisionChosen: DecisionChosen | null,
): PrescriptionSnapshotData {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    scheme: prescription.scheme,
    targetRir: prescription.targetRir,
    restSeconds: prescription.restSeconds,
    progression: {
      strategyId: prescription.progression.strategyId,
      strategyVersion: STRATEGY_VERSIONS[prescription.progression.strategyId],
      config: prescription.progression.config,
      classification: prescription.progression.classification,
    },
    appliedModifiers: null,
    prefill: resolveWorkingTargets({
      decisionChosen,
      candidates: carryForwardCandidates,
      baselineLoadKg: prescription.baselineLoadKg,
      scheme: prescription.scheme,
    }),
  };
}
