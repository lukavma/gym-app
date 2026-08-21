import type { RecommendationAction, RecommendationTarget } from "./engine";
import { roundToStepKg } from "./loadHelpers";

// progression-engine.md §7 — the implicit decision: "if the user just starts
// logging, the first *work* set resolves it — logged load equal to the
// recommended target (after loadStepKg rounding) ⇒ accepted /
// implicit_first_set; a different load ⇒ modified with chosen = actual."
//
// The comparison is on load only: achieved reps are performance the next
// evaluation consumes, not a target the athlete chose in advance, so an
// implicit `modified` records only the load actually lifted. Rep targets
// change hands only through explicit accept/modify (chosen.reps).

export interface ImplicitDecisionRecommendation {
  action: RecommendationAction;
  target: RecommendationTarget | null;
}

export interface ImplicitDecisionResult {
  status: "accepted" | "modified";
  chosen: RecommendationTarget;
  source: "implicit_first_set";
}

export function resolveImplicitDecision(
  recommendation: ImplicitDecisionRecommendation,
  firstWorkSet: { weightKg: number },
  loadStepKg: number,
): ImplicitDecisionResult | null {
  const target = recommendation.target;
  // A recommendation without a load target (e.g. action 'none') has nothing
  // to match against — it stays pending until superseded.
  if (!target || target.loadKg === undefined) return null;

  if (firstWorkSet.weightKg === roundToStepKg(target.loadKg, loadStepKg)) {
    return {
      status: "accepted",
      chosen: { ...target },
      source: "implicit_first_set",
    };
  }
  return {
    status: "modified",
    chosen: { loadKg: firstWorkSet.weightKg },
    source: "implicit_first_set",
  };
}
