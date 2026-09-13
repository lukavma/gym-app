import { projectGroup, type SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { ResolvedProgression } from "../progression/registry";
import type { CarryForwardCandidate } from "../progression/carryForward";
import { resolveWorkingTargets, type DecisionChosen } from "../progression/workingTargets";
import {
  STRATEGY_VERSIONS,
  type Prefill,
  type PrescriptionSnapshotData,
} from "../schemas/prescriptionSnapshot";
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

// set-groups-architecture-evaluation.md §5.3/§5.6 — per-group carry-forward
// inputs the caller (server/today/service.ts) assembles per group key,
// including the C-1/D-6(a) bridge (the first group's own candidate/decision
// list already has the slot's null-key legacy history folded in by the
// caller; every other group's list is that group's own key only).
export interface GroupSnapshotInputs {
  carryForwardCandidates: readonly CarryForwardCandidate[];
  decisionChosen: DecisionChosen | null;
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
//
// set-groups-architecture-evaluation.md §5.3 — for a `groups` scheme,
// `groupInputs` (keyed by group key) resolves one Prefill PER GROUP through
// the identical chain, using each group's own `baselineLoadKg` (falling back
// to the slot's) and its own *projected* scheme (so `schemeDefaultReps`
// reads that group's rep target, not the slot's). `prefill` itself keeps the
// FIRST group's resolved values, so every existing reader — History, a
// pre-Stage-A card path — stays correct without change (§5.3's Prefill row).
export function buildPrescriptionSnapshotData(
  exercise: SnapshotExercise,
  prescription: SnapshotPrescription,
  carryForwardCandidates: readonly CarryForwardCandidate[],
  decisionChosen: DecisionChosen | null,
  weekModifiers: WeekModifiers | null,
  loadStepKg: number,
  groupInputs?: ReadonlyMap<string, GroupSnapshotInputs>,
): PrescriptionSnapshotData {
  const { scheme, targetRir } = applyWeekModifiersToPrescription(
    prescription.scheme,
    prescription.targetRir,
    weekModifiers,
  );

  let groupPrefills: Record<string, Prefill> | undefined;
  let firstGroupPrefill: Prefill | undefined;
  if (scheme.type === "groups") {
    groupPrefills = {};
    for (const group of scheme.groups) {
      const gi = groupInputs?.get(group.key);
      const rawGroupPrefill = resolveWorkingTargets({
        decisionChosen: gi?.decisionChosen ?? null,
        candidates: gi?.carryForwardCandidates ?? [],
        baselineLoadKg: group.baselineLoadKg ?? prescription.baselineLoadKg,
        scheme: projectGroup(group),
      });
      const resolved: Prefill = {
        loadKg: applyLoadMultiplier(
          rawGroupPrefill.loadKg,
          weekModifiers?.loadMultiplier,
          loadStepKg,
        ),
        reps: rawGroupPrefill.reps,
      };
      groupPrefills[group.key] = resolved;
      if (firstGroupPrefill === undefined) firstGroupPrefill = resolved;
    }
  }

  const rawPrefill = resolveWorkingTargets({
    decisionChosen,
    candidates: carryForwardCandidates,
    baselineLoadKg: prescription.baselineLoadKg,
    scheme,
  });
  const slotPrefill: Prefill = {
    loadKg: applyLoadMultiplier(rawPrefill.loadKg, weekModifiers?.loadMultiplier, loadStepKg),
    reps: rawPrefill.reps,
  };

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
      ...(prescription.progression.groups
        ? {
            groups: Object.fromEntries(
              Object.entries(prescription.progression.groups).map(([key, rp]) => [
                key,
                {
                  strategyId: rp.strategyId,
                  strategyVersion: STRATEGY_VERSIONS[rp.strategyId],
                  config: rp.config,
                  classification: rp.classification,
                },
              ]),
            ),
          }
        : {}),
    },
    appliedModifiers: weekModifiers,
    prefill: firstGroupPrefill ?? slotPrefill,
    ...(groupPrefills ? { groupPrefills } : {}),
  };
}
