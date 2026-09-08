import {
  correctHistorySet,
  deleteHistorySet,
  type HistorySetCorrectionPatch,
} from "@/sync/corrections";
import type { SetLogRowFields } from "@/domain/sync/setDeletionOps";
import type { MeasurementProfile } from "@/domain/measurement/profile";

// L-8 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md)
// — `correctHistorySet` (O-13) and `deleteHistorySet` now build their payload
// through a schema `.parse()` (buildSetLogCorrectionPayload /
// buildSetDeletionOps -> buildSetLogUpsertPayload) and can therefore reject.
// Both call sites in HistoryDetail.tsx apply an optimistic local update
// BEFORE this fire-and-forget async op ever settles; if it rejects, the
// screen must not keep showing a change with no corresponding outbox
// operation, and the rejection must not go unhandled. These two wrappers own
// the apply -> await -> revert-and-report shape so it is unit-testable
// without a DOM (this repo's `tests/unit` config runs under
// `environment: "node"`, no @testing-library/react — see
// tests/unit/history/correctionSubmit.test.ts, which forces a rejection with
// a deliberately invalid patch/row that bypasses the UI-level
// `validateSetInput` guard, the same way it currently only fails to reach
// production code by that guard mirroring the wire schema).
export interface HistoryEditCallbacks {
  // Applies the local, pre-confirmation UI change. Called synchronously,
  // before the async op is awaited — this is what makes the update
  // "optimistic" rather than a spinner-and-wait.
  applyOptimistic: () => void;
  // Undoes exactly what `applyOptimistic` did, restoring the screen to what
  // it showed before this submission — called only if the async op rejects.
  revertOptimistic: () => void;
  // Surfaces a visible, coherent error to the athlete once the optimistic
  // change has been reverted.
  onError: (message: string) => void;
}

export const CORRECTION_FAILED_MESSAGE =
  "Couldn't save this change — it has been reverted. Check Sync Issues.";
export const DELETION_FAILED_MESSAGE =
  "Couldn't delete this set — it has not been removed. Check Sync Issues.";

export async function submitHistorySetCorrection(
  setId: string,
  sessionExerciseId: string,
  patch: HistorySetCorrectionPatch,
  callbacks: HistoryEditCallbacks,
): Promise<void> {
  callbacks.applyOptimistic();
  try {
    await correctHistorySet(setId, sessionExerciseId, patch);
  } catch {
    callbacks.revertOptimistic();
    callbacks.onError(CORRECTION_FAILED_MESSAGE);
  }
}

export async function submitHistorySetDeletion(
  sessionExerciseId: string,
  setId: string,
  sets: readonly SetLogRowFields[],
  profile: MeasurementProfile,
  callbacks: HistoryEditCallbacks,
): Promise<void> {
  callbacks.applyOptimistic();
  try {
    await deleteHistorySet(sessionExerciseId, setId, sets, profile);
  } catch {
    callbacks.revertOptimistic();
    callbacks.onError(DELETION_FAILED_MESSAGE);
  }
}
