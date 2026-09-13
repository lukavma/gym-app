import { newId } from "@/domain/ids/uuidv7";
import { buildSetDeletionOps, type SetLogRowFields } from "@/domain/sync/setDeletionOps";
import { buildSetLogCorrectionPayload } from "@/domain/sync/payloadBuilders";
import type { MeasurementProfile } from "@/domain/measurement/profile";
import { enqueueOp, enqueueOps } from "./outbox";
import { flushOutbox } from "./flush";

// Release 2 (athletic-measurement-profiles-architecture-evaluation.md
// §21.2, §12.3) — widened to number|null (weightKg/reps) and to accept
// distanceM/durationS, mirroring `setLogUpsertPayloadSchema`'s own partial-
// correction shape. `correctHistorySet` stays the one PARTIAL emitter (never
// profile-scoped like the full-row builders) — a caller sends only the
// field(s) it actually changed; an explicit `null` clears a nullable field
// (and is rejected server-side, `invalid_measurement`, if the parent slot's
// frozen profile requires it — NC-7).
export type HistorySetCorrectionPatch = Partial<{
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  isWarmup: boolean;
  notes: string | null;
  // set-groups-architecture-evaluation.md §4.4/§11.3 — reassigns which group
  // this set belongs to; `null` clears the attribution (an "unattributed"
  // work set, §4.4 rule 3). Validated against the parent slot's frozen
  // snapshot server-side, same rule as every other setLog write.
  groupKey: string | null;
}>;

// Post-completion set corrections (domain-model.md §7 — SetLog values
// remain user-editable "at any time, including after completion") go
// through the same outbox write path as in-progress logging, never a
// direct REST PATCH — pwa-offline-strategy.md's "one execution-fact write
// path" holds online or offline. These don't touch the activeSession
// aggregate (the session is already completed and long gone from
// IndexedDB) — just enqueue directly.
//
// O-13 (§12.3) — the payload is now built through `buildSetLogCorrectionPayload`
// (schema-parsed against `setLogUpsertPayloadSchema`), closing the "never
// schema-parsed client-side" gap this function previously had (a bare object
// literal, no `.parse()` at all).
export async function correctHistorySet(
  setId: string,
  sessionExerciseId: string,
  patch: HistorySetCorrectionPatch,
): Promise<void> {
  await enqueueOp({
    opId: newId(),
    entity: "setLog",
    operation: "upsert",
    payload: buildSetLogCorrectionPayload({ id: setId, sessionExerciseId, ...patch }),
  });
  void flushOutbox();
}

// Finding D — the post-completion half of contiguous renumbering: the same
// ops, in the same order, as the in-session path, enqueued in one IndexedDB
// transaction so the queue can never hold the deletion without the
// renumbering that keeps set numbers 1..n. `sets` must be the exercise's sets
// as they were BEFORE the deletion; the caller applies `remaining` locally
// (src/ui/history/HistoryDetail.tsx renumbers optimistically the same way).
//
// O-13 (§12.3) — `profile` is the parent slot's frozen `measurement.profile`
// (HistoryExerciseDetail.measurement, src/ui/history/types.ts), so the
// renumber upserts this produces carry exactly that profile's permitted
// keys, same as the in-session path.
export async function deleteHistorySet(
  sessionExerciseId: string,
  setId: string,
  sets: readonly SetLogRowFields[],
  profile: MeasurementProfile,
  // set-groups-architecture-evaluation.md §5.4/rev. 3 V-1 — same
  // profile-scoped emission rule as the in-session path: the renumber
  // upserts carry `groupKey` only when the slot is grouped.
  isGrouped = false,
): Promise<void> {
  const { deleted, ops } = buildSetDeletionOps({
    sessionExerciseId,
    setId,
    sets,
    profile,
    isGrouped,
  });
  if (!deleted) return;

  await enqueueOps(ops);
  void flushOutbox();
}
