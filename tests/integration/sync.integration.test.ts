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
