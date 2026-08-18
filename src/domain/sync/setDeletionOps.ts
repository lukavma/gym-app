import { newId } from "@/domain/ids/uuidv7";
import { buildSetLogDeletePayload, buildSetLogUpsertPayload } from "./payloadBuilders";
import { planSetDeletion, type NumberedSet } from "./setNumbering";

// Finding D — the one place that turns "delete this set" into the sequence of
// outbox ops that keeps PostgreSQL contiguous. Shared by the in-session path
// (src/sync/activeSession.ts, which commits these together with the mutated
// aggregate in a single IndexedDB transaction) and the post-completion path
// (src/sync/corrections.ts), so both emit identical, identically-ordered ops.
//
// Pure apart from id generation, which is injectable — the ordering guarantee
// this function exists to provide is therefore unit-testable without a
// browser, an IndexedDB, or a database.

// The full-row fields a setLog upsert re-sends. ActiveSessionSetDto and the
// history screen's HistorySetDetail both satisfy this structurally.
export interface SetLogRowFields extends NumberedSet {
  isWarmup: boolean;
  weightKg: number;
  reps: number;
  rir: number | null;
  loggedAt: string;
  notes: string | null;
}

export interface SetLogOp {
  opId: string;
  entity: "setLog";
  operation: "delete" | "upsert";
  payload: Record<string, unknown>;
}

export interface SetDeletionOps<T extends SetLogRowFields> {
  // null when the set was not in `sets`: nothing to delete, no ops.
  deleted: T | null;
  // The survivors, renumbered to a contiguous 1..n — what the caller should
  // store locally so the device agrees with what these ops will do remotely.
  remaining: T[];
  // Delete first, then one full-row upsert per renumbered set in ascending
  // order of the new set number. The sync API applies one transaction per op,
  // so `uq_set_number` is checked at every op's own COMMIT: this order is what
  // guarantees each target number is already free when its update lands.
  // Empty when `deleted` is null.
  //
  // The ordering is load-bearing; the constraint being DEFERRABLE INITIALLY
  // DEFERRED is not required for this path — see the note in setNumbering.ts.
  ops: SetLogOp[];
}

export function buildSetDeletionOps<T extends SetLogRowFields>({
  sessionExerciseId,
  setId,
  sets,
  newOpId = newId,
}: {
  sessionExerciseId: string;
  setId: string;
  sets: readonly T[];
  newOpId?: () => string;
}): SetDeletionOps<T> {
  const plan = planSetDeletion(sets, setId);
  if (!plan.deleted) return { deleted: null, remaining: plan.remaining, ops: [] };

  const ops: SetLogOp[] = [
    {
      opId: newOpId(),
      entity: "setLog",
      operation: "delete",
      payload: buildSetLogDeletePayload({ id: setId }),
    },
  ];
  for (const set of plan.renumbered) {
    ops.push({
      opId: newOpId(),
      entity: "setLog",
      operation: "upsert",
      payload: buildSetLogUpsertPayload({
        id: set.id,
        sessionExerciseId,
        setNumber: set.setNumber,
        isWarmup: set.isWarmup,
        weightKg: set.weightKg,
        reps: set.reps,
        rir: set.rir,
        loggedAt: set.loggedAt,
        notes: set.notes,
      }),
    });
  }

  return { deleted: plan.deleted, remaining: plan.remaining, ops };
}
