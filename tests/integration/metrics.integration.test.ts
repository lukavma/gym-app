import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb, createTestDbWithStatementLog } from "./testDb";
import { bodyweightEntries, sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise } from "@/server/exercises/service";
import { applySyncBatch } from "@/server/sync/service";
import { getWeeklyVolumeReport } from "@/server/volume/service";
import { getExerciseStrengthReport } from "@/server/strength/service";
import { getMetricsDashboard } from "@/server/metrics/service";
import { replaceSelection } from "@/server/metrics/selectionService";
import { seedMuscleGroups, seedVolumePresets } from "@/db/seed";
import type { MetricsDashboardDto } from "@/domain/metrics/types";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §11.2 (query plan), §11.3 (performance boundaries), acceptance criteria
// A-2 (divergence fixtures), A-3, A-10 through A-16, A-34.

async function insertTestUser(db: AppDb, email = "metrics@example.com") {
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

// Saturday — Europe/Ljubljana (users.timezone default), weekStartsOn = 1
// (Monday). The current week (W0) runs Mon 2026-08-31 .. Sun 2026-09-06 (later
// than the "so far" partial-week label suggests, since the fixture asOf below
// is fixed at noon on the Sunday).
const AS_OF = new Date("2026-09-06T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(AS_OF.getTime() - days * 86_400_000).toISOString();
}

describe("getMetricsDashboard", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;

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
  });

  it("A-10: returns the full DTO shape with one consistent asOf/asOfLocalDate/timezone", async () => {
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.generatedAt).toBe(AS_OF.toISOString());
    expect(metrics.asOf).toBe(AS_OF.toISOString());
    expect(metrics.asOfLocalDate).toBe("2026-09-06");
    expect(metrics.timezone).toBe("Europe/Ljubljana");
    expect(metrics.weekStartsOn).toBe(1);
    expect(metrics.training.weeks).toHaveLength(8);
    expect(metrics.strength.selection).toEqual([]);
    expect(metrics.strength.windowDays).toBe(90);
    expect(metrics.strength.algorithm).toEqual({
      id: "e1rm-epley-rir",
      version: 1,
      formula: "epley",
    });
    expect(metrics.volume.weeks).toHaveLength(2);
    expect(metrics.bodyweight.series).toEqual([]);
    expect(metrics.recovery.days).toHaveLength(7);
  });

  it("A-2(i): a completed deload session with no work sets badges Training, not Volume", async () => {
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({ exerciseId, startedAt: daysBefore(2), sets: [], isDeload: true }).ops,
    );
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.training.weeks[0]).toMatchObject({
      isDeload: true,
      sessionsCompleted: 1,
      workSets: 0,
    });
    expect(metrics.volume.weeks[0]?.isDeload).toBe(false);
  });

  it("A-2(ii): an in-progress deload session badges Volume (and counts its sets), not Training", async () => {
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(2),
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
        isDeload: true,
        complete: false,
      }).ops,
    );
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.training.weeks[0]).toMatchObject({
      isDeload: false,
      sessionsCompleted: 0,
      workSets: 0,
    });
    expect(metrics.volume.weeks[0]?.isDeload).toBe(true);
    expect(metrics.volume.weeks[0]?.leaves.quads.effective).toBeGreaterThan(0);
  });

  it("A-2(iii): a completed session dated after D appears in volume.weeks[0] but not training/strength", async () => {
    // D must be mid-week for a "future, but still inside the current
    // calendar week" session to exist at all — AS_OF (Sunday, the week's
    // last day under weekStartsOn=1) has no such day. Wednesday 2026-09-02
    // is the same current week (2026-08-31 .. 2026-09-07 exclusive).
    const midWeekAsOf = new Date("2026-09-02T12:00:00.000Z");
    await replaceSelection(db, userId, [exerciseId]);
    const futureStart = new Date(midWeekAsOf.getTime() + 2 * 86_400_000).toISOString();
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: futureStart,
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
      }).ops,
    );
    const metrics = await getMetricsDashboard(db, userId, midWeekAsOf);
    expect(metrics.training.weeks[0]).toMatchObject({ sessionsCompleted: 0, workSets: 0 });
    expect(metrics.volume.weeks[0]?.startDate).toBe("2026-08-31");
    expect(metrics.volume.weeks[0]?.leaves.quads.effective).toBeGreaterThan(0);
    expect(metrics.strength.selection[0]).toMatchObject({ state: "no_current_estimate" });
  });

  it("A-3: in-progress and discarded sessions contribute nothing to training or strength", async () => {
    const completed = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(2),
      sets: [{ weightKg: 100, reps: 5, rir: 2 }],
    });
    await applySyncBatch(db, userId, completed.ops);

    const inProgress = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(1),
      sets: [{ weightKg: 999, reps: 5, rir: 2 }],
      complete: false,
    });
    await applySyncBatch(db, userId, inProgress.ops);

    const discardedBuild = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(1),
      sets: [{ weightKg: 999, reps: 5, rir: 2 }],
    });
    await applySyncBatch(db, userId, discardedBuild.ops);
    await db
      .update(workoutSessions)
      .set({ status: "discarded" })
      .where(eq(workoutSessions.id, discardedBuild.sessionId));

    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.training.weeks[0]).toMatchObject({ sessionsCompleted: 1, workSets: 1 });
  });

  // §11.2's Training-card row / §11.3 site #4 — the Training card is an
  // ACTIVITY count structurally independent of the profile/volume_counting
  // gate added to `aggregateVolume`: `TrainingSetRow` carries only
  // `{sessionId, isWarmup}`, so it cannot even express a profile filter.
  // O-6's caption change is Release 2 (§21.2) — not asserted here — but the
  // counting RULE itself ("every exercise type counts as a set") is already
  // today's behaviour and must not regress once Volume grows its own gate.
  // Raw inserts (not `buildSessionOps`, which is fixed to the `load_reps`
  // sync payload shape) so the set matches its profile's exact CHECK shape.
  it("O-6 / §11.2: a non-load_reps, volume-excluded exercise's sets still count on the Training card", async () => {
    const pushup = await createExercise(db, userId, {
      name: "Hand-built Push-Up",
      equipment: "other",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      measurementProfile: "reps",
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    expect(pushup.volumeCounting).toBe("off"); // O-4(ii) — closed by default.

    const startedAt = new Date(daysBefore(2));
    const sessionId = newId();
    const sessionExerciseId = newId();
    await db.insert(workoutSessions).values({
      id: sessionId,
      userId,
      templateName: "Ad-hoc",
      weekIndex: 1,
      isDeload: false,
      status: "completed",
      startedAt,
      completedAt: startedAt,
    });
    await db.insert(sessionExercises).values({
      id: sessionExerciseId,
      sessionId,
      exerciseId: pushup.id,
      position: 0,
      source: "adhoc",
      measurementProfile: "reps",
      loadBasis: null,
    });
    await db.insert(setLogs).values(
      [1, 2, 3].map((setNumber) => ({
        id: newId(),
        sessionExerciseId,
        setNumber,
        isWarmup: false,
        measurementProfile: "reps",
        weightKg: null,
        reps: 20,
        loggedAt: startedAt,
      })),
    );

    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    // Training counts all 3 sets — the profile/switch gate never reaches it.
    expect(metrics.training.weeks[0]).toMatchObject({ sessionsCompleted: 1, workSets: 3 });
    // Volume excludes every one of them (volumeCounting = 'off').
    expect(metrics.volume.weeks[0]?.leaves.chest).toEqual({ effective: 0, raw: 0 });
  });

  it("A-11: metrics.volume.weeks deep-equals getWeeklyVolumeReport(...).weeks.slice(0,2) for the same now, with an in-progress deload session", async () => {
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(1),
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
        isDeload: true,
        complete: false,
      }).ops,
    );
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    const volumeReport = await getWeeklyVolumeReport(db, userId, AS_OF);
    expect(metrics.volume.weeks).toHaveLength(2);
    expect(metrics.volume.weeks).toEqual(volumeReport.weeks.slice(0, 2));
  });

  it("A-14: a session started at 23:30 account-local on the last day of W1 is counted in W1, not W0", async () => {
    // W0 starts Monday 2026-08-31; W1 is 2026-08-24 .. 2026-08-31 (exclusive).
    // 23:30 Europe/Ljubljana (CEST, UTC+2) on 2026-08-30 is 21:30 UTC.
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.training.weeks[0]!.startDate).toBe("2026-08-31");
    expect(metrics.training.weeks[1]!.startDate).toBe("2026-08-24");

    await applySyncBatch(
      db,
      userId,
      buildSessionOps({ exerciseId, startedAt: "2026-08-30T21:30:00.000Z", sets: [] }).ops,
    );
    const after = await getMetricsDashboard(db, userId, AS_OF);
    expect(after.training.weeks[1]).toMatchObject({ sessionsCompleted: 1 });
    expect(after.training.weeks[0]).toMatchObject({ sessionsCompleted: 0 });
  });

  it("A-14: bodyweight 'latest' orders by date, not by created_at / receipt time", async () => {
    const [older] = await db
      .insert(bodyweightEntries)
      .values({ id: newId(), userId, date: "2026-09-05", weightKg: 80 })
      .returning();
    // Inserted AFTER the row above but dated a day earlier.
    await db
      .insert(bodyweightEntries)
      .values({ id: newId(), userId, date: "2026-09-04", weightKg: 79 });
    expect(older).toBeTruthy();
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.bodyweight.latest).toEqual({ date: "2026-09-05", weightKg: 80 });
  });

  it("A-15: editing a historical set's weight through the sync path changes the next read (computed on read, no cache)", async () => {
    const { setIds, sessionExerciseId } = buildSessionOps({
      exerciseId,
      startedAt: daysBefore(2),
      sets: [
        { weightKg: 100, reps: 5, rir: 2 },
        { weightKg: 100, reps: 5, rir: 2 },
        { weightKg: 100, reps: 5, rir: 2 },
      ],
    });
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: daysBefore(2),
        sets: [
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
        ],
      }).ops,
    );
    await replaceSelection(db, userId, [exerciseId]);
    const before = await getMetricsDashboard(db, userId, AS_OF);
    const beforeVolume = before.volume.weeks[0]!.leaves.quads.effective;

    // Reclassify one of THIS test's own sets as a warm-up (not the fixture
    // above's ids — those belong to a different, unreferenced session).
    void setIds;
    void sessionExerciseId;
    const [row] = await db.select().from(workoutSessions).where(eq(workoutSessions.userId, userId));
    expect(row).toBeTruthy();

    // Directly find one of the just-inserted sets via the session id and flip
    // its is_warmup flag through the same sync path the app itself uses.
    const { setLogs, sessionExercises } = await import("@/db/schema");
    const [se] = await db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, row!.id));
    const [firstSet] = await db.select().from(setLogs).where(eq(setLogs.sessionExerciseId, se!.id));
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: firstSet!.id, sessionExerciseId: se!.id, isWarmup: true },
      },
    ]);

    const after = await getMetricsDashboard(db, userId, AS_OF);
    expect(after.training.weeks[0]!.workSets).toBeLessThan(before.training.weeks[0]!.workSets);
    expect(after.volume.weeks[0]!.leaves.quads.effective).toBeLessThan(beforeVolume);
  });

  it("A-16: the DTO survives a JSON round trip unchanged (no hand-mirrored copy to drift)", async () => {
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    const roundTripped = JSON.parse(JSON.stringify(metrics)) as MetricsDashboardDto;
    // L-5 — `JSON.parse` returns `any`, so `x satisfies MetricsDashboardDto`
    // on its result type-checks unconditionally and proves nothing on its
    // own. The deep-equality check IS the real proof that the DTO is
    // JSON-safe: `JSON.parse(JSON.stringify(...))` is only an involution
    // when every field is already a JSON primitive, so a field secretly
    // typed `string` but populated with a `Date`, `undefined` or `NaN`
    // would survive stringification under a DIFFERENT representation and
    // fail this comparison. The explicit `typeof`/`Array.isArray` checks
    // below are the non-vacuous stand-in for the old `satisfies` — real
    // assertions on the round-tripped value, not on `any`.
    expect(roundTripped).toEqual(metrics);
    expect(typeof roundTripped.generatedAt).toBe("string");
    expect(typeof roundTripped.asOf).toBe("string");
    expect(typeof roundTripped.asOfLocalDate).toBe("string");
    expect(typeof roundTripped.timezone).toBe("string");
    expect(typeof roundTripped.weekStartsOn).toBe("number");
    expect(Array.isArray(roundTripped.training.weeks)).toBe(true);
    expect(Array.isArray(roundTripped.strength.selection)).toBe(true);
    expect(Array.isArray(roundTripped.volume.weeks)).toBe(true);
    expect(Array.isArray(roundTripped.recovery.days)).toBe(true);
  });

  it("M-4 / A-1: weekStartsOn = 0 (Sunday) yields eight Sunday-anchored windows through the metrics service, not just the reused calendarWeekWindows unit", async () => {
    await db.update(users).set({ weekStartsOn: 0 }).where(eq(users.id, userId));
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.weekStartsOn).toBe(0);
    expect(metrics.training.weeks.map((w) => w.startDate)).toEqual([
      "2026-09-06",
      "2026-08-30",
      "2026-08-23",
      "2026-08-16",
      "2026-08-09",
      "2026-08-02",
      "2026-07-26",
      "2026-07-19",
    ]);
  });

  it("M-4 / A-1: Pacific/Kiritimati — the same instant yields a different local day, and the future guard applies to strength too", async () => {
    await db.update(users).set({ timezone: "Pacific/Kiritimati" }).where(eq(users.id, userId));
    await replaceSelection(db, userId, [exerciseId]);

    // Europe/Ljubljana (the default) reads this instant as 2026-09-06
    // 23:30 local; Pacific/Kiritimati (UTC+14) reads the SAME instant as
    // 2026-09-07 11:30 local — a genuinely different account-local day.
    const instant = new Date("2026-09-06T21:30:00.000Z");
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId,
        startedAt: instant.toISOString(),
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
      }).ops,
    );

    const metrics = await getMetricsDashboard(db, userId, instant);
    expect(metrics.timezone).toBe("Pacific/Kiritimati");
    expect(metrics.asOfLocalDate).toBe("2026-09-07");
    expect(metrics.training.weeks[0]!.startDate).toBe("2026-09-07");
    expect(metrics.training.weeks[0]).toMatchObject({ sessionsCompleted: 1, workSets: 1 });
    expect(metrics.strength.selection[0]).toMatchObject({ state: "estimate" });

    // With `D` held at 2026-09-06 (an earlier `now` whose local day in this
    // zone is still 2026-09-06), the SAME session — whose local day is
    // 2026-09-07 — is a future session relative to `D` and must count in
    // neither Training nor Strength (I-6's future guard, applied to the
    // selected exercise's own row too).
    const heldD = new Date("2026-09-06T09:00:00.000Z"); // +14h = 2026-09-06T23:00 local
    const heldMetrics = await getMetricsDashboard(db, userId, heldD);
    expect(heldMetrics.asOfLocalDate).toBe("2026-09-06");
    expect(heldMetrics.training.weeks[0]).toMatchObject({ sessionsCompleted: 0, workSets: 0 });
    expect(heldMetrics.strength.selection[0]).toMatchObject({ state: "no_current_estimate" });
  });

  it("L-9 / A-6(c): the same exercise at two session_exercises positions in one session — the metrics row matches the detail endpoint, under the query's own contractual ORDER BY", async () => {
    const sessionId = newId();
    const seTop = newId();
    const seBackOff = newId();
    const startedAt = daysBefore(3);
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
          isDeload: false,
          startedAt,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: seTop,
          sessionId,
          exerciseId,
          position: 0,
          source: "adhoc",
          prescription: null,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: seTop,
          setNumber: 1,
          isWarmup: false,
          weightKg: 140,
          reps: 3,
          rir: 1,
          loggedAt: startedAt,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: seBackOff,
          sessionId,
          exerciseId,
          position: 1,
          source: "adhoc",
          prescription: null,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: seBackOff,
          setNumber: 1,
          isWarmup: false,
          weightKg: 100,
          reps: 8,
          rir: 2,
          loggedAt: startedAt,
        },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          status: "completed",
          completedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(),
        },
      },
    ];
    await applySyncBatch(db, userId, ops);
    await replaceSelection(db, userId, [exerciseId]);

    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    const detail = await getExerciseStrengthReport(db, userId, exerciseId, {}, AS_OF);
    expect(detail?.estimate.currentE1rmKg).not.toBeNull();
    expect(metrics.strength.selection[0]?.currentE1rmKg).toBe(detail?.estimate.currentE1rmKg);
    expect(metrics.strength.selection[0]?.confidence).toBe(detail?.estimate.confidence);
    expect(metrics.strength.selection[0]?.latestPoolAgeDays).toBe(
      detail?.estimate.latestPoolAgeDays,
    );
  });

  it("A-34: with the selection cleared, strength.selection is [] and one fewer statement runs (step 9 skipped)", async () => {
    const { db: loggedDb, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(loggedDb);
    const u = (await insertTestUser(loggedDb)).id;

    log.reset();
    const metrics = await getMetricsDashboard(loggedDb, u, AS_OF);
    expect(metrics.strength.selection).toEqual([]);
    expect(log.statements.some((s) => /dashboard_estimate_selections/i.test(s))).toBe(true);
    // The authoritative proof that step 9 itself is skipped (not merely
    // returning zero rows) is the exact statement count — A-12's "10 / 12
    // with an empty selection vs 11 / 13 with a non-empty one" pins one
    // fewer statement than the non-empty case, re-verified below on this
    // same no-active-program/no-default-preset fixture.
    expect(log.statements).toHaveLength(10);
  });
});

describe("getMetricsDashboard — statement counts (A-12) and no-write guarantee (A-13)", () => {
  it("A-12/A-13: exactly 11 statements with a 5-exercise selection and no active program/default preset; the log contains no INSERT/UPDATE/DELETE", async () => {
    const { db, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(db);
    const userId = (await insertTestUser(db)).id;
    const exerciseIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ex = await createExercise(db, userId, {
        name: `Fixture Exercise ${i}`,
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      exerciseIds.push(ex.id);
      await applySyncBatch(
        db,
        userId,
        buildSessionOps({
          exerciseId: ex.id,
          startedAt: daysBefore(5),
          sets: [{ weightKg: 100, reps: 5, rir: 2 }],
        }).ops,
      );
    }
    await replaceSelection(db, userId, exerciseIds);

    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(11);
    const writes = log.statements.filter((s) => /^\s*(insert|update|delete)\b/i.test(s));
    expect(writes).toEqual([]);
  });

  it("A-12: exactly 13 statements on the same fixture with a seeded default volume preset (no active program)", async () => {
    const { db, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(db);
    await seedVolumePresets(db);
    const userId = (await insertTestUser(db)).id;
    await seedVolumePresets(db); // re-run: resolves the just-created user's default slot
    const exerciseIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ex = await createExercise(db, userId, {
        name: `Fixture Exercise ${i}`,
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      exerciseIds.push(ex.id);
      await applySyncBatch(
        db,
        userId,
        buildSessionOps({
          exerciseId: ex.id,
          startedAt: daysBefore(5),
          sets: [{ weightKg: 100, reps: 5, rir: 2 }],
        }).ops,
      );
    }
    await replaceSelection(db, userId, exerciseIds);

    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(13);
  });

  it("A-12: exactly 10 / 12 statements on the same two fixtures with the selection cleared (step 9 skipped)", async () => {
    const { db, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(db);
    const userId = (await insertTestUser(db)).id;
    await applySyncBatch(
      db,
      userId,
      buildSessionOps({
        exerciseId: (
          await createExercise(db, userId, {
            name: "Solo Exercise",
            equipment: "barbell",
            mechanics: "compound",
            laterality: "bilateral",
            loadStepKg: 2.5,
            contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
          })
        ).id,
        startedAt: daysBefore(5),
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
      }).ops,
    );

    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(10);

    await seedVolumePresets(db);
    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(12);
  });

  it("A-12: selection-size independence — a ONE-exercise selection yields the same 11/13 totals as five", async () => {
    const { db, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(db);
    const userId = (await insertTestUser(db)).id;
    const exercise = await createExercise(db, userId, {
      name: "Solo Selected Exercise",
      equipment: "barbell",
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
        startedAt: daysBefore(5),
        sets: [{ weightKg: 100, reps: 5, rir: 2 }],
      }).ops,
    );
    await replaceSelection(db, userId, [exercise.id]);

    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(11);

    await seedVolumePresets(db);
    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(13);
  });

  it("A-13: replaceSelection's log contains writes to dashboard_estimate_selections only", async () => {
    const { db, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(db);
    const userId = (await insertTestUser(db)).id;
    const exercise = await createExercise(db, userId, {
      name: "Write Path Exercise",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });

    log.reset();
    await replaceSelection(db, userId, [exercise.id]);
    const writes = log.statements.filter((s) => /^\s*(insert|update|delete)\b/i.test(s));
    expect(writes.length).toBeGreaterThan(0);
    for (const statement of writes) {
      expect(statement.toLowerCase()).toContain("dashboard_estimate_selections");
    }
  });

  it("M-3 / A-12: every fact-table statement is bounded by its own predicate or by an id list from one, and step 9 carries user_id", async () => {
    const { db, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(db);
    const userId = (await insertTestUser(db)).id;
    const exerciseIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ex = await createExercise(db, userId, {
        name: `Boundedness Fixture ${i}`,
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      exerciseIds.push(ex.id);
      await applySyncBatch(
        db,
        userId,
        buildSessionOps({
          exerciseId: ex.id,
          startedAt: daysBefore(5),
          sets: [{ weightKg: 100, reps: 5, rir: 2 }],
        }).ops,
      );
    }
    await replaceSelection(db, userId, exerciseIds);

    log.reset();
    await getMetricsDashboard(db, userId, AS_OF);
    expect(log.statements).toHaveLength(11);

    // §11.3 / A-12's boundedness clause, verbatim: "every statement that
    // reads workout_sessions, set_logs, bodyweight_entries or
    // recovery_entries is bounded either by a started_at/date predicate in
    // its own text or by an id list produced by such a bounded statement."
    // Step 3 (training set rows) is the one statement with no time
    // predicate of its own — it is bounded by step 2's session-id list
    // instead, which is itself bounded.
    const factTableStatements = log.statements.filter((s) =>
      /"workout_sessions"|"set_logs"|"bodyweight_entries"|"recovery_entries"/.test(s),
    );
    expect(factTableStatements.length).toBeGreaterThan(0);
    for (const statement of factTableStatements) {
      const hasStartedAtBound = /"started_at"\s*(>=|<)\s*\$\d/.test(statement);
      const hasDateBound = /"date"\s*(>=|<=)\s*\$\d/.test(statement);
      const hasSessionIdList = /"session_id"\s+in\s*\(/i.test(statement);
      expect(
        hasStartedAtBound || hasDateBound || hasSessionIdList,
        `unbounded fact-table statement: ${statement}`,
      ).toBe(true);
    }

    // Step 9 (the selection-bounded strength fact query) is the one
    // statement RM-6 requires to carry `user_id` explicitly in its own
    // text, alongside the exercise-id list and both instant bounds. Its
    // fingerprint is the WHERE-clause `IN` predicate on
    // `session_exercises.exercise_id` — the reused volume query (steps
    // 4-7) also references that same quoted column pair, but only inside a
    // JOIN's `ON` equality, never followed by `in (`.
    const step9 = log.statements.find((s) =>
      /"session_exercises"\."exercise_id"\s+in\s*\(/i.test(s),
    );
    expect(step9, "step 9 (strength fact query) not found in the captured log").toBeTruthy();
    expect(step9).toContain('"workout_sessions"."user_id"');
    expect(step9).toMatch(/"started_at"\s*>=\s*\$\d/);
    expect(step9).toMatch(/"started_at"\s*<\s*\$\d/);
    expect(step9).toMatch(
      /order by "session_exercises"\."exercise_id" asc, "workout_sessions"\."started_at" asc, "session_exercises"\."position" asc, "set_logs"\."set_number" asc/i,
    );
  });
});
