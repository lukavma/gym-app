import type { PrescriptionSnapshotData } from "../schemas/prescriptionSnapshot";
import type { RecommendationTarget } from "./engine";

// progression-engine.md §2 — EvaluationContext.prescription is the
// prescription "as executed THIS session". The snapshot is frozen at session
// start (ADR-007), but a recommendation decided *during* the session
// (explicitly at workout start, or implicitly via the first work set) changes
// the rep target the athlete actually executed against — e.g. accepting an
// `increase_reps` rec to 11 means the session was performed at target 11
// even though the snapshot froze the pre-decision prefill of 10. Overlaying
// the chosen reps here keeps rep progression advancing per earned session
// instead of lagging one session behind the frozen snapshot.
//
// Snapshots themselves are never rewritten — this overlay exists only in the
// in-memory evaluation context, on both the server and the offline client.

export interface InSessionDecision {
  status: "pending" | "accepted" | "modified" | "rejected" | "superseded";
  chosen?: RecommendationTarget | null;
}

export function applyInSessionDecisionToPrefill(
  snapshot: PrescriptionSnapshotData,
  decision: InSessionDecision | null,
): PrescriptionSnapshotData {
  if (!decision || (decision.status !== "accepted" && decision.status !== "modified")) {
    return snapshot;
  }
  const chosenReps = decision.chosen?.reps;
  if (chosenReps === undefined) return snapshot;
  return { ...snapshot, prefill: { ...snapshot.prefill, reps: chosenReps } };
}
