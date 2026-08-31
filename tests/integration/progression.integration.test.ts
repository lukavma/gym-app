import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import {
  exercisePrescriptions,
  recommendations,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
} from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import {
  createBlock,
  activateBlock,
  createWeekOverride,
  getBlockSummary,
} from "@/server/blocks/service";
import { createPrescription } from "@/server/prescriptions/service";
import { buildTodayBundle, getActiveSession } from "@/server/today/service";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";
import { loadProgressionConfigSchema } from "@/domain/progression/registry";
import {
  wrapPrescriptionSnapshot,
  type PrescriptionSnapshot,
} from "@/domain/schemas/prescriptionSnapshot";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Phase 4 integration coverage (implementation-plan.md Phase 4 Tests):
// server evaluation on completion, supersede semantics, the pending partial
// unique, decision immutability (one-time append), and reject-leaves-plan-
// untouched — all against real SQL (PGlite) through the sync write path.

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const fixedScheme = { v: 1 as const, scheme: { type: "fixed" as const, sets: 3, reps: 5 } };

// drizzle-orm wraps the raw pg/PGlite error; the SQLSTATE lives on `.cause`,
// not the thrown error itself (same rationale as isPostgresErrorCode in
// src/server/sync/service.ts).
async function expectUniqueViolation(promise: Promise<unknown>): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeDefined();
  let found = false;
  let current = thrown as { code?: unknown; cause?: unknown } | undefined;
  while (current && typeof current === "object") {
    if (current.code === "23505") {
      found = true;
      break;
    }
    current = current.cause as typeof current;
  }
  expect(found, "expected a 23505 unique violation in the error cause chain").toBe(true);
}

// The materialized load-progression config exactly as Phase 2's
// resolveProgression persists it onto prescriptions/snapshots.
const loadProgressionConfig = loadProgressionConfigSchema.parse({ incrementKg: 2.5 });

function buildSnapshot(exerciseId: string, exerciseName: string): PrescriptionSnapshot {
  return wrapPrescriptionSnapshot({
    exerciseId,
    exerciseName,
    scheme: { type: "fixed", sets: 3, reps: 5 },
    targetRir: { min: 0, max: 2 },
    restSeconds: 120,
    progression: {
      strategyId: "load-progression",
      strategyVersion: 1,
      config: loadProgressionConfig as Record<string, unknown>,
      classification: "heuristic",
    },
    appliedModifiers: null,
    prefill: { loadKg: 100, reps: 5 },
  });
}

interface SessionOpsInput {
  blockId: string | null;
  templateId: string | null;
  exerciseId: string;
  exerciseName: string;
  weightKg?: number;
  reps?: number[];
  finalRir?: number | null;
  startedAt?: string;
  isDeload?: boolean;
}

// The full op sequence one completed workout produces on the wire: create
// session → create session exercise (snapshot frozen) → set logs →
// completion. Returns ids alongside the ops so tests can assert against
// specific rows.
function buildSessionOps(input: SessionOpsInput) {
  const sessionId = newId();
  const sessionExerciseId = newId();
  const startedAt = input.startedAt ?? new Date().toISOString();
  const completedAt = new Date(new Date(startedAt).getTime() + 60 * 60 * 1000).toISOString();
  const reps = input.reps ?? [5, 5, 5];
  const weightKg = input.weightKg ?? 100;
  const setIds = reps.map(() => newId());

  const ops: SyncOpEnvelope[] = [
    {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: {
        id: sessionId,
        blockId: input.blockId,
        templateId: input.templateId,
        templateName: "Push Day",
        weekIndex: 1,
        isDeload: input.isDeload ?? false,
        startedAt,
      },
    },
    {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: {
        id: sessionExerciseId,
        sessionId,
        exerciseId: input.exerciseId,
        position: 0,
        source: "template",
        prescription: buildSnapshot(input.exerciseId, input.exerciseName),
      },
    },
    ...reps.map((repCount, index): SyncOpEnvelope => ({
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: setIds[index]!,
        sessionExerciseId,
        setNumber: index + 1,
        weightKg,
        reps: repCount,
        rir: index === reps.length - 1 ? (input.finalRir === undefined ? 2 : input.finalRir) : 2,
        loggedAt: startedAt,
      },
    })),
    {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "completed", completedAt },
    },
  ];

  return { ops, sessionId, sessionExerciseId, setIds, startedAt, completedAt };
}

describe("progression engine server orchestration (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;
  let exerciseName: string;
  let templateId: string;
  let blockId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    const exercise = await createExercise(db, userId, {
      name: "Back Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    exerciseId = exercise.id;
    exerciseName = exercise.name;
    const program = await createProgram(db, userId, { name: "Program A" });
    const template = await createTemplate(db, userId, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    templateId = template.id;
    await createPrescription(db, userId, template.id, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "load-progression" },
    });
    const block = await createBlock(db, userId, program.id, {
      name: "Block A",
      goal: "hypertrophy",
      startDate: "2026-08-01",
      weeksPlanned: 6,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    blockId = block.id;
    await activateBlock(db, userId, block.id);
  });

  async function runCompletedSession(overrides: Partial<SessionOpsInput> = {}) {
    const built = buildSessionOps({
      blockId,
      templateId,
      exerciseId,
      exerciseName,
      ...overrides,
    });
    const result = await applySyncBatch(db, userId, built.ops);
    expect(result.rejected).toEqual([]);
    return built;
  }

  it("evaluates on completion: persisted rec with frozen config/inputs, computed_by server, pending", async () => {
    const { sessionId, sessionExerciseId } = await runCompletedSession();

    const rows = await db.select().from(recommendations);
    expect(rows).toHaveLength(1);
    const rec = rows[0]!;
    expect(rec.userId).toBe(userId);
    expect(rec.exerciseId).toBe(exerciseId);
    expect(rec.blockId).toBe(blockId);
    expect(rec.sourceSessionId).toBe(sessionId);
    expect(rec.sourceSessionExerciseId).toBe(sessionExerciseId);
    expect(rec.strategyId).toBe("load-progression");
    expect(rec.strategyVersion).toBe(1);
    expect(rec.classification).toBe("heuristic");
    expect(rec.config).toEqual(loadProgressionConfig);
    expect(rec.action).toBe("increase_load");
    expect(rec.target).toEqual({ loadKg: 102.5 });
    expect(rec.reasonCodes).toEqual([
      "ALL_PRESCRIBED_REPS_COMPLETED",
      "FINAL_SET_RIR_IN_PROGRESS_ZONE",
    ]);
    expect(rec.confidence).toBe("high");
    expect(rec.computedBy).toBe("server");
    expect(rec.decisionStatus).toBe("pending");
    expect(rec.decisionChosen).toBeNull();
    expect(rec.decidedAt).toBeNull();
    // Frozen inputs are the §6 facts, not references.
    expect(rec.inputs).toMatchObject({
      prescribed: { scheme: { type: "fixed", sets: 3, reps: 5 } },
      derived: { setsCompleted: 3, prescribedSets: 3, finalSetRir: 2, workingLoadKg: 100 },
      historyDepthUsed: 0,
    });
  });

  // implementation-plan.md Phase 5 / progression-engine.md §5 case 10 —
  // "Deload session -> no evaluation." Phase 4 built evaluateSession() to
  // skip on `isDeload`, but nothing could ever set it true until Phase 5.
  it("produces zero recommendations for a completed session frozen as a deload", async () => {
    await runCompletedSession({ isDeload: true });

    const rows = await db.select().from(recommendations);
    expect(rows).toEqual([]);
  });

  it("replaying the identical batch does not re-evaluate or duplicate recommendations", async () => {
    const { ops } = await runCompletedSession();
    const before = await db.select().from(recommendations);

    const replay = await applySyncBatch(db, userId, ops);
    expect(replay.rejected).toEqual([]);

    const after = await db.select().from(recommendations);
    expect(after).toEqual(before);
  });

  // docs/reviews/mvp-v1-independent-review.md MEDIUM-1 — a lost reply to a
  // multi-op reconnect flush resends the WHOLE pending outbox unchanged
  // (src/sync/flush.ts never removes an op it didn't get a classified
  // response for). This reproduces the exact op mix the review's F6
  // reconnect flow produces — session create, two exercise creates, a
  // skip/unskip round-trip and a stray skip left set on the second
  // exercise, set creates AND a correction, and completion — submitted
  // three times as one identical batch (the "server actually applied it,
  // client never saw the reply, resend the same batch" shape). Before the
  // fix, the second and third submissions dead-lettered the session-create
  // (`invalid_lifecycle_transition`) and the exercise ops whose skip/notes
  // state a later op in the same batch had since moved on
  // (`session_locked`), even though nothing was ever lost or duplicated.
  it(
    "a lost-reply replay of a full reconnect batch (create, skip toggle, notes, set " +
      "create+edit, second exercise, completion) converges with zero rejections and an " +
      "unchanged, non-duplicated recommendation",
    async () => {
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
      const startedAt = "2026-08-20T10:00:00.000Z";
      const completedAt = "2026-08-20T11:00:00.000Z";

      // Every op below is deliberately FULL-ROW (see
      // sync.integration.test.ts's twin test for the full rationale): the
      // real client always resends every field it knows, and the
      // supersession tolerance only excuses an earlier op via a later one
      // that is itself create-anchored and fully subsumes it
      // (docs/reviews/mvp-v1-remediation-verification.md V-3) — a later op
      // missing fields (as an earlier version of this test sent) never
      // qualifies, and isn't what the real client produces anyway.
      const squatSnapshot = buildSnapshot(exerciseId, exerciseName);
      const ops: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: {
            id: sessionId,
            blockId,
            templateId,
            templateName: "Push Day",
            weekIndex: 1,
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
            prescription: squatSnapshot,
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
        // Skip/unskip round-trip on the squat — its create-shaped values
        // (skipped:false) end up trailing these later same-id ops once the
        // batch is replayed against an already-terminal row.
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
            prescription: squatSnapshot,
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
            prescription: squatSnapshot,
            skipped: false,
            notes: null,
          },
        },
        // The curl is left skipped — mirrors the review's exact "curl slot"
        // reproduction: its create's skipped:false is stale against this.
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
        ...[5, 5, 5].map((repCount, index): SyncOpEnvelope => ({
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[index]!,
            sessionExerciseId: squatRowId,
            setNumber: index + 1,
            isWarmup: false,
            weightKg: 100,
            reps: repCount,
            rir: index === 2 ? 2 : 3,
            loggedAt: startedAt,
            notes: null,
          },
        })),
        // A correction of the first set through the in-session Edit/Save UI
        // (editSet → setLogFullRowOp, also full-row) — "set edits", not
        // just creates.
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: setIds[0]!,
            sessionExerciseId: squatRowId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 101,
            reps: 5,
            rir: 3,
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
            prescription: squatSnapshot,
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
            blockId,
            templateId,
            templateName: "Push Day",
            weekIndex: 1,
            isDeload: false,
            status: "completed",
            startedAt,
            completedAt,
            clientId: null,
            notes: null,
          },
        },
      ];

      const first = await applySyncBatch(db, userId, ops);
      expect(first.rejected).toEqual([]);
      expect(first.applied).toHaveLength(ops.length);

      async function snapshot() {
        const [session] = await db
          .select()
          .from(workoutSessions)
          .where(eq(workoutSessions.id, sessionId));
        const exerciseRows = await db
          .select()
          .from(sessionExercises)
          .where(eq(sessionExercises.sessionId, sessionId))
          .orderBy(asc(sessionExercises.position));
        const setRows = await db
          .select()
          .from(setLogs)
          .where(eq(setLogs.sessionExerciseId, squatRowId))
          .orderBy(asc(setLogs.setNumber));
        const recs = await db.select().from(recommendations);
        return {
          session,
          exerciseRows,
          // setLogs.updatedAt is bumped on every replay by design
          // (applySetLogUpsert has no noop short-circuit — corrections are
          // allowed at any time, pre-existing and unrelated to MEDIUM-1) —
          // excluded here so this stays a check on actual DATA, not on that
          // bookkeeping column.
          setRows: setRows.map((row) => {
            const { updatedAt, ...rest } = row;
            void updatedAt;
            return rest;
          }),
          recs,
        };
      }

      const after = await snapshot();
      expect(after.session?.status).toBe("completed");
      expect(after.exerciseRows.find((e) => e.id === squatRowId)).toMatchObject({
        skipped: false,
        notes: "felt strong today",
      });
      expect(after.exerciseRows.find((e) => e.id === curlRowId)).toMatchObject({
        skipped: true,
      });
      expect(after.setRows.find((s) => s.id === setIds[0])?.weightKg).toBe(101);
      expect(after.recs).toHaveLength(1);
      expect(after.recs[0]?.action).toBe("increase_load");

      for (let attempt = 0; attempt < 2; attempt++) {
        const replay = await applySyncBatch(db, userId, ops);
        expect(replay.rejected).toEqual([]);
        expect(replay.applied).toHaveLength(ops.length);

        const now = await snapshot();
        expect(now).toEqual(after);
      }
    },
  );

  // docs/reviews/mvp-v1-remediation-verification.md V-1 — extends the
  // create→delete→renumber shape (see sync.integration.test.ts's twin
  // tests) to a real load-progression recommendation, proving the deleted
  // set never transiently (or permanently) resurrects into the evaluation
  // the completion runs, and that replaying the batch never churns out a
  // second recommendation. The deleted set here is a genuinely bad rep (a
  // failed single at 3 reps) — if it survived the replay even momentarily,
  // evaluation would see 4 sets instead of 3 and a worse final-set outcome.
  it("a create→delete→renumber→complete batch never resurrects the deleted set into evaluation, and never churns the recommendation, across three submissions", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setIds = [newId(), newId(), newId(), newId()];
    const startedAt = "2026-08-21T10:00:00.000Z";
    const completedAt = "2026-08-21T11:00:00.000Z";
    const snapshot = buildSnapshot(exerciseId, exerciseName);

    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId,
          templateId,
          templateName: "Push Day",
          weekIndex: 1,
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
      // Sets 1-3 at 100kg/5reps/RIR2 (all-prescribed-reps-completed), a 4th
      // failed single (3 reps) that gets deleted below — if it survived
      // even transiently, `derived.setsCompleted` would be 4 and the
      // outcome would differ.
      ...[5, 5, 5, 3].map((reps, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[index]!,
          sessionExerciseId,
          setNumber: index + 1,
          isWarmup: false,
          weightKg: 100,
          reps,
          rir: index === 3 ? 0 : 2,
          loggedAt: startedAt,
          notes: null,
        },
      })),
      { opId: newId(), entity: "setLog", operation: "delete", payload: { id: setIds[3]! } },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId,
          templateId,
          templateName: "Push Day",
          weekIndex: 1,
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

    const setRows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId));
    expect(setRows).toHaveLength(3);
    expect(setRows.every((s) => s.reps === 5)).toBe(true);

    const recs = await db.select().from(recommendations);
    expect(recs).toHaveLength(1);
    // 3/3 prescribed sets at RIR 2 (in the progress zone) → increase_load,
    // not the hold/decrease outcome a surviving failed 4th set would cause.
    expect(recs[0]?.action).toBe("increase_load");
    expect(recs[0]?.inputs).toMatchObject({
      derived: { setsCompleted: 3, prescribedSets: 3 },
    });
  });

  it("a later session's evaluation supersedes the previous pending rec (one pending per exercise+block)", async () => {
    const first = await runCompletedSession({ startedAt: "2026-08-10T10:00:00.000Z" });
    const second = await runCompletedSession({
      startedAt: "2026-08-12T10:00:00.000Z",
      weightKg: 102.5,
    });

    const rows = await db.select().from(recommendations).orderBy(asc(recommendations.createdAt));
    expect(rows).toHaveLength(2);
    const bySource = new Map(rows.map((r) => [r.sourceSessionId, r]));
    expect(bySource.get(first.sessionId)?.decisionStatus).toBe("superseded");
    const pending = bySource.get(second.sessionId);
    expect(pending?.decisionStatus).toBe("pending");
    expect(pending?.target).toEqual({ loadKg: 105 });
  });

  it("uq_recs_one_pending rejects a second pending row for the same (exercise, block) and for the null-block slot", async () => {
    const base = {
      userId,
      exerciseId,
      strategyId: "load-progression",
      strategyVersion: 1,
      classification: "heuristic",
      config: {},
      inputs: {},
      action: "hold",
      target: null,
      reasonCodes: ["HOLD_POLICY"],
      confidence: "medium",
      computedBy: "server",
    };
    const { sessionId, sessionExerciseId } = await runCompletedSession();
    // The completion evaluation already left one pending rec for
    // (exercise, block) — a direct second pending insert must violate.
    await expectUniqueViolation(
      db.insert(recommendations).values({
        ...base,
        id: newId(),
        blockId,
        sourceSessionId: sessionId,
        sourceSessionExerciseId: sessionExerciseId,
      }),
    );

    // The block-less slot is its own coalesce group: one pending fits…
    await db.insert(recommendations).values({
      ...base,
      id: newId(),
      blockId: null,
      sourceSessionId: sessionId,
      sourceSessionExerciseId: sessionExerciseId,
    });
    // …a second does not.
    await expectUniqueViolation(
      db.insert(recommendations).values({
        ...base,
        id: newId(),
        blockId: null,
        sourceSessionId: sessionId,
        sourceSessionExerciseId: sessionExerciseId,
      }),
    );
  });

  it("editing a source-session set while the rec is pending supersedes and re-evaluates", async () => {
    const { sessionExerciseId, setIds } = await runCompletedSession();

    // Correct the final set down to 3 reps — the session is no longer
    // completed-as-prescribed, so the fresh evaluation must hold, not
    // increase.
    const edit = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[2]!, sessionExerciseId, reps: 3 },
      },
    ]);
    expect(edit.rejected).toEqual([]);

    const rows = await db.select().from(recommendations).orderBy(asc(recommendations.createdAt));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.decisionStatus).toBe("superseded");
    const fresh = rows[1]!;
    expect(fresh.decisionStatus).toBe("pending");
    expect(fresh.action).toBe("hold");
    expect(fresh.reasonCodes).toContain("PRESCRIBED_REPS_NOT_COMPLETED");
    expect(fresh.computedBy).toBe("server");
  });

  it("editing a source-session set after a decision never recomputes (the user's choice stands)", async () => {
    const { sessionExerciseId, setIds } = await runCompletedSession();
    const [rec] = await db.select().from(recommendations);

    const decide = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: {
          recommendationId: rec!.id,
          status: "accepted",
          chosen: { loadKg: 102.5 },
          decidedAt: "2026-08-12T10:00:00.000Z",
          source: "explicit",
        },
      },
    ]);
    expect(decide.rejected).toEqual([]);

    const edit = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[2]!, sessionExerciseId, reps: 3 },
      },
    ]);
    expect(edit.rejected).toEqual([]);

    const rows = await db.select().from(recommendations);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.decisionStatus).toBe("accepted");
    expect(rows[0]!.decisionChosen).toEqual({ loadKg: 102.5 });
    expect(rows[0]!.action).toBe("increase_load"); // output untouched
  });

  it("decision append is one-time: identical replay converges, a different decision dead-letters", async () => {
    await runCompletedSession();
    const [rec] = await db.select().from(recommendations);
    const decisionPayload = {
      recommendationId: rec!.id,
      status: "modified" as const,
      chosen: { loadKg: 100 },
      decidedAt: "2026-08-12T10:00:00.000Z",
      source: "implicit_first_set" as const,
    };

    const first = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: decisionPayload,
      },
    ]);
    expect(first.rejected).toEqual([]);

    // Byte-identical replay (client retried a batch whose response it lost).
    const replay = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: decisionPayload,
      },
    ]);
    expect(replay.rejected).toEqual([]);

    // A genuinely different second decision must be rejected, never applied.
    const conflicting = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: { ...decisionPayload, status: "rejected" as const, chosen: null },
      },
    ]);
    expect(conflicting.rejected).toEqual([
      expect.objectContaining({ entity: "recommendationDecision", reason: "decision_conflict" }),
    ]);

    const [after] = await db.select().from(recommendations);
    expect(after!.decisionStatus).toBe("modified");
    expect(after!.decisionChosen).toEqual({ loadKg: 100 });

    // Unknown recommendation id → not_found (dead-letters, never silent).
    const unknown = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: { ...decisionPayload, recommendationId: newId() },
      },
    ]);
    expect(unknown.rejected).toEqual([
      expect.objectContaining({ entity: "recommendationDecision", reason: "not_found" }),
    ]);
  });

  it("rejecting a recommendation leaves the prescription row byte-identical and the next prefill unchanged", async () => {
    await runCompletedSession({ startedAt: "2026-08-10T10:00:00.000Z" });
    const [rec] = await db.select().from(recommendations);
    const prescriptionsBefore = await db
      .select()
      .from(exercisePrescriptions)
      .orderBy(asc(exercisePrescriptions.id));

    const decide = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: {
          recommendationId: rec!.id,
          status: "rejected",
          chosen: null,
          decidedAt: "2026-08-12T10:00:00.000Z",
          source: "explicit",
        },
      },
    ]);
    expect(decide.rejected).toEqual([]);

    const prescriptionsAfter = await db
      .select()
      .from(exercisePrescriptions)
      .orderBy(asc(exercisePrescriptions.id));
    expect(prescriptionsAfter).toEqual(prescriptionsBefore);

    // mvp-scope F7 — next targets unchanged: the prefill is the last
    // session's load (100), not the rejected rec's 102.5.
    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-13T10:00:00.000Z"));
    expect(bundle.today.kind).toBe("scheduled");
    if (bundle.today.kind !== "scheduled") throw new Error("unreachable");
    expect(bundle.today.exercises[0]!.prefill.loadKg).toBe(100);
    // The rejected rec is decided — nothing pending rides the bundle.
    expect(bundle.today.exercises[0]!.pendingRecommendation).toBeNull();
  });

  it("an accepted decision's chosen values head the carry-forward chain (bundle prefill)", async () => {
    await runCompletedSession({ startedAt: "2026-08-10T10:00:00.000Z" });
    const [rec] = await db.select().from(recommendations);

    const decide = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: {
          recommendationId: rec!.id,
          status: "accepted",
          chosen: { loadKg: 102.5 },
          decidedAt: "2026-08-12T10:00:00.000Z",
          source: "implicit_first_set",
        },
      },
    ]);
    expect(decide.rejected).toEqual([]);

    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-13T10:00:00.000Z"));
    if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
    const entry = bundle.today.exercises[0]!;
    expect(entry.prefill).toEqual({ loadKg: 102.5, reps: 5 });
    expect(entry.pendingRecommendation).toBeNull();
  });

  it("a pending recommendation rides the bundle without touching the prefill", async () => {
    await runCompletedSession({ startedAt: "2026-08-10T10:00:00.000Z" });

    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-13T10:00:00.000Z"));
    if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
    const entry = bundle.today.exercises[0]!;
    // Prefill = carry-forward (last session's 100); the proposed 102.5 is
    // carried separately as the pending recommendation.
    expect(entry.prefill.loadKg).toBe(100);
    expect(entry.pendingRecommendation).toMatchObject({
      action: "increase_load",
      target: { loadKg: 102.5 },
      confidence: "high",
      computedBy: "server",
      decision: { status: "pending" },
    });
    expect(entry.pendingRecommendation!.reasonCodes.length).toBeGreaterThan(0);
  });

  it("a client-computed rec op ahead of the completion op wins the dedupe: no duplicate server rec", async () => {
    const built = buildSessionOps({ blockId, templateId, exerciseId, exerciseName });
    const clientRecId = newId();
    const clientRecOp: SyncOpEnvelope = {
      opId: newId(),
      entity: "recommendation",
      operation: "upsert",
      payload: {
        id: clientRecId,
        exerciseId,
        blockId,
        sourceSessionId: built.sessionId,
        sourceSessionExerciseId: built.sessionExerciseId,
        strategyId: "load-progression",
        strategyVersion: 1,
        classification: "heuristic",
        config: loadProgressionConfig,
        inputs: {
          prescribed: { scheme: { type: "fixed", sets: 3, reps: 5 } },
          workSets: [
            { weightKg: 100, reps: 5, rir: 2 },
            { weightKg: 100, reps: 5, rir: 2 },
            { weightKg: 100, reps: 5, rir: 2 },
          ],
          derived: {
            setsCompleted: 3,
            prescribedSets: 3,
            finalSetRir: 2,
            workingLoadKg: 100,
            mixedLoads: false,
          },
          historyDepthUsed: 0,
        },
        action: "increase_load",
        target: { loadKg: 102.5 },
        reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED", "FINAL_SET_RIR_IN_PROGRESS_ZONE"],
        confidence: "high",
        computedBy: "client",
        createdAt: built.completedAt,
      },
    };

    // Client order: …session ops, sets, REC OPS, completion (FIFO).
    const completionOp = built.ops[built.ops.length - 1]!;
    const opsWithClientRec = [...built.ops.slice(0, -1), clientRecOp, completionOp];
    const result = await applySyncBatch(db, userId, opsWithClientRec);
    expect(result.rejected).toEqual([]);

    const rows = await db.select().from(recommendations);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(clientRecId);
    expect(rows[0]!.computedBy).toBe("client");
    expect(rows[0]!.decisionStatus).toBe("pending");

    // Replaying the rec op converges as a no-op (immutable record).
    const replay = await applySyncBatch(db, userId, [clientRecOp]);
    expect(replay.rejected).toEqual([]);
    expect(await db.select().from(recommendations)).toEqual(rows);
  });

  it("deleting a source-session set while pending also supersedes and re-evaluates", async () => {
    const { setIds } = await runCompletedSession();

    const del = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "delete",
        payload: { id: setIds[2]! },
      },
    ]);
    expect(del.rejected).toEqual([]);

    const rows = await db.select().from(recommendations).orderBy(asc(recommendations.createdAt));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.decisionStatus).toBe("superseded");
    const fresh = rows[1]!;
    expect(fresh.decisionStatus).toBe("pending");
    // 2 of 3 prescribed sets remain — not completed, so hold.
    expect(fresh.action).toBe("hold");
    expect(fresh.reasonCodes).toContain("PRESCRIBED_REPS_NOT_COMPLETED");
  });

  // H-1 regression (docs/reviews/phase-5-review.md) — a pending
  // recommendation must never override the deload-modified target, and its
  // decision must never leak the deload load into post-deload carry-forward
  // or the block summary. `block` (weeksPlanned: 6, startDate 2026-08-01)
  // and the load-progression prescription come from the outer beforeEach;
  // week 3 spans days 14-20 (2026-08-18), week 4 spans days 21-27
  // (2026-08-22).
  describe("H-1 — deload recommendation isolation", () => {
    const week3Date = "2026-08-18T10:00:00.000Z";
    const week4Date = "2026-08-22T10:00:00.000Z";

    // Builds the wire ops for a deload session shaped exactly like the
    // client would freeze it: the frozen snapshot carries the *already
    // deload-modified* prefill/appliedModifiers (buildSnapshotFromBundleEntry
    // freezes buildTodayBundle's resolution verbatim — no second modifier
    // computation on the client). Crucially, no recommendationDecision op is
    // built here: the fixed client has nothing to decide because
    // buildTodayBundle never attached a pendingRecommendation to this
    // session's exercise in the first place.
    function buildDeloadSessionOps(input: {
      weekIndex: number;
      prefillLoadKg: number;
      weightKg: number;
      startedAt: string;
    }) {
      const sessionId = newId();
      const sessionExerciseId = newId();
      const setId = newId();
      const completedAt = new Date(
        new Date(input.startedAt).getTime() + 60 * 60 * 1000,
      ).toISOString();
      const snapshot = wrapPrescriptionSnapshot({
        exerciseId,
        exerciseName,
        scheme: { type: "fixed", sets: 3, reps: 5 },
        targetRir: { min: 0, max: 2 },
        restSeconds: 120,
        progression: {
          strategyId: "load-progression",
          strategyVersion: 1,
          config: loadProgressionConfig as Record<string, unknown>,
          classification: "heuristic",
        },
        appliedModifiers: { loadMultiplier: 0.9 },
        prefill: { loadKg: input.prefillLoadKg, reps: 5 },
      });
      const ops: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: {
            id: sessionId,
            blockId,
            templateId,
            templateName: "Push Day",
            weekIndex: input.weekIndex,
            isDeload: true,
            startedAt: input.startedAt,
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
            weightKg: input.weightKg,
            reps: 5,
            rir: 2,
            loggedAt: input.startedAt,
          },
        },
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, status: "completed", completedAt },
        },
      ];
      return { ops, sessionId };
    }

    it("suppresses the pending rec on the deload bundle and in the in-progress session, records no decision, and leaves post-deload carry-forward/summary on the pre-deload load", async () => {
      // 1+2 — a completed non-deload performance at 100 kg (real
      // load-progression evaluation), which produces the pending 102.5 kg
      // recommendation.
      await runCompletedSession({ startedAt: "2026-08-10T10:00:00.000Z" });
      const seeded = await db.select().from(recommendations);
      expect(seeded).toHaveLength(1);
      expect(seeded[0]!.target).toEqual({ loadKg: 102.5 });
      expect(seeded[0]!.decisionStatus).toBe("pending");

      // 3 — resolve a deload for week 3 with a 0.9 load multiplier.
      await createWeekOverride(db, userId, blockId, {
        weekIndex: 3,
        type: "deload",
        modifiers: { loadMultiplier: 0.9 },
      });

      // 4 — Today's deload bundle shows the 90 kg deload target (100 * 0.9)
      // with no pending recommendation to decide.
      const deloadBundle = await buildTodayBundle(db, userId, new Date(week3Date));
      if (deloadBundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(deloadBundle.today.isDeload).toBe(true);
      const deloadEntry = deloadBundle.today.exercises[0]!;
      expect(deloadEntry.prefill.loadKg).toBe(90);
      expect(deloadEntry.pendingRecommendation).toBeNull();

      // Start + log the deload session's first work set at 90 kg through the
      // real sync write path, without completing yet — proves the
      // server-hydrated/cross-device resume shape (getActiveSession) also
      // omits the recommendation despite it existing, pending, for this
      // (exercise, block).
      const { ops, sessionId } = buildDeloadSessionOps({
        weekIndex: 3,
        prefillLoadKg: 90,
        weightKg: 90,
        startedAt: week3Date,
      });
      const started = await applySyncBatch(db, userId, ops.slice(0, 3));
      expect(started.rejected).toEqual([]);

      const active = await getActiveSession(db, userId);
      expect(active?.id).toBe(sessionId);
      expect(active?.isDeload).toBe(true);
      expect(active?.exercises[0]?.recommendation).toBeNull();

      // 5+6 — completing the deload session (no recommendationDecision op
      // was ever built, and completion's own evaluation skips isDeload
      // sessions) must not touch the pending rec or create a new one.
      const completed = await applySyncBatch(db, userId, [ops[3]!]);
      expect(completed.rejected).toEqual([]);

      const afterDeload = await db.select().from(recommendations);
      expect(afterDeload).toHaveLength(1);
      expect(afterDeload[0]!.decisionStatus).toBe("pending");
      expect(afterDeload[0]!.decisionChosen).toBeNull();
      expect(afterDeload[0]!.target).toEqual({ loadKg: 102.5 });

      // 7 — the next non-deload week's bundle carries forward from the
      // pre-deload 100 kg, not the deload's 90 kg, and the original rec is
      // still there, still pending.
      const postDeloadBundle = await buildTodayBundle(db, userId, new Date(week4Date));
      if (postDeloadBundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(postDeloadBundle.today.isDeload).toBe(false);
      const postDeloadEntry = postDeloadBundle.today.exercises[0]!;
      expect(postDeloadEntry.prefill.loadKg).toBe(100);
      expect(postDeloadEntry.pendingRecommendation).toMatchObject({
        target: { loadKg: 102.5 },
        decision: { status: "pending" },
      });

      // 7 (block summary) — "after" must not be the deload's 90 kg either.
      const summary = await getBlockSummary(db, userId, blockId);
      if (!summary) throw new Error("expected summary");
      expect(summary.hadDeloadSession).toBe(true);
      expect(summary.exercises[0]).toMatchObject({
        exerciseId,
        beforeLoadKg: 100,
        afterLoadKg: 100,
      });
    });
  });
});
