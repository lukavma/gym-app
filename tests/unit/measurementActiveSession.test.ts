// Athletic Measurement Profiles Release 2 "Foundations" —
// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §21.2: "ActiveSessionSetDto gains distanceM, durationS and widens
// weightKg/reps to number|null; ActiveSessionExerciseDto gains
// measurement. DB_VERSION stays 2 ... Hydration normalises pre-upgrade
// aggregates ... the bundleCache 'sanitise on read' precedent."
//
// Driven against the REAL production mutators in src/sync/activeSession.ts
// and a REAL IndexedDB (fake-indexeddb), following the pattern established
// by tests/unit/warmupActiveSession.test.ts and
// tests/unit/activeSessionConcurrency.test.ts.
//
// What this file proves:
//   * NC-8 — an old cached bundle entry (no `measurement` key at all) starts
//     a session that freezes the pre-Release-2 default, and the set it then
//     logs produces a setLog op byte-identical to a pre-upgrade recording (no
//     distanceM/durationS anywhere on the wire — still true post-O-13: both
//     are forbidden for `load_reps`, so `setLogFullRowOp` omits them). The
//     sessionExercise op is the one deliberate exception (O-13, §12.3):
//     `measurementProfile`/`loadBasis` are a FIXED key set that
//     `sessionExerciseFullRowOp` always emits regardless of profile (W-1
//     subsumption, MEDIUM-1) — this test asserts them present with the
//     frozen default's values, not absent;
//   * a genuinely pre-upgrade ActiveSessionDto already sitting in IndexedDB
//     (no `measurement` on its exercise, no `distanceM`/`durationS` on its
//     sets — written directly, bypassing every mutator) hydrates without
//     error, defaults correctly, and never loses or corrupts the existing
//     weightKg/reps values;
//   * the same normalization applies to a genuinely OLD/pre-upgrade
//     server-hydrated (cross-device adopt) payload, still tolerated exactly
//     like a pre-upgrade IndexedDB aggregate (NC-8-style tolerance);
//   * H-1 remediation (athletic-measurement-profiles-release-2-review.md
//     §5.1) — a LIVE server-hydrated payload now always carries
//     `measurement` (populated in `getActiveSession` from the slot's own
//     frozen `session_exercises` columns), and adopting it must PRESERVE
//     that exact profile rather than silently defaulting to
//     `load_reps`/`unspecified`;
//   * DB_VERSION is unchanged (2) — normalization is purely a read/write
//     sanitization, never a schema migration.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import type { ActiveSessionDto, TodayBundleExerciseEntryDto } from "@/sync/types";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";

const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

const EXERCISE_ID = newId();

// A pre-Release-2 bundle entry: the object literally has no `measurement`
// key, the way a service-worker- or IndexedDB-cached copy fetched before
// this feature shipped deserializes (H-10's tolerance rule).
function legacyBundleEntry(): TodayBundleExerciseEntryDto {
  return {
    prescriptionId: newId(),
    exerciseId: EXERCISE_ID,
    exerciseName: "Back Squat",
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
    // no `measurement` key at all
  };
}

function legacyStartInput() {
  return {
    blockId: newId(),
    templateId: newId(),
    templateName: "Upper A",
    weekIndex: 1,
    isDeload: false,
    exercises: [legacyBundleEntry()],
  };
}

async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload }));
}

async function reloadSession(): Promise<ActiveSessionDto | null> {
  const { getLocalActiveSession } = await import("@/sync/activeSession");
  return getLocalActiveSession();
}

// Writes a raw value straight into the `activeSession` store, bypassing
// every mutator (startSession, hydrateFromServer, commitSessionMutation) —
// exactly how a value that predates this feature would already sit in a
// real device's IndexedDB. `as unknown as ActiveSessionDto` is deliberate:
// the whole point is that this object does NOT satisfy the current,
// widened type.
async function writeRawActiveSession(raw: Record<string, unknown>): Promise<void> {
  const { getIdb, ACTIVE_SESSION_KEY } = await import("@/sync/db");
  const db = await getIdb();
  await db.put("activeSession", raw as unknown as ActiveSessionDto, ACTIVE_SESSION_KEY);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("DB_VERSION is unchanged by this feature (I-2 — schemaless stores, no migration)", () => {
  it("stays 2 (db.ts's own DB_VERSION isn't exported — see tests/unit/idbUpgrade.test.ts's identical note — so this reads it off a real opened connection instead)", async () => {
    const { getIdb } = await import("@/sync/db");
    const db = await getIdb();
    expect(db.version).toBe(2);
  });
});

describe("NC-8 — an old cached bundle entry starts a session and logs a set whose op equals a pre-upgrade recording", () => {
  it("freezes the load_reps/unspecified default and the set op carries no new keys", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    const started = await startSession(legacyStartInput());

    // The frozen default — never left `undefined`, never crashes.
    expect(started.exercises[0]?.measurement).toEqual({
      profile: "load_reps",
      loadBasis: "unspecified",
    });

    const reloaded = await reloadSession();
    expect(reloaded?.exercises[0]?.measurement).toEqual({
      profile: "load_reps",
      loadBasis: "unspecified",
    });

    const exerciseId = reloaded?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");
    await logSet({ sessionExerciseId: exerciseId, weightKg: 100, reps: 5, rir: 2 });

    const ops = await readOutbox();
    expect(ops.map((op) => op.entity)).toEqual(["workoutSession", "sessionExercise", "setLog"]);

    // O-13 (§12.3) — `sessionExerciseFullRowOp` ALWAYS emits
    // measurementProfile/loadBasis (a fixed key set, the one exception to
    // "profile-scoped"), so a legacy-bundle-started session's slot op still
    // carries them, with the frozen default's own values. The setLog op
    // stays a pre-upgrade recording: distanceM/durationS are forbidden for
    // `load_reps`, so `setLogFullRowOp` omits both, byte-identical to today.
    const sessionExerciseOp = ops.find((op) => op.entity === "sessionExercise");
    expect(sessionExerciseOp?.payload).toMatchObject({
      measurementProfile: "load_reps",
      loadBasis: "unspecified",
    });

    const setLogOp = ops.find((op) => op.entity === "setLog");
    expect(setLogOp?.payload).not.toHaveProperty("distanceM");
    expect(setLogOp?.payload).not.toHaveProperty("durationS");
    expect(setLogOp?.payload).toMatchObject({
      setNumber: 1,
      isWarmup: false,
      weightKg: 100,
      reps: 5,
      rir: 2,
    });
  });
});

describe("hydration normalization — a genuinely pre-upgrade ActiveSessionDto already in IndexedDB", () => {
  // The exact shape a device's IndexedDB held before this feature shipped:
  // no `measurement` on the exercise, no `distanceM`/`durationS` on the set.
  function legacyRawSession(sessionId: string, exerciseId: string, setId: string) {
    return {
      id: sessionId,
      blockId: null,
      templateId: null,
      templateName: "Upper A",
      weekIndex: null,
      isDeload: false,
      status: "in_progress",
      startedAt: new Date(0).toISOString(),
      clientId: null,
      notes: null,
      exercises: [
        {
          id: exerciseId,
          exerciseId: EXERCISE_ID,
          exerciseName: "Back Squat",
          position: 0,
          source: "template",
          prescription: null,
          skipped: false,
          notes: null,
          loadStepKg: 2.5,
          recommendation: null,
          // no `measurement` key
          sets: [
            {
              id: setId,
              setNumber: 1,
              isWarmup: false,
              weightKg: 102.5,
              reps: 5,
              rir: 1,
              // no `distanceM`/`durationS` keys
              loggedAt: new Date(0).toISOString(),
              notes: null,
            },
          ],
        },
      ],
    };
  }

  it("getLocalActiveSession hydrates it without error, defaulting measurement and distanceM/durationS, without touching weightKg/reps/rir", async () => {
    const sessionId = newId();
    const exerciseId = newId();
    const setId = newId();
    await writeRawActiveSession(legacyRawSession(sessionId, exerciseId, setId));

    const session = await reloadSession();
    expect(session?.id).toBe(sessionId);
    const exercise = session?.exercises[0];
    expect(exercise?.measurement).toEqual({ profile: "load_reps", loadBasis: "unspecified" });

    const set = exercise?.sets[0];
    expect(set?.distanceM).toBeNull();
    expect(set?.durationS).toBeNull();
    // The pre-existing values are untouched — corruption would be a
    // straight `weightKg`/`reps` mismatch here, not a thrown error.
    expect(set?.weightKg).toBe(102.5);
    expect(set?.reps).toBe(5);
    expect(set?.rir).toBe(1);
  });

  it("logging a further set on the normalized (self-healed) session works exactly as on a fresh one", async () => {
    const sessionId = newId();
    const exerciseId = newId();
    const setId = newId();
    await writeRawActiveSession(legacyRawSession(sessionId, exerciseId, setId));

    const { logSet } = await import("@/sync/activeSession");
    await logSet({ sessionExerciseId: exerciseId, weightKg: 105, reps: 4, rir: 0 });

    const session = await reloadSession();
    const exercise = session?.exercises[0];
    // Self-healing: once read-and-written-back through a mutator, the
    // aggregate now carries the fully-shaped fields going forward.
    expect(exercise?.measurement).toEqual({ profile: "load_reps", loadBasis: "unspecified" });
    expect(exercise?.sets).toHaveLength(2);
    expect(exercise?.sets[1]).toMatchObject({ weightKg: 105, reps: 4, rir: 0 });
    expect(exercise?.sets.every((s) => s.distanceM === null && s.durationS === null)).toBe(true);
  });
});

describe("cross-device adopt (hydrateFromServer) normalizes the same way", () => {
  it("a genuinely OLD/pre-upgrade server-hydrated payload (no `measurement` key at all) normalizes on adopt", async () => {
    const sessionId = newId();
    const exerciseId = newId();
    const setId = newId();
    // NOT what `/api/active-session` returns today (H-1 is fixed — see the
    // test below). This is what a pre-upgrade server, or a stale cached
    // response predating the H-1 fix, would have returned: the fixture is
    // deliberately shaped as OLD data, not as today's live contract.
    const remote = {
      id: sessionId,
      blockId: null,
      templateId: null,
      templateName: null,
      weekIndex: null,
      isDeload: false,
      status: "in_progress",
      startedAt: new Date(0).toISOString(),
      clientId: null,
      notes: null,
      exercises: [
        {
          id: exerciseId,
          exerciseId: EXERCISE_ID,
          exerciseName: "Back Squat",
          position: 0,
          source: "template",
          prescription: null,
          skipped: false,
          notes: null,
          loadStepKg: 2.5,
          recommendation: null,
          // no `measurement` key — the pre-H-1-fix (or pre-Release-2) shape.
          sets: [
            {
              id: setId,
              setNumber: 1,
              isWarmup: false,
              weightKg: 80,
              reps: 6,
              rir: null,
              distanceM: null,
              durationS: null,
              loggedAt: new Date(0).toISOString(),
              notes: null,
            },
          ],
        },
      ],
    } as unknown as ActiveSessionDto;
    expect("measurement" in remote.exercises[0]!).toBe(false);

    const { hydrateFromServer } = await import("@/sync/activeSession");
    await hydrateFromServer(remote);

    const adopted = await reloadSession();
    expect(adopted?.exercises[0]?.measurement).toEqual({
      profile: "load_reps",
      loadBasis: "unspecified",
    });
    expect(adopted?.exercises[0]?.sets[0]?.weightKg).toBe(80);
    expect(adopted?.exercises[0]?.sets[0]?.reps).toBe(6);
  });

  // H-1 remediation — a LIVE server response now always carries
  // `measurement` (getActiveSession populates it from the slot's own frozen
  // session_exercises columns). Adopting it must TRUST and preserve that
  // exact value, never silently default it to load_reps/unspecified the way
  // the old-data case above still (correctly) does.
  it('a live server-hydrated payload carrying `measurement` (e.g. profile "duration") adopts preserving that exact profile, not defaulting to load_reps', async () => {
    const sessionId = newId();
    const exerciseId = newId();
    const setId = newId();
    // Today's real live shape: `measurement` is present, non-optional, and
    // is not the load_reps/unspecified default — proving adopt trusts it
    // rather than routing it through the same fallback old data gets.
    const remote = {
      id: sessionId,
      blockId: null,
      templateId: null,
      templateName: null,
      weekIndex: null,
      isDeload: false,
      status: "in_progress",
      startedAt: new Date(0).toISOString(),
      clientId: null,
      notes: null,
      exercises: [
        {
          id: exerciseId,
          exerciseId: EXERCISE_ID,
          exerciseName: "Plank",
          position: 0,
          source: "template",
          prescription: null,
          skipped: false,
          notes: null,
          loadStepKg: null,
          recommendation: null,
          measurement: { profile: "duration", loadBasis: null },
          sets: [
            {
              id: setId,
              setNumber: 1,
              isWarmup: false,
              weightKg: null,
              reps: null,
              rir: null,
              distanceM: null,
              durationS: 45,
              loggedAt: new Date(0).toISOString(),
              notes: null,
            },
          ],
        },
      ],
    } as unknown as ActiveSessionDto;
    expect(remote.exercises[0]!.measurement).toEqual({ profile: "duration", loadBasis: null });

    const { hydrateFromServer } = await import("@/sync/activeSession");
    await hydrateFromServer(remote);

    const adopted = await reloadSession();
    // Preserved exactly — NOT defaulted to load_reps/unspecified.
    expect(adopted?.exercises[0]?.measurement).toEqual({ profile: "duration", loadBasis: null });
    expect(adopted?.exercises[0]?.sets[0]?.durationS).toBe(45);
    expect(adopted?.exercises[0]?.sets[0]?.weightKg).toBeNull();
    expect(adopted?.exercises[0]?.sets[0]?.reps).toBeNull();
  });
});

describe("addAdhocExercise falls back to the conservative default only when the caller supplies nothing", () => {
  it("an ad-hoc slot with no measurement argument at all defaults to load_reps/unspecified", async () => {
    const { addAdhocExercise, startSession } = await import("@/sync/activeSession");
    await startSession(legacyStartInput());

    const session = await addAdhocExercise(newId(), "Farmer's Carry");
    const adhoc = session.exercises.find((e) => e.source === "adhoc");
    expect(adhoc?.measurement).toEqual({ profile: "load_reps", loadBasis: "unspecified" });
  });
});

// H-2 remediation (athletic-measurement-profiles-release-2-review.md) — the
// caller (activeSessionStore.ts, ultimately AddAdhocExercise.tsx) now threads
// the exercise's REAL measurement profile/load basis through
// addAdhocExercise instead of it always freezing load_reps/unspecified. Every
// one of the five NEW profiles (all but load_reps itself, already covered by
// the legacy-default describe block above and NC-8) must be threaded through
// verbatim, both in the returned aggregate AND in the emitted sessionExercise
// outbox op — the op is what the server actually validates against the
// exercise's own frozen profile, so a bug here is exactly what previously
// made ad-hoc-adding any of these five profiles dead-letter
// measurement_profile_mismatch (H-2).
describe("H-2 — addAdhocExercise threads the caller's real measurement through, for every new profile", () => {
  const NEW_PROFILE_FIXTURES: {
    profile: Exclude<MeasurementProfile, "load_reps">;
    loadBasis: LoadBasis | null;
  }[] = [
    { profile: "reps", loadBasis: null },
    { profile: "load_distance", loadBasis: "unspecified" },
    { profile: "distance_time", loadBasis: null },
    { profile: "duration", loadBasis: null },
    { profile: "load_duration", loadBasis: "total" },
  ];

  for (const { profile, loadBasis } of NEW_PROFILE_FIXTURES) {
    it(`${profile}: the supplied measurement lands on the aggregate and the sessionExercise op, not the load_reps/unspecified default`, async () => {
      const { addAdhocExercise, startSession } = await import("@/sync/activeSession");
      await startSession(legacyStartInput());

      const exerciseId = newId();
      const measurement = { profile, loadBasis };
      const session = await addAdhocExercise(exerciseId, `H-2 ${profile}`, measurement);
      const adhoc = session.exercises.find((e) => e.source === "adhoc");
      expect(adhoc?.measurement).toEqual(measurement);
      // Never the old unconditional default — a mutation witness proving
      // this case is genuinely distinct from the fallback describe block
      // above.
      expect(adhoc?.measurement).not.toEqual({ profile: "load_reps", loadBasis: "unspecified" });

      const reloaded = await reloadSession();
      const reloadedAdhoc = reloaded?.exercises.find((e) => e.id === adhoc?.id);
      expect(reloadedAdhoc?.measurement).toEqual(measurement);

      const ops = await readOutbox();
      const sessionExerciseOps = ops.filter((op) => op.entity === "sessionExercise");
      const thisOp = sessionExerciseOps.find((op) => op.payload.id === adhoc?.id);
      expect(thisOp?.payload).toMatchObject({
        measurementProfile: profile,
        loadBasis,
      });
    });
  }
});
