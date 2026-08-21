import type { LoadProgressionConfig } from "./registry";
import {
  checkRir,
  type Confidence,
  type EvaluationContext,
  type InputsSummary,
  type PerformedExercise,
  type PerformedSet,
  type RecommendationDraft,
} from "./engine";
import type { ReasonCode } from "./reasonCodes";
import { modalWorkingLoad, roundToStepKg } from "./loadHelpers";
import type { SetScheme } from "../schemes/setScheme";

// progression-engine.md §4.1 — `load-progression` v1: fixed target reps →
// add load. The evaluation pseudocode in §4.1 is implemented literally;
// every deviation-worthy detail is called out inline.

// R: the per-set rep requirement — fixed reps, or minReps for repRange
// ("'repRange' (use minReps as R)").
function targetRepsPerSet(scheme: SetScheme): number {
  return scheme.type === "fixed" ? scheme.reps : scheme.minReps;
}

// shortfall(sets, R) — missing reps summed over the first S work sets (extra
// sets beyond S never add shortfall; fewer sets than S already fails the
// `sets.length >= S` half of `completed`).
function repShortfall(sets: readonly PerformedSet[], prescribedSets: number, reps: number): number {
  let shortfall = 0;
  for (const set of sets.slice(0, prescribedSets)) {
    shortfall += Math.max(0, reps - set.reps);
  }
  return shortfall;
}

function isCompleted(sets: readonly PerformedSet[], scheme: SetScheme, tolerance: number): boolean {
  return (
    sets.length >= scheme.sets &&
    repShortfall(sets, scheme.sets, targetRepsPerSet(scheme)) <= tolerance
  );
}

// §4.1 — "failStreak = 1 + count of immediately-preceding non-deload history
// entries that used same load AND were also not-completed". Deload entries
// are skipped over (they "neither trigger nor reset") when
// `skipDeloadSessions`; an entry without a prescribed snapshot (ad-hoc) has
// no completion criterion, so it ends the streak.
function entryQualifiesForStreak(
  entry: PerformedExercise,
  currentLoadKg: number,
  tolerance: number,
): boolean {
  if (!entry.prescribed || entry.workSets.length === 0) return false;
  if (modalWorkingLoad(entry.workSets).loadKg !== currentLoadKg) return false;
  return !isCompleted(entry.workSets, entry.prescribed.scheme, tolerance);
}

function capForMixedLoads(confidence: Confidence, mixed: boolean): Confidence {
  // §8 — mixed loads within work sets cap confidence at medium.
  return mixed && confidence === "high" ? "medium" : confidence;
}

export function evaluateLoadProgression(
  ctx: EvaluationContext,
  cfg: LoadProgressionConfig,
): RecommendationDraft {
  const sets = ctx.performance.workSets;
  const scheme = ctx.prescription.scheme;
  const { loadKg: load, mixed } = modalWorkingLoad(sets);
  const step = ctx.exercise.loadStepKg;

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
      mixedLoads: mixed,
    },
    historyDepthUsed: ctx.history.length,
  };

  if (sets.length === 0) {
    return { action: "none", reasonCodes: ["NO_WORK_SETS_LOGGED"], inputs, confidence: "low" };
  }

  const incrementKg = cfg.incrementKg ?? step;
  const completed = isCompleted(sets, scheme, cfg.repShortfallTolerance);
  const finalRir = sets[sets.length - 1]!.rir;

  if (!completed) {
    const relevantHistory = cfg.skipDeloadSessions
      ? ctx.history.filter((h) => !h.isDeload)
      : ctx.history;
    let failStreak = 1;
    for (const entry of relevantHistory) {
      if (!entryQualifiesForStreak(entry, load, cfg.repShortfallTolerance)) break;
      failStreak += 1;
    }

    if (cfg.failureAction === "decrease" && failStreak >= cfg.decreaseAfterConsecutiveFailures) {
      return {
        action: "decrease_load",
        target: { loadKg: roundToStepKg(load * (1 - cfg.decreasePercent / 100), step) },
        reasonCodes: ["REPEATED_INCOMPLETE_AT_LOAD", "DECREASE_APPLIED"],
        inputs,
        confidence: "medium",
      };
    }

    // §8 — the decrease rule needs streak history; when it is configured but
    // there is none at all, note INSUFFICIENT_HISTORY (confidence note in §6:
    // "partial history for streak logic" ⇒ medium).
    const insufficientHistory = cfg.failureAction === "decrease" && relevantHistory.length === 0;
    const reasonCodes: ReasonCode[] = insufficientHistory
      ? ["PRESCRIBED_REPS_NOT_COMPLETED", "INSUFFICIENT_HISTORY"]
      : ["PRESCRIBED_REPS_NOT_COMPLETED"];
    const confidence: Confidence = finalRir !== null && !insufficientHistory ? "high" : "medium";
    return {
      action: "hold",
      target: { loadKg: load },
      reasonCodes,
      inputs,
      confidence: capForMixedLoads(confidence, mixed),
    };
  }

  switch (checkRir(finalRir, cfg.progressRirGate)) {
    case "met":
      return {
        action: "increase_load",
        target: { loadKg: roundToStepKg(load + incrementKg, step) },
        reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED", "FINAL_SET_RIR_IN_PROGRESS_ZONE"],
        inputs,
        confidence: capForMixedLoads("high", mixed),
      };
    case "below":
      // Completed but at (or under) the limit of the progress zone. With the
      // default gate {min:1} this is RIR 0: hold once when `holdAtRirZero`,
      // otherwise progress anyway — either way the facts are the same codes.
      if (cfg.holdAtRirZero) {
        return {
          action: "hold",
          target: { loadKg: load },
          reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED", "FINAL_SET_RIR_AT_LIMIT"],
          inputs,
          confidence: capForMixedLoads("high", mixed),
        };
      }
      return {
        action: "increase_load",
        target: { loadKg: roundToStepKg(load + incrementKg, step) },
        reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED", "FINAL_SET_RIR_AT_LIMIT"],
        inputs,
        confidence: capForMixedLoads("high", mixed),
      };
    case "unknown":
      if (cfg.onMissingRir === "reps_only") {
        return {
          action: "increase_load",
          target: { loadKg: roundToStepKg(load + incrementKg, step) },
          reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED", "RIR_MISSING_REPS_ONLY_EVALUATION"],
          inputs,
          confidence: "medium",
        };
      }
      return {
        action: "hold",
        target: { loadKg: load },
        reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED", "RIR_MISSING_HOLD_POLICY"],
        inputs,
        confidence: "medium",
      };
    case "above":
      // §4.1 — impossible with the default gate (max 10); with a user-
      // narrowed gate the data smells wrong (e.g. RIR 8 on a 0–2 target), so
      // never auto-jump load.
      return {
        action: "hold",
        target: { loadKg: load },
        reasonCodes: ["FINAL_SET_RIR_ABOVE_PROGRESS_ZONE_SUSPECT"],
        inputs,
        confidence: "low",
      };
  }
}
