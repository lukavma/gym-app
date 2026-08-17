import type { SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { ResolvedProgression } from "../progression/registry";
import { resolveCarryForwardLoadKg, type CarryForwardCandidate } from "../progression/carryForward";
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

// prescription-model.md §2 doesn't define a reps carry-forward rule (only
// load — see carryForward.ts); the reps prefill is simply the scheme's own
// target: the fixed rep count, or the bottom of a rep range (a conservative
// starting target — RIR is what tells the lifter whether to push past it).
function prefillReps(scheme: SetScheme): number | null {
  return scheme.type === "fixed" ? scheme.reps : scheme.minReps;
}

// Assembles the Phase 3 subset of EffectivePrescription (domain-model.md
// §6) into a PrescriptionSnapshotData: scheme + RIR band + rest, as
// prescribed, plus a carry-forward prefill. No Decision layer (Phase 4) and
// no deload/week modifiers (Phase 5) are applied here.
export function buildPrescriptionSnapshotData(
  exercise: SnapshotExercise,
  prescription: SnapshotPrescription,
  carryForwardCandidates: readonly CarryForwardCandidate[],
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
    prefill: {
      loadKg: resolveCarryForwardLoadKg(carryForwardCandidates, prescription.baselineLoadKg),
      reps: prefillReps(prescription.scheme),
    },
  };
}
