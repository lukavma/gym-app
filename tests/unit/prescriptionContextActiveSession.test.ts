// PI-018 Workout prescription context —
// docs/reviews/workout-prescription-context-architecture-evaluation.md
// §6/§7 C-2/C-3/C-6, U-7.
//
// Driven against the REAL production mutators in src/sync/activeSession.ts
// and a REAL IndexedDB (fake-indexeddb, not a mock of getIdb/db.ts),
// following the pattern established by tests/unit/warmupActiveSession.test.ts
// and tests/unit/measurementActiveSession.test.ts.
//
// What this file proves:
//   * C-2 — a PRE-UPGRADE cached bundle entry (no `prescriptionNotes` key at
//     all, exactly how a service-worker or `bundleCache` copy fetched before
//     this feature shipped deserializes) starts a workout without throwing
//     and freezes the key as `null`. This is the Phase 5 L-4 guard for the
//     new field: that regression was a cached bundle lacking
//     `appliedModifiers` making offline start throw.
//   * C-3 — the assertion is `toBeNull()`, strictly, and NOT `toBeFalsy()`
//     or a whole-object `toEqual`. That is what makes NC-2 (reverting the
//     `?? null` in `buildSnapshotFromBundleEntry` to a bare
//     `entry.prescriptionNotes`) discriminate: the bare form freezes
//     `undefined`, which a falsy/loose assertion would happily accept.
//   * the note survives a "reload" — a fresh read straight out of IndexedDB,
//     which is what the app actually does after a refresh or an iOS process
//     kill — and rides into the outbox `sessionExercise` op.
//   * C-6 — two prescription slots of the SAME exercise in one template keep
//     their own independent frozen notes and rest targets.
//   * the frozen note is immune to a later program edit, because nothing on
//     this path ever re-reads the bundle (the server-side half of that
//     property is tests/integration/sync.integration.test.ts's concern).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import type { ActiveSessionDto, TodayBundleExerciseEntryDto } from "@/sync/types";

// Same rationale as measurementActiveSession.test.ts / warmupActiveSession
// .test.ts: sync is irrelevant to this file's concern and, unmocked, every
// mutator's fire-and-forget `void flushOutbox()` would attempt a
// relative-URL fetch Node cannot resolve.
const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

const BENCH_ID = newId();

const PROGRAM_NOTE = "Pause 1 s on the chest.\nElbows ~45°.";

function bundleEntry(overrides: Partial<TodayBundleExerciseEntryDto> = {}) {
  return {
    prescriptionId: newId(),
    exerciseId: BENCH_ID,
    exerciseName: "Bench Press",
    scheme: { type: "fixed", sets: 3, reps: 5 },
    targetRir: { min: 1, max: 2 },
    restSeconds: 150,
    progression: { strategyId: "manual", config: {}, classification: "user_defined" },
    baselineLoadKg: 100,
    loadStepKg: 2.5,
    prefill: { loadKg: 100, reps: 5 },
    appliedModifiers: null,
    pendingRecommendation: null,
    previousPerformance: [],
    history: [],
    measurement: { profile: "load_reps", loadBasis: "unspecified" },
    prescriptionNotes: PROGRAM_NOTE,
    ...overrides,
  } as TodayBundleExerciseEntryDto;
}

// A pre-upgrade cached bundle entry: the object literally has no
// `prescriptionNotes` key, the way a copy cached before this feature shipped
// deserializes (R-1's mandatory tolerance rule). Built by deletion rather
// than by omission so the type stays honest about what is missing.
function legacyBundleEntry(): TodayBundleExerciseEntryDto {
  const entry = bundleEntry();
  delete (entry as Partial<TodayBundleExerciseEntryDto>).prescriptionNotes;
  return entry;
}

function startInput(exercises: TodayBundleExerciseEntryDto[]) {
  return {
    blockId: newId(),
    templateId: newId(),
    templateName: "Upper A",
    weekIndex: 1,
    isDeload: false,
    exercises,
  };
}

async function reloadSession(): Promise<ActiveSessionDto | null> {
  const { getLocalActiveSession } = await import("@/sync/activeSession");
  return getLocalActiveSession();
}

async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("U-7 — startSession freezes the prescription note once, per slot", () => {
  it("freezes a live bundle entry's note and rest verbatim, and both survive a reload from IndexedDB", async () => {
    const { startSession } = await import("@/sync/activeSession");
    const started = await startSession(startInput([bundleEntry()]));

    expect(started.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBe(PROGRAM_NOTE);
    expect(started.exercises[0]?.prescription?.snapshot.restSeconds).toBe(150);

    const reloaded = await reloadSession();
    expect(reloaded?.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBe(PROGRAM_NOTE);
    expect(reloaded?.exercises[0]?.prescription?.snapshot.restSeconds).toBe(150);
  });

  it("C-2 — a pre-upgrade cached bundle entry with NO prescriptionNotes key starts without throwing and freezes exactly null", async () => {
    const { startSession } = await import("@/sync/activeSession");
    const entry = legacyBundleEntry();
    expect("prescriptionNotes" in entry).toBe(false);

    const started = await startSession(startInput([entry]));

    // `toBeNull()`, strictly — see this file's header. A `toBeFalsy()` here
    // would pass on `undefined` and make NC-2 vacuous.
    expect(started.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBeNull();
    // C-3 — a newly frozen snapshot ALWAYS carries the key, even when the
    // source entry omitted it.
    const snapshot = started.exercises[0]?.prescription?.snapshot as Record<string, unknown>;
    expect("prescriptionNotes" in snapshot).toBe(true);
    // The pre-existing frozen field is untouched by the tolerance path.
    expect(started.exercises[0]?.prescription?.snapshot.restSeconds).toBe(150);

    const reloaded = await reloadSession();
    expect(reloaded?.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBeNull();
  });

  it("freezes an explicit null note as null (a slot the program left blank)", async () => {
    const { startSession } = await import("@/sync/activeSession");
    const started = await startSession(
      startInput([bundleEntry({ prescriptionNotes: null, restSeconds: null })]),
    );
    expect(started.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBeNull();
    expect(started.exercises[0]?.prescription?.snapshot.restSeconds).toBeNull();
  });

  it("C-6 — two slots of the SAME exercise keep their own independent note and rest", async () => {
    const { startSession } = await import("@/sync/activeSession");
    const started = await startSession(
      startInput([
        bundleEntry({ prescriptionNotes: "Top set: leave 1 in the tank.", restSeconds: 180 }),
        bundleEntry({
          prescriptionNotes: "Back-off: same bar speed, no grinders.",
          restSeconds: 90,
        }),
      ]),
    );

    expect(started.exercises).toHaveLength(2);
    expect(started.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBe(
      "Top set: leave 1 in the tank.",
    );
    expect(started.exercises[0]?.prescription?.snapshot.restSeconds).toBe(180);
    expect(started.exercises[1]?.prescription?.snapshot.prescriptionNotes).toBe(
      "Back-off: same bar speed, no grinders.",
    );
    expect(started.exercises[1]?.prescription?.snapshot.restSeconds).toBe(90);
    // Same exercise, two distinct session_exercises rows — nothing upstream
    // collapsed them by exerciseId.
    expect(started.exercises[0]?.exerciseId).toBe(started.exercises[1]?.exerciseId);
    expect(started.exercises[0]?.id).not.toBe(started.exercises[1]?.id);
  });

  it("the frozen note reaches the outbox sessionExercise op inside `prescription`, with no new top-level key", async () => {
    const { startSession } = await import("@/sync/activeSession");
    await startSession(startInput([bundleEntry()]));

    const ops = await readOutbox();
    const sessionExerciseOps = ops.filter((op) => op.entity === "sessionExercise");
    expect(sessionExerciseOps).toHaveLength(1);

    const payload = sessionExerciseOps[0]!.payload as {
      prescription?: { snapshot: { prescriptionNotes?: string | null } };
    };
    expect(payload.prescription?.snapshot.prescriptionNotes).toBe(PROGRAM_NOTE);
    // §3.4 — the note rides inside the existing `prescription` field; the
    // payload's own key set is unchanged.
    expect("prescriptionNotes" in sessionExerciseOps[0]!.payload).toBe(false);
  });

  it("a later program edit cannot reach a running session — the execution path never re-reads a bundle", async () => {
    const { startSession, setExerciseNotes } = await import("@/sync/activeSession");
    const entry = bundleEntry();
    const started = await startSession(startInput([entry]));
    const sessionExerciseId = started.exercises[0]!.id;

    // The program definition changes after the freeze. The bundle entry
    // object this session was started from is mutated in place — the most
    // aggressive version of "the program changed" this layer can be exposed
    // to, since nothing here holds a reference to it any more.
    entry.prescriptionNotes = "COMPLETELY DIFFERENT INSTRUCTION";
    entry.restSeconds = 30;

    // …and the session keeps being mutated normally in the meantime.
    await setExerciseNotes(sessionExerciseId, "session note typed during the workout");

    const reloaded = await reloadSession();
    expect(reloaded?.exercises[0]?.prescription?.snapshot.prescriptionNotes).toBe(PROGRAM_NOTE);
    expect(reloaded?.exercises[0]?.prescription?.snapshot.restSeconds).toBe(150);
    // Independent lifecycles — the session note is its own field on its own
    // table, and writing it did not touch the frozen prescription note.
    expect(reloaded?.exercises[0]?.notes).toBe("session note typed during the workout");
  });
});
