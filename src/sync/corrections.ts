import { newId } from "@/domain/ids/uuidv7";
import { buildSetDeletionOps, type SetLogRowFields } from "@/domain/sync/setDeletionOps";
import { enqueueOp, enqueueOps } from "./outbox";
import { flushOutbox } from "./flush";

export type HistorySetCorrectionPatch = Partial<{
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup: boolean;
  notes: string | null;
}>;

// Post-completion set corrections (domain-model.md §7 — SetLog values
// remain user-editable "at any time, including after completion") go
// through the same outbox write path as in-progress logging, never a
// direct REST PATCH — pwa-offline-strategy.md's "one execution-fact write
// path" holds online or offline. These don't touch the activeSession
// aggregate (the session is already completed and long gone from
// IndexedDB) — just enqueue directly.
export async function correctHistorySet(
  setId: string,
  sessionExerciseId: string,
  patch: HistorySetCorrectionPatch,
): Promise<void> {
  await enqueueOp({
    opId: newId(),
    entity: "setLog",
    operation: "upsert",
    payload: { id: setId, sessionExerciseId, ...patch },
  });
  void flushOutbox();
}

// Finding D — the post-completion half of contiguous renumbering: the same
// ops, in the same order, as the in-session path, enqueued in one IndexedDB
// transaction so the queue can never hold the deletion without the
// renumbering that keeps set numbers 1..n. `sets` must be the exercise's sets
// as they were BEFORE the deletion; the caller applies `remaining` locally
// (src/ui/history/HistoryDetail.tsx renumbers optimistically the same way).
export async function deleteHistorySet(
  sessionExerciseId: string,
  setId: string,
  sets: readonly SetLogRowFields[],
): Promise<void> {
  const { deleted, ops } = buildSetDeletionOps({ sessionExerciseId, setId, sets });
  if (!deleted) return;

  await enqueueOps(ops);
  void flushOutbox();
}
