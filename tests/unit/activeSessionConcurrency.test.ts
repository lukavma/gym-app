// phase-8-review.md MEDIUM-1 — a real, deterministic regression test for the
// race `serialize()` (src/sync/activeSession.ts) exists to fix, run against
// the ACTUAL production mutators (not a copy, not the payload builders they
// call — see activeSessionPayloads.test.ts for that separate concern), using
// a REAL IndexedDB (fake-indexeddb, not a mock of getIdb/db.ts).
//
// The previous coverage for this — offline-set-edit-delete.spec.ts's
// Playwright assertion — never actually exercised the race: its
// `row.waitFor({ state: "detached" })` resolves as soon as the row's
// `onEdit(...)` handler is *invoked* (a synchronous `setEditing(false)`
// happens immediately, before the returned promise settles), not once
// `editSet`'s write has actually committed, so the two UI actions it drives
// were never truly in flight at the same time. Reverting `serialize()`
// entirely did not fail that spec. This file instead calls `editSet` and
// `deleteSet` directly, back-to-back with no `await` between them —
// mirroring exactly how the UI actually invokes every mutator
// (`void editSet(...)`, fire-and-forget, no per-row disabling while the
// call is in flight, per activeSession.ts's own comment on `serialize`) —
// so both calls' `requireLocalSession()` reads are genuinely racing for the
// same pre-mutation snapshot, not sequenced by any test-harness delay.
//
// Verified manually (not an automated part of this suite, since it requires
// editing source) that this test fails when `serialize()` is bypassed:
// temporarily changing `serialize` to `fn => fn()` in activeSession.ts and
// rerunning this file fails "both changes converge" below every time (the
// delete's stale in-memory read always clobbers the edit's committed
// weightKg, or vice versa, depending on which write transaction resolves
// last) — see docs/reviews/phase-8-remediation.md for the exact before/after
// run output.
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import {
  deleteSet,
  editSet,
  getLocalActiveSession,
  hydrateFromServer,
  logSet,
} from "@/sync/activeSession";
import type { ActiveSessionDto, ActiveSessionSetDto } from "@/sync/types";

// Sync itself is irrelevant to this file's concern (the local IndexedDB
// commit race) and, unmocked, would have every mutator's fire-and-forget
// `void flushOutbox()` attempt a real `fetch("/api/sync")` — a relative URL
// Node's fetch can't resolve outside a browser/document context. flush.ts
// catches that failure internally (treated like any other network error, no
// unhandled rejection), but stubbing it out keeps this file hermetic and
// fast rather than relying on that incidental safety net.
vi.mock("@/sync/flush", () => ({
  flushOutbox: vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
}));

function makeSet(setNumber: number, weightKg: number): ActiveSessionSetDto {
  return {
    id: newId(),
    setNumber,
    isWarmup: false,
    weightKg,
    reps: 8,
    rir: 2,
    loggedAt: new Date(Date.UTC(2026, 7, 26, 10, setNumber)).toISOString(),
    notes: null,
  };
}

function makeSession(sets: ActiveSessionSetDto[]): {
  session: ActiveSessionDto;
  exerciseId: string;
} {
  const exerciseId = newId();
  const session: ActiveSessionDto = {
    id: newId(),
    blockId: null,
    templateId: null,
    templateName: null,
    weekIndex: null,
    isDeload: false,
    status: "in_progress",
    startedAt: new Date(Date.UTC(2026, 7, 26, 10, 0)).toISOString(),
    clientId: null,
    notes: null,
    exercises: [
      {
        id: exerciseId,
        exerciseId: newId(),
        exerciseName: "Bench Press",
        position: 1,
        source: "adhoc",
        prescription: null,
        skipped: false,
        notes: null,
        loadStepKg: 2.5,
        recommendation: null,
        sets,
      },
    ],
  };
  return { session, exerciseId };
}

// db.ts's getIdb() memoizes its connection for the process lifetime, so
// both tests below share one real (fake-indexeddb-backed) database — same
// as production, where there is only ever one IndexedDB connection. Each
// test uses its own fresh session/exercise/set ids and writes to the single
// fixed activeSession key, matching the real "exactly one active session at
// a time" invariant, so this is safe without any per-test reset.
describe("activeSession concurrency (phase-8-review.md MEDIUM-1)", () => {
  it("editSet and deleteSet fired with no await between them both converge — neither is lost to the other's stale read", async () => {
    const setA = makeSet(1, 100);
    const setB = makeSet(2, 100);
    const { session, exerciseId } = makeSession([setA, setB]);
    await hydrateFromServer(session);

    // No `await` between these two calls: both start executing before
    // either's `requireLocalSession()` read resolves, exactly the real
    // overlap that broke offline-set-edit-delete.spec.ts.
    const editPromise = editSet(exerciseId, setA.id, { weightKg: 105 });
    const deletePromise = deleteSet(exerciseId, setB.id);
    await Promise.all([editPromise, deletePromise]);

    const finalSession = await getLocalActiveSession();
    const finalExercise = finalSession?.exercises.find((e) => e.id === exerciseId);
    expect(finalExercise?.sets.map((s) => s.id)).toEqual([setA.id]);
    expect(finalExercise?.sets.find((s) => s.id === setA.id)?.weightKg).toBe(105);
  });

  it("three mutators fired with no await between any of them — logSet, editSet, deleteSet — all converge", async () => {
    const setA = makeSet(1, 100);
    const setB = makeSet(2, 100);
    const setC = makeSet(3, 100);
    const { session, exerciseId } = makeSession([setA, setB, setC]);
    await hydrateFromServer(session);

    const logPromise = logSet({ sessionExerciseId: exerciseId, weightKg: 120, reps: 5, rir: 1 });
    const editPromise = editSet(exerciseId, setA.id, { reps: 10 });
    const deletePromise = deleteSet(exerciseId, setB.id);
    await Promise.all([logPromise, editPromise, deletePromise]);

    const finalSession = await getLocalActiveSession();
    const finalExercise = finalSession?.exercises.find((e) => e.id === exerciseId);

    // setB gone, setA and setC survive (renumbered to 1,2), plus the newly
    // logged fourth set — every one of the three concurrent mutations
    // reflected in the final row, none silently reverted by another's
    // stale-snapshot write.
    expect(finalExercise?.sets.map((s) => s.id).sort()).toEqual(
      [setA.id, setC.id, finalExercise?.sets.find((s) => s.weightKg === 120)?.id].sort(),
    );
    expect(finalExercise?.sets.find((s) => s.id === setA.id)?.reps).toBe(10);
    expect(finalExercise?.sets.some((s) => s.weightKg === 120 && s.reps === 5)).toBe(true);
  });
});
