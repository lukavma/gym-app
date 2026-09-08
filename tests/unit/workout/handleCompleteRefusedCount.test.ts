// M-2 (athletic-measurement-profiles-release-2-review.md, MEDIUM) —
// WorkoutExecution.tsx's handleComplete used to read
// refusedSetLogIds/refusedSessionExerciseIds straight off the store's
// current in-memory snapshot, which is only ever refreshed by hydrate(),
// adoptRemote(), and SyncStatusBanner's own 5-second poll — never by
// handleComplete itself. An athlete who tapped Complete inside that window
// saw only the ordinary "Complete this workout?" prompt, never the "N
// unsaved sets ... will be dropped" confirmation, even though the rejection
// was already sitting in IndexedDB as a dead letter.
//
// The fix (getRefusedCountAfterRefresh, src/ui/workout/refusedSetCount.ts,
// called by handleComplete) awaits a real refreshSessionBlocked() before
// reading the counts. This repo's unit-test toolchain has no
// jsdom/@testing-library/react, so handleComplete itself can't be rendered
// and clicked here — getRefusedCountAfterRefresh is what was extracted out
// of it specifically so this race-sensitive step stays covered by a real
// test against the ACTUAL production store and a REAL IndexedDB
// (fake-indexeddb), not a copy of the logic.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { enqueueOp, markDeadLetter } from "@/sync/outbox";
import { getRefusedCountAfterRefresh } from "@/ui/workout/refusedSetCount";
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

describe("getRefusedCountAfterRefresh (src/ui/workout/refusedSetCount.ts) — M-2", () => {
  it("counts a rejection that is already dead-lettered in IndexedDB but NOT yet reflected in the store's cached refusal Sets — the exact race handleComplete used to lose", async () => {
    const setA = makeSet();
    const exerciseA = makeExercise({ sets: [setA] });
    const session = makeSession([exerciseA]);

    // Simulates the store's state exactly as it would sit mid-race: a
    // rejection has genuinely happened and is durably recorded (the dead
    // letter is written straight via outbox.ts below), but nothing has
    // called refreshSessionBlocked() yet, so the store's own cached Sets are
    // still empty — precisely what a hook-bound render snapshot would show
    // an athlete tapping Complete inside the stale window.
    useActiveSessionStore.setState({
      session,
      sessionBlocked: false,
      refusedSetLogIds: new Set(),
      refusedSessionExerciseIds: new Set(),
    });

    await deadLetterSetLog(exerciseA.id, setA.id);

    // Proves the precondition: reading the store's CACHED state directly
    // (what the old, un-fixed handleComplete did) still shows zero refusals
    // even though the dead letter already exists.
    expect(useActiveSessionStore.getState().refusedSetLogIds.size).toBe(0);

    // The fix: getRefusedCountAfterRefresh refreshes first, so it sees the
    // dead letter regardless of whether anything else has polled yet.
    const refusedCount = await getRefusedCountAfterRefresh();
    expect(refusedCount).toBe(1);
    expect(useActiveSessionStore.getState().refusedSetLogIds.has(setA.id)).toBe(true);
  });

  it("returns 0 when there is no active session or nothing refused", async () => {
    useActiveSessionStore.setState({
      session: null,
      sessionBlocked: false,
      refusedSetLogIds: new Set([newId()]),
      refusedSessionExerciseIds: new Set(),
    });

    const refusedCount = await getRefusedCountAfterRefresh();
    expect(refusedCount).toBe(0);
  });
});
