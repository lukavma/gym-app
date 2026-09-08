import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise, updateExercise } from "@/server/exercises/service";
import {
  applySyncBatch,
  SESSION_EXERCISE_FIELDS,
  SET_LOG_FIELDS,
  setLogPreCheck,
} from "@/server/sync/service";
import { getHistorySessionDetail } from "@/server/history/service";
import { newId } from "@/domain/ids/uuidv7";
import type { SyncOpEnvelope } from "@/domain/sync/schema";
import {
  MEASUREMENT_PROFILES,
  dimensionsOf,
  type MeasurementProfile,
} from "@/domain/measurement/profile";

// athletic-measurement-profiles-architecture-evaluation.md §12.2/§12.3
// (payload schemas, reject vocabulary), §10.1/§10.2 (server-side profile
// derivation), §13.1 (effective-row determinism), I-8, I-14, NC-1 (R1's
// server-keys half), NC-2, NC-3, NC-4, NC-14, A-18.

// Mirrors src/server/sync/service.ts's own `isPostgresErrorCode` — not
// exported from there, and only needed here to inspect the raw error shape
// of a deliberate DB-layer probe (a raw insert bypassing the service).
function postgresErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if ("code" in err && typeof err.code === "string") return err.code;
  return "cause" in err ? postgresErrorCode((err as { cause?: unknown }).cause) : undefined;
}

async function insertTestUser(db: AppDb, email = "athlete@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const BASE_EXERCISE_INPUT = {
  equipment: "barbell" as const,
  mechanics: "compound" as const,
  laterality: "bilateral" as const,
  loadStepKg: 2.5,
  contributions: [{ muscleGroupId: "quads" as const, role: "primary" as const, weight: 1 }],
};

async function createProfiledExercise(
  db: AppDb,
  userId: string,
  name: string,
  measurementProfile: MeasurementProfile,
) {
  return createExercise(db, userId, { ...BASE_EXERCISE_INPUT, name, measurementProfile });
}

async function createInProgressSession(db: AppDb, userId: string): Promise<string> {
  const sessionId = newId();
  const result = await applySyncBatch(db, userId, [
    {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, startedAt: new Date().toISOString() },
    },
  ]);
  if (result.rejected.length > 0) throw new Error("expected session create to apply");
  return sessionId;
}

async function createAdhocSlot(
  db: AppDb,
  userId: string,
  sessionId: string,
  exerciseId: string,
  position = 0,
  extra: Record<string, unknown> = {},
) {
  const sessionExerciseId = newId();
  const result = await applySyncBatch(db, userId, [
    {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: {
        id: sessionExerciseId,
        sessionId,
        exerciseId,
        position,
        source: "adhoc",
        ...extra,
      },
    },
  ]);
  return { sessionExerciseId, result };
}

describe("NC-1 — server supersession field-key lists (R1, server keys)", () => {
  const EXPECTED_SESSION_EXERCISE_FIELDS = [
    "sessionId",
    "exerciseId",
    "position",
    "source",
    "prescription",
    "measurementProfile",
    "loadBasis",
    "skipped",
    "notes",
  ].sort();
  const EXPECTED_SET_LOG_FIELDS = [
    "sessionExerciseId",
    "setNumber",
    "isWarmup",
    "weightKg",
    "reps",
    "rir",
    "distanceM",
    "durationS",
    "loggedAt",
    "notes",
  ].sort();

  it("SESSION_EXERCISE_FIELDS is exactly the profile-independent keys plus measurementProfile/loadBasis", () => {
    expect([...SESSION_EXERCISE_FIELDS].sort()).toEqual(EXPECTED_SESSION_EXERCISE_FIELDS);
  });

  it("SET_LOG_FIELDS is exactly the profile-independent keys plus distanceM/durationS", () => {
    expect([...SET_LOG_FIELDS].sort()).toEqual(EXPECTED_SET_LOG_FIELDS);
  });

  it("mutation witness — an expected list missing a field fails the equality (proves exact-equality, not a subset check)", () => {
    const shortSessionExerciseFields = EXPECTED_SESSION_EXERCISE_FIELDS.filter(
      (f) => f !== "loadBasis",
    );
    expect(() => {
      expect([...SESSION_EXERCISE_FIELDS].sort()).toEqual(shortSessionExerciseFields);
    }).toThrow();

    const shortSetLogFields = EXPECTED_SET_LOG_FIELDS.filter((f) => f !== "durationS");
    expect(() => {
      expect([...SET_LOG_FIELDS].sort()).toEqual(shortSetLogFields);
    }).toThrow();
  });
});

describe("measurement-profile-aware sync (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
  });

  it("NC-2 — a nine-key (pre-upgrade-shaped) create on a load_reps slot yields a row identical to today's fixture, plus the two new nulls", async () => {
    const exercise = await createProfiledExercise(db, userId, "Back Squat", "load_reps");
    const sessionId = await createInProgressSession(db, userId);
    const { sessionExerciseId, result: slotResult } = await createAdhocSlot(
      db,
      userId,
      sessionId,
      exercise.id,
    );
    expect(slotResult.rejected).toEqual([]);

    const setId = newId();
    const loggedAt = new Date().toISOString();
    const result = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setId,
          sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 100,
          reps: 5,
          rir: 2,
          loggedAt,
          notes: null,
        },
      },
    ]);
    expect(result.rejected).toEqual([]);

    const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
    expect(row).toMatchObject({
      sessionExerciseId,
      setNumber: 1,
      isWarmup: false,
      weightKg: 100,
      reps: 5,
      rir: 2,
      notes: null,
      measurementProfile: "load_reps",
      distanceM: null,
      durationS: null,
    });
  });

  it("NC-3 — a nine-key create on a hand-built load_distance slot rejects invalid_measurement from the service, and the batch's other ops still apply", async () => {
    const distanceExercise = await createProfiledExercise(db, userId, "Sled Push", "load_distance");
    const repsProfileExercise = await createProfiledExercise(
      db,
      userId,
      "Bench Press",
      "load_reps",
    );
    const sessionId = await createInProgressSession(db, userId);

    const distanceSlot = await createAdhocSlot(db, userId, sessionId, distanceExercise.id, 0);
    const repsSlot = await createAdhocSlot(db, userId, sessionId, repsProfileExercise.id, 1);
    expect(distanceSlot.result.rejected).toEqual([]);
    expect(repsSlot.result.rejected).toEqual([]);

    const loggedAt = new Date().toISOString();
    const badOpId = newId();
    const goodOpId = newId();
    const result = await applySyncBatch(db, userId, [
      {
        opId: badOpId,
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: distanceSlot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 100,
          reps: 5,
          rir: null,
          loggedAt,
          notes: null,
        },
      },
      {
        opId: goodOpId,
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: repsSlot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 100,
          reps: 5,
          rir: null,
          loggedAt,
          notes: null,
        },
      },
    ]);

    expect(result.rejected).toEqual([
      { opId: badOpId, entity: "setLog", reason: "invalid_measurement" },
    ]);
    expect(result.applied).toEqual([goodOpId]);

    const badRows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, distanceSlot.sessionExerciseId));
    expect(badRows).toHaveLength(0);

    // Dual-path assertion (NC-3's point): with the service's own derivation
    // effectively absent — a raw write that lets the column fall back to its
    // `NOT NULL DEFAULT 'load_reps'` instead of looking up the parent slot's
    // real profile, exactly what a regressed implementation without §10.1's
    // derivation would do — the SAME nine-key shape hits the composite
    // mirror FK instead, as 23503, because the parent slot's real profile
    // ('load_distance') never matches the row's ('load_reps').
    let dbError: unknown;
    try {
      await db.insert(setLogs).values({
        id: newId(),
        sessionExerciseId: distanceSlot.sessionExerciseId,
        setNumber: 1,
        isWarmup: false,
        weightKg: 100,
        reps: 5,
        loggedAt: new Date(),
        // measurementProfile deliberately omitted -> the column default.
      });
    } catch (err) {
      dbError = err;
    }
    expect(postgresErrorCode(dbError)).toBe("23503");
  });

  describe("NC-4 — profile shape matrix (service layer)", () => {
    const VALID_FILL: Record<MeasurementProfile, Record<string, number>> = {
      load_reps: { weightKg: 100, reps: 5 },
      reps: { reps: 10 },
      load_distance: { weightKg: 20, distanceM: 20 },
      distance_time: { distanceM: 400, durationS: 90 },
      duration: { durationS: 60 },
      load_duration: { weightKg: 20, durationS: 30 },
    };
    const FIELD_KEY = {
      weight: "weightKg",
      reps: "reps",
      rir: "rir",
      distance: "distanceM",
      duration: "durationS",
    } as const;
    const SAMPLE_VALUE: Record<string, number> = {
      weightKg: 50,
      reps: 5,
      rir: 3,
      distanceM: 10,
      durationS: 30,
    };

    for (const profile of MEASUREMENT_PROFILES) {
      const dims = dimensionsOf(profile);
      const fill = VALID_FILL[profile];

      for (const dim of ["weight", "reps", "rir", "distance", "duration"] as const) {
        const field = FIELD_KEY[dim];

        if (dims[dim] === "forbidden") {
          it(`${profile}: a non-null ${field} (forbidden) is rejected invalid_measurement`, async () => {
            const exercise = await createProfiledExercise(
              db,
              userId,
              `${profile}-${field}-forbidden`,
              profile,
            );
            const sessionId = await createInProgressSession(db, userId);
            const slot = await createAdhocSlot(db, userId, sessionId, exercise.id);
            expect(slot.result.rejected).toEqual([]);

            const result = await applySyncBatch(db, userId, [
              {
                opId: newId(),
                entity: "setLog",
                operation: "upsert",
                payload: {
                  id: newId(),
                  sessionExerciseId: slot.sessionExerciseId,
                  setNumber: 1,
                  isWarmup: false,
                  loggedAt: new Date().toISOString(),
                  ...fill,
                  [field]: SAMPLE_VALUE[field],
                },
              },
            ]);
            expect(result.rejected[0]?.reason).toBe("invalid_measurement");
          });
        }

        if (dims[dim] === "required") {
          it(`${profile}: an explicit null ${field} (required) is rejected invalid_measurement`, async () => {
            const exercise = await createProfiledExercise(
              db,
              userId,
              `${profile}-${field}-null`,
              profile,
            );
            const sessionId = await createInProgressSession(db, userId);
            const slot = await createAdhocSlot(db, userId, sessionId, exercise.id);
            expect(slot.result.rejected).toEqual([]);

            const result = await applySyncBatch(db, userId, [
              {
                opId: newId(),
                entity: "setLog",
                operation: "upsert",
                payload: {
                  id: newId(),
                  sessionExerciseId: slot.sessionExerciseId,
                  setNumber: 1,
                  isWarmup: false,
                  loggedAt: new Date().toISOString(),
                  ...fill,
                  [field]: null,
                },
              },
            ]);
            expect(result.rejected[0]?.reason).toBe("invalid_measurement");
          });
        }
      }
    }
  });

  describe("NC-4 — profile shape (DB layer, service check bypassed)", () => {
    it("a raw insert with a forbidden field non-null fails ck_set_logs_profile_shape (23514)", async () => {
      const exercise = await createProfiledExercise(db, userId, "Sprint 100m", "reps");
      const sessionId = await createInProgressSession(db, userId);
      const slot = await createAdhocSlot(db, userId, sessionId, exercise.id);
      expect(slot.result.rejected).toEqual([]);

      let dbError: unknown;
      try {
        await db.insert(setLogs).values({
          id: newId(),
          sessionExerciseId: slot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 50, // forbidden for `reps`
          reps: 10,
          measurementProfile: "reps",
          loggedAt: new Date(),
        });
      } catch (err) {
        dbError = err;
      }
      expect(postgresErrorCode(dbError)).toBe("23514");
    });

    it("a raw insert with a required field null fails ck_set_logs_profile_shape (23514)", async () => {
      const exercise = await createProfiledExercise(db, userId, "Back Squat DB Probe", "load_reps");
      const sessionId = await createInProgressSession(db, userId);
      const slot = await createAdhocSlot(db, userId, sessionId, exercise.id);
      expect(slot.result.rejected).toEqual([]);

      let dbError: unknown;
      try {
        await db.insert(setLogs).values({
          id: newId(),
          sessionExerciseId: slot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 100,
          reps: null, // required for load_reps
          measurementProfile: "load_reps",
          loggedAt: new Date(),
        });
      } catch (err) {
        dbError = err;
      }
      expect(postgresErrorCode(dbError)).toBe("23514");
    });
  });

  // Independent audit finding: every test above either goes through the
  // REAL, untouched service (where `isEffectiveSetRowValid` always
  // intercepts a shape-invalid row before any DB write is attempted, so the
  // catch block's `23514`/`22003` -> `invalid_measurement` mapping is never
  // reached) or bypasses the service entirely with a raw `db.insert`/
  // `db.update` (the "DB layer" describe block above — proving the
  // constraint exists, never that the service's own catch block maps its
  // SQLSTATE correctly). Deleting the `23514`/`22003` branch in
  // `applySetLogUpsert`'s catch block left every test above passing
  // unchanged. This block closes that gap: it stubs the proactive check to
  // report a genuinely shape-invalid row as valid, so the row actually
  // reaches `applySyncBatch`'s real `db.insert`, and asserts the resulting
  // SQLSTATE is mapped by the real catch block, not by a re-implementation
  // of it.
  //
  // `setLogPreCheck` (exported from src/server/sync/service.ts) exists
  // purely as this test seam: `applySetLogUpsert`'s two call sites read
  // `setLogPreCheck.isEffectiveSetRowValid` rather than calling the bare
  // function, because `vi.spyOn` on a plain named export does not intercept
  // a module's own internal calls to it (verified empirically against this
  // project's Vitest/esbuild setup — the call binds directly to the local
  // declaration, never through the export object). Routing the call through
  // a mutable holder object makes the self-mock observable without changing
  // `isEffectiveSetRowValid`'s own body, name, or signature.
  describe("NC-4 — catch-block regression guard (real DB round-trip via applySyncBatch)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("a load_reps create with reps:null, past a stubbed-valid pre-check, reaches the real DB and ck_set_logs_profile_shape's 23514 is mapped to invalid_measurement by the catch block", async () => {
      const exercise = await createProfiledExercise(
        db,
        userId,
        "Deadlift CHECK Probe",
        "load_reps",
      );
      const sessionId = await createInProgressSession(db, userId);
      const slot = await createAdhocSlot(db, userId, sessionId, exercise.id);
      expect(slot.result.rejected).toEqual([]);

      vi.spyOn(setLogPreCheck, "isEffectiveSetRowValid").mockReturnValue(true);

      const opId = newId();
      const result = await applySyncBatch(db, userId, [
        {
          opId,
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: slot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 100,
            reps: null, // required for load_reps — the stubbed check no longer catches this
            loggedAt: new Date().toISOString(),
          },
        },
      ]);

      expect(result.applied).toEqual([]);
      expect(result.rejected).toEqual([{ opId, entity: "setLog", reason: "invalid_measurement" }]);

      // The stubbed check must not have let a shape-invalid row land.
      const rows = await db
        .select()
        .from(setLogs)
        .where(eq(setLogs.sessionExerciseId, slot.sessionExerciseId));
      expect(rows).toHaveLength(0);
    });

    // The `22003` half of the catch block's mapping is NOT exercised this
    // way, deliberately: `setLogUpsertPayloadSchema`'s own Zod bounds
    // (weightKg max 9999.99, distanceM max 99999.99, durationS max 86400 —
    // src/domain/sync/schema.ts) are already set exactly at each numeric
    // column's storage ceiling (precision 6/7/7, scale 2 —
    // src/db/schema/setLogs.ts). No value that survives
    // `setLogUpsertPayloadSchema.safeParse` can therefore ever overflow a
    // column, regardless of what internal checks are stubbed out — `22003`
    // is structurally unreachable via any real parsed payload. The "DB
    // layer" describe block above's raw `db.insert` probes (which go
    // beneath Zod entirely) are the correct — and only possible — technique
    // for that SQLSTATE; they are not a gap.
  });

  describe("NC-4 — numeric boundary rows", () => {
    it("accepts the exact ceiling for weightKg/distanceM/durationS via the normal sync path", async () => {
      const loadReps = await createProfiledExercise(db, userId, "Max Squat", "load_reps");
      const distanceTime = await createProfiledExercise(db, userId, "Ultra Row", "distance_time");
      const sessionId = await createInProgressSession(db, userId);

      const loadRepsSlot = await createAdhocSlot(db, userId, sessionId, loadReps.id, 0);
      const distanceTimeSlot = await createAdhocSlot(db, userId, sessionId, distanceTime.id, 1);
      expect(loadRepsSlot.result.rejected).toEqual([]);
      expect(distanceTimeSlot.result.rejected).toEqual([]);

      const loggedAt = new Date().toISOString();
      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: loadRepsSlot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 9999.99,
            reps: 5,
            loggedAt,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: distanceTimeSlot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            distanceM: 99999.99,
            durationS: 86400,
            loggedAt,
          },
        },
      ]);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(2);
    });

    it("rejects ceiling+0.01 when injected directly at the DB layer, bypassing Zod's own max (which already refuses it upstream in the normal sync path)", async () => {
      const distanceTime = await createProfiledExercise(db, userId, "Ultra Row 2", "distance_time");
      const loadReps = await createProfiledExercise(db, userId, "Max Squat 2", "load_reps");
      const sessionId = await createInProgressSession(db, userId);
      const distanceTimeSlot = await createAdhocSlot(db, userId, sessionId, distanceTime.id, 0);
      const loadRepsSlot = await createAdhocSlot(db, userId, sessionId, loadReps.id, 1);
      expect(distanceTimeSlot.result.rejected).toEqual([]);
      expect(loadRepsSlot.result.rejected).toEqual([]);

      let distanceError: unknown;
      try {
        await db.insert(setLogs).values({
          id: newId(),
          sessionExerciseId: distanceTimeSlot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          distanceM: 100000.0,
          durationS: 100,
          measurementProfile: "distance_time",
          loggedAt: new Date(),
        });
      } catch (err) {
        distanceError = err;
      }
      expect(postgresErrorCode(distanceError)).toBe("22003");

      let durationError: unknown;
      try {
        await db.insert(setLogs).values({
          id: newId(),
          sessionExerciseId: distanceTimeSlot.sessionExerciseId,
          setNumber: 2,
          isWarmup: false,
          distanceM: 100,
          durationS: 86400.01,
          measurementProfile: "distance_time",
          loggedAt: new Date(),
        });
      } catch (err) {
        durationError = err;
      }
      expect(postgresErrorCode(durationError)).toBe("23514");

      let weightError: unknown;
      try {
        await db.insert(setLogs).values({
          id: newId(),
          sessionExerciseId: loadRepsSlot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 10000.0,
          reps: 5,
          measurementProfile: "load_reps",
          loggedAt: new Date(),
        });
      } catch (err) {
        weightError = err;
      }
      expect(postgresErrorCode(weightError)).toBe("22003");
    });

    it("rejects a value that rounds into overflow when injected directly at the DB layer, below the Zod layer (9999.995 on weight_kg)", async () => {
      const loadReps = await createProfiledExercise(db, userId, "Max Squat 3", "load_reps");
      const sessionId = await createInProgressSession(db, userId);
      const slot = await createAdhocSlot(db, userId, sessionId, loadReps.id);
      expect(slot.result.rejected).toEqual([]);

      let dbError: unknown;
      try {
        await db.insert(setLogs).values({
          id: newId(),
          sessionExerciseId: slot.sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 9999.995,
          reps: 5,
          measurementProfile: "load_reps",
          loggedAt: new Date(),
        });
      } catch (err) {
        dbError = err;
      }
      expect(postgresErrorCode(dbError)).toBe("22003");
    });
  });

  // O-13 (§12.3) — R2's client-emission half of NC-6, extending the
  // reconnect-idempotence pattern `sync.integration.test.ts:517` already
  // established for `load_reps` ("submitting a complete multi-op reconnect
  // batch three times converges with zero rejections and byte-identical
  // rows every time") to a batch of `distance_time`/`load_distance` setLog
  // ops — the profile-scoped shapes a real client's outbox resend
  // (`flushOutbox`, "resends the whole pending outbox unchanged when a
  // reply is lost") would actually replay.
  describe("NC-6 — full reconnect batch with distance/duration sets replayed three times", () => {
    it("zero rejections and byte-identical rows across three submissions of the same batch", async () => {
      const distanceTime = await createProfiledExercise(
        db,
        userId,
        "Ultra Row NC6",
        "distance_time",
      );
      const loadDistance = await createProfiledExercise(
        db,
        userId,
        "Sled Push NC6",
        "load_distance",
      );
      const sessionId = await createInProgressSession(db, userId);
      const distanceTimeSlot = await createAdhocSlot(db, userId, sessionId, distanceTime.id, 0, {
        measurementProfile: "distance_time",
      });
      const loadDistanceSlot = await createAdhocSlot(db, userId, sessionId, loadDistance.id, 1, {
        measurementProfile: "load_distance",
        loadBasis: "unspecified",
      });
      expect(distanceTimeSlot.result.rejected).toEqual([]);
      expect(loadDistanceSlot.result.rejected).toEqual([]);

      const loggedAt = new Date().toISOString();
      const setIds = [newId(), newId(), newId(), newId()];
      // Every op here is deliberately the FULL profile-scoped row a real
      // client's `setLogFullRowOp`/renumber-upsert emitter would send for
      // these two profiles — `distance_time` (distanceM + durationS, no
      // weightKg/reps/rir) and `load_distance` (weightKg + distanceM, no
      // reps/rir/durationS) — not a hand-minimized fixture.
      const ops: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[0]!,
            sessionExerciseId: distanceTimeSlot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            distanceM: 400,
            durationS: 90,
            loggedAt,
            notes: null,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[1]!,
            sessionExerciseId: distanceTimeSlot.sessionExerciseId,
            setNumber: 2,
            isWarmup: false,
            distanceM: 400,
            durationS: 88.5,
            loggedAt,
            notes: null,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[2]!,
            sessionExerciseId: loadDistanceSlot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 40,
            distanceM: 20,
            loggedAt,
            notes: null,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[3]!,
            sessionExerciseId: loadDistanceSlot.sessionExerciseId,
            setNumber: 2,
            isWarmup: true,
            weightKg: 20,
            distanceM: 10,
            loggedAt,
            notes: "easy warm-up round",
          },
        },
      ];

      async function snapshotSetRows() {
        return db
          .select({
            id: setLogs.id,
            sessionExerciseId: setLogs.sessionExerciseId,
            setNumber: setLogs.setNumber,
            isWarmup: setLogs.isWarmup,
            weightKg: setLogs.weightKg,
            reps: setLogs.reps,
            rir: setLogs.rir,
            distanceM: setLogs.distanceM,
            durationS: setLogs.durationS,
            notes: setLogs.notes,
          })
          .from(setLogs)
          .where(eq(setLogs.sessionExerciseId, distanceTimeSlot.sessionExerciseId))
          .orderBy(setLogs.setNumber);
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await applySyncBatch(db, userId, ops);
        expect(result.rejected).toEqual([]);
        expect(result.applied.sort()).toEqual(ops.map((op) => op.opId).sort());
      }

      const distanceTimeRows = await snapshotSetRows();
      expect(distanceTimeRows).toMatchObject([
        { setNumber: 1, weightKg: null, reps: null, rir: null, distanceM: 400, durationS: 90 },
        { setNumber: 2, weightKg: null, reps: null, rir: null, distanceM: 400, durationS: 88.5 },
      ]);

      const loadDistanceRows = await db
        .select()
        .from(setLogs)
        .where(eq(setLogs.sessionExerciseId, loadDistanceSlot.sessionExerciseId))
        .orderBy(setLogs.setNumber);
      expect(
        loadDistanceRows.map((r) => [
          r.setNumber,
          r.isWarmup,
          r.weightKg,
          r.distanceM,
          r.reps,
          r.durationS,
        ]),
      ).toEqual([
        [1, false, 40, 20, null, null],
        [2, true, 20, 10, null, null],
      ]);

      // Exactly one row per set id — replaying the identical batch three
      // times converged, it did not accumulate duplicates.
      const allSetRows = [...(await snapshotSetRows()), ...loadDistanceRows];
      expect(new Set(allSetRows.map((r) => r.id)).size).toBe(setIds.length);
    });
  });

  describe("NC-14 — session-exercise insert derivation vs. an exercise edited after the client froze its bundle", () => {
    it("(a) a load-basis change after freeze applies with the LIVE basis, and set ops on the slot apply normally", async () => {
      const exercise = await createProfiledExercise(db, userId, "Farmer's Carry", "load_distance");
      expect(exercise.loadBasis).toBe("unspecified");

      // The basis is edited (on another device/tab) after the bundle was
      // cached — a permitted, ordinary event (§10.3), not a disagreement.
      const updated = await updateExercise(db, userId, exercise.id, { loadBasis: "per_hand" });
      expect(updated.loadBasis).toBe("per_hand");

      // Mutation witness: the payload's stale `loadBasis` genuinely differs
      // from the live value, so this scenario is not vacuous — a service
      // that (incorrectly) compared `loadBasis` the same way it compares
      // `measurementProfile` would reject this exact op as a mismatch
      // instead of applying it.
      const staleLoadBasis = "unspecified";
      expect(staleLoadBasis).not.toBe(updated.loadBasis);

      const sessionId = await createInProgressSession(db, userId);
      const sessionExerciseId = newId();
      const setId = newId();

      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId: exercise.id,
            position: 0,
            source: "adhoc",
            measurementProfile: "load_distance", // still correct, unchanged
            loadBasis: staleLoadBasis, // stale — must be ignored (I-14)
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 40,
            distanceM: 20,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(2);

      const [slot] = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId));
      expect(slot?.loadBasis).toBe("per_hand");
      expect(slot?.measurementProfile).toBe("load_distance");
    });

    it("(b) a profile change (only possible while unreferenced) rejects measurement_profile_mismatch, and its set ops reject not_found — nothing written", async () => {
      const exercise = await createProfiledExercise(db, userId, "Box Jump Candidate", "load_reps");
      await updateExercise(db, userId, exercise.id, { measurementProfile: "reps" });

      const sessionId = await createInProgressSession(db, userId);
      const sessionExerciseId = newId();
      const setId = newId();
      const slotOpId = newId();
      const setOpId = newId();

      const result = await applySyncBatch(db, userId, [
        {
          opId: slotOpId,
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId: exercise.id,
            position: 0,
            source: "adhoc",
            measurementProfile: "load_reps", // stale — the exercise is now `reps`
          },
        },
        {
          opId: setOpId,
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 100,
            reps: 5,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(result.applied).toEqual([]);
      expect(result.rejected).toEqual([
        { opId: slotOpId, entity: "sessionExercise", reason: "measurement_profile_mismatch" },
        { opId: setOpId, entity: "setLog", reason: "not_found" },
      ]);

      const slotRows = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId));
      expect(slotRows).toHaveLength(0);
      const setRows = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      expect(setRows).toHaveLength(0);
    });

    it("(c) an insert without either key derives both silently", async () => {
      const exercise = await createProfiledExercise(db, userId, "Plain Bench", "load_reps");
      const sessionId = await createInProgressSession(db, userId);
      const sessionExerciseId = newId();

      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId: exercise.id,
            position: 0,
            source: "adhoc",
          },
        },
      ]);
      expect(result.rejected).toEqual([]);

      const [slot] = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId));
      expect(slot?.measurementProfile).toBe("load_reps");
      expect(slot?.loadBasis).toBe("unspecified");
    });
  });

  describe("A-18 — sync sessionExercise/setLog acceptance-side rules", () => {
    it("a foreign or missing exerciseId rejects invalid_reference, with no row written", async () => {
      const sessionId = await createInProgressSession(db, userId);
      const sessionExerciseId = newId();
      const foreignExerciseId = newId();
      const opId = newId();

      const result = await applySyncBatch(db, userId, [
        {
          opId,
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId: foreignExerciseId,
            position: 0,
            source: "adhoc",
          },
        },
      ]);
      expect(result.rejected).toEqual([
        { opId, entity: "sessionExercise", reason: "invalid_reference" },
      ]);

      const rows = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId));
      expect(rows).toHaveLength(0);
    });

    it("a duration create without weightKg/reps applies", async () => {
      const plank = await createProfiledExercise(db, userId, "Plank", "duration");
      const sessionId = await createInProgressSession(db, userId);
      const slot = await createAdhocSlot(db, userId, sessionId, plank.id);
      expect(slot.result.rejected).toEqual([]);

      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: slot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            durationS: 60,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(result.rejected).toEqual([]);
    });

    it("a load_reps create without reps rejects missing_required_fields", async () => {
      const squat = await createProfiledExercise(db, userId, "Back Squat A18", "load_reps");
      const sessionId = await createInProgressSession(db, userId);
      const slot = await createAdhocSlot(db, userId, sessionId, squat.id);
      expect(slot.result.rejected).toEqual([]);

      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: slot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 100,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(result.rejected[0]?.reason).toBe("missing_required_fields");
    });

    it("both new reject reasons are distinguishable, side by side, in one batch's rejected array", async () => {
      const staleProfileExercise = await createProfiledExercise(
        db,
        userId,
        "Box Jump Candidate 2",
        "load_reps",
      );
      await updateExercise(db, userId, staleProfileExercise.id, { measurementProfile: "reps" });
      const validExercise = await createProfiledExercise(
        db,
        userId,
        "Bench Press A18",
        "load_reps",
      );

      const sessionId = await createInProgressSession(db, userId);
      const mismatchSlotId = newId();
      const validSlot = await createAdhocSlot(db, userId, sessionId, validExercise.id, 1);
      expect(validSlot.result.rejected).toEqual([]);

      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: mismatchSlotId,
            sessionId,
            exerciseId: staleProfileExercise.id,
            position: 0,
            source: "adhoc",
            measurementProfile: "load_reps",
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: validSlot.sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 100,
            reps: null,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      const reasons = result.rejected.map((r) => r.reason).sort();
      expect(reasons).toEqual(["invalid_measurement", "measurement_profile_mismatch"]);
    });
  });

  // A-13 — history read/correct/delete on a load_distance slot, entirely
  // through direct sync-batch calls (bypassing the client). The renumbering
  // ops below are still hand-built rather than via `buildSetDeletionOps`
  // (src/domain/sync/setDeletionOps.ts) purely to keep this describe block's
  // existing fixtures independent of the client emitter; O-13 (§12.3) has
  // since been implemented — `buildSetDeletionOps`'s renumber upserts and
  // `setLogFullRowOp` now build exactly this profile-scoped shape, covered
  // directly by tests/unit/setDeletion.test.ts and
  // tests/unit/sync/setLogEmission.test.ts. What's asserted here is that the
  // SERVER accepts and stores a profile-scoped full row correctly when given
  // one — a property those client-side unit tests cannot exercise, since
  // they don't touch a real database.
  describe("A-13 — history read/correct/delete on a load_distance slot", () => {
    it("reads, corrects and deletes-with-renumbering, preserving distanceM AND durationS on the survivors, in ascending order", async () => {
      const exercise = await createProfiledExercise(db, userId, "Sled Push A13", "load_distance");
      const sessionId = await createInProgressSession(db, userId);
      const { sessionExerciseId, result: slotResult } = await createAdhocSlot(
        db,
        userId,
        sessionId,
        exercise.id,
      );
      expect(slotResult.rejected).toEqual([]);

      const loggedAt = new Date().toISOString();
      const setIds = [newId(), newId(), newId()];
      // `load_distance`'s `durationS` is optional (§6.2), not forbidden —
      // populated here (unlike the rest of this describe block's other
      // cases) specifically so this test can prove renumbering preserves
      // BOTH distance-bearing fields, not only `distanceM`.
      const rounds = [
        { weightKg: 25, distanceM: 20, durationS: 12 },
        { weightKg: 27, distanceM: 30, durationS: 15 },
        { weightKg: 29, distanceM: 40, durationS: 18 },
      ];
      const createResult = await applySyncBatch(
        db,
        userId,
        rounds.map((round, i) => ({
          opId: newId(),
          entity: "setLog" as const,
          operation: "upsert" as const,
          payload: {
            id: setIds[i]!,
            sessionExerciseId,
            setNumber: i + 1,
            isWarmup: false,
            weightKg: round.weightKg,
            distanceM: round.distanceM,
            durationS: round.durationS,
            loggedAt,
          },
        })),
      );
      expect(createResult.rejected).toEqual([]);

      // Read (before any correction) — the parent slot's frozen measurement
      // and the profile-scoped fields the shape CHECK guarantees (`reps`
      // null for `load_distance`).
      const complete1 = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, status: "completed", completedAt: new Date().toISOString() },
        },
      ]);
      expect(complete1.rejected).toEqual([]);

      let detail = await getHistorySessionDetail(db, userId, sessionId);
      expect(detail?.exercises).toHaveLength(1);
      let exerciseDetail = detail!.exercises[0]!;
      expect(exerciseDetail.measurement).toEqual({
        profile: "load_distance",
        loadBasis: "unspecified",
      });
      expect(
        exerciseDetail.sets.map((s) => [s.setNumber, s.weightKg, s.distanceM, s.durationS, s.reps]),
      ).toEqual([
        [1, 25, 20, 12, null],
        [2, 27, 30, 15, null],
        [3, 29, 40, 18, null],
      ]);

      // Correct — a partial upsert (distanceM only), the same shape
      // `correctHistorySet` sends, applied directly through the sync batch.
      const correctResult = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: setIds[1]!, sessionExerciseId, distanceM: 35 },
        },
      ]);
      expect(correctResult.rejected).toEqual([]);

      detail = await getHistorySessionDetail(db, userId, sessionId);
      exerciseDetail = detail!.exercises[0]!;
      expect(exerciseDetail.sets.find((s) => s.id === setIds[1])?.distanceM).toBe(35);
      // The correction touched only distanceM — durationS is untouched.
      expect(exerciseDetail.sets.find((s) => s.id === setIds[1])?.durationS).toBe(15);

      // Delete the FIRST round and hand-build the renumbering upserts a
      // profile-aware client emitter would send — full profile-scoped rows
      // (distanceM AND durationS included, reps omitted) for each survivor,
      // ascending order (the same ordering `buildSetDeletionOps` uses and
      // `uq_set_number`'s per-op-commit check requires).
      const deleteAndRenumber = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "delete",
          payload: { id: setIds[0]! },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[1]!,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 27,
            distanceM: 35,
            durationS: 15,
            loggedAt,
            notes: null,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[2]!,
            sessionExerciseId,
            setNumber: 2,
            isWarmup: false,
            weightKg: 29,
            distanceM: 40,
            durationS: 18,
            loggedAt,
            notes: null,
          },
        },
      ]);
      expect(deleteAndRenumber.rejected).toEqual([]);

      detail = await getHistorySessionDetail(db, userId, sessionId);
      exerciseDetail = detail!.exercises[0]!;
      // The deleted round is gone; the survivors are contiguously
      // renumbered in ASCENDING order and both `distanceM` (including the
      // corrected 35, not the original 30, and not the deleted round's 20)
      // AND `durationS` survived intact (I-13/H-12: nothing here was
      // fabricated or dropped) — A-13's binding assertion.
      expect(
        exerciseDetail.sets.map((s) => [s.setNumber, s.id, s.weightKg, s.distanceM, s.durationS]),
      ).toEqual([
        [1, setIds[1], 27, 35, 15],
        [2, setIds[2], 29, 40, 18],
      ]);
      expect(exerciseDetail.sets.every((s) => s.reps === null)).toBe(true);
      // Ascending order, explicitly: each survivor's setNumber, distanceM
      // and durationS all increase together across the renumbered list.
      for (let i = 1; i < exerciseDetail.sets.length; i++) {
        const prev = exerciseDetail.sets[i - 1]!;
        const cur = exerciseDetail.sets[i]!;
        expect(cur.setNumber).toBeGreaterThan(prev.setNumber);
        expect(cur.distanceM!).toBeGreaterThan(prev.distanceM!);
        expect(cur.durationS!).toBeGreaterThan(prev.durationS!);
      }
    });

    // NC-7 (§13.5) — partial-correction shape rules: the effective-row
    // validation (not the schema, which accepts every field as optional/
    // nullable for every profile) is what makes an omitted-optional
    // correction apply and an explicit-null-on-a-required-field correction
    // reject, extending this describe block's own "distanceM only" partial
    // correction above with the remaining combinations.
    it("NC-7 — a partial {durationS: null} on load_distance applies (optional, absent)", async () => {
      const exercise = await createProfiledExercise(db, userId, "Sled Push NC7a", "load_distance");
      const sessionId = await createInProgressSession(db, userId);
      const { sessionExerciseId, result: slotResult } = await createAdhocSlot(
        db,
        userId,
        sessionId,
        exercise.id,
      );
      expect(slotResult.rejected).toEqual([]);

      const setId = newId();
      const created = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 30,
            distanceM: 50,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(created.rejected).toEqual([]);

      const correction = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: setId, sessionExerciseId, durationS: null },
        },
      ]);
      expect(correction.rejected).toEqual([]);

      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      expect(row).toMatchObject({ weightKg: 30, distanceM: 50, durationS: null });
    });

    it("NC-7 — a partial {distanceM: null} on the same load_distance slot rejects (required)", async () => {
      const exercise = await createProfiledExercise(db, userId, "Sled Push NC7b", "load_distance");
      const sessionId = await createInProgressSession(db, userId);
      const { sessionExerciseId, result: slotResult } = await createAdhocSlot(
        db,
        userId,
        sessionId,
        exercise.id,
      );
      expect(slotResult.rejected).toEqual([]);

      const setId = newId();
      const created = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 30,
            distanceM: 50,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(created.rejected).toEqual([]);

      const opId = newId();
      const correction = await applySyncBatch(db, userId, [
        {
          opId,
          entity: "setLog",
          operation: "upsert",
          payload: { id: setId, sessionExerciseId, distanceM: null },
        },
      ]);
      expect(correction.rejected).toEqual([
        { opId, entity: "setLog", reason: "invalid_measurement" },
      ]);

      // Rejected — the row is untouched, not partially cleared.
      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      expect(row).toMatchObject({ weightKg: 30, distanceM: 50 });
    });

    it("NC-7 — a partial {reps: null} on load_reps rejects (required)", async () => {
      const exercise = await createProfiledExercise(db, userId, "Bench Press NC7c", "load_reps");
      const sessionId = await createInProgressSession(db, userId);
      const { sessionExerciseId, result: slotResult } = await createAdhocSlot(
        db,
        userId,
        sessionId,
        exercise.id,
      );
      expect(slotResult.rejected).toEqual([]);

      const setId = newId();
      const created = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 100,
            reps: 5,
            rir: 2,
            loggedAt: new Date().toISOString(),
          },
        },
      ]);
      expect(created.rejected).toEqual([]);

      const opId = newId();
      const correction = await applySyncBatch(db, userId, [
        {
          opId,
          entity: "setLog",
          operation: "upsert",
          payload: { id: setId, sessionExerciseId, reps: null },
        },
      ]);
      expect(correction.rejected).toEqual([
        { opId, entity: "setLog", reason: "invalid_measurement" },
      ]);

      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      expect(row).toMatchObject({ weightKg: 100, reps: 5 });
    });

    it("NC-7 — a full-row edit trailed by a partial correction preserves the fields the correction omitted", async () => {
      const exercise = await createProfiledExercise(db, userId, "Sled Push NC7d", "load_distance");
      const sessionId = await createInProgressSession(db, userId);
      const { sessionExerciseId, result: slotResult } = await createAdhocSlot(
        db,
        userId,
        sessionId,
        exercise.id,
      );
      expect(slotResult.rejected).toEqual([]);

      const setId = newId();
      const loggedAt = new Date().toISOString();
      const created = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 30,
            distanceM: 50,
            loggedAt,
            notes: "first pull",
          },
        },
      ]);
      expect(created.rejected).toEqual([]);

      // Full-row edit — a real client's `setLogFullRowOp` re-sending every
      // profile-scoped key after e.g. the athlete edited the weight.
      const fullRowEdit = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 32.5,
            distanceM: 50,
            loggedAt,
            notes: "first pull",
          },
        },
      ]);
      expect(fullRowEdit.rejected).toEqual([]);

      // Trailing partial correction — `correctHistorySet`'s shape: only the
      // one field the athlete actually touched (notes), nothing else named.
      const partialCorrection = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: setId, sessionExerciseId, notes: "felt heavier than usual" },
        },
      ]);
      expect(partialCorrection.rejected).toEqual([]);

      // The full-row edit's weightKg survives the partial correction that
      // never named it — an omitted field is "preserve", never "clear"
      // (D-03's field-level merge).
      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      expect(row).toMatchObject({
        weightKg: 32.5,
        distanceM: 50,
        notes: "felt heavier than usual",
      });
    });
  });
});
