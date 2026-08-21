import type { RepProgressionConfig } from "./registry";
import {
  checkRir,
  type Confidence,
  type EvaluationContext,
  type InputsSummary,
  type RecommendationDraft,
} from "./engine";
import { modalWorkingLoad, roundToStepKg } from "./loadHelpers";
import type { SetScheme } from "../schemes/setScheme";

// progression-engine.md §4.2 — `rep-progression` v1: fixed load → add reps;
// rep-range aware. `onCapReached: 'suggest_load_increase'` IS double
// progression — it ships because it falls out of the same code path, but the
// MVP default keeps it off and the UI does not advertise it (mvp-scope §2.3).

function schemeMinReps(scheme: SetScheme): number {
  return scheme.type === "fixed" ? scheme.reps : scheme.minReps;
}

// Effective rep cap: config `repCap` wins when set; `repRange` falls back to
// its own maxReps ("for 'repRange' = scheme.maxReps"). A `fixed` scheme
// without a configured cap ("required for 'fixed' schemes", but Phase 2's
// defaulting leaves it a genuine user choice) is treated as uncapped —
// progression simply never hits the rollover branch.
function effectiveRepCap(scheme: SetScheme, cfg: RepProgressionConfig): number | null {
  if (cfg.repCap !== undefined) return cfg.repCap;
  return scheme.type === "repRange" ? scheme.maxReps : null;
}

function capForMixedLoads(confidence: Confidence, mixed: boolean): Confidence {
  return mixed && confidence === "high" ? "medium" : confidence;
}

export function evaluateRepProgression(
  ctx: EvaluationContext,
  cfg: RepProgressionConfig,
): RecommendationDraft {
  const sets = ctx.performance.workSets;
  const scheme = ctx.prescription.scheme;
  const { loadKg: load, mixed } = modalWorkingLoad(sets);

  // §4.2 — "currentTarget = target reps this session (from snapshot prefill;
  // else scheme.minReps / scheme.reps)". The context assembler overlays an
  // in-session accepted/modified decision's chosen reps onto the prefill
  // (evaluationTarget.ts), so this is the target as executed.
  const currentTarget = ctx.prescription.prefill.reps ?? schemeMinReps(scheme);

  const inputs: InputsSummary = {
    prescribed: {
      scheme,
      ...(ctx.prescription.targetRir ? { targetRir: ctx.prescription.targetRir } : {}),
    },
    workSets: sets,
    derived: {
      setsCompleted: sets.length,
      prescribedSets: scheme.sets,
      finalSetRir: sets.length > 0 ? sets[sets.length - 1]!.rir : null,
      workingLoadKg: load,
      currentRepTarget: currentTarget,
      mixedLoads: mixed,
    },
    historyDepthUsed: ctx.history.length,
  };

  if (sets.length === 0) {
    return { action: "none", reasonCodes: ["NO_WORK_SETS_LOGGED"], inputs, confidence: "low" };
  }

  // §4.2 — "completed = all prescribed sets logged AND every work set reps ≥
  // currentTarget".
  const completed = sets.length >= scheme.sets && sets.every((s) => s.reps >= currentTarget);
  const finalRir = sets[sets.length - 1]!.rir;

  if (!completed) {
    return {
      action: "hold",
      target: { loadKg: load, reps: currentTarget },
      reasonCodes: ["TARGET_REPS_NOT_REACHED_ALL_SETS"],
      inputs,
      confidence: capForMixedLoads(finalRir !== null ? "high" : "medium", mixed),
    };
  }

  // Same 'unknown'/'below' handling as §4.1 (there is no holdAtRirZero knob
  // here — at-limit RIR always holds the rep target).
  const gate = checkRir(finalRir, cfg.progressRirGate);
  let confidence: Confidence;
  switch (gate) {
    case "met":
      confidence = "high";
      break;
    case "below":
      return {
        action: "hold",
        target: { loadKg: load, reps: currentTarget },
        reasonCodes: ["ALL_SETS_AT_TARGET_REPS", "FINAL_SET_RIR_AT_LIMIT"],
        inputs,
        confidence: capForMixedLoads("high", mixed),
      };
    case "unknown":
      if (cfg.onMissingRir === "hold") {
        return {
          action: "hold",
          target: { loadKg: load, reps: currentTarget },
          reasonCodes: ["ALL_SETS_AT_TARGET_REPS", "RIR_MISSING_HOLD_POLICY"],
          inputs,
          confidence: "medium",
        };
      }
      confidence = "medium";
      break;
    case "above":
      return {
        action: "hold",
        target: { loadKg: load, reps: currentTarget },
        reasonCodes: ["FINAL_SET_RIR_ABOVE_PROGRESS_ZONE_SUSPECT"],
        inputs,
        confidence: "low",
      };
  }

  const cap = effectiveRepCap(scheme, cfg);
  const nextTarget = currentTarget + cfg.repIncrement;

  if (cap === null || nextTarget <= cap) {
    return {
      action: "increase_reps",
      target: { reps: nextTarget, loadKg: load },
      reasonCodes:
        gate === "unknown"
          ? ["ALL_SETS_AT_TARGET_REPS", "RIR_MISSING_REPS_ONLY_EVALUATION", "REP_TARGET_INCREASED"]
          : ["ALL_SETS_AT_TARGET_REPS", "FINAL_SET_RIR_IN_PROGRESS_ZONE", "REP_TARGET_INCREASED"],
      inputs,
      confidence: capForMixedLoads(confidence, mixed),
    };
  }

  if (cfg.onCapReached === "hold") {
    return {
      action: "hold",
      target: { loadKg: load, reps: currentTarget },
      reasonCodes: ["REP_CAP_REACHED", "HOLD_POLICY"],
      inputs,
      confidence: capForMixedLoads(confidence, mixed),
    };
  }

  // 'suggest_load_increase' — classic double progression: load up, reps back
  // to the scheme minimum (or a configured reset value).
  const resetReps =
    cfg.resetRepsOnRollover === "schemeMin" ? schemeMinReps(scheme) : cfg.resetRepsOnRollover;
  const increment = cfg.loadIncrementOnRollover ?? ctx.exercise.loadStepKg;
  return {
    action: "increase_load",
    target: {
      loadKg: roundToStepKg(load + increment, ctx.exercise.loadStepKg),
      reps: resetReps,
    },
    reasonCodes: ["REP_CAP_REACHED", "LOAD_INCREASE_WITH_REP_RESET"],
    inputs,
    confidence: capForMixedLoads(confidence, mixed),
  };
}
