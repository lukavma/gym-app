import { getIdb, ACTIVE_SESSION_KEY, commitSessionMutation, type OutboxOpInput } from "./db";
import { flushOutbox } from "./flush";
import { getCachedBundle } from "./bundleCache";
import { newId } from "@/domain/ids/uuidv7";
import {
  buildWorkoutSessionUpsertPayload,
  buildSessionExerciseUpsertPayload,
  buildSetLogUpsertPayload,
  buildRecommendationUpsertPayload,
  buildRecommendationDecisionUpsertPayload,
} from "@/domain/sync/payloadBuilders";
import {
  wrapPrescriptionSnapshot,
  STRATEGY_VERSIONS,
  type PrescriptionSnapshot,
  type PrescriptionSnapshotData,
} from "@/domain/schemas/prescriptionSnapshot";
import { buildSetDeletionOps } from "@/domain/sync/setDeletionOps";
import { resolveImplicitDecision } from "@/domain/progression/implicitDecision";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";
import {
  applyInSessionDecisionToPrefill,
  applyInSessionDecisionsToGroupPrefills,
} from "@/domain/progression/evaluationTarget";
import {
  evaluateSession,
  type SessionExerciseEvaluationInput,
} from "@/domain/progression/evaluateSession";
import { hasEvaluableStrategy } from "@/domain/progression/groupEvaluation";
import type {
  PerformedExercise,
  PerformedSet,
  RecommendationTarget,
} from "@/domain/progression/engine";
import {
  DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE,
  DEFAULT_MEASUREMENT_PROFILE,
  measuredFieldsForProfile,
  type LoadBasis,
  type MeasurementProfile,
} from "@/domain/measurement/profile";
import {
  freezeWarmupState,
  selectWarmupRoutine as selectWarmupRoutineState,
  setWarmupDismissed as setWarmupDismissedState,
  toggleWarmupItem as toggleWarmupItemState,
} from "@/domain/warmup/session";
import type {
  ActiveSessionDto,
  ActiveSessionExerciseDto,
  ActiveSessionSetDto,
  RecommendationDto,
  TodayBundleExerciseEntryDto,
  TodayWarmupRoutineDto,
} from "./types";

// Every mutator here follows the same shape: mutate the in-memory
// activeSession aggregate, then commit the resulting aggregate AND every
// outbox op it implies in a single IndexedDB transaction via
// commitSessionMutation (HIGH-1 — no separate persist-then-enqueue pair, so
// a process death between the two writes can never happen). Each outbox
// payload is the full row from the post-mutation aggregate, built through
// the schema-typed builders in domain/sync/payloadBuilders.ts (MEDIUM-1 —
// full-row upserts, not partial diffs; BLOCKER-1 — parent FKs can't be
// omitted, it's a compile error to try). Sync itself (the flushOutbox() kick
// at the end) is fire-and-forget bookkeeping, online or not.
//
// Phase 8 — that same shape is a read-modify-write of the ENTIRE aggregate
// (requireLocalSession() re-reads from IndexedDB every call; nothing caches
// it in memory), which is only safe if calls are strictly sequential. The UI
// invokes every mutator fire-and-forget (`void editSet(...)`) with no
// per-row disabling while the async call is in flight, so two realistic,
// rapid interactions — edit one set, then immediately delete another —
// could interleave: the second call's read races ahead of the first call's
// write, and its own write silently reverts what the first call had just
// committed. `serialize()` below queues every mutator's body so each one's
// read is guaranteed to see the fully-committed result of whichever call
// was invoked immediately before it, no matter how close together the UI
// fires them. Found via offline-set-edit-delete.spec.ts intermittently
// losing an edit when run back-to-back with other specs.
let mutationQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(fn, fn);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// Release 2 (athletic-measurement-profiles-architecture-evaluation.md
// §21.2) — "sanitise on read", the same precedent bundleCache.ts's
// withoutActiveSession already established for its own store: a
// pre-upgrade ActiveSessionExerciseDto has no `measurement` key at all, and
// a pre-upgrade ActiveSessionSetDto has no `distanceM`/`durationS` keys.
// Both default to exactly what every pre-Release-2 row already meant
// (`load_reps` / `unspecified` / no distance / no duration) — never
// touching the existing weightKg/reps/rir/etc values — so a device that
// straddles the deploy with an in-progress session keeps working with no
// IndexedDB migration and no DB_VERSION bump (object stores are
// schemaless). Applied on every read (getLocalActiveSession) AND before
// every write that did not just come from a read (hydrateFromServer),
// mirroring withoutActiveSession's "read as well as write" note.
function normalizeActiveSessionSet(set: ActiveSessionSetDto): ActiveSessionSetDto {
  return {
    ...set,
    distanceM: set.distanceM ?? null,
    durationS: set.durationS ?? null,
    // set-groups-architecture-evaluation.md §8 IndexedDB row — same
    // "sanitise on read" precedent as distanceM/durationS above.
    groupKey: set.groupKey ?? null,
  };
}

function normalizeActiveSessionExercise(
  exercise: ActiveSessionExerciseDto,
): ActiveSessionExerciseDto {
  return {
    ...exercise,
    measurement: exercise.measurement ?? {
      profile: DEFAULT_MEASUREMENT_PROFILE,
      loadBasis: DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE,
    },
    // set-groups-architecture-evaluation.md §4.5's unknown-key defence,
    // applied on read: a stale cached aggregate's per-group recommendation
    // whose key no longer exists in the (possibly since-edited) template is
    // harmless to keep around locally — the card only ever looks one up by
    // the keys the CURRENT snapshot's scheme actually has — but normalising
    // an absent array to `[]` keeps every reader from re-deriving `?? []`.
    recommendations: exercise.recommendations ?? [],
    sets: exercise.sets.map(normalizeActiveSessionSet),
  };
}

export function normalizeActiveSession(session: ActiveSessionDto): ActiveSessionDto {
  return {
    ...session,
    exercises: session.exercises.map(normalizeActiveSessionExercise),
  };
}

export async function getLocalActiveSession(): Promise<ActiveSessionDto | null> {
  const db = await getIdb();
  const session = await db.get("activeSession", ACTIVE_SESSION_KEY);
  return session ? normalizeActiveSession(session) : null;
}

export async function clearLocalSession(): Promise<void> {
  const db = await getIdb();
  await db.delete("activeSession", ACTIVE_SESSION_KEY);
}

// Cold-client resume and cross-device "resume (view cached)": adopt a
// server-hydrated session verbatim as this device's local state.
//
// Finding C — the last line of defence, and the reason it throws rather than
// returning a flag: everything downstream of this write treats the local
// activeSession as an in-progress workout it may append sets to. A completed
// or discarded session written here becomes a local session whose every
// subsequent op the server rejects as `session_locked`, which is what the
// device actually did. Callers must revalidate against
// src/sync/remoteActiveSession.ts first; this refuses anything else outright.
export function hydrateFromServer(remote: ActiveSessionDto): Promise<void> {
  return serialize(async () => {
    if (remote.status !== "in_progress") {
      throw new Error(`Refusing to hydrate a session with status "${remote.status}"`);
    }
    const db = await getIdb();
    // Normalized before the write, not only relied on at the next read.
    // H-1 remediation — the server's own ActiveSessionExerciseDto
    // (src/server/today/service.ts) now always populates `measurement` for
    // a live response, so this normalization is no longer masking a live
    // server gap; it remains solely so a genuinely old, pre-upgrade
    // `remote` value (or a stale cached copy) still adopts without error.
    await db.put("activeSession", normalizeActiveSession(remote), ACTIVE_SESSION_KEY);
  });
}

async function requireLocalSession(): Promise<ActiveSessionDto> {
  const session = await getLocalActiveSession();
  if (!session) throw new Error("No active session");
  return session;
}

function findExercise(
  session: ActiveSessionDto,
  sessionExerciseId: string,
): ActiveSessionExerciseDto {
  const exercise = session.exercises.find((e) => e.id === sessionExerciseId);
  if (!exercise) throw new Error("Session exercise not found");
  return exercise;
}

function nextSetNumber(exercise: ActiveSessionExerciseDto): number {
  return exercise.sets.reduce((max, s) => Math.max(max, s.setNumber), 0) + 1;
}

// implementation-plan.md Phase 5 — `entry` already carries the effective
// prescription exactly as the server resolved it (scheme/targetRir/prefill
// modified, appliedModifiers set); this freezes it verbatim, online or from
// the cached bundle offline. No second modifier computation exists here.
function buildSnapshotFromBundleEntry(entry: TodayBundleExerciseEntryDto): PrescriptionSnapshot {
  return wrapPrescriptionSnapshot({
    exerciseId: entry.exerciseId,
    exerciseName: entry.exerciseName,
    scheme: entry.scheme,
    targetRir: entry.targetRir,
    restSeconds: entry.restSeconds,
    progression: {
      strategyId: entry.progression.strategyId,
      strategyVersion: STRATEGY_VERSIONS[entry.progression.strategyId],
      config: entry.progression.config,
      classification: entry.progression.classification,
      // set-groups-architecture-evaluation.md §5.3 — mirrors the per-group
      // resolved progression verbatim; absent on an ungrouped bundle entry
      // (and on any bundle cached before this release).
      ...(entry.progression.groups
        ? {
            groups: Object.fromEntries(
              Object.entries(entry.progression.groups).map(([key, rp]) => [
                key,
                {
                  strategyId: rp.strategyId,
                  strategyVersion: STRATEGY_VERSIONS[rp.strategyId],
                  config: rp.config,
                  classification: rp.classification,
                },
              ]),
            ),
          }
        : {}),
    },
    appliedModifiers: entry.appliedModifiers,
    prefill: entry.prefill,
    ...(entry.groupPrefills ? { groupPrefills: entry.groupPrefills } : {}),
    // workout-prescription-context-architecture-evaluation.md §7 C-2/C-3 —
    // the single freeze site for the program note. `?? null` is load-bearing:
    // a bundle served from the SW cache or `bundleCache` after deploy has no
    // `prescriptionNotes` key at all (R-1 tolerance), and a freshly frozen
    // snapshot must always CARRY the key, `null` when unknown or empty,
    // rather than reproducing the source's absence. Old snapshots keep their
    // absent key untouched; nothing ever reconstructs a missing note from
    // the current program definition (C-1).
    prescriptionNotes: entry.prescriptionNotes ?? null,
  });
}

// Full-row helpers — every field the corresponding schema accepts, read
// from the in-memory aggregate. Centralized so every mutator that upserts a
// workoutSession/sessionExercise/setLog row sends the same complete shape.
type WorkoutSessionStatus = "in_progress" | "completed" | "discarded";

function workoutSessionFullRowOp(
  session: ActiveSessionDto,
  overrides?: { status?: WorkoutSessionStatus; completedAt?: string },
) {
  return {
    opId: newId(),
    entity: "workoutSession" as const,
    operation: "upsert" as const,
    payload: buildWorkoutSessionUpsertPayload({
      id: session.id,
      blockId: session.blockId,
      templateId: session.templateId,
      templateName: session.templateName,
      weekIndex: session.weekIndex,
      isDeload: session.isDeload,
      status: overrides?.status ?? session.status,
      startedAt: session.startedAt,
      completedAt: overrides?.completedAt,
      clientId: session.clientId,
      notes: session.notes,
    }),
  };
}

// W-1 subsumption (§12.3) — `measurementProfile`/`loadBasis` are a FIXED
// key set, always both emitted, regardless of the slot's profile. This is
// the one full-row builder O-13's "profile-scoped" rule does NOT apply to:
// varying this key set is exactly the hazard H-7/MEDIUM-1 already closed for
// this builder, so it must stay fixed even though the payload's `loadBasis`
// carries no authority server-side (§10.1, I-14).
function sessionExerciseFullRowOp(sessionId: string, exercise: ActiveSessionExerciseDto) {
  return {
    opId: newId(),
    entity: "sessionExercise" as const,
    operation: "upsert" as const,
    payload: buildSessionExerciseUpsertPayload({
      id: exercise.id,
      sessionId,
      exerciseId: exercise.exerciseId,
      position: exercise.position,
      source: exercise.source,
      prescription: exercise.prescription,
      measurementProfile: exercise.measurement.profile,
      loadBasis: exercise.measurement.loadBasis,
      skipped: exercise.skipped,
      notes: exercise.notes,
    }),
  };
}

interface DecisionFields {
  status: "accepted" | "modified" | "rejected";
  chosen: RecommendationTarget | null;
  decidedAt: string;
  source: "explicit" | "implicit_first_set";
}

function recommendationDecisionOp(recommendationId: string, decision: DecisionFields) {
  return {
    opId: newId(),
    entity: "recommendationDecision" as const,
    operation: "upsert" as const,
    payload: buildRecommendationDecisionUpsertPayload({
      recommendationId,
      status: decision.status,
      chosen: decision.chosen,
      decidedAt: decision.decidedAt,
      source: decision.source,
    }),
  };
}

// O-13 (§12.3) — profile-scoped full row: the profile-independent keys
// (id, sessionExerciseId, setNumber, isWarmup, loggedAt, notes) plus every
// key the frozen `profile` permits (required and optional, `null` for an
// absent optional), forbidden keys omitted entirely. `measuredFieldsForProfile`
// is the single source of the permitted set (`dimensionsOf`, shared with the
// renumber upserts in `@/domain/sync/setDeletionOps`, so the two full-row
// setLog emitters can never disagree). For `load_reps` this reduces to
// exactly today's nine keys, byte for byte (NC-1). Exported for direct unit
// testing — see tests/unit/sync/setLogEmission.test.ts.
// set-groups-architecture-evaluation.md §5.4/rev. 3 V-1 — `groupKey` is
// emitted ONLY for a grouped slot, exactly like O-13's profile-scoped
// pattern for the measured fields: an ungrouped slot's op omits the key
// entirely (never `null`), keeping it byte-identical to before Stage A
// (A-10/NC-9). `isGrouped` is the caller's own knowledge of the slot's
// FROZEN scheme shape, not derived from `set.groupKey` (which would
// conflate "ungrouped" with "grouped but unattributed", §4.4 rule 3 — both
// are `null` on the set itself).
export function setLogFullRowOp(
  sessionExerciseId: string,
  set: ActiveSessionSetDto,
  profile: MeasurementProfile,
  isGrouped: boolean,
) {
  return {
    opId: newId(),
    entity: "setLog" as const,
    operation: "upsert" as const,
    payload: buildSetLogUpsertPayload({
      id: set.id,
      sessionExerciseId,
      setNumber: set.setNumber,
      isWarmup: set.isWarmup,
      loggedAt: set.loggedAt,
      notes: set.notes,
      ...measuredFieldsForProfile(profile, set),
      ...(isGrouped ? { groupKey: set.groupKey ?? null } : {}),
    }),
  };
}

function isGroupedExercise(exercise: ActiveSessionExerciseDto): boolean {
  return exercise.prescription?.snapshot.scheme.type === "groups";
}

export interface StartSessionInput {
  blockId: string | null;
  templateId: string | null;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  exercises: TodayBundleExerciseEntryDto[];
  // Warm-up Routines v1 — both optional, because a pre-upgrade cached bundle
  // (SW cache or IndexedDB `bundleCache`) simply has no such fields (R-1).
  // Omitted/empty means `session.warmup` stays null and no card renders; no
  // caller has to special-case it.
  warmupRoutines?: TodayWarmupRoutineDto[];
  defaultWarmupRoutineId?: string | null;
}

// Snapshot-on-use, exactly once: every scheduled exercise's
// PrescriptionSnapshot is frozen right here, at session creation — never
// lazily per-exercise as the workout progresses (ADR-007).
export function startSession(input: StartSessionInput): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const sessionId = newId();
    const startedAt = new Date().toISOString();

    const exercises: ActiveSessionExerciseDto[] = input.exercises.map((entry, index) => ({
      id: newId(),
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      position: index,
      source: "template" as const,
      prescription: buildSnapshotFromBundleEntry(entry),
      skipped: false,
      notes: null,
      loadStepKg: entry.loadStepKg,
      // The pending recommendation rides into the session verbatim — it is
      // decided here (explicitly, or implicitly via the first work set), never
      // re-frozen into the snapshot (progression-engine.md §7).
      //
      // H-1 remediation — buildTodayBundle already omits pendingRecommendation
      // for a deload week, but a bundle served from the offline cache
      // (bundleCache.ts) can be a stale pre-fix copy that still carries one;
      // recommendationForDeload is the defensive backstop that keeps a deload
      // session decision-free regardless of what the bundle entry claims.
      recommendation: recommendationForDeload(input.isDeload, entry.pendingRecommendation),
      // set-groups-architecture-evaluation.md §5.3 — every group's pending
      // recommendation rides into the session verbatim, same rule as the
      // ungrouped `recommendation` above; empty on an ungrouped bundle
      // entry or one cached before this release.
      recommendations: input.isDeload ? [] : (entry.pendingRecommendations ?? []),
      // Frozen exactly once, here — never re-derived live from the current
      // exercise row afterward (ADR-007's snapshot-on-use discipline,
      // applied to this field the same way as `prescription`). `entry`'s
      // own `measurement` is optional (a pre-upgrade cached bundle has no
      // such key, R-1-style tolerance — see TodayBundleExerciseEntryDto);
      // the default matches what every pre-Release-2 exercise already was.
      measurement: entry.measurement ?? {
        profile: DEFAULT_MEASUREMENT_PROFILE,
        loadBasis: DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE,
      },
      sets: [],
    }));

    const session: ActiveSessionDto = {
      id: sessionId,
      blockId: input.blockId,
      templateId: input.templateId,
      templateName: input.templateName,
      weekIndex: input.weekIndex,
      isDeload: input.isDeload,
      status: "in_progress",
      startedAt,
      clientId: null,
      notes: null,
      exercises,
      // Frozen exactly once, here (evaluation §6.3). Nothing later in the
      // session re-reads the bundle for warm-up data, so a bundle refresh
      // or a routine edit mid-workout cannot change the checklist under the
      // athlete's thumb.
      warmup: freezeWarmupState({
        routines: input.warmupRoutines ?? [],
        defaultRoutineId: input.defaultWarmupRoutineId ?? null,
      }),
    };

    // Note what is NOT here: no warm-up op. `warmup` rides inside the local
    // aggregate only, and the three payload builders below enumerate their
    // fields explicitly, so it is a compile-level impossibility for it to
    // reach the wire (I-2, W-1 — the sync contract is untouched by this
    // feature).
    const ops: OutboxOpInput[] = [
      workoutSessionFullRowOp(session),
      ...exercises.map((ex) => sessionExerciseFullRowOp(sessionId, ex)),
    ];

    await commitSessionMutation({ session, ops });
    void flushOutbox();
    return session;
  });
}

// Warm-up Routines v1 — the three execution mutators.
//
// They are the ONLY mutators in this file that commit with `ops: []`. That
// is the whole design: the write is a durable local aggregate commit through
// the same `commitSessionMutation` transaction as everything else (so it
// survives reload, iOS process kill and same-device resume exactly like a
// logged set), while producing nothing for the outbox to carry and nothing
// for the server to store (I-1/I-5).
//
// They also deliberately do NOT call `flushOutbox()`. Every other mutator
// kicks a flush because it just enqueued something; these enqueue nothing,
// so a flush would be a pointless network attempt whose only observable
// effect would be to make "did a warm-up interaction touch the wire?" harder
// to answer honestly. It is now answerable by inspection: no ops, no flush.
//
// A session without `warmup` (pre-upgrade aggregate, or a cross-device
// adopt) is returned unchanged rather than throwing — the card that would
// have called these isn't rendered in that case, so this is a backstop, not
// a path the UI takes.
function commitWarmupMutation(
  mutate: (
    state: NonNullable<ActiveSessionDto["warmup"]>,
  ) => NonNullable<ActiveSessionDto["warmup"]>,
): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    if (!session.warmup) return session;
    session.warmup = mutate(session.warmup);
    await commitSessionMutation({ session, ops: [] });
    return session;
  });
}

export function selectWarmupRoutine(routineId: string | null): Promise<ActiveSessionDto> {
  return commitWarmupMutation((state) => selectWarmupRoutineState(state, routineId));
}

export function toggleWarmupItem(index: number): Promise<ActiveSessionDto> {
  return commitWarmupMutation((state) => toggleWarmupItemState(state, index));
}

export function setWarmupDismissed(dismissed: boolean): Promise<ActiveSessionDto> {
  return commitWarmupMutation((state) => setWarmupDismissedState(state, dismissed));
}

export function addAdhocExercise(
  exerciseId: string,
  exerciseName: string,
  // H-2 remediation (athletic-measurement-profiles-release-2-review.md) —
  // the caller (activeSessionStore.ts, in turn AddAdhocExercise.tsx) now has
  // the exercise's real measurement profile/load basis in hand (it just
  // searched a full ExerciseDto) and threads it through here. The
  // load_reps/unspecified default below is a defensive fallback for a
  // caller that genuinely has nothing — never the normal path — not the
  // unconditional freeze this used to be, which made ad-hoc-adding any of
  // the five non-load_reps profiles unusable (the server rejected the
  // mismatched slot as measurement_profile_mismatch).
  measurement?: { profile: MeasurementProfile; loadBasis: LoadBasis | null },
): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const id = newId();
    const position = session.exercises.length;
    const exercise: ActiveSessionExerciseDto = {
      id,
      exerciseId,
      exerciseName,
      position,
      source: "adhoc",
      prescription: null,
      skipped: false,
      notes: null,
      loadStepKg: null,
      recommendation: null,
      measurement: measurement ?? {
        profile: DEFAULT_MEASUREMENT_PROFILE,
        loadBasis: DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE,
      },
      sets: [],
    };
    session.exercises.push(exercise);

    await commitSessionMutation({
      session,
      ops: [sessionExerciseFullRowOp(session.id, exercise)],
    });
    void flushOutbox();
    return session;
  });
}

export function setExerciseSkipped(
  sessionExerciseId: string,
  skipped: boolean,
): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const exercise = findExercise(session, sessionExerciseId);
    exercise.skipped = skipped;

    await commitSessionMutation({
      session,
      ops: [sessionExerciseFullRowOp(session.id, exercise)],
    });
    void flushOutbox();
    return session;
  });
}

export function setExerciseNotes(
  sessionExerciseId: string,
  notes: string | null,
): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const exercise = findExercise(session, sessionExerciseId);
    exercise.notes = notes;

    await commitSessionMutation({
      session,
      ops: [sessionExerciseFullRowOp(session.id, exercise)],
    });
    void flushOutbox();
    return session;
  });
}

// athletic-measurement-profiles-architecture-evaluation.md §15.3 — widened
// from the pre-Release-2 shape (`weightKg`/`reps` required non-null) to
// `number | null` so a non-`load_reps` card (ExerciseCard.tsx) can log a set
// missing the dimensions its profile forbids; `distanceM`/`durationS` are
// new, optional (default null, matching every pre-Release-2 caller that
// predates them). Every existing call site that supplies only
// weightKg/reps/rir keeps compiling and keeps producing the identical
// `load_reps` set it always did (NC-1/NC-13's byte-identical requirement) —
// this is a pure widening, not a behaviour change for `load_reps`.
export interface LogSetInput {
  sessionExerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM?: number | null;
  durationS?: number | null;
  isWarmup?: boolean;
  notes?: string | null;
  // set-groups-architecture-evaluation.md §4.4/§11.4 — the group selected on
  // the card at the moment of Log. The card always supplies one for a
  // grouped slot; ignored (forced to `null`) for a warm-up set (rule 1) and
  // for an ungrouped slot.
  groupKey?: string | null;
}

export function logSet(input: LogSetInput): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const exercise = findExercise(session, input.sessionExerciseId);
    const grouped = isGroupedExercise(exercise);
    const isWarmupValue = input.isWarmup ?? false;
    const setId = newId();
    const loggedAt = new Date().toISOString();
    const set: ActiveSessionSetDto = {
      id: setId,
      setNumber: nextSetNumber(exercise),
      isWarmup: isWarmupValue,
      weightKg: input.weightKg,
      reps: input.reps,
      rir: input.rir,
      // §15.3 — whatever the card collected for the frozen profile's
      // distance/duration dimensions; null (never omitted) when the caller
      // didn't supply one, matching every field above. `setLogFullRowOp`
      // below still emits only the frozen profile's permitted keys
      // (`measuredFieldsForProfile`, O-13) regardless of what this object
      // carries, so a `load_reps` set's wire shape is unaffected either way.
      distanceM: input.distanceM ?? null,
      durationS: input.durationS ?? null,
      loggedAt,
      notes: input.notes ?? null,
      groupKey: grouped && !isWarmupValue ? (input.groupKey ?? null) : null,
    };
    exercise.sets.push(set);

    const ops: OutboxOpInput[] = [
      setLogFullRowOp(exercise.id, set, exercise.measurement.profile, grouped),
    ];

    // progression-engine.md §7 — the implicit decision: the FIRST work set
    // resolves a still-pending recommendation. Committed in the same IndexedDB
    // transaction as the set itself, so the queue can never hold the set
    // without the decision it implied.
    //
    // H-1 remediation — gated through recommendationForDeload so a deload
    // session can never enqueue an implicit decision, even a resumed session
    // hydrated before this fix that still carries `exercise.recommendation`.
    //
    // `input.weightKg !== null` — a type-safety backstop, not a live branch:
    // a recommendation is only ever populated server-side for a `load_reps`
    // slot (evaluateSession.ts's own profile gate, NC-9), whose card always
    // supplies a real weight, so this narrows `input.weightKg` from §15.3's
    // widened `number | null` back to the `number` `resolveImplicitDecision`
    // (unmodified, load_reps-only) still requires, without touching that
    // function's own signature.
    if (grouped) {
      // set-groups-architecture-evaluation.md §5.3 A-9 — "first `g7k2` work
      // set decides only `g7k2`'s record": per-key implicit decision, never
      // touching a sibling group's pending record.
      if (!set.isWarmup && input.weightKg !== null && set.groupKey) {
        const recs = exercise.recommendations ?? [];
        const idx = recs.findIndex((r) => r.groupKey === set.groupKey);
        const rec = idx >= 0 ? recommendationForDeload(session.isDeload, recs[idx]!) : null;
        if (rec && rec.decision.status === "pending") {
          const isFirstWorkSetOfGroup =
            exercise.sets.filter((s) => !s.isWarmup && s.groupKey === set.groupKey).length === 1;
          if (isFirstWorkSetOfGroup) {
            const implicit = resolveImplicitDecision(
              { action: rec.action, target: rec.target },
              { weightKg: input.weightKg },
              exercise.loadStepKg ?? 0,
            );
            if (implicit) {
              const decision: DecisionFields = {
                status: implicit.status,
                chosen: implicit.chosen,
                decidedAt: loggedAt,
                source: implicit.source,
              };
              const next = [...recs];
              next[idx] = { ...rec, decision: { ...decision } };
              exercise.recommendations = next;
              ops.push(recommendationDecisionOp(rec.id, decision));
            }
          }
        }
      }
    } else {
      const rec = recommendationForDeload(session.isDeload, exercise.recommendation);
      if (!set.isWarmup && input.weightKg !== null && rec && rec.decision.status === "pending") {
        const isFirstWorkSet = exercise.sets.filter((s) => !s.isWarmup).length === 1;
        if (isFirstWorkSet) {
          const implicit = resolveImplicitDecision(
            { action: rec.action, target: rec.target },
            { weightKg: input.weightKg },
            // Engine targets are already rounded to loadStepKg; 0 degrades the
            // comparison to exact-value equality, which is then still correct.
            exercise.loadStepKg ?? 0,
          );
          if (implicit) {
            const decision: DecisionFields = {
              status: implicit.status,
              chosen: implicit.chosen,
              decidedAt: loggedAt,
              source: implicit.source,
            };
            exercise.recommendation = {
              ...rec,
              decision: { ...decision },
            };
            ops.push(recommendationDecisionOp(rec.id, decision));
          }
        }
      }
    }

    await commitSessionMutation({ session, ops });
    void flushOutbox();
    return session;
  });
}

export type ExplicitDecisionInput =
  | { status: "accepted" }
  | { status: "modified"; chosen: RecommendationTarget }
  | { status: "rejected" };

// progression-engine.md §7 — explicit Accept / Keep previous (reject) /
// Custom (modify) from the recommendation card. One-time: only a pending
// recommendation can be decided; the local state flips immediately and the
// decision op rides the same outbox path as every other execution fact.
//
// set-groups-architecture-evaluation.md §5.3 — `groupKey` selects WHICH
// group's card is being decided on a grouped slot; defaults to `null`
// (the ungrouped case), so every existing call site keeps working
// unchanged.
export function decideRecommendation(
  sessionExerciseId: string,
  input: ExplicitDecisionInput,
  groupKey: string | null = null,
): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const exercise = findExercise(session, sessionExerciseId);
    // H-1 remediation — a deload session has nothing to decide, even if a
    // stale pre-fix local session still carries a recommendation (the
    // RecommendationCard is never rendered for one either — see
    // ExerciseCard.tsx — so this is a defensive backstop, not the primary gate).
    let rec: RecommendationDto | null;
    let groupIndex = -1;
    let groupRecs: RecommendationDto[] = [];
    if (groupKey !== null) {
      groupRecs = exercise.recommendations ?? [];
      groupIndex = groupRecs.findIndex((r) => r.groupKey === groupKey);
      rec =
        groupIndex >= 0 ? recommendationForDeload(session.isDeload, groupRecs[groupIndex]!) : null;
    } else {
      rec = recommendationForDeload(session.isDeload, exercise.recommendation);
    }
    if (!rec || rec.decision.status !== "pending") {
      throw new Error("No pending recommendation to decide");
    }
    const chosen: RecommendationTarget | null =
      input.status === "accepted"
        ? (rec.target ?? null)
        : input.status === "modified"
          ? input.chosen
          : null;
    if (input.status === "accepted" && chosen === null) {
      throw new Error("Recommendation has no target to accept");
    }
    const decision: DecisionFields = {
      status: input.status,
      chosen,
      decidedAt: new Date().toISOString(),
      source: "explicit",
    };
    const decided: RecommendationDto = { ...rec, decision: { ...decision } };
    if (groupIndex >= 0) {
      const next = [...groupRecs];
      next[groupIndex] = decided;
      exercise.recommendations = next;
    } else {
      exercise.recommendation = decided;
    }

    await commitSessionMutation({
      session,
      ops: [recommendationDecisionOp(rec.id, decision)],
    });
    void flushOutbox();
    return session;
  });
}

// §15.3 — widened to the two new dimensions so a non-`load_reps` card's
// edit form can patch them too; `Partial` already made every existing key
// optional, so this is additive for every pre-Release-2 caller.
// set-groups-architecture-evaluation.md §4.4/§11.3 — `groupKey` additionally
// widened here so the set row's edit form and the History correction chip
// can change a set's group attribution (an evaluation-relevant edit).
export type EditSetPatch = Partial<
  Pick<
    ActiveSessionSetDto,
    "weightKg" | "reps" | "rir" | "distanceM" | "durationS" | "isWarmup" | "notes" | "groupKey"
  >
>;

// Allowed for both in-progress and already-completed sessions server-side
// (domain-model.md §7 — SetLog values are user-editable at any time,
// including after completion); the client doesn't need to distinguish
// that here since it only ever mutates its OWN locally-held activeSession,
// which by definition is still in_progress. Post-completion corrections go
// through the history UI instead (src/server/history + a dedicated route).
export function editSet(
  sessionExerciseId: string,
  setId: string,
  patch: EditSetPatch,
): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const exercise = findExercise(session, sessionExerciseId);
    const set = exercise.sets.find((s) => s.id === setId);
    if (!set) throw new Error("Set not found");
    Object.assign(set, patch);

    await commitSessionMutation({
      session,
      ops: [
        setLogFullRowOp(
          exercise.id,
          set,
          exercise.measurement.profile,
          isGroupedExercise(exercise),
        ),
      ],
    });
    void flushOutbox();
    return session;
  });
}

// Finding D — deleting a set renumbers the survivors to a contiguous 1..n.
// The local aggregate, the renumbering, the delete op and every renumber op
// are committed in the one IndexedDB transaction commitSessionMutation
// already provides (HIGH-1), so the device can never end up having deleted a
// set without having queued the renumbering that goes with it. Op order
// inside the batch is significant — see planSetDeletion.
export function deleteSet(sessionExerciseId: string, setId: string): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const exercise = findExercise(session, sessionExerciseId);
    const { deleted, remaining, ops } = buildSetDeletionOps({
      sessionExerciseId: exercise.id,
      setId,
      sets: exercise.sets,
      profile: exercise.measurement.profile,
      isGrouped: isGroupedExercise(exercise),
    });
    // Already gone — emitting a delete op would be harmless, but a renumbering
    // pass over rows we have no reason to touch would not be.
    if (!deleted) return session;
    exercise.sets = remaining;

    await commitSessionMutation({ session, ops });
    void flushOutbox();
    return session;
  });
}

export function setSessionNotes(notes: string | null): Promise<ActiveSessionDto> {
  return serialize(async () => {
    const session = await requireLocalSession();
    session.notes = notes;

    await commitSessionMutation({
      session,
      ops: [workoutSessionFullRowOp(session)],
    });
    void flushOutbox();
    return session;
  });
}

// pwa-offline-strategy.md §2/§10 — "(if completing offline) client-computed
// recs queue in outbox": the identical pure domain code evaluates against
// the cached bundle context and the results sync up as `computedBy:
// 'client'` records. The recommendation ops are enqueued AHEAD of the
// completion op, so FIFO delivers them first and the server's own
// completion-time evaluation skips those exercises instead of duplicating
// them (progression-engine.md §5 — determinism makes the paths equivalent).
// When online, no client evaluation happens — the server evaluates as the
// completion op lands; if the onLine heuristic is ever wrong, §5's
// missing-evaluation fallback (carry-forward prefill, nothing fabricated)
// covers the next workout.
// Release 2 (athletic-measurement-profiles-architecture-evaluation.md
// §21.2, NC-9) — ActiveSessionSetDto/HistorySetSummaryDto now carry a
// nullable weightKg/reps for the new profiles (§6.2), but the shared,
// UNMODIFIED domain/progression PerformedSet stays required-non-null
// (I-13/H-12's "a null is never coerced to 0" rule forbids `?? 0` here).
// §15.3's card can now create a genuinely null-valued set (any profile but
// `load_reps` forbids weight and/or reps), so this filter is no longer only
// a type-safety backstop — it is the real exclusion that keeps a
// distance/duration set out of the load-only progression engine, mirroring
// the same profile gate `evaluateSession` already applies server-side
// (evaluateSession.ts's `profile !== DEFAULT_MEASUREMENT_PROFILE` skip)
// rather than fabricating a value. `buildClientRecommendationOps` below
// additionally skips every such exercise before it ever reaches this
// filter, because a non-`load_reps` prescription's `progression.strategyId`
// can only be `manual` (§9.2's compatibility gate) — the pre-existing
// `strategyId === "manual"` skip already excludes it.
// set-groups-architecture-evaluation.md §5.4/§4.4 — widened to carry
// `groupKey` through (defaulting to `null` for a caller with no such field,
// which is every pre-Stage-A caller and every ungrouped exercise's own
// sets), matching the uniform-attach-then-`stripGroupKey` discipline
// `groupEvaluation.ts` documents. This was the one place the offline client
// evaluator (`buildClientRecommendationOps` below) silently dropped
// attribution before this fix: both a grouped exercise's OWN work sets and
// its history entries' sets funnel through this single mapper, so
// `evaluateSession`'s per-group partitioning (`workSets.filter(s =>
// s.groupKey === group.key)`) would have matched nothing at all for a
// completion evaluated offline, ungrouped-only fallback aside — never
// exercised until this remediation pass added dedicated offline-grouped
// coverage.
function toPerformedSets(
  sets: readonly {
    isWarmup: boolean;
    weightKg: number | null;
    reps: number | null;
    rir: number | null;
    groupKey?: string | null;
  }[],
): PerformedSet[] {
  const result: PerformedSet[] = [];
  for (const s of sets) {
    if (s.isWarmup || s.weightKg === null || s.reps === null) continue;
    result.push({ weightKg: s.weightKg, reps: s.reps, rir: s.rir, groupKey: s.groupKey ?? null });
  }
  return result;
}

async function buildClientRecommendationOps(session: ActiveSessionDto): Promise<OutboxOpInput[]> {
  const cached = await getCachedBundle();
  const bundleEntries = new Map<string, TodayBundleExerciseEntryDto>();
  if (cached && cached.bundle.today.kind === "scheduled") {
    for (const entry of cached.bundle.today.exercises) {
      bundleEntries.set(entry.exerciseId, entry);
    }
  }

  const inputs: SessionExerciseEvaluationInput[] = [];
  for (const exercise of session.exercises) {
    if (exercise.skipped || !exercise.prescription) continue;
    const snapshot = exercise.prescription.snapshot;
    // M-2 (independent review) — group-aware: a `groups` scheme whose SLOT
    // default is manual but which has a non-manual group override must still
    // reach `evaluateSession`'s own per-group dispatch, which already handles
    // this correctly (progression-engine.md §5.1). A bare
    // `strategyId === "manual"` check here silently dropped the whole
    // exercise before that dispatch ever ran.
    if (!hasEvaluableStrategy(snapshot)) continue;
    const entry = bundleEntries.get(exercise.exerciseId);
    const loadStepKg = exercise.loadStepKg ?? entry?.loadStepKg;
    if (loadStepKg === undefined) continue;

    const history: PerformedExercise[] = (entry?.history ?? []).map((h) => ({
      sessionId: h.sessionId,
      performedAt: h.startedAt,
      isDeload: h.isDeload,
      prescribed: h.prescribed
        ? {
            scheme: h.prescribed.scheme,
            ...(h.prescribed.targetRir ? { targetRir: h.prescribed.targetRir } : {}),
          }
        : null,
      workSets: toPerformedSets(h.sets),
    }));

    // L-1 (independent review) — the per-group sibling of the ungrouped
    // overlay below, mirroring `server/progression/service.ts`'s
    // `overlayInSessionDecisions` branch-for-branch: a `groups` scheme's
    // in-session decisions live in `exercise.recommendations` (plural), never
    // the singular `exercise.recommendation`, so only the group-keyed overlay
    // applies to `groupPrefills`. Without this, an offline completion under
    // rep-progression read `ctx.prescription.prefill.reps` as the still-frozen
    // pre-decision value whenever an accept/modify chose different reps,
    // diverging from what the server would have computed for the same facts.
    const decidedSnapshot: PrescriptionSnapshotData =
      snapshot.scheme.type === "groups"
        ? applyInSessionDecisionsToGroupPrefills(
            snapshot,
            new Map(
              (exercise.recommendations ?? [])
                .filter((r): r is typeof r & { groupKey: string } => r.groupKey !== null)
                .map((r) => [r.groupKey, r.decision]),
            ),
          )
        : applyInSessionDecisionToPrefill(snapshot, exercise.recommendation?.decision ?? null);

    inputs.push({
      sessionExerciseId: exercise.id,
      exerciseId: exercise.exerciseId,
      skipped: exercise.skipped,
      prescription: decidedSnapshot,
      workSets: toPerformedSets(exercise.sets.slice().sort((a, b) => a.setNumber - b.setNumber)),
      history,
      loadStepKg,
    });
  }
  if (inputs.length === 0) return [];

  const results = evaluateSession({
    sessionId: session.id,
    startedAt: session.startedAt,
    isDeload: session.isDeload,
    // Block goal isn't in the cached bundle; v1 strategies never read it, so
    // client and server evaluations stay byte-equivalent without it.
    block: session.blockId
      ? {
          ...(session.weekIndex !== null ? { weekIndex: session.weekIndex } : {}),
          isDeload: session.isDeload,
        }
      : null,
    exercises: inputs,
  });

  const createdAt = new Date().toISOString();
  return results.map((result) => ({
    opId: newId(),
    entity: "recommendation" as const,
    operation: "upsert" as const,
    payload: buildRecommendationUpsertPayload({
      id: newId(),
      exerciseId: result.exerciseId,
      blockId: session.blockId,
      sourceSessionId: session.id,
      sourceSessionExerciseId: result.sessionExerciseId,
      // set-groups-architecture-evaluation.md §5.3/rev. 3 V-1 — this was
      // missing entirely before this remediation pass: a grouped exercise
      // completed OFFLINE produces one `EvaluatedRecommendation` per group
      // (each with its own real `groupKey`), but the op built here dropped
      // it on the floor, so every offline-computed record synced as if it
      // were ungrouped (`groupKey: null`) — two such records for the same
      // (exercise, block) would then collide on `uq_recs_one_pending`
      // (coalesce(group_key,'') is identical for both), dead-lettering one
      // of them as `recommendation_conflict` on reconnect. Omitted entirely
      // for an ungrouped result (`groupKey === null`), matching the
      // recommendationUpsertPayloadSchema's own emission rule and the
      // server's own `evaluateSession`-derived `groupKey` on the online path.
      ...(result.groupKey !== null ? { groupKey: result.groupKey } : {}),
      strategyId: result.strategyId,
      strategyVersion: result.strategyVersion,
      classification: result.classification,
      config: result.config,
      inputs: result.draft.inputs,
      action: result.draft.action,
      target: result.draft.target ?? null,
      reasonCodes: [...result.draft.reasonCodes],
      confidence: result.draft.confidence,
      computedBy: "client",
      createdAt,
    }),
  }));
}

export function completeSession(): Promise<void> {
  return serialize(async () => {
    const session = await requireLocalSession();
    const completedAt = new Date().toISOString();

    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const recommendationOps = offline ? await buildClientRecommendationOps(session) : [];

    await commitSessionMutation({
      session: null,
      ops: [
        ...recommendationOps,
        workoutSessionFullRowOp(session, { status: "completed", completedAt }),
      ],
    });
    void flushOutbox();
  });
}

// Discards a session by id — defaults to the local session (normal
// discard), but accepts an explicit id for takeover, where the session
// being discarded belongs to another device and was never held locally. In
// the local case the full row (from the in-memory aggregate) is sent; in
// the foreign case there is no local copy to read a full row from, so only
// the id + status are sent — the server-side schema allows that (every
// field but id is optional) and there is nothing else this device could
// possibly know about that row.
export function discardSession(sessionId?: string): Promise<void> {
  return serialize(async () => {
    const local = await getLocalActiveSession();
    const id = sessionId ?? local?.id;
    if (!id) throw new Error("No active session");

    if (local && local.id === id) {
      await commitSessionMutation({
        session: null,
        ops: [workoutSessionFullRowOp(local, { status: "discarded" })],
      });
    } else {
      await commitSessionMutation({
        session: undefined,
        ops: [
          {
            opId: newId(),
            entity: "workoutSession",
            operation: "upsert",
            payload: buildWorkoutSessionUpsertPayload({ id, status: "discarded" }),
          },
        ],
      });
    }
    void flushOutbox();
  });
}
