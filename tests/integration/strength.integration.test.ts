import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { exercises, sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { reconcileStrengthEstimates, runSeed, seedMuscleGroups } from "@/db/seed";
import { seededExerciseId } from "@/db/seed/exercises";
import { newId } from "@/domain/ids/uuidv7";
import { buildSetDeletionOps } from "@/domain/sync/setDeletionOps";
import { createExercise, setExerciseArchived, updateExercise } from "@/server/exercises/service";
import { applySyncBatch } from "@/server/sync/service";
import { getExerciseStrengthReport } from "@/server/strength/service";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §14.1, §14.4 and acceptance criteria A-20, A-25, A-30, plus the O-2
// migration reconcile. Everything runs against real SQL (PGlite) applying the
// same committed migrations production applies.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

interface SetSpec {
  weightKg: number;
  reps: number;
  rir?: number | null;
  isWarmup?: boolean;
}

// The op sequence one completed workout produces on the wire — the same
// write path the app itself uses, so nothing here can pass because a test
// helper wrote a row the real code never would.
function buildSessionOps(input: {
  exerciseId: string;
  sets: SetSpec[];
  startedAt: string;
  isDeload?: boolean;
  complete?: boolean;
}) {
  const sessionId = newId();
  const sessionExerciseId = newId();
  const setIds = input.sets.map(() => newId());
  const completedAt = new Date(Date.parse(input.startedAt) + 3_600_000).toISOString();

  const ops: SyncOpEnvelope[] = [
    {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: {
        id: sessionId,
        blockId: null,
        templateId: null,
        templateName: null,
        weekIndex: null,
        isDeload: input.isDeload ?? false,
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
        exerciseId: input.exerciseId,
        position: 0,
        source: "adhoc",
        prescription: null,
      },
    },
    ...input.sets.map((spec, index): SyncOpEnvelope => ({
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: setIds[index]!,
        sessionExerciseId,
        setNumber: index + 1,
        isWarmup: spec.isWarmup ?? false,
        weightKg: spec.weightKg,
        reps: spec.reps,
        rir: spec.rir ?? null,
        loggedAt: input.startedAt,
      },
    })),
  ];

  if (input.complete !== false) {
    ops.push({
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "completed", completedAt },
    });
  }

  return { ops, sessionId, sessionExerciseId, setIds };
}

const AS_OF = new Date("2026-09-06T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(AS_OF.getTime() - days * 86_400_000).toISOString();
}

describe("strength report over real SQL (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    // Europe/Ljubljana is the `users.timezone` default; the report is
    // computed in ACCOUNT-timezone calendar days, not UTC ones.
    const exercise = await createExercise(db, userId, {
      name: "Back Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    exerciseId = exercise.id;
  });

  it("derives current, best and the trend from completed sessions", async () => {
    for (const [days, weight] of [
      [20, 100],
      [12, 105],
      [5, 110],
    ] as const) {
      const { ops } = buildSessionOps({
        exerciseId,
        startedAt: daysBefore(days),
        sets: [
          { weightKg: weight, reps: 5, rir: 2 },
          { weightKg: weight, reps: 5, rir: 2 },
          { weightKg: weight, reps: 5, rir: 2 },
        ],
      });
      await applySyncBatch(db, userId, ops);
    }

    const report = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    // 100/105/110 kg x 5 @ RIR 2 -> RTF 7 -> 123.33 / 129.5 / 135.67.
    expect(report?.estimate.currentE1rmKg).toBe(129.5);
    expect(report?.estimate.best).toMatchObject({ e1rmKg: 135.67, unconfirmed: false });
    expect(report?.observations).toHaveLength(3);
    // Newest first.
    expect(report?.observations[0]?.e1rmKg).toBe(135.67);
    expect(report?.estimate.confidence).toBe("high");
    expect(report?.exercise.loadStepKg).toBe(2.5);
    expect(report?.algorithm).toEqual({ id: "e1rm-epley-rir", version: 1, formula: "epley" });
  });

  it("counts only completed sessions (§6.3)", async () => {
    const completed = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(5),
      sets: [{ weightKg: 100, reps: 5, rir: 2 }],
    });
    await applySyncBatch(db, userId, completed.ops);

    const inProgress = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(2),
      sets: [{ weightKg: 200, reps: 5, rir: 2 }],
      complete: false,
    });
    await applySyncBatch(db, userId, inProgress.ops);

    const report = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(report?.observations).toHaveLength(1);
    // NEGATIVE CONTROL: the in-progress 200 kg session must not move the
    // estimate — N-5, "the estimate never moves during a workout".
    expect(report?.estimate.currentE1rmKg).toBe(123.33);
    expect(report?.estimate.best?.e1rmKg).not.toBe(266.67);

    await db
      .update(workoutSessions)
      .set({ status: "discarded" })
      .where(eq(workoutSessions.id, inProgress.sessionId));
    const afterDiscard = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(afterDiscard?.observations).toHaveLength(1);
  });

  it("recomputes on read after a set edit, a reclassification and a delete (A-20)", async () => {
    const { ops, setIds, sessionExerciseId } = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(4),
      sets: [
        { weightKg: 60, reps: 5, rir: 2 },
        { weightKg: 100, reps: 5, rir: 2 },
        { weightKg: 100, reps: 5, rir: 2 },
        { weightKg: 100, reps: 5, rir: 2 },
      ],
    });
    await applySyncBatch(db, userId, ops);

    const before = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(before?.estimate.currentE1rmKg).toBe(123.33);
    expect(before?.observations[0]?.excludedSetCounts.subModal).toBe(1);
    expect(before?.observations[0]?.reasonCodes).toContain("SUB_MODAL_SETS_EXCLUDED");

    // (a) Reclassify the ramp as a warm-up — the F-1 remediation's own path.
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[0]!, sessionExerciseId, isWarmup: true },
      },
    ]);
    const afterFlag = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(afterFlag?.estimate.currentE1rmKg).toBe(123.33);
    expect(afterFlag?.observations[0]?.excludedSetCounts.subModal).toBe(0);
    expect(afterFlag?.observations[0]?.excludedSetCounts.warmup).toBe(1);
    expect(afterFlag?.observations[0]?.reasonCodes).not.toContain("SUB_MODAL_SETS_EXCLUDED");

    // (b) Correct a weight — 100 -> 110 on two of the three work sets makes
    // 110 the modal group.
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[1]!, sessionExerciseId, weightKg: 110 },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[2]!, sessionExerciseId, weightKg: 110 },
      },
    ]);
    const afterEdit = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(afterEdit?.estimate.currentE1rmKg).toBe(135.67);
    expect(afterEdit?.observations[0]?.governingGroupLoadKg).toBe(110);

    expect(afterEdit?.observations[0]?.groups.find((g) => g.loadKg === 110)?.setCount).toBe(2);

    // (c) Delete a middle set through the SAME op builder the history screen
    // uses, so the renumbering of the survivors is exercised too. The
    // group loses a member and the observation picks up SINGLE_SET_GROUP.
    // A-20's "no table other than `set_logs` (and `updated_at` on renumbered
    // siblings)" clause. All three of the other tables the deletion path can
    // reach are sampled — `session_exercises` especially, since the ops
    // address rows BY `sessionExerciseId` and a regression that bumped its
    // `updated_at` would otherwise pass unnoticed.
    const snapshot = async () => ({
      exercise: await db
        .select({ updatedAt: exercises.updatedAt })
        .from(exercises)
        .where(eq(exercises.id, exerciseId)),
      session: await db
        .select({ updatedAt: workoutSessions.updatedAt, status: workoutSessions.status })
        .from(workoutSessions)
        .where(eq(workoutSessions.userId, userId)),
      sessionExercise: await db
        .select({ updatedAt: sessionExercises.updatedAt, position: sessionExercises.position })
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId)),
    });
    const before2 = await snapshot();

    const rows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(setLogs.setNumber);
    const { ops: deletionOps } = buildSetDeletionOps({
      sessionExerciseId,
      setId: setIds[1]!,
      sets: rows.map((row) => ({
        id: row.id,
        setNumber: row.setNumber,
        isWarmup: row.isWarmup,
        weightKg: row.weightKg,
        reps: row.reps,
        rir: row.rir,
        loggedAt: row.loggedAt.toISOString(),
        notes: row.notes,
      })),
    });
    const deletionResult = await applySyncBatch(
      db,
      userId,
      deletionOps as unknown as SyncOpEnvelope[],
    );
    expect(deletionResult.rejected).toEqual([]);

    const afterDelete = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    const group = afterDelete?.observations[0]?.groups.find((g) => g.loadKg === 110);
    expect(group?.setCount).toBe(1);
    expect(afterDelete?.observations[0]?.flags).toContain("SINGLE_SET_GROUP");
    expect(afterDelete?.estimate.currentE1rmKg).toBe(135.67);

    // The exercise, session and session_exercise rows are byte-identical
    // across the delete, and the survivors are renumbered contiguously.
    const after2 = await snapshot();
    expect(after2).toEqual(before2);

    const remaining = await db
      .select({ id: setLogs.id, setNumber: setLogs.setNumber })
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(setLogs.setNumber);
    expect(remaining).toHaveLength(3);
    expect(remaining.map((row) => row.setNumber)).toEqual([1, 2, 3]);

    const [exerciseRow] = await db
      .select({ strengthEstimate: exercises.strengthEstimate })
      .from(exercises)
      .where(eq(exercises.id, exerciseId));
    expect(exerciseRow?.strengthEstimate).toBe("auto");
  });

  it("badges a deload session but keeps it out of current and best (§6.3, O-10)", async () => {
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(10),
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
      }).ops,
    );
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(3),
        sets: [{ weightKg: 130, reps: 5, rir: 2 }],
        isDeload: true,
      }).ops,
    );

    const report = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(report?.estimate.currentE1rmKg).toBe(123.33);
    expect(report?.estimate.best?.e1rmKg).toBe(123.33);
    expect(report?.estimate.reasonCodes).toContain("DELOAD_SESSIONS_EXCLUDED");
    expect(report?.observations).toHaveLength(2);
    expect(report?.observations.find((o) => o.isDeload)?.flags).toContain("DELOAD_SESSION");
  });

  it("dates an observation by the ACCOUNT timezone, not by UTC (V-10)", async () => {
    // NEGATIVE CONTROL for the account-timezone half of V-10. `users.timezone`
    // defaults to Europe/Ljubljana, which is UTC+2 in September. A session
    // starting at 22:30 UTC on the 3rd is 00:30 local on the 4th, so its
    // `performedOn` must be 2026-09-04. Hard-coding the conversion to "UTC"
    // — or keying off `logged_at` in UTC — would report 2026-09-03.
    const startedAt = "2026-09-03T22:30:00.000Z";
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt,
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
      }).ops,
    );

    const report = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(report?.timezone).toBe("Europe/Ljubljana");
    expect(report?.observations[0]?.performedOn).toBe("2026-09-04");
    expect(report?.observations[0]?.performedOn).not.toBe("2026-09-03");

    // And the same instant read through a UTC account lands on the 3rd —
    // proving the date really is derived from the account's zone rather than
    // being a constant this fixture happens to match.
    await db.update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
    const utcReport = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(utcReport?.timezone).toBe("UTC");
    expect(utcReport?.observations[0]?.performedOn).toBe("2026-09-03");
  });

  it("counts a completed session that logged no eligible set", async () => {
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(3),
        sets: [{ weightKg: 60, reps: 10, rir: null, isWarmup: true }],
      }).ops,
    );
    const report = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(report?.sessionsWithoutEligibleSets).toBe(1);
    expect(report?.observations).toHaveLength(0);
    expect(report?.estimate.reasonCodes).toContain("NO_ELIGIBLE_SETS");
  });
});

describe("endpoint semantics (A-25, §14.4)", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    const exercise = await createExercise(db, userId, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    exerciseId = exercise.id;
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(5),
        sets: [
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
        ],
      }).ops,
    );
  });

  it("returns null for another user's exercise — indistinguishable from missing", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await expect(
      getExerciseStrengthReport(db, otherUserId, exerciseId, {}, AS_OF),
    ).resolves.toBeNull();
    await expect(getExerciseStrengthReport(db, userId, newId(), {}, AS_OF)).resolves.toBeNull();
  });

  it("treats a malformed id as not-found, never letting Postgres raise (review F-5)", async () => {
    // Without the guard, `uuid` rejects these with SQLSTATE 22P02, which no
    // route in this repository maps — it surfaced as an unhandled 500.
    for (const malformed of [
      "not-a-uuid",
      "",
      "123",
      "'; drop table exercises; --",
      "01a07403-3454-7885-ad2f",
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
    ]) {
      await expect(
        getExerciseStrengthReport(db, userId, malformed, {}, AS_OF),
        `expected null for ${JSON.stringify(malformed)}`,
      ).resolves.toBeNull();
    }
    // NEGATIVE CONTROL: a well-formed id that simply does not exist takes the
    // same path, so the guard cannot be what makes the loop above pass.
    await expect(getExerciseStrengthReport(db, userId, newId(), {}, AS_OF)).resolves.toBeNull();
    // ...and a real id still resolves, so the guard is not rejecting everything.
    await expect(
      getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF),
    ).resolves.not.toBeNull();
  });

  it("serves an ARCHIVED exercise (O-15)", async () => {
    await setExerciseArchived(db, userId, exerciseId, "archive");
    const report = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(report).not.toBeNull();
    expect(report?.exercise.archivedAt).toBeInstanceOf(Date);
    expect(report?.estimate.currentE1rmKg).toBe(123.33);
  });

  it("clamps a future asOf to server now and echoes the effective value (RM-2)", async () => {
    const future = new Date(AS_OF.getTime() + 30 * 86_400_000);
    const report = await getExerciseStrengthReport(db, userId, exerciseId, { asOf: future }, AS_OF);
    expect(report?.asOf).toBe(AS_OF.toISOString());
    expect(report?.asOfLocalDate).toBe("2026-09-06");
  });

  it("honours a PAST asOf, hiding everything after it", async () => {
    const past = new Date(AS_OF.getTime() - 10 * 86_400_000);
    const report = await getExerciseStrengthReport(db, userId, exerciseId, { asOf: past }, AS_OF);
    expect(report?.asOf).toBe(past.toISOString());
    expect(report?.estimate.currentE1rmKg).toBeNull();
    expect(report?.observations).toHaveLength(0);
  });

  it("computes the what-if from the current estimate", async () => {
    const report = await getExerciseStrengthReport(
      db,
      userId,
      exerciseId,
      { whatIf: { reps: 8, rir: 1 } },
      AS_OF,
    );
    // 123.33 / f(9) = 94.87 -> floored to the 2.5 kg grid. Well under the
    // 1.10 × 100 = 110.00 cap, so no cap code.
    expect(report?.whatIf?.rawLoadKg).toBe(94.87);
    expect(report?.whatIf?.loadKg).toBe(92.5);
    expect(report?.whatIf?.reasonCodes).not.toContain("CAPPED_AT_RECENT_MAX_LOAD");
  });

  it("caps the what-if at 1.10 × the heaviest admitted load, end to end (review F-2)", async () => {
    // The fixture in `beforeEach` is `3 × 100×5 @ RIR 2` -> current 123.33,
    // heaviest admitted load 100, so the cap is 110.00. A 3-rep target at
    // RIR 0 translates to 112.12, above it.
    const report = await getExerciseStrengthReport(
      db,
      userId,
      exerciseId,
      { whatIf: { reps: 3, rir: 0 } },
      AS_OF,
    );
    expect(report?.whatIf?.rawLoadKg).toBe(112.12);
    expect(report?.whatIf?.loadKg).toBe(110);
    expect(report?.whatIf?.reasonCodes).toContain("CAPPED_AT_RECENT_MAX_LOAD");
    // On this fixture the 2.5 kg grid floors both 112.12 and the capped
    // 110.00 to the same 110, so the emitted load alone does not distinguish
    // the two — the BAND does, because §9.5 step 8 brackets the value the cap
    // left behind. NEGATIVE CONTROL: uncapped it would be [100, 125].
    expect(report?.whatIf?.bandKg).toEqual([97.5, 122.5]);
    expect(report?.whatIf?.bandKg).not.toEqual([100, 125]);
  });
});

describe("the exercise opt-out (A-30, O-2)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
  });

  async function withHistory(equipment: "barbell" | "bodyweight", name: string) {
    const exercise = await createExercise(db, userId, {
      name,
      equipment,
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId: exercise.id,
        startedAt: daysBefore(4),
        sets: [
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
        ],
      }).ops,
    );
    return exercise;
  }

  it("defaults a new exercise to 'auto'", async () => {
    const exercise = await withHistory("barbell", "Front Squat");
    expect(exercise.strengthEstimate).toBe("auto");
    const report = await getExerciseStrengthReport(db, userId, exercise.id, {}, AS_OF);
    expect(report?.eligible).toBe(true);
    expect(report?.estimate.currentE1rmKg).toBe(123.33);
  });

  it("refuses everywhere once the switch is off, and restores on flipping back", async () => {
    const exercise = await withHistory("barbell", "Zercher Squat");
    const updated = await updateExercise(db, userId, exercise.id, { strengthEstimate: "off" });
    expect(updated.strengthEstimate).toBe("off");

    const off = await getExerciseStrengthReport(
      db,
      userId,
      exercise.id,
      { whatIf: { reps: 5, rir: 2 } },
      AS_OF,
    );
    expect(off?.eligible).toBe(false);
    expect(off?.estimate.currentE1rmKg).toBeNull();
    expect(off?.estimate.reasonCodes).toEqual(["EXERCISE_ESTIMATE_DISABLED"]);
    expect(off?.observations).toEqual([]);
    expect(off?.whatIf?.reasonCodes).toEqual(["EXERCISE_ESTIMATE_DISABLED"]);

    // Nothing was lost — the switch is a gate over a derivation, not a delete.
    await updateExercise(db, userId, exercise.id, { strengthEstimate: "auto" });
    const back = await getExerciseStrengthReport(db, userId, exercise.id, {}, AS_OF);
    expect(back?.estimate.currentE1rmKg).toBe(123.33);
  });

  it("cannot be enabled for an unsupported category (V-3)", async () => {
    const exercise = await withHistory("bodyweight", "Pull-Up");
    expect(exercise.strengthEstimate).toBe("auto");
    const report = await getExerciseStrengthReport(db, userId, exercise.id, {}, AS_OF);
    expect(report?.eligible).toBe(false);
    expect(report?.estimate.reasonCodes).toEqual(["EXERCISE_CATEGORY_UNSUPPORTED"]);
  });

  it("makes a whole series appear or vanish when equipment is edited (§6.1)", async () => {
    const exercise = await withHistory("barbell", "Hack Squat");
    expect((await getExerciseStrengthReport(db, userId, exercise.id, {}, AS_OF))?.eligible).toBe(
      true,
    );
    await updateExercise(db, userId, exercise.id, { equipment: "other" });
    expect((await getExerciseStrengthReport(db, userId, exercise.id, {}, AS_OF))?.eligible).toBe(
      false,
    );
    await updateExercise(db, userId, exercise.id, { equipment: "barbell" });
    const restored = await getExerciseStrengthReport(db, userId, exercise.id, {}, AS_OF);
    expect(restored?.eligible).toBe(true);
    expect(restored?.estimate.currentE1rmKg).toBe(123.33);
  });
});

describe("the O-2 migration and seed reconcile", () => {
  it("ships the two unreadable-load catalog exercises switched off", async () => {
    const db = await createTestDb();
    await insertTestUser(db);
    await runSeed(db);

    const [user] = await db.select({ id: users.id }).from(users);
    const seededUserId = user!.id;

    for (const slug of ["machine-assisted-pull-up", "dumbbell-farmers-carry"]) {
      const [row] = await db
        .select({ name: exercises.name, strengthEstimate: exercises.strengthEstimate })
        .from(exercises)
        .where(
          and(
            eq(exercises.id, seededExerciseId(seededUserId, slug)),
            eq(exercises.userId, seededUserId),
          ),
        );
      expect(row, `expected a seeded row for ${slug}`).toBeDefined();
      expect(row?.strengthEstimate, slug).toBe("off");
    }
  });

  it("leaves every other seeded exercise on 'auto'", async () => {
    const db = await createTestDb();
    await insertTestUser(db);
    await runSeed(db);
    const [user] = await db.select({ id: users.id }).from(users);
    const seededUserId = user!.id;

    const rows = await db
      .select({ id: exercises.id, strengthEstimate: exercises.strengthEstimate })
      .from(exercises)
      .where(eq(exercises.userId, seededUserId));
    expect(rows.length).toBeGreaterThan(80);
    const off = rows.filter((row) => row.strengthEstimate === "off");
    expect(off).toHaveLength(2);
    const auto = rows.filter((row) => row.strengthEstimate === "auto");
    expect(auto.length).toBe(rows.length - 2);
  });

  it("reaches a row that already existed before the column did — by id, through a rename", async () => {
    // The reconcile's own job, exercised directly rather than assumed. Rows
    // seeded before the column existed are unreachable from the catalog
    // (`seedExerciseCatalogForUser` is ledger-gated and insert-if-absent), so
    // this simulates one: write 'auto' back onto the seeded assisted pull-up
    // AND rename it, then run the reconcile.
    //
    // The rename is the point. §14.4 names the deterministic `slugToUuid`
    // ids as the key, and ADR-010 rejects name matching precisely because
    // `exercises.name` is user-mutable. A name-keyed reconcile passes every
    // other assertion in this file and fails only here.
    const db = await createTestDb();
    await insertTestUser(db);
    await runSeed(db);
    const [user] = await db.select({ id: users.id }).from(users);
    const seededUserId = user!.id;
    const assistedId = seededExerciseId(seededUserId, "machine-assisted-pull-up");

    await db
      .update(exercises)
      .set({ strengthEstimate: "auto", name: "Machine Pull-Up Helper" })
      .where(eq(exercises.id, assistedId));
    const [drifted] = await db
      .select({ strengthEstimate: exercises.strengthEstimate, name: exercises.name })
      .from(exercises)
      .where(eq(exercises.id, assistedId));
    expect(drifted?.strengthEstimate).toBe("auto");
    expect(drifted?.name).toBe("Machine Pull-Up Helper");

    const summary = await reconcileStrengthEstimates(db);
    expect(summary.users).toBe(1);
    expect(summary.updated).toBe(1);

    const [fixed] = await db
      .select({ strengthEstimate: exercises.strengthEstimate, name: exercises.name })
      .from(exercises)
      .where(eq(exercises.id, assistedId));
    expect(fixed?.strengthEstimate).toBe("off");
    // The reconcile touches the switch and nothing else.
    expect(fixed?.name).toBe("Machine Pull-Up Helper");
  });

  it("is state-predicated: a second run touches nothing", async () => {
    const db = await createTestDb();
    await insertTestUser(db);
    await runSeed(db);
    // `runSeed` already ran it once; both rows are 'off' from the catalog, so
    // even the first explicit call has nothing to do.
    const first = await reconcileStrengthEstimates(db);
    expect(first.updated).toBe(0);
    expect(first.noop).toBe(2);
    const second = await reconcileStrengthEstimates(db);
    expect(second.updated).toBe(0);
  });

  it("never touches an exercise it did not seed", async () => {
    // NEGATIVE CONTROL for the `is_seeded` guard: a user-authored exercise
    // named exactly like a catalog entry must be left alone. A name-keyed
    // reconcile without the guard would switch this one off.
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const seededUserId = (await insertTestUser(db)).id;
    const mine = await createExercise(db, seededUserId, {
      name: "Assisted Pull-Up",
      equipment: "machine",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 5,
      contributions: [{ muscleGroupId: "lats", role: "primary", weight: 1 }],
    });
    expect(mine.strengthEstimate).toBe("auto");

    await reconcileStrengthEstimates(db);

    const [row] = await db
      .select({ strengthEstimate: exercises.strengthEstimate })
      .from(exercises)
      .where(eq(exercises.id, mine.id));
    expect(row?.strengthEstimate).toBe("auto");
  });

  it("keeps the migration itself free of data motion", async () => {
    // The repository's convention — no migration in `drizzle/` contains DML —
    // and the reason this reconcile lives in the seed at all. Asserted here
    // rather than left to a reviewer's grep.
    const sql = readFileSync(
      path.resolve(__dirname, "../../drizzle/0011_happy_celestials.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "strength_estimate"');
    expect(sql).toContain("ck_exercises_strength_estimate");
    expect(sql).not.toMatch(/\bUPDATE\s+"?exercises"?/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
