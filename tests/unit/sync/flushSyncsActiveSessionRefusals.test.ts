// M-2 (athletic-measurement-profiles-release-2-review.md, MEDIUM) —
// refreshSessionBlocked (src/sync/activeSessionStore.ts) is the only writer
// of refusedSetLogIds/refusedSessionExerciseIds, and before this fix it was
// only ever called from hydrate(), adoptRemote(), and SyncStatusBanner's own
// 5-second poll (src/ui/SyncStatusBanner.tsx) — NOT from flushOutbox
// (src/sync/flush.ts), which is where a rejection actually becomes a dead
// letter. That let the active-session card's refused-set marker (O-16) and
// WorkoutExecution's handleComplete drop-confirmation lag a real rejection by
// up to 5 seconds, reading a stale in-memory snapshot in between.
//
// This test exercises the ACTUAL production flushOutbox() (not a copy or a
// mock of it — flush.ts is deliberately NOT vi.mock'd here, unlike every
// other unit test that touches activeSession.ts) against a real IndexedDB
// (fake-indexeddb) and a mocked /api/sync fetch that rejects one op. It
// asserts the store reflects the refusal immediately after flushOutbox()
// resolves, WITHOUT this test ever calling refreshSessionBlocked() itself —
// isolating flush.ts's own new call to it (the fix) from the pre-existing,
// already-tested refreshSessionBlocked matching logic itself (see
// tests/unit/sync/refreshSessionBlockedRefusals.test.ts).
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { flushOutbox } from "@/sync/flush";
import { enqueueOp } from "@/sync/outbox";
import type { ActiveSessionDto, ActiveSessionExerciseDto, ActiveSessionSetDto } from "@/sync/types";

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

function resetStoreState(session: ActiveSessionDto | null): void {
  useActiveSessionStore.setState({
    session,
    sessionBlocked: false,
    refusedSetLogIds: new Set(),
    refusedSessionExerciseIds: new Set(),
  });
}

describe("flushOutbox refreshes the active-session store's refusal sets (M-2)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("marks a rejected setLog op in refusedSetLogIds immediately after flushOutbox resolves, with no manual refreshSessionBlocked call", async () => {
    const setA = makeSet();
    const exerciseA = makeExercise({ sets: [setA] });
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    const opId = newId();
    await enqueueOp({
      opId,
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: setA.id,
        sessionExerciseId: exerciseA.id,
        setNumber: 1,
        weightKg: 100,
        reps: 5,
      },
    });

    // Simulates the server's real /api/sync response classifying this op as
    // rejected (a genuine business-rule rejection, e.g. invalid_measurement
    // — same shape flush.ts's SyncApiResponse expects).
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          applied: [],
          rejected: [{ opId, entity: "setLog", reason: "invalid_measurement" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await flushOutbox();
    expect(result.rejected).toBe(1);

    // flush.ts fires its refreshSessionBlocked() call with `void` (matching
    // the pre-existing `void refreshDeadLetters()` right beside it — fire
    // and forget, never blocking the flush cycle on a UI-store update), so
    // it lands a microtask or two after flushOutbox() itself resolves, not
    // necessarily before. vi.waitFor's short poll is the deterministic way
    // to observe that without an arbitrary sleep — the real-world contrast
    // that matters is "microtasks", not "up to 5 more seconds via a poll
    // interval", which is exactly what this test would fail to show if
    // flush.ts's own call to refreshSessionBlocked() (the M-2 fix) were
    // absent: nothing else here ever calls it, so the Set would stay empty
    // no matter how long this waited.
    await vi.waitFor(
      () => {
        expect(useActiveSessionStore.getState().refusedSetLogIds.has(setA.id)).toBe(true);
      },
      { timeout: 1000, interval: 5 },
    );
  });

  it("marks a rejected sessionExercise op in refusedSessionExerciseIds immediately after flushOutbox resolves", async () => {
    const exerciseA = makeExercise();
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    const opId = newId();
    await enqueueOp({
      opId,
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: exerciseA.id, sessionId: session.id, skipped: true },
    });

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          applied: [],
          rejected: [{ opId, entity: "sessionExercise", reason: "not_found" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const result = await flushOutbox();
    expect(result.rejected).toBe(1);

    await vi.waitFor(
      () => {
        expect(useActiveSessionStore.getState().refusedSessionExerciseIds.has(exerciseA.id)).toBe(
          true,
        );
      },
      { timeout: 1000, interval: 5 },
    );
  });

  it("leaves refusedSetLogIds empty when nothing was rejected", async () => {
    const setA = makeSet();
    const exerciseA = makeExercise({ sets: [setA] });
    const session = makeSession([exerciseA]);
    resetStoreState(session);

    const opId = newId();
    await enqueueOp({
      opId,
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: setA.id,
        sessionExerciseId: exerciseA.id,
        setNumber: 1,
        weightKg: 100,
        reps: 5,
      },
    });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ applied: [opId], rejected: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await flushOutbox();
    expect(result.rejected).toBe(0);

    const state = useActiveSessionStore.getState();
    expect(state.refusedSetLogIds.size).toBe(0);
  });
});
