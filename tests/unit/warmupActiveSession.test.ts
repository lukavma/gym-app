// Warm-up Routines v1 — the client-side lifecycle, driven against the REAL
// production mutators in src/sync/activeSession.ts and a REAL IndexedDB
// (fake-indexeddb, not a mock of getIdb/db.ts), following the pattern
// established by tests/unit/activeSessionConcurrency.test.ts.
//
// What these prove, and why each matters:
//   * warm-up state is frozen at start and survives a "reload" (a fresh read
//     straight out of IndexedDB, which is exactly what the app does on
//     hydrate after a refresh or an iOS process kill);
//   * every warm-up mutation writes ZERO outbox ops — inspected directly in
//     the outbox store, not inferred from the code;
//   * completion and discard delete the aggregate, so no warm-up state
//     survives anywhere on the device (M-5);
//   * a server-hydrated session (cross-device adopt) carries no warm-up
//     state, the accepted v1 behavior (O-3);
//   * a legacy/pre-upgrade cached bundle (no warm-up fields at all) starts a
//     normal workout with no card and no error (R-1);
//   * two sessions with identical work sets produce byte-identical outbox
//     payload streams whether or not the athlete touched the warm-up card.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { STRATEGY_VERSIONS } from "@/domain/schemas/prescriptionSnapshot";
import type {
  ActiveSessionDto,
  TodayBundleExerciseEntryDto,
  TodayWarmupRoutineDto,
} from "@/sync/types";

// Same rationale as activeSessionConcurrency.test.ts: sync is irrelevant to
// this file's concern and, unmocked, every mutator's fire-and-forget
// `void flushOutbox()` would attempt a relative-URL fetch Node cannot
// resolve. Warm-up mutators deliberately do not call it at all — see the
// dedicated assertion below, which is only meaningful because this mock
// records calls.
const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

const upperRoutine: TodayWarmupRoutineDto = {
  id: newId(),
  name: "Upper Standard",
  items: [
    { label: "Bike", instruction: "5 min easy" },
    { label: "Band external rotation", instruction: "2x15 light" },
    { label: "Scap pull-ups", instruction: null },
  ],
};

const shoulderRoutine: TodayWarmupRoutineDto = {
  id: newId(),
  name: "Shoulder Prep",
  items: [{ label: "Horizontal rotation", instruction: "10 controlled reps" }],
};

// Fixed, not regenerated per call: the equivalence test below runs two
// sessions and compares their outbox payloads field by field, so the
// exercise identity has to be the same in both — a fresh id would make the
// streams differ for a reason that has nothing to do with warm-ups.
const EXERCISE_ID = newId();

function bundleEntry(): TodayBundleExerciseEntryDto {
  return {
    prescriptionId: newId(),
    exerciseId: EXERCISE_ID,
    exerciseName: "Bench Press",
    scheme: { type: "fixed", sets: 3, reps: 5 },
    targetRir: null,
    restSeconds: null,
    progression: { strategyId: "manual", config: {}, classification: "user_defined" },
    baselineLoadKg: 60,
    loadStepKg: 2.5,
    prefill: { loadKg: 60, reps: 5 },
    appliedModifiers: null,
    pendingRecommendation: null,
    previousPerformance: [],
    history: [],
  };
}

// A pre-upgrade bundle: the object literally has no warm-up keys at all, the
// way a service-worker- or IndexedDB-cached copy from before this feature
// shipped deserializes.
function legacyStartInput() {
  return {
    blockId: newId(),
    templateId: newId(),
    templateName: "Upper A",
    weekIndex: 1,
    isDeload: false,
    exercises: [bundleEntry()],
  };
}

function startInput(routines: TodayWarmupRoutineDto[], defaultWarmupRoutineId: string | null) {
  return { ...legacyStartInput(), warmupRoutines: routines, defaultWarmupRoutineId };
}

// Every string that only exists because a warm-up routine exists. If any of
// these ever appears in an outbox payload, warm-up data reached the wire.
const WARMUP_ROUTINE_MARKERS = [
  upperRoutine.id,
  upperRoutine.name,
  shoulderRoutine.id,
  shoulderRoutine.name,
  ...[...upperRoutine.items, ...shoulderRoutine.items].flatMap((item) =>
    item.instruction ? [item.label, item.instruction] : [item.label],
  ),
];

// I-8's vocabulary separation, asserted rather than assumed: a naive
// /warmup/i scan is WRONG here, because `setLog.isWarmup` is a legitimate,
// pre-existing, unrelated field (`set_logs.is_warmup` — warm-up SETS of a
// loaded lift). This checks for warm-up ROUTINE data specifically: the
// frozen routine content, and any key this feature introduced.
function expectNoWarmupRoutineData(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const marker of WARMUP_ROUTINE_MARKERS) {
    expect(serialized, `outbox payload leaked warm-up routine data: ${marker}`).not.toContain(
      marker,
    );
  }
  expect(serialized).not.toMatch(
    /"(warmup|warmupRoutines|defaultWarmupRoutineId|selectedRoutineId|dismissed)"/,
  );
}

async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload }));
}

async function clearOutbox(): Promise<void> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  await db.clear("outbox");
}

// Reads the aggregate the way a page reload does: a brand-new read of the
// IndexedDB record, never the object a mutator happened to return.
async function reloadSession(): Promise<ActiveSessionDto | null> {
  const { getLocalActiveSession } = await import("@/sync/activeSession");
  return getLocalActiveSession();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("startSession — freezing the linked routines (evaluation §6.3)", () => {
  it("freezes the routines and preselects the default", async () => {
    const { startSession } = await import("@/sync/activeSession");
    await startSession(startInput([upperRoutine, shoulderRoutine], upperRoutine.id));

    const session = await reloadSession();
    expect(session?.warmup?.routines).toEqual([upperRoutine, shoulderRoutine]);
    expect(session?.warmup?.selectedRoutineId).toBe(upperRoutine.id);
    expect(session?.warmup?.done).toEqual([false, false, false]);
    expect(session?.warmup?.dismissed).toBe(false);
  });

  it("links but no default => nothing selected (the compact chooser)", async () => {
    const { startSession } = await import("@/sync/activeSession");
    await startSession(startInput([upperRoutine, shoulderRoutine], null));

    const session = await reloadSession();
    expect(session?.warmup?.routines).toHaveLength(2);
    expect(session?.warmup?.selectedRoutineId).toBeNull();
  });

  it("no linked routines => no warm-up state at all", async () => {
    const { startSession } = await import("@/sync/activeSession");
    await startSession(startInput([], null));
    expect((await reloadSession())?.warmup).toBeNull();
  });

  it("a legacy cached bundle with the warm-up fields ABSENT starts normally, with no card and no error", async () => {
    const { startSession } = await import("@/sync/activeSession");
    const session = await startSession(legacyStartInput());

    expect(session.warmup).toBeNull();
    expect(session.exercises).toHaveLength(1);
    const reloaded = await reloadSession();
    expect(reloaded?.warmup).toBeNull();
    expect(reloaded?.exercises).toHaveLength(1);
    // The workout itself is entirely unaffected: the session + its one
    // session-exercise op are enqueued exactly as before.
    const ops = await readOutbox();
    expect(ops.map((op) => op.entity)).toEqual(["workoutSession", "sessionExercise"]);
  });

  it("does not put warm-up data on the session's own outbox payload", async () => {
    const { startSession } = await import("@/sync/activeSession");
    await startSession(startInput([upperRoutine], upperRoutine.id));

    const ops = await readOutbox();
    expectNoWarmupRoutineData(ops);
  });
});

describe("warm-up mutations — durable locally, invisible to the wire (I-1/I-2/I-5)", () => {
  beforeEach(async () => {
    const { startSession } = await import("@/sync/activeSession");
    await startSession(startInput([upperRoutine, shoulderRoutine], upperRoutine.id));
    await clearOutbox();
    flushOutbox.mockClear();
  });

  it("ticking items survives a reload (the same mechanism that restores sets)", async () => {
    const { toggleWarmupItem } = await import("@/sync/activeSession");
    await toggleWarmupItem(0);
    await toggleWarmupItem(2);

    expect((await reloadSession())?.warmup?.done).toEqual([true, false, true]);
  });

  it("un-ticking survives a reload too", async () => {
    const { toggleWarmupItem } = await import("@/sync/activeSession");
    await toggleWarmupItem(1);
    await toggleWarmupItem(1);
    expect((await reloadSession())?.warmup?.done).toEqual([false, false, false]);
  });

  it("switching routines resets the checklist, durably", async () => {
    const { selectWarmupRoutine, toggleWarmupItem } = await import("@/sync/activeSession");
    await toggleWarmupItem(0);
    await toggleWarmupItem(1);
    await selectWarmupRoutine(shoulderRoutine.id);

    const session = await reloadSession();
    expect(session?.warmup?.selectedRoutineId).toBe(shoulderRoutine.id);
    expect(session?.warmup?.done).toEqual([false]);
  });

  it("skip is durable and reversible within the session", async () => {
    const { setWarmupDismissed, toggleWarmupItem } = await import("@/sync/activeSession");
    await toggleWarmupItem(0);
    await setWarmupDismissed(true);
    expect((await reloadSession())?.warmup?.dismissed).toBe(true);

    await setWarmupDismissed(false);
    const restored = await reloadSession();
    expect(restored?.warmup?.dismissed).toBe(false);
    expect(restored?.warmup?.done).toEqual([true, false, false]);
  });

  it("NONE of them enqueue an outbox op, and none of them kick a flush", async () => {
    const { selectWarmupRoutine, setWarmupDismissed, toggleWarmupItem } =
      await import("@/sync/activeSession");
    await toggleWarmupItem(0);
    await toggleWarmupItem(1);
    await selectWarmupRoutine(shoulderRoutine.id);
    await toggleWarmupItem(0);
    await setWarmupDismissed(true);
    await setWarmupDismissed(false);

    expect(await readOutbox()).toEqual([]);
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  it("negative control: the same outbox inspection DOES catch a real op, so the empty result above is meaningful", async () => {
    const { logSet } = await import("@/sync/activeSession");
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({ sessionExerciseId: exerciseId, weightKg: 60, reps: 5, rir: null });

    const ops = await readOutbox();
    expect(ops.map((op) => op.entity)).toEqual(["setLog"]);
    expect(flushOutbox).toHaveBeenCalled();
  });

  it("are no-ops on a session that has no warm-up state (pre-upgrade aggregate / adopted session)", async () => {
    const { clearLocalSession, startSession, toggleWarmupItem } =
      await import("@/sync/activeSession");
    await clearLocalSession();
    await startSession(legacyStartInput());
    await clearOutbox();

    await expect(toggleWarmupItem(0)).resolves.toBeTruthy();
    expect((await reloadSession())?.warmup).toBeNull();
    expect(await readOutbox()).toEqual([]);
  });
});

describe("end of session — warm-up state ceases to exist (M-5, N-1)", () => {
  beforeEach(async () => {
    const { startSession, toggleWarmupItem } = await import("@/sync/activeSession");
    await startSession(startInput([upperRoutine], upperRoutine.id));
    await toggleWarmupItem(0);
    await toggleWarmupItem(1);
  });

  it("completing deletes the aggregate, and the completion ops carry no warm-up data", async () => {
    const { completeSession } = await import("@/sync/activeSession");
    await clearOutbox();
    await completeSession();

    expect(await reloadSession()).toBeNull();
    expectNoWarmupRoutineData(await readOutbox());
  });

  it("discarding deletes the aggregate, and the discard op carries no warm-up data", async () => {
    const { discardSession } = await import("@/sync/activeSession");
    await clearOutbox();
    await discardSession();

    expect(await reloadSession()).toBeNull();
    expectNoWarmupRoutineData(await readOutbox());
  });
});

describe("cross-device adopt (O-3, accepted v1 limitation)", () => {
  it("a server-hydrated session carries no warm-up state, so the adopting device shows no card", async () => {
    const { hydrateFromServer, startSession, toggleWarmupItem, clearLocalSession } =
      await import("@/sync/activeSession");
    await startSession(startInput([upperRoutine], upperRoutine.id));
    await toggleWarmupItem(0);
    const local = await reloadSession();
    if (!local) throw new Error("expected a local session");
    expect(local.warmup?.done).toEqual([true, false, false]);

    // What `/api/active-session` actually returns: the server builds this
    // DTO from PostgreSQL, which holds nothing about warm-ups, so the field
    // is simply absent from the payload.
    const remote = JSON.parse(JSON.stringify({ ...local, warmup: undefined })) as ActiveSessionDto;
    expect("warmup" in remote).toBe(false);

    await clearLocalSession();
    await hydrateFromServer(remote);

    const adopted = await reloadSession();
    expect(adopted?.id).toBe(local.id);
    expect(adopted?.warmup ?? null).toBeNull();
  });
});

describe("equivalence — warm-up interactions cannot change what syncs (A-9)", () => {
  // Everything that varies between two sessions by construction (ids,
  // timestamps) is stripped, leaving only the fields that decide what the
  // server stores and what progression/volume later read.
  function normalize(ops: { entity: string; payload: Record<string, unknown> }[]) {
    return ops.map((op) => {
      const payload = { ...op.payload };
      for (const key of ["id", "sessionId", "sessionExerciseId", "blockId", "templateId"]) {
        delete payload[key];
      }
      for (const key of ["startedAt", "completedAt", "loggedAt", "createdAt", "decidedAt"]) {
        delete payload[key];
      }
      return { entity: op.entity, payload };
    });
  }

  async function runSession(interactWithWarmup: boolean) {
    const {
      clearLocalSession,
      completeSession,
      logSet,
      selectWarmupRoutine,
      setWarmupDismissed,
      startSession,
      toggleWarmupItem,
    } = await import("@/sync/activeSession");

    await clearLocalSession();
    await clearOutbox();
    await startSession(startInput([upperRoutine, shoulderRoutine], upperRoutine.id));

    if (interactWithWarmup) {
      await toggleWarmupItem(0);
      await toggleWarmupItem(1);
      await selectWarmupRoutine(shoulderRoutine.id);
      await toggleWarmupItem(0);
      await setWarmupDismissed(true);
      await setWarmupDismissed(false);
    }

    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");
    await logSet({ sessionExerciseId: exerciseId, weightKg: 62.5, reps: 5, rir: 2 });
    await logSet({ sessionExerciseId: exerciseId, weightKg: 62.5, reps: 5, rir: 1 });
    await completeSession();

    return normalize(await readOutbox());
  }

  it("identical work sets produce identical op streams, warm-up interactions or not", async () => {
    const withWarmup = await runSession(true);
    const withoutWarmup = await runSession(false);

    expect(withWarmup).toEqual(withoutWarmup);
    expect(withWarmup.map((op) => op.entity)).toEqual([
      "workoutSession",
      "sessionExercise",
      "setLog",
      "setLog",
      "workoutSession",
    ]);
    expectNoWarmupRoutineData(withWarmup);
    // I-6/I-8 — the OTHER warm-up concept is untouched: set logs still carry
    // `isWarmup`, and it is still false for these work sets. Without this,
    // expectNoWarmupRoutineData could pass simply because set logging broke.
    const setLogs = withWarmup.filter((op) => op.entity === "setLog");
    expect(setLogs).toHaveLength(2);
    expect(setLogs.every((op) => op.payload.isWarmup === false)).toBe(true);
  });

  it("negative control: a genuine difference in the WORK sets does make the streams differ", async () => {
    const baseline = await runSession(false);
    const { clearLocalSession, completeSession, logSet, startSession } =
      await import("@/sync/activeSession");
    await clearLocalSession();
    await clearOutbox();
    await startSession(startInput([upperRoutine], upperRoutine.id));
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");
    await logSet({ sessionExerciseId: exerciseId, weightKg: 65, reps: 5, rir: 2 });
    await logSet({ sessionExerciseId: exerciseId, weightKg: 62.5, reps: 5, rir: 1 });
    await completeSession();

    expect(normalize(await readOutbox())).not.toEqual(baseline);
  });
});

describe("the frozen snapshot shape is unchanged by this feature", () => {
  it("still wraps the prescription exactly as before (no warm-up field leaked into it)", async () => {
    const { startSession } = await import("@/sync/activeSession");
    const session = await startSession(startInput([upperRoutine], upperRoutine.id));
    const snapshot = session.exercises[0]?.prescription;
    expect(snapshot?.v).toBe(1);
    expect(snapshot?.snapshot.progression.strategyVersion).toBe(STRATEGY_VERSIONS.manual);
    expectNoWarmupRoutineData(snapshot);
  });
});
