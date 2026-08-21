import { resolveCarryForwardLoadKg, type CarryForwardCandidate } from "./carryForward";
import type { SetScheme } from "../schemes/setScheme";

// prescription-model.md §4 — the full MVP load-prescription chain, now with
// its Phase 4 head: "1. chosen values of latest recommendation Decision for
// (E, current block) — if any", ahead of the Phase 3 chain (last non-deload
// session load → baselineLoadKg → empty).
//
// `decisionChosen` must be the chosen values of the latest *accepted or
// modified* decision for (exercise, current block); rejected decisions are
// transparent to the chain — an older chosen value (or the history fallback)
// still applies, which is exactly what "rejecting leaves next targets
// unchanged" (mvp-scope F7) requires. Scoping and ordering are the caller's
// responsibility (this stays a pure function).

export interface DecisionChosen {
  loadKg?: number;
  reps?: number;
}

export interface WorkingTargets {
  loadKg: number | null;
  reps: number | null;
}

// The reps prefill default is the scheme's own target (fixed reps / bottom
// of a rep range) — same rule Phase 3 used; a decision's chosen reps (an
// accepted rep-progression target) now takes precedence.
export function schemeDefaultReps(scheme: SetScheme): number {
  return scheme.type === "fixed" ? scheme.reps : scheme.minReps;
}

export function resolveWorkingTargets(args: {
  decisionChosen: DecisionChosen | null;
  candidates: readonly CarryForwardCandidate[];
  baselineLoadKg: number | null;
  scheme: SetScheme;
}): WorkingTargets {
  return {
    loadKg:
      args.decisionChosen?.loadKg ??
      resolveCarryForwardLoadKg(args.candidates, args.baselineLoadKg),
    reps: args.decisionChosen?.reps ?? schemeDefaultReps(args.scheme),
  };
}
