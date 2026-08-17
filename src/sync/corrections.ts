import { newId } from "@/domain/ids/uuidv7";
import { enqueueOp } from "./outbox";
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

export async function deleteHistorySet(setId: string): Promise<void> {
  await enqueueOp({
    opId: newId(),
    entity: "setLog",
    operation: "delete",
    payload: { id: setId },
  });
  void flushOutbox();
}
