import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { enqueueOp, markDeadLetter } from "@/sync/outbox";
import type { ActiveSessionDto, ActiveSessionExerciseDto, ActiveSessionSetDto } from "@/sync/types";

// athletic-measurement-profiles-architecture-evaluation.md §13.4 (O-16,
// binding, verbatim): "refreshSessionBlocked ... matches setLog /
// sessionExercise dead letters by payload.sessionExerciseId / payload.sessionId
// against the active session in addition to today's workoutSession match."
//
// This exercises the ACTUAL production store (not a copy of its matching
// logic) against a REAL IndexedDB (fake-indexeddb), the same convention as
// activeSessionConcurrency.test.ts — enqueue a real op via outbox.ts,
// dead-letter it via outbox.ts's own markDeadLetter, then call the store's
// own refreshSessionBlocked and read back its new refusedSetLogIds /
// refusedSessionExerciseIds state.

function makeSet(overrides: Partial<ActiveSessionSetDto> = {}): ActiveSessionSetDto {
  return {
    id: newId(),
    setNumber: 1,
    isWarmup: false,
    weightKg: 100,
    reps: 5,
    rir: 2,
    distanceM: null,
    durationS: null,
    loggedAt: new Date(Date.UTC(2026, 8, 8, 10, 0)).toISOString(),
    notes: null,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<ActiveSessionExerciseDto> = {}): ActiveSessionExerciseDto {
  return {
    id: newId(),
    exerciseId: newId(),
    exerciseName: "Bench Press",
    position: 1,
    source: "adhoc",
    prescription: null,
    skipped: false,
    notes: null,
    loadStepKg: 2.5,
    recommendation: null,
    measurement: { profile: "load_reps", loadBasis: "unspecified" },
    sets: [],
    ...overrides,
  };
}

function makeSession(exercises: ActiveSessionExerciseDto[]): ActiveSessionDto {
  return {
    id: newId(),
    blockId: null,
    templateId: null,
    templateName: null,
    weekIndex: null,
    isDeload: false,
    status: "in_progress",
    startedAt: new Date(Date.UTC(2026, 8, 8, 10, 0)).toISOString(),
    clientId: null,
    notes: null,
    exercises,
  };
}

async function deadLetterSetLog(sessionExerciseId: string, setId: string): Promise<void> {
  const opId = newId();
  await enqueueOp({
    opId,
    entity: "setLog",
    operation: "upsert",
    payload: { id: setId, sessionExerciseId, setNumber: 1, weightKg: 100, reps: 5 },
  });
  await markDeadLetter(opId, "invalid_measurement");
}

async function deadLetterSessionExercise(
  sessionId: string,
  sessionExerciseId: string,
): Promise<void> {
  const opId = newId();
  await enqueueOp({
    opId,
    entity: "sessionExercise",
    operation: "upsert",
    payload: { id: sessionExerciseId, sessionId, skipped: true },
  });
  await markDeadLetter(opId, "not_found");
}

// Resets only the store's reactive state, never the shared fake-indexeddb —
// every helper above enqueues rows with fresh newId()s, so accumulation
// across tests/files cannot produce a false match (the filters are keyed by
// this test's own session/exercise/set ids throughout).
function resetStoreState(session: ActiveSessionDto | null): void {
  useActiveSessionStore.setState({
    session,
    sessionBlocked: false,
    refusedSetLogIds: new Set(),
    refusedSessionExerciseIds: new Set(),
  });
}

describe("refreshSessionBlocked — O-16 setLog/sessionExercise dead-letter matching", () => {
  it("marks a setLog dead letter whose sessionExerciseId belongs to the active session", async () => {
    const setA = makeSet();
    const exerciseA = makeExercise({ sets: [setA] });
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    await deadLetterSetLog(exerciseA.id, setA.id);
    await useActiveSessionStore.getState().refreshSessionBlocked();

    const state = useActiveSessionStore.getState();
    expect(state.refusedSetLogIds.has(setA.id)).toBe(true);
    expect(state.refusedSessionExerciseIds.size).toBe(0);
    // Additive, not a replacement — the workoutSession-only block stays
    // false so completion remains possible (O-16's "completion stays
    // possible" requirement).
    expect(state.sessionBlocked).toBe(false);
  });

  it("marks a sessionExercise dead letter whose sessionId is the active session", async () => {
    const exerciseA = makeExercise();
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    await deadLetterSessionExercise(session.id, exerciseA.id);
    await useActiveSessionStore.getState().refreshSessionBlocked();

    const state = useActiveSessionStore.getState();
    expect(state.refusedSessionExerciseIds.has(exerciseA.id)).toBe(true);
    expect(state.refusedSetLogIds.size).toBe(0);
    expect(state.sessionBlocked).toBe(false);
  });

  it("does NOT mark a setLog dead letter belonging to a different session's slot", async () => {
    const setA = makeSet();
    const exerciseA = makeExercise({ sets: [setA] });
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    // A dead letter for a set on a slot that is NOT part of this session
    // (e.g. a stale/foreign sessionExerciseId) must never mark this card.
    const foreignSessionExerciseId = newId();
    const foreignSetId = newId();
    await deadLetterSetLog(foreignSessionExerciseId, foreignSetId);
    await useActiveSessionStore.getState().refreshSessionBlocked();

    const state = useActiveSessionStore.getState();
    expect(state.refusedSetLogIds.has(foreignSetId)).toBe(false);
    expect(state.refusedSetLogIds.has(setA.id)).toBe(false);
    expect(state.refusedSetLogIds.size).toBe(0);
  });

  it("does NOT mark a sessionExercise dead letter belonging to a different session", async () => {
    const exerciseA = makeExercise();
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    const foreignSessionId = newId();
    await deadLetterSessionExercise(foreignSessionId, exerciseA.id);
    await useActiveSessionStore.getState().refreshSessionBlocked();

    const state = useActiveSessionStore.getState();
    expect(state.refusedSessionExerciseIds.has(exerciseA.id)).toBe(false);
    expect(state.refusedSessionExerciseIds.size).toBe(0);
  });

  it("still raises sessionBlocked (unchanged) for a workoutSession dead letter of the active session, additively alongside setLog matching", async () => {
    const setA = makeSet();
    const exerciseA = makeExercise({ sets: [setA] });
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    const opId = newId();
    await enqueueOp({
      opId,
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: session.id, status: "in_progress" },
    });
    await markDeadLetter(opId, "conflict");
    await deadLetterSetLog(exerciseA.id, setA.id);

    await useActiveSessionStore.getState().refreshSessionBlocked();

    const state = useActiveSessionStore.getState();
    expect(state.sessionBlocked).toBe(true);
    expect(state.refusedSetLogIds.has(setA.id)).toBe(true);
  });

  it("clears both refusal sets when there is no active session", async () => {
    resetStoreState(null);
    await useActiveSessionStore.getState().refreshSessionBlocked();
    const state = useActiveSessionStore.getState();
    expect(state.sessionBlocked).toBe(false);
    expect(state.refusedSetLogIds.size).toBe(0);
    expect(state.refusedSessionExerciseIds.size).toBe(0);
  });
});
