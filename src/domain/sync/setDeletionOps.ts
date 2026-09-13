import { newId } from "@/domain/ids/uuidv7";
import { buildSetLogDeletePayload, buildSetLogUpsertPayload } from "./payloadBuilders";
import { planSetDeletion, type NumberedSet } from "./setNumbering";
import {
  DEFAULT_MEASUREMENT_PROFILE,
  measuredFieldsForProfile,
  type MeasurementProfile,
} from "@/domain/measurement/profile";

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
  // Release 2 (athletic-measurement-profiles-architecture-evaluation.md
  // §21.2) — widened to number|null alongside ActiveSessionSetDto and
  // HistorySetDetail (both of which structurally satisfy this interface),
  // matching the server's own "a null is never coerced" rule (I-13/H-12).
  // Which of these five keys actually reaches the wire is decided by the
  // caller's `profile` argument below (O-13, §12.3) — this interface only
  // states the full shape a caller may hold locally.
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  loggedAt: string;
  notes: string | null;
  // set-groups-architecture-evaluation.md §4.4 — carried through a renumber
  // so a group's attribution survives a sibling set's deletion untouched
  // (renumbering never touches keys).
  groupKey?: string | null;
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
  // Defaults to `load_reps` so every pre-existing caller/test that predates
  // this parameter (only `load_reps` slots ever existed then) keeps
  // building the identical nine-key row without having to name the profile
  // explicitly. Every real production caller (activeSession.ts's
  // `deleteSet`, corrections.ts's `deleteHistorySet`) passes the parent
  // slot's actual frozen `measurement.profile` — never relies on this
  // default.
  profile = DEFAULT_MEASUREMENT_PROFILE,
  // set-groups-architecture-evaluation.md §5.4/rev. 3 V-1 — same
  // profile-scoped emission rule as `setLogFullRowOp`: `groupKey` is emitted
  // for the renumber upserts ONLY when the slot is grouped. Defaults to
  // `false` so every pre-existing caller/test keeps building the identical
  // byte shape.
  isGrouped = false,
  newOpId = newId,
}: {
  sessionExerciseId: string;
  setId: string;
  sets: readonly T[];
  profile?: MeasurementProfile;
  isGrouped?: boolean;
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
        loggedAt: set.loggedAt,
        notes: set.notes,
        // O-13 (§12.3) — profile-scoped: only the frozen profile's
        // permitted keys are emitted, `null` for an absent optional one,
        // forbidden keys omitted entirely. For `load_reps` this is exactly
        // {weightKg, reps, rir}, byte for byte.
        ...measuredFieldsForProfile(profile, set),
        ...(isGrouped ? { groupKey: set.groupKey ?? null } : {}),
      }),
    });
  }

  return { deleted: plan.deleted, remaining: plan.remaining, ops };
}
