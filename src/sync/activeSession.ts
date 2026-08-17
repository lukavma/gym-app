import { getIdb, ACTIVE_SESSION_KEY, commitSessionMutation, type OutboxOpInput } from "./db";
import { flushOutbox } from "./flush";
import { newId } from "@/domain/ids/uuidv7";
import {
  buildWorkoutSessionUpsertPayload,
  buildSessionExerciseUpsertPayload,
  buildSetLogUpsertPayload,
  buildSetLogDeletePayload,
} from "@/domain/sync/payloadBuilders";
import {
  wrapPrescriptionSnapshot,
  STRATEGY_VERSIONS,
  type PrescriptionSnapshot,
} from "@/domain/schemas/prescriptionSnapshot";
import type {
  ActiveSessionDto,
  ActiveSessionExerciseDto,
  ActiveSessionSetDto,
  TodayBundleExerciseEntryDto,
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

export async function getLocalActiveSession(): Promise<ActiveSessionDto | null> {
  const db = await getIdb();
  const session = await db.get("activeSession", ACTIVE_SESSION_KEY);
  return session ?? null;
}

export async function clearLocalSession(): Promise<void> {
  const db = await getIdb();
  await db.delete("activeSession", ACTIVE_SESSION_KEY);
}

// Cold-client resume and cross-device "resume (view cached)": adopt a
// server-hydrated session verbatim as this device's local state.
export async function hydrateFromServer(remote: ActiveSessionDto): Promise<void> {
  const db = await getIdb();
  await db.put("activeSession", remote, ACTIVE_SESSION_KEY);
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
    },
    appliedModifiers: null,
    prefill: entry.prefill,
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
      skipped: exercise.skipped,
      notes: exercise.notes,
    }),
  };
}

function setLogFullRowOp(sessionExerciseId: string, set: ActiveSessionSetDto) {
  return {
    opId: newId(),
    entity: "setLog" as const,
    operation: "upsert" as const,
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
  };
}

export interface StartSessionInput {
  blockId: string | null;
  templateId: string | null;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  exercises: TodayBundleExerciseEntryDto[];
}

// Snapshot-on-use, exactly once: every scheduled exercise's
// PrescriptionSnapshot is frozen right here, at session creation — never
// lazily per-exercise as the workout progresses (ADR-007).
export async function startSession(input: StartSessionInput): Promise<ActiveSessionDto> {
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
  };

  const ops: OutboxOpInput[] = [
    workoutSessionFullRowOp(session),
    ...exercises.map((ex) => sessionExerciseFullRowOp(sessionId, ex)),
  ];

  await commitSessionMutation({ session, ops });
  void flushOutbox();
  return session;
}

export async function addAdhocExercise(
  exerciseId: string,
  exerciseName: string,
): Promise<ActiveSessionDto> {
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
    sets: [],
  };
  session.exercises.push(exercise);

  await commitSessionMutation({
    session,
    ops: [sessionExerciseFullRowOp(session.id, exercise)],
  });
  void flushOutbox();
  return session;
}

export async function setExerciseSkipped(
  sessionExerciseId: string,
  skipped: boolean,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  exercise.skipped = skipped;

  await commitSessionMutation({
    session,
    ops: [sessionExerciseFullRowOp(session.id, exercise)],
  });
  void flushOutbox();
  return session;
}

export async function setExerciseNotes(
  sessionExerciseId: string,
  notes: string | null,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  exercise.notes = notes;

  await commitSessionMutation({
    session,
    ops: [sessionExerciseFullRowOp(session.id, exercise)],
  });
  void flushOutbox();
  return session;
}

export interface LogSetInput {
  sessionExerciseId: string;
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup?: boolean;
  notes?: string | null;
}

export async function logSet(input: LogSetInput): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, input.sessionExerciseId);
  const setId = newId();
  const loggedAt = new Date().toISOString();
  const set: ActiveSessionSetDto = {
    id: setId,
    setNumber: nextSetNumber(exercise),
    isWarmup: input.isWarmup ?? false,
    weightKg: input.weightKg,
    reps: input.reps,
    rir: input.rir,
    loggedAt,
    notes: input.notes ?? null,
  };
  exercise.sets.push(set);

  await commitSessionMutation({
    session,
    ops: [setLogFullRowOp(exercise.id, set)],
  });
  void flushOutbox();
  return session;
}

export type EditSetPatch = Partial<
  Pick<ActiveSessionSetDto, "weightKg" | "reps" | "rir" | "isWarmup" | "notes">
>;

// Allowed for both in-progress and already-completed sessions server-side
// (domain-model.md §7 — SetLog values are user-editable at any time,
// including after completion); the client doesn't need to distinguish
// that here since it only ever mutates its OWN locally-held activeSession,
// which by definition is still in_progress. Post-completion corrections go
// through the history UI instead (src/server/history + a dedicated route).
export async function editSet(
  sessionExerciseId: string,
  setId: string,
  patch: EditSetPatch,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  const set = exercise.sets.find((s) => s.id === setId);
  if (!set) throw new Error("Set not found");
  Object.assign(set, patch);

  await commitSessionMutation({
    session,
    ops: [setLogFullRowOp(exercise.id, set)],
  });
  void flushOutbox();
  return session;
}

export async function deleteSet(
  sessionExerciseId: string,
  setId: string,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  exercise.sets = exercise.sets.filter((s) => s.id !== setId);

  await commitSessionMutation({
    session,
    ops: [
      {
        opId: newId(),
        entity: "setLog",
        operation: "delete",
        payload: buildSetLogDeletePayload({ id: setId }),
      },
    ],
  });
  void flushOutbox();
  return session;
}

export async function setSessionNotes(notes: string | null): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  session.notes = notes;

  await commitSessionMutation({
    session,
    ops: [workoutSessionFullRowOp(session)],
  });
  void flushOutbox();
  return session;
}

export async function completeSession(): Promise<void> {
  const session = await requireLocalSession();
  const completedAt = new Date().toISOString();

  await commitSessionMutation({
    session: null,
    ops: [workoutSessionFullRowOp(session, { status: "completed", completedAt })],
  });
  void flushOutbox();
}

// Discards a session by id — defaults to the local session (normal
// discard), but accepts an explicit id for takeover, where the session
// being discarded belongs to another device and was never held locally. In
// the local case the full row (from the in-memory aggregate) is sent; in
// the foreign case there is no local copy to read a full row from, so only
// the id + status are sent — the server-side schema allows that (every
// field but id is optional) and there is nothing else this device could
// possibly know about that row.
export async function discardSession(sessionId?: string): Promise<void> {
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
}
