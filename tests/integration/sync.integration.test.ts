import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createPrescription, updatePrescription } from "@/server/prescriptions/service";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";
import {
  STRATEGY_VERSIONS,
  wrapPrescriptionSnapshot,
  type PrescriptionSnapshot,
} from "@/domain/schemas/prescriptionSnapshot";
import type { SyncOpEnvelope } from "@/domain/sync/schema";
import {
  buildSetDeletionOps,
  type SetLogOp,
  type SetLogRowFields,
} from "@/domain/sync/setDeletionOps";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

async function insertSquat(db: AppDb, userId: string) {
  return createExercise(db, userId, {
    name: "Back Squat",
    equipment: "barbell",
    mechanics: "compound",
    laterality: "bilateral",
    loadStepKg: 2.5,
    contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
  });
}

const fixedScheme = { v: 1 as const, scheme: { type: "fixed" as const, sets: 3, reps: 10 } };

function buildSnapshot(exerciseId: string, exerciseName: string): PrescriptionSnapshot {
  return wrapPrescriptionSnapshot({
    exerciseId,
    exerciseName,
    scheme: { type: "fixed", sets: 3, reps: 10 },
    targetRir: null,
    restSeconds: 90,
    progression: {
      strategyId: "manual",
      strategyVersion: STRATEGY_VERSIONS.manual,
      config: {},
      classification: "user_defined",
    },
    appliedModifiers: null,
    prefill: { loadKg: 100, reps: 10 },
  });
}

describe("sync service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;
  let exerciseName: string;
  let prescriptionId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    const exercise = await insertSquat(db, userId);
    exerciseId = exercise.id;
    exerciseName = exercise.name;
    const programId = (await createProgram(db, userId, { name: "Program A" })).id;
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    const prescription = await createPrescription(db, userId, template.id, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!prescription) throw new Error("expected prescription");
    prescriptionId = prescription.id;
  });

  it("replaying an identical batch twice converges to the same DB state (idempotent)", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const startedAt = new Date().toISOString();
    const snapshot = buildSnapshot(exerciseId, exerciseName);

    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt, templateName: "Push Day" },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
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
          weightKg: 100,
          reps: 10,
          rir: 2,
          loggedAt: startedAt,
        },
      },
    ];

    const first = await applySyncBatch(db, userId, ops);
    expect(first.rejected).toEqual([]);
    expect(first.applied).toHaveLength(3);

    // Same ops, byte-for-byte, replayed a second time (simulates a client
    // retrying a batch whose response it never saw).
    const second = await applySyncBatch(db, userId, ops);
    expect(second.rejected).toEqual([]);
    expect(second.applied).toHaveLength(3);

    const [sessionRow] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    const [exerciseRow] = await db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.id, sessionExerciseId));
    const setRows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId));

    expect(sessionRow?.status).toBe("in_progress");
    expect(sessionRow?.templateName).toBe("Push Day");
    expect(exerciseRow?.position).toBe(0);
    expect(exerciseRow?.prescription).toEqual(snapshot);
    expect(setRows).toHaveLength(1);
    expect(setRows[0]?.weightKg).toBe(100);
    expect(setRows[0]?.reps).toBe(10);
    expect(setRows[0]?.rir).toBe(2);
  });

  it("keeps a session_exercise's frozen prescription snapshot immutable across replays and later prescription-definition changes", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const startedAt = new Date().toISOString();
    const originalSnapshot = buildSnapshot(exerciseId, exerciseName);

    const created = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: originalSnapshot,
        },
      },
    ]);
    expect(created.rejected).toEqual([]);

    // The live prescription definition changes after the snapshot was taken
    // (ADR-007: interpreting the session must never depend on this).
    await updatePrescription(db, userId, prescriptionId, {
      notes: "bumped after session start",
      restSeconds: 120,
    });

    // A later sessionExercise upsert even tries to smuggle a *different*
    // snapshot through — the service must ignore it, not just leave the
    // field untouched when omitted.
    const differentSnapshot = buildSnapshot(exerciseId, "Renamed Exercise");
    const updateOp: SyncOpEnvelope = {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: sessionExerciseId, sessionId, skipped: true, prescription: differentSnapshot },
    };
    const updated = await applySyncBatch(db, userId, [updateOp]);
    expect(updated.applied).toEqual([updateOp.opId]);

    const [row] = await db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.id, sessionExerciseId));
    expect(row?.skipped).toBe(true);
    expect(row?.prescription).toEqual(originalSnapshot);
  });

  it("enforces at most one in-progress session per user, and supports takeover via explicit discard", async () => {
    const session1 = newId();
    const create1: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: session1, startedAt: new Date().toISOString() },
    };
    const r1 = await applySyncBatch(db, userId, [create1]);
    expect(r1.applied).toEqual([create1.opId]);

    const session2 = newId();
    const create2: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: session2, startedAt: new Date().toISOString() },
    };
    const r2 = await applySyncBatch(db, userId, [create2]);
    expect(r2.applied).toEqual([]);
    expect(r2.rejected).toEqual([
      { opId: create2.opId, entity: "workoutSession", reason: "session_conflict" },
    ]);

    // Takeover: explicitly discard the foreign in-progress session...
    const discard1: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: session1, status: "discarded" },
    };
    const r3 = await applySyncBatch(db, userId, [discard1]);
    expect(r3.applied).toEqual([discard1.opId]);

    // ...then the same create2 op (a client retry, unmodified) succeeds.
    const r4 = await applySyncBatch(db, userId, [create2]);
    expect(r4.applied).toEqual([create2.opId]);
  });

  it("treats another user's session/session_exercise/set_log rows as not_found rather than leaking existence", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const startedAt = new Date().toISOString();

    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: sessionExerciseId, sessionId, exerciseId, position: 0, source: "template" },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setId,
          sessionExerciseId,
          setNumber: 1,
          weightKg: 50,
          reps: 5,
          loggedAt: startedAt,
        },
      },
    ]);

    const hijackSession: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, notes: "hijacked" },
    };
    const hijackExercise: SyncOpEnvelope = {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: sessionExerciseId, sessionId, skipped: true },
    };
    const hijackSet: SyncOpEnvelope = {
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: { id: setId, sessionExerciseId, weightKg: 999 },
    };

    const result = await applySyncBatch(db, otherUserId, [
      hijackSession,
      hijackExercise,
      hijackSet,
    ]);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([
      { opId: hijackSession.opId, entity: "workoutSession", reason: "not_found" },
      { opId: hijackExercise.opId, entity: "sessionExercise", reason: "not_found" },
      { opId: hijackSet.opId, entity: "setLog", reason: "not_found" },
    ]);

    const [sessionRow] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    expect(sessionRow?.notes).toBeNull();
  });

  it("only allows forward lifecycle transitions and locks structure on completion, while still allowing set-log corrections", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const startedAt = new Date().toISOString();

    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: sessionExerciseId, sessionId, exerciseId, position: 0, source: "template" },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setId,
          sessionExerciseId,
          setNumber: 1,
          weightKg: 100,
          reps: 10,
          loggedAt: startedAt,
        },
      },
    ]);

    const complete: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "completed", completedAt: new Date().toISOString() },
    };
    const completeResult = await applySyncBatch(db, userId, [complete]);
    expect(completeResult.applied).toEqual([complete.opId]);

    // completed -> in_progress is not an allowed transition.
    const revert: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "in_progress" },
    };
    const revertResult = await applySyncBatch(db, userId, [revert]);
    expect(revertResult.rejected).toEqual([
      { opId: revert.opId, entity: "workoutSession", reason: "invalid_lifecycle_transition" },
    ]);

    // A brand-new session_exercise on a completed session is locked...
    const newExercise: SyncOpEnvelope = {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: newId(), sessionId, exerciseId, position: 1, source: "adhoc" },
    };
    const newExerciseResult = await applySyncBatch(db, userId, [newExercise]);
    expect(newExerciseResult.rejected).toEqual([
      { opId: newExercise.opId, entity: "sessionExercise", reason: "session_locked" },
    ]);

    // ...and so is a brand-new set (a late addition, not a correction).
    const newSet: SyncOpEnvelope = {
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: newId(),
        sessionExerciseId,
        setNumber: 2,
        weightKg: 90,
        reps: 8,
        loggedAt: new Date().toISOString(),
      },
    };
    const newSetResult = await applySyncBatch(db, userId, [newSet]);
    expect(newSetResult.rejected).toEqual([
      { opId: newSet.opId, entity: "setLog", reason: "session_locked" },
    ]);

    // But correcting the value of an *existing* set post-completion is allowed.
    const correction: SyncOpEnvelope = {
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: { id: setId, sessionExerciseId, weightKg: 102.5, rir: 1 },
    };
    const correctionResult = await applySyncBatch(db, userId, [correction]);
    expect(correctionResult.applied).toEqual([correction.opId]);

    const [setRow] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
    expect(setRow?.weightKg).toBe(102.5);
    expect(setRow?.rir).toBe(1);
  });

  it("locks set-log corrections and deletes once a session is discarded", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const startedAt = new Date().toISOString();

    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: sessionExerciseId, sessionId, exerciseId, position: 0, source: "template" },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setId,
          sessionExerciseId,
          setNumber: 1,
          weightKg: 100,
          reps: 10,
          loggedAt: startedAt,
        },
      },
    ]);

    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, status: "discarded" },
      },
    ]);

    const correction: SyncOpEnvelope = {
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: { id: setId, sessionExerciseId, weightKg: 1 },
    };
    const correctionResult = await applySyncBatch(db, userId, [correction]);
    expect(correctionResult.rejected).toEqual([
      { opId: correction.opId, entity: "setLog", reason: "session_locked" },
    ]);

    const del: SyncOpEnvelope = {
      opId: newId(),
      entity: "setLog",
      operation: "delete",
      payload: { id: setId },
    };
    const delResult = await applySyncBatch(db, userId, [del]);
    expect(delResult.rejected).toEqual([
      { opId: del.opId, entity: "setLog", reason: "session_locked" },
    ]);

    const [setRow] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
    expect(setRow?.weightKg).toBe(100);
  });

  // docs/reviews/mvp-v1-independent-review.md MEDIUM-1 — direct counterpart
  // to "only allows forward lifecycle transitions and locks structure on
  // completion" above: that test proves a STANDALONE stale mutation (no
  // later op on the same id in its own request) still correctly rejects.
  // This one proves the opposite shape doesn't: a single reconnect-flush
  // batch containing every op category F6 produces — session create, two
  // exercise creates, a skip/unskip round-trip, a stray skip left set, set
  // creates plus a correction, and completion — submitted three times
  // (src/sync/flush.ts resends the whole pending outbox unchanged when a
  // reply is lost) must apply cleanly and identically every time, not just
  // the first.
  it("submitting a complete multi-op reconnect batch three times converges with zero rejections and byte-identical rows every time", async () => {
    const curl = await createExercise(db, userId, {
      name: "Bicep Curl",
      equipment: "dumbbell",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 1,
      contributions: [{ muscleGroupId: "biceps", role: "primary", weight: 1 }],
    });

    const sessionId = newId();
    const squatRowId = newId();
    const curlRowId = newId();
    const setIds = [newId(), newId(), newId()];
    const startedAt = new Date().toISOString();
    const completedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const snapshot = buildSnapshot(exerciseId, exerciseName);

    // Every op below is deliberately FULL-ROW — every field the entity's
    // schema accepts, echoed on every op, not just the create — because
    // that is what the real client actually sends
    // (`workoutSessionFullRowOp`/`sessionExerciseFullRowOp`/
    // `setLogFullRowOp`, src/sync/activeSession.ts, always resend the
    // entire current in-memory row). A hand-written test that sends
    // minimal/partial payloads for later ops (as an earlier version of
    // this test did) is unrealistic and would mask real behavior: the
    // remediation's supersession tolerance only excuses an earlier op via
    // a later one that is itself create-anchored and fully subsumes it
    // (docs/reviews/mvp-v1-remediation-verification.md V-3) — a minimal
    // partial op never qualifies as the "later op", which the real client
    // never produces anyway.
    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId: null,
          templateId: null,
          templateName: "Push Day",
          weekIndex: null,
          isDeload: false,
          status: "in_progress",
          startedAt,
          completedAt: null,
          clientId: null,
          notes: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: squatRowId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
          skipped: false,
          notes: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: curlRowId,
          sessionId,
          exerciseId: curl.id,
          position: 1,
          source: "adhoc",
          prescription: null,
          skipped: false,
          notes: null,
        },
      },
      // Skip/unskip round-trip on the squat, all still queued offline —
      // this op's create-shaped skipped:false is stale against the row a
      // later op in this same batch left behind.
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: squatRowId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
          skipped: true,
          notes: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: squatRowId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
          skipped: false,
          notes: null,
        },
      },
      // The curl is left skipped — the review's exact "curl slot"
      // reproduction: its own create above (skipped left implicit/false) is
      // stale against this.
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: curlRowId,
          sessionId,
          exerciseId: curl.id,
          position: 1,
          source: "adhoc",
          prescription: null,
          skipped: true,
          notes: null,
        },
      },
      ...[10, 10, 10].map((reps, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[index]!,
          sessionExerciseId: squatRowId,
          setNumber: index + 1,
          isWarmup: false,
          weightKg: 100,
          reps,
          rir: 2,
          loggedAt: startedAt,
          notes: null,
        },
      })),
      // A correction of the first set through the in-session Edit/Save UI
      // (editSet → setLogFullRowOp, also full-row) — set EDITS, not just
      // creates.
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[0]!,
          sessionExerciseId: squatRowId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 102.5,
          reps: 10,
          rir: 2,
          loggedAt: startedAt,
          notes: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: squatRowId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
          skipped: false,
          notes: "felt strong today",
        },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId: null,
          templateId: null,
          templateName: "Push Day",
          weekIndex: null,
          isDeload: false,
          status: "completed",
          startedAt,
          completedAt,
          clientId: null,
          notes: null,
        },
      },
    ];

    async function snapshotDb() {
      const [session] = await db
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.id, sessionId));
      const exerciseRows = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.sessionId, sessionId));
      const setRows = await db
        .select()
        .from(setLogs)
        .where(eq(setLogs.sessionExerciseId, squatRowId));
      return {
        session,
        exerciseRows,
        // setLogs.updatedAt is bumped on every write by design (corrections
        // are allowed at any time — applySetLogUpsert has no noop
        // short-circuit); excluded so this compares actual data, not that
        // unrelated bookkeeping column.
        setRows: setRows.map((row) => {
          const { updatedAt, ...rest } = row;
          void updatedAt;
          return rest;
        }),
      };
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(ops.length);
    }

    const final = await snapshotDb();
    expect(final.session?.status).toBe("completed");
    expect(final.exerciseRows).toHaveLength(2);
    expect(final.exerciseRows.find((e) => e.id === squatRowId)).toMatchObject({
      skipped: false,
      notes: "felt strong today",
    });
    expect(final.exerciseRows.find((e) => e.id === curlRowId)).toMatchObject({ skipped: true });
    expect(final.setRows).toHaveLength(3);
    expect(final.setRows.find((s) => s.id === setIds[0])?.weightKg).toBe(102.5);
    expect(final.setRows.find((s) => s.id === setIds[1])?.weightKg).toBe(100);
  });

  // docs/reviews/mvp-v1-remediation-verification.md V-1 — the first
  // remediation never exercised a `setLog` delete: on replay, a stale
  // create of a set that a LATER op in the same batch deletes finds no row
  // (the delete already ran, during the first application) and is rejected
  // by the checks that live in the "row doesn't exist" branch —
  // `session_locked` if the parent is now completed, `set_number_conflict`
  // if a survivor's renumbering already reclaimed the slot — permanently,
  // exactly the false "couldn't sync" MEDIUM-1 names. This is the review's
  // own S3 shape: delete of the LAST set (no renumbering needed), batch
  // also completes the session.
  it("a create→delete→renumber→complete batch (the deleted set's own create trailing its own delete) converges with zero rejections, submitted three times", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setIds = [newId(), newId(), newId()];
    const startedAt = new Date().toISOString();
    const completedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const snapshot = buildSnapshot(exerciseId, exerciseName);

    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId: null,
          templateId: null,
          templateName: "Push Day",
          weekIndex: null,
          isDeload: false,
          status: "in_progress",
          startedAt,
          completedAt: null,
          clientId: null,
          notes: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
          skipped: false,
          notes: null,
        },
      },
      // Three sets logged (70/72.5/75), the middle one (72.5) deleted — the
      // review's own real-client reproduction (docs/reviews/mvp-v1-
      // remediation-verification.md §6.2)'s exact numbers.
      ...[70, 72.5, 75].map((weightKg, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[index]!,
          sessionExerciseId,
          setNumber: index + 1,
          isWarmup: false,
          weightKg,
          reps: 5,
          rir: 2,
          loggedAt: startedAt,
          notes: null,
        },
      })),
      // buildSetDeletionOps (src/domain/sync/setDeletionOps.ts): delete
      // first, then one full-row upsert per renumbered survivor. Deleting
      // the LAST set (75kg, setNumber 3) needs no renumbering — its own
      // delete is the only op.
      { opId: newId(), entity: "setLog", operation: "delete", payload: { id: setIds[2]! } },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId: null,
          templateId: null,
          templateName: "Push Day",
          weekIndex: null,
          isDeload: false,
          status: "completed",
          startedAt,
          completedAt,
          clientId: null,
          notes: null,
        },
      },
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(ops.length);
    }

    const [sessionRow] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    expect(sessionRow?.status).toBe("completed");
    const setRows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(asc(setLogs.setNumber));
    // Exactly the two survivors, never resurrected — the review's own
    // acceptance bar ("`GET /api/history` for that session returns exactly
    // ["70x5", "75x5"]" would be wrong here; this test deletes the LAST
    // set, so the survivors are 70 and 72.5, at their original numbers).
    expect(setRows.map((s) => ({ setNumber: s.setNumber, weightKg: s.weightKg }))).toEqual([
      { setNumber: 1, weightKg: 70 },
      { setNumber: 2, weightKg: 72.5 },
    ]);
  });

  // V-1's second shape (the review's own S4): mid-workout, not completed,
  // deleting the FIRST set so the survivor is renumbered INTO the deleted
  // set's own slot — the replayed stale create then collides with the
  // renumbered survivor on (sessionExerciseId, setNumber), a
  // `set_number_conflict` rather than S3's `session_locked`, and is
  // equally permanent before the fix.
  it("the same create→delete→renumber shape mid-workout (not completed) also converges with zero rejections, submitted three times", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setIds = [newId(), newId()];
    const startedAt = new Date().toISOString();
    const snapshot = buildSnapshot(exerciseId, exerciseName);

    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId: null,
          templateId: null,
          templateName: "Push Day",
          weekIndex: null,
          isDeload: false,
          status: "in_progress",
          startedAt,
          completedAt: null,
          clientId: null,
          notes: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
          skipped: false,
          notes: null,
        },
      },
      ...[70, 72.5].map((weightKg, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[index]!,
          sessionExerciseId,
          setNumber: index + 1,
          isWarmup: false,
          weightKg,
          reps: 5,
          rir: 2,
          loggedAt: startedAt,
          notes: null,
        },
      })),
      // Delete the FIRST set (setNumber 1) — the survivor (setIds[1],
      // currently setNumber 2) is renumbered down into slot 1, the exact
      // slot the deleted set's own stale create would try to reclaim.
      { opId: newId(), entity: "setLog", operation: "delete", payload: { id: setIds[0]! } },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[1]!,
          sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          weightKg: 72.5,
          reps: 5,
          rir: 2,
          loggedAt: startedAt,
          notes: null,
        },
      },
      // No completion — the batch ends mid-workout.
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(ops.length);
    }

    const [sessionRow] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    expect(sessionRow?.status).toBe("in_progress");
    const setRows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(asc(setLogs.setNumber));
    expect(setRows.map((s) => ({ setNumber: s.setNumber, weightKg: s.weightKg }))).toEqual([
      { setNumber: 1, weightKg: 72.5 },
    ]);
  });

  // docs/reviews/mvp-v1-remediation-verification.md V-2 — a later same-id
  // op that is only a PARTIAL correction (src/sync/corrections.ts's
  // `correctHistorySet`, the History screen's post-completion edit) does
  // NOT fully subsume an earlier full-row op: the fields it omits (reps,
  // RIR here) must still be written by the earlier op, not silently
  // dropped by a blanket skip. Reused across a genuine first application
  // AND a replay of the identical two-op batch to prove the fields the
  // partial op never touches converge to the same correct values either
  // way — this is exactly the shape the first remediation's unconditional
  // `applySetLogUpsert` skip got wrong.
  it("a full-row setLog edit trailed by a partial correction preserves the fields the partial op omits (reps, RIR)", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const startedAt = new Date().toISOString();

    // Seed the set at its pre-batch values (100kg / 5 reps / RIR 2) —
    // mirrors the verification's own S9 probe, which starts from an
    // ALREADY-EXISTING set, not a fresh create in the same batch.
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: sessionExerciseId, sessionId, exerciseId, position: 0, source: "template" },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setId,
          sessionExerciseId,
          setNumber: 1,
          weightKg: 100,
          reps: 5,
          rir: 2,
          loggedAt: startedAt,
        },
      },
    ]);

    const ops: SyncOpEnvelope[] = [
      // A full-row edit (the in-session Edit/Save UI, editSet →
      // setLogFullRowOp) changing reps and RIR, weight unchanged for now.
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
          reps: 6,
          rir: 1,
          loggedAt: startedAt,
          notes: null,
        },
      },
      // A later PARTIAL correction — only weightKg, exactly
      // correctHistorySet's shape.
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setId, sessionExerciseId, weightKg: 105 },
      },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);
      expect(result.applied).toHaveLength(2);

      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      // The first remediation's blanket skip would report this applied but
      // leave reps/RIR at their pre-batch values (5/2) — silently dropping
      // the full-row op's edit. Correct merge: the partial op's own field
      // (weightKg) wins, everything else comes from the full-row edit.
      expect(row?.weightKg).toBe(105);
      expect(row?.reps).toBe(6);
      expect(row?.rir).toBe(1);
    }
  });

  // docs/reviews/mvp-v1-remediation-verification.md V-3 — the first
  // remediation excused an earlier op from a genuine rejection merely
  // because SOME later op shared its id, even when that later op is not
  // itself a plausible replay of a real snapshot (missing the fields only
  // a genuine create/full-row op carries). Both of the review's exact
  // probes (§6.3 workoutSession, §6.4 sessionExercise), each run standalone
  // (already covered by "only allows forward lifecycle transitions…" above)
  // and trailed by a later same-id op — the shape that used to wrongly
  // excuse it.
  it("a genuine invalid lifecycle transition or locked-session mutation trailed by a later same-id op still rejects (never reported applied)", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const startedAt = new Date().toISOString();

    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: sessionExerciseId, sessionId, exerciseId, position: 0, source: "template" },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, status: "completed", completedAt: new Date().toISOString() },
      },
    ]);

    // V-3 §6.3 — a bare `{status:"in_progress"}` (missing `startedAt`, the
    // one field only a real create ever sends) trailed by a later op on
    // the same id must still reject, not be excused.
    const revert: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "in_progress" },
    };
    const reconfirmCompletion: SyncOpEnvelope = {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "completed" },
    };
    const sessionResult = await applySyncBatch(db, userId, [revert, reconfirmCompletion]);
    expect(sessionResult.rejected).toEqual([
      { opId: revert.opId, entity: "workoutSession", reason: "invalid_lifecycle_transition" },
    ]);
    const [sessionRow] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    expect(sessionRow?.status).toBe("completed");

    // V-3 §6.4 — a bare `{skipped:true, notes:"…"}` (missing exerciseId/
    // position/source, the fields only a real create ever sends) trailed
    // by a later op on the same id must still reject.
    const hijack: SyncOpEnvelope = {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: sessionExerciseId, sessionId, skipped: true, notes: "not a real edit" },
    };
    const revertHijack: SyncOpEnvelope = {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: sessionExerciseId, sessionId, skipped: false, notes: null },
    };
    const exerciseResult = await applySyncBatch(db, userId, [hijack, revertHijack]);
    expect(exerciseResult.rejected).toEqual([
      { opId: hijack.opId, entity: "sessionExercise", reason: "session_locked" },
    ]);
    const [exerciseRow] = await db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.id, sessionExerciseId));
    expect(exerciseRow?.skipped).toBe(false);
    expect(exerciseRow?.notes).toBeNull();
  });

  it("rejects conflicting session_exercise positions and set numbers as ordinary rejections, not thrown errors", async () => {
    const sessionId = newId();
    const startedAt = new Date().toISOString();
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt },
      },
    ]);

    const ex1 = newId();
    const ex2 = newId();
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: ex1, sessionId, exerciseId, position: 0, source: "template" },
      },
    ]);
    const conflictExercise: SyncOpEnvelope = {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: { id: ex2, sessionId, exerciseId, position: 0, source: "template" },
    };
    const exerciseResult = await applySyncBatch(db, userId, [conflictExercise]);
    expect(exerciseResult.rejected).toEqual([
      { opId: conflictExercise.opId, entity: "sessionExercise", reason: "position_conflict" },
    ]);

    const set1 = newId();
    const set2 = newId();
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: set1,
          sessionExerciseId: ex1,
          setNumber: 1,
          weightKg: 50,
          reps: 5,
          loggedAt: startedAt,
        },
      },
    ]);
    const conflictSet: SyncOpEnvelope = {
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: set2,
        sessionExerciseId: ex1,
        setNumber: 1,
        weightKg: 60,
        reps: 5,
        loggedAt: startedAt,
      },
    };
    const setResult = await applySyncBatch(db, userId, [conflictSet]);
    expect(setResult.rejected).toEqual([
      { opId: conflictSet.opId, entity: "setLog", reason: "set_number_conflict" },
    ]);
  });
});

// Finding D — contiguous set numbering after a deletion, proved against real
// PostgreSQL rather than only against the pure planner in
// tests/unit/setDeletion.test.ts. The ops applied here are the ops the client
// actually enqueues: buildSetDeletionOps is the same module
// src/sync/activeSession.ts (in-session) and src/sync/corrections.ts
// (post-completion history) call.
describe("set deletion renumbering (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;
  let sessionId: string;
  let sessionExerciseId: string;
  let clientSets: SetLogRowFields[];

  const startedAt = new Date("2026-08-17T09:00:00.000Z").toISOString();

  async function readSets() {
    return db
      .select({ id: setLogs.id, setNumber: setLogs.setNumber, weightKg: setLogs.weightKg })
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(asc(setLogs.setNumber));
  }

  function toEnvelopes(ops: readonly SetLogOp[]): SyncOpEnvelope[] {
    return ops.map((op) => ({
      opId: op.opId,
      entity: op.entity,
      operation: op.operation,
      payload: op.payload,
    }));
  }

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    exerciseId = (await insertSquat(db, userId)).id;
    sessionId = newId();
    sessionExerciseId = newId();

    // Four work sets, numbered 1..4 — the state the device was in.
    clientSets = [1, 2, 3, 4].map((setNumber) => ({
      id: newId(),
      setNumber,
      isWarmup: false,
      weightKg: 100 + setNumber,
      reps: 8,
      rir: 2,
      loggedAt: startedAt,
      notes: null,
    }));

    const seedOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, startedAt, templateName: "Push Day" },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: { id: sessionExerciseId, sessionId, exerciseId, position: 0, source: "template" },
      },
      ...clientSets.map((set) => ({
        opId: newId(),
        entity: "setLog" as const,
        operation: "upsert" as const,
        payload: {
          id: set.id,
          sessionExerciseId,
          setNumber: set.setNumber,
          weightKg: set.weightKg,
          reps: set.reps,
          rir: set.rir,
          loggedAt: set.loggedAt,
        },
      })),
    ];
    const seeded = await applySyncBatch(db, userId, seedOps);
    expect(seeded.rejected).toEqual([]);
  });

  it.each([
    { label: "first", index: 0 },
    { label: "middle", index: 1 },
    { label: "last", index: 3 },
  ])("leaves 1..n contiguous after deleting the $label set", async ({ index }) => {
    const target = clientSets[index]!;
    const { deleted, remaining, ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: target.id,
      sets: clientSets,
    });
    expect(deleted?.id).toBe(target.id);

    const result = await applySyncBatch(db, userId, toEnvelopes(ops));
    // Every op applied — a rejected renumber op would leave PostgreSQL
    // non-contiguous while the device showed 1..n.
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(ops.length);

    const rows = await readSets();
    // No duplicate and no missing row: exactly the survivors, numbered 1..n.
    expect(rows.map((r) => r.setNumber)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.id)).toEqual(remaining.map((s) => s.id));
    // The deleted row is gone, and the survivors kept their own values —
    // renumbering must not shift weights onto the wrong set.
    expect(rows.map((r) => r.id)).not.toContain(target.id);
    expect(rows.map((r) => r.weightKg)).toEqual(remaining.map((s) => s.weightKg));
  });

  it("renumbers a completed session's sets too (post-completion history deletion)", async () => {
    const completed = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          status: "completed",
          completedAt: new Date("2026-08-17T10:00:00.000Z").toISOString(),
        },
      },
    ]);
    expect(completed.rejected).toEqual([]);

    const { ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: clientSets[1]!.id,
      sets: clientSets,
    });
    const result = await applySyncBatch(db, userId, toEnvelopes(ops));

    expect(result.rejected).toEqual([]);
    const rows = await readSets();
    expect(rows.map((r) => r.setNumber)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.id)).toEqual([
      clientSets[0]!.id,
      clientSets[2]!.id,
      clientSets[3]!.id,
    ]);
  });

  it("rejects the renumbering if the ops are applied in descending order", async () => {
    // Proof that buildSetDeletionOps's ascending order is load-bearing and not
    // cosmetic. The sync API runs one transaction per op, so uq_set_number is
    // checked at each op's own COMMIT: renumbering 4→3 before 3→2 commits two
    // rows holding set_number 3.
    //
    // Note what this does NOT show: that the constraint needs to be DEFERRABLE
    // INITIALLY DEFERRED. With one statement per transaction, the ascending
    // order alone keeps every commit valid, and an INITIALLY IMMEDIATE
    // constraint would reject this descending batch just the same. The
    // deferral would only matter if several renumber statements shared a
    // transaction.
    const { ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: clientSets[1]!.id,
      sets: clientSets,
    });
    const [deleteOp, ...renumberOps] = toEnvelopes(ops);
    const descending = [deleteOp!, ...renumberOps.reverse()];

    const result = await applySyncBatch(db, userId, descending);

    expect(result.rejected).toEqual([
      { opId: descending[1]!.opId, entity: "setLog", reason: "set_number_conflict" },
    ]);
  });

  it("is idempotent when the whole deletion batch is replayed", async () => {
    // Offline reality: the flush can be interrupted after the server applied
    // ops it never got to acknowledge, so the same batch arrives twice.
    const { ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: clientSets[0]!.id,
      sets: clientSets,
    });
    const envelopes = toEnvelopes(ops);

    const first = await applySyncBatch(db, userId, envelopes);
    const second = await applySyncBatch(db, userId, envelopes);

    expect(first.rejected).toEqual([]);
    expect(second.rejected).toEqual([]);
    const rows = await readSets();
    expect(rows.map((r) => r.setNumber)).toEqual([1, 2, 3]);
  });
});
