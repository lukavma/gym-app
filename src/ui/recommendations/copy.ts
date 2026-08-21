import type { ReasonCode } from "@/domain/progression/reasonCodes";
import type { RecommendationAction, RecommendationTarget } from "@/domain/progression/engine";

// progression-engine.md §6 — "the UI owns human phrasing (i18n-ready),
// codes are the API." This map is the entire phrasing surface: the domain
// never carries copy, and a code without an entry here would surface as its
// raw identifier (compile-enforced completeness prevents that).
export const REASON_CODE_COPY: Record<ReasonCode, string> = {
  ALL_PRESCRIBED_REPS_COMPLETED: "All prescribed reps completed",
  PRESCRIBED_REPS_NOT_COMPLETED: "Prescribed reps not completed",
  NO_WORK_SETS_LOGGED: "No work sets logged",
  FINAL_SET_RIR_IN_PROGRESS_ZONE: "Final-set RIR in the progress zone",
  FINAL_SET_RIR_AT_LIMIT: "Final-set RIR at the limit",
  RIR_MISSING_REPS_ONLY_EVALUATION: "RIR not reported — evaluated on reps alone",
  RIR_MISSING_HOLD_POLICY: "RIR not reported — holding per your settings",
  FINAL_SET_RIR_ABOVE_PROGRESS_ZONE_SUSPECT: "Reported RIR far above target — data looks off",
  TARGET_REPS_NOT_REACHED_ALL_SETS: "Target reps not reached on every set",
  ALL_SETS_AT_TARGET_REPS: "All sets hit the target reps",
  REP_TARGET_INCREASED: "Rep target increased",
  REP_CAP_REACHED: "Rep cap reached",
  HOLD_POLICY: "Holding per your settings",
  LOAD_INCREASE_WITH_REP_RESET: "Load up, reps reset",
  REPEATED_INCOMPLETE_AT_LOAD: "Repeatedly incomplete at this load",
  DECREASE_APPLIED: "Load decrease applied",
  UNSUPPORTED_SCHEME: "Set scheme not supported by this strategy",
  INSUFFICIENT_HISTORY: "Not enough history yet",
  DELOAD_SESSION_NOT_EVALUATED: "Deload session — not evaluated",
};

export function reasonCopy(code: string): string {
  // Codes travel as plain strings on the wire; unknown ones (from a future
  // strategy version) fall back to the raw identifier rather than crashing —
  // a record must stay renderable forever (progression-engine.md §6).
  return (REASON_CODE_COPY as Record<string, string>)[code] ?? code;
}

export const ACTION_COPY: Record<RecommendationAction, string> = {
  increase_load: "Increase load",
  decrease_load: "Decrease load",
  hold: "Hold",
  increase_reps: "Add reps",
  none: "No recommendation",
};

export const CONFIDENCE_COPY: Record<"low" | "medium" | "high", string> = {
  low: "low",
  medium: "medium",
  high: "high",
};

// evidence-to-design.md labeling rules — every shipped trigger rule is a
// labeled heuristic; tuned config is the user's own rule. Neither is ever
// presented as science.
export function classificationCopy(
  classification: "evidence_supported" | "heuristic" | "user_defined",
): string {
  if (classification === "user_defined") {
    return "your configuration — heuristic, not a scientific threshold";
  }
  return "heuristic — not a scientific threshold";
}

export function formatTarget(target: RecommendationTarget | null): string | null {
  if (!target) return null;
  const parts: string[] = [];
  if (target.loadKg !== undefined) parts.push(`${target.loadKg} kg`);
  if (target.reps !== undefined) parts.push(`${target.reps} reps`);
  return parts.length > 0 ? parts.join(" × ") : null;
}
