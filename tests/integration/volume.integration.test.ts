import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import {
  blocks,
  exerciseMuscleContributions,
  sessionExercises,
  setLogs,
  users,
  volumePresets,
  workoutSessions,
} from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { activateBlock, createBlock } from "@/server/blocks/service";
import { getWeeklyVolumeReport } from "@/server/volume/service";
import { aggregateVolume } from "@/domain/volume/aggregate";
import { blockWeekWindows } from "@/domain/volume/weekBuckets";
import { localDateToUtcInstant } from "@/server/time/userLocalDate";
import { seedVolumePresets } from "@/db/seed/volumePresets";

async function insertTestUser(db: AppDb, email = "lifter@example.com", timezone = "UTC") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash", timezone, weekStartsOn: 1 })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

interface SessionSpec {
  userId: string;
  blockId?: string | null;
  templateId?: string | null;
  status: "in_progress" | "completed" | "discarded";
  startedAt: Date;
  isDeload?: boolean;
  exerciseId: string;
  source: "template" | "adhoc";
  sets: { weightKg: number; isWarmup?: boolean }[];
}

async function insertSession(db: AppDb, spec: SessionSpec): Promise<string> {
  const sessionId = newId();
  const sessionExerciseId = newId();
  await db.insert(workoutSessions).values({
    id: sessionId,
    userId: spec.userId,
    blockId: spec.blockId ?? null,
    templateId: spec.templateId ?? null,
    templateName: "Push Day",
    weekIndex: 1,
    isDeload: spec.isDeload ?? false,
    status: spec.status,
    startedAt: spec.startedAt,
    completedAt: spec.status === "completed" ? spec.startedAt : null,
  });
  await db.insert(sessionExercises).values({
    id: sessionExerciseId,
    sessionId,
    exerciseId: spec.exerciseId,
    position: 0,
    source: spec.source,
  });
  if (spec.sets.length > 0) {
    await db.insert(setLogs).values(
      spec.sets.map((s, i) => ({
        id: newId(),
        sessionExerciseId,
        setNumber: i + 1,
        isWarmup: s.isWarmup ?? false,
        weightKg: s.weightKg,
        reps: 5,
        loggedAt: spec.startedAt,
      })),
    );
  }
  return sessionId;
}

describe("getWeeklyVolumeReport (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let chestExerciseId: string;
  let absOnlyExerciseId: string; // exclusively used by the discarded session
  const now = new Date("2026-08-06T12:00:00.000Z"); // Thursday in [2026-08-03, 2026-08-10)

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    userId = user.id;

    const chest = await createExercise(db, userId, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [
        { muscleGroupId: "chest", role: "primary", weight: 1 },
        { muscleGroupId: "triceps", role: "secondary", weight: 0.5 },
      ],
    });
    chestExerciseId = chest.id;

    const absOnly = await createExercise(db, userId, {
      name: "Discarded-Only Lift",
      equipment: "other",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "abs", role: "primary", weight: 1 }],
    });
    absOnlyExerciseId = absOnly.id;
  });

  it("has no active preset before any preset is seeded", async () => {
    const report = await getWeeklyVolumeReport(db, userId, now);
    expect(report.activePreset).toBeNull();
    // volume must still render honestly with no preset — the numeric
    // report is fully populated regardless.
    expect(report.weeks).toHaveLength(5);
  });

  it("counts templated and ad-hoc work sets identically, excludes warmups, discarded sessions, and buckets by session.startedAt", async () => {
    // Templated session: 2 work sets + 1 warmup.
    await insertSession(db, {
      userId,
      status: "completed",
      startedAt: new Date("2026-08-04T10:00:00.000Z"),
      exerciseId: chestExerciseId,
      source: "template",
      sets: [{ weightKg: 100 }, { weightKg: 100 }, { weightKg: 40, isWarmup: true }],
      isDeload: true,
    });
    // Ad-hoc session: 2 work sets — must count exactly like the templated one.
    await insertSession(db, {
      userId,
      status: "completed",
      startedAt: new Date("2026-08-04T11:00:00.000Z"),
      exerciseId: chestExerciseId,
      source: "adhoc",
      sets: [{ weightKg: 100 }, { weightKg: 100 }],
    });
    // In-progress session: 1 work set — must still count (only 'discarded'
    // is excluded, domain-model.md §7).
    await insertSession(db, {
      userId,
      status: "in_progress",
      startedAt: new Date("2026-08-05T09:00:00.000Z"),
      exerciseId: chestExerciseId,
      source: "template",
      sets: [{ weightKg: 100 }],
    });
    // Discarded session: must contribute nothing at all.
    await insertSession(db, {
      userId,
      status: "discarded",
      startedAt: new Date("2026-08-05T09:00:00.000Z"),
      exerciseId: absOnlyExerciseId,
      source: "template",
      sets: [{ weightKg: 100 }, { weightKg: 100 }],
    });
    // Two weeks ago: must land in an older bucket, not the current week.
    await insertSession(db, {
      userId,
      status: "completed",
      startedAt: new Date("2026-07-23T10:00:00.000Z"),
      exerciseId: absOnlyExerciseId,
      source: "template",
      sets: [{ weightKg: 50 }, { weightKg: 50 }, { weightKg: 50 }],
    });

    const report = await getWeeklyVolumeReport(db, userId, now);
    const currentWeek = report.weeks[0]!;

    // chest: (2 templated + 2 ad-hoc + 1 in-progress) work sets = 5 primary
    // sets, warmup excluded.
    expect(currentWeek.leaves.chest).toEqual({ effective: 5, raw: 5 });
    expect(currentWeek.leaves.triceps).toEqual({ effective: 2.5, raw: 0 });
    // The discarded session's abs-only exercise must never appear.
    expect(currentWeek.leaves.abs).toEqual({ effective: 0, raw: 0 });
    expect(currentWeek.isDeload).toBe(true);

    expect(report.weeks).toHaveLength(5);
    expect(report.weeks[0]!.startDate).toBe("2026-08-03");
    // Two weeks back: 2026-07-20 .. 2026-07-27 contains 2026-07-23.
    const twoWeeksAgo = report.weeks[2]!;
    expect(twoWeeksAgo.startDate).toBe("2026-07-20");
    expect(twoWeeksAgo.leaves.abs).toEqual({ effective: 3, raw: 3 });
    expect(currentWeek.leaves.abs).toEqual({ effective: 0, raw: 0 });
  });

  it("resolves the seeded RP General preset as the user's default once seeded", async () => {
    await seedVolumePresets(db);
    const report = await getWeeklyVolumeReport(db, userId, now);
    expect(report.activePreset).not.toBeNull();
    expect(report.activePreset!.name).toBe("RP General");
    expect(report.activePreset!.isBuiltin).toBe(true);
    expect(report.activePreset!.landmarks.length).toBeGreaterThan(0);
  });

  it("prefers the active block's volume preset over the user's default", async () => {
    await seedVolumePresets(db);
    const program = await createProgram(db, userId, { name: "Program A" });
    const template = await createTemplate(db, userId, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    const block = await createBlock(db, userId, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    // Create a second, user-owned preset directly and point the block at it —
    // proves resolution reads the block's slot, not just "is there a
    // default". Full duplicate-on-edit flow is covered in
    // volumeLandmarks.integration.test.ts.
    const customPresetId = newId();
    await db.insert(volumePresets).values({
      id: customPresetId,
      userId,
      name: "Block Custom",
      classification: "user_defined",
      isBuiltin: false,
    });
    await db.update(blocks).set({ volumePresetId: customPresetId }).where(eq(blocks.id, block.id));

    const report = await getWeeklyVolumeReport(db, userId, now);
    expect(report.activePreset!.id).toBe(customPresetId);
    expect(report.activePreset!.name).toBe("Block Custom");
  });
});

describe("block-week bucketing + a session spanning midnight (volume-model.md §2)", () => {
  // No production route currently drives block-week mode (the MVP volume
  // screen is calendar-week only per volume-model.md §2's "Calendar week
  // (dashboard)"), but the domain function and the instant-conversion
  // pipeline both support it and are exercised here end-to-end: real
  // PGlite-queried rows through the exact same query shape
  // getWeeklyVolumeReport uses, fed through aggregateVolume with
  // block-week windows instead of calendar-week ones.
  it("keeps a session started just before local midnight in the week containing that calendar day, and a session starting exactly on the next week's boundary in the following week", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db, "blockweek@example.com", "UTC");
    const program = await createProgram(db, user.id, { name: "P" });
    const template = await createTemplate(db, user.id, program.id, { name: "T" });
    if (!template) throw new Error("expected template");
    const block = await createBlock(db, user.id, program.id, {
      name: "B1",
      goal: "general",
      startDate: "2026-08-03",
      weeksPlanned: 4,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, user.id, block.id);

    const exercise = await createExercise(db, user.id, {
      name: "Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });

    // Week 1 = [2026-08-03, 2026-08-10); week 2 = [2026-08-10, 2026-08-17).
    // Session A starts 23:50 on 2026-08-09 (week 1's last day) and its
    // second set is logged after real midnight — the whole session still
    // belongs to week 1 because sessions are atomic for volume
    // (domain-model.md §7), bucketed by session.startedAt alone.
    await insertSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      status: "completed",
      startedAt: new Date("2026-08-09T23:50:00.000Z"),
      exerciseId: exercise.id,
      source: "template",
      sets: [{ weightKg: 100 }, { weightKg: 100 }],
    });
    // Session B starts exactly at week 2's boundary — must land in week 2.
    await insertSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      status: "completed",
      startedAt: new Date("2026-08-10T00:00:00.000Z"),
      exerciseId: exercise.id,
      source: "template",
      sets: [{ weightKg: 100 }],
    });

    const windows = blockWeekWindows("2026-08-03", 2, 2); // [week2, week1]
    const instantWindows = windows.map((w) => ({
      startDate: w.startDate,
      endDateExclusive: w.endDateExclusive,
      startInstant: localDateToUtcInstant(w.startDate, "UTC").toISOString(),
      endInstant: localDateToUtcInstant(w.endDateExclusive, "UTC").toISOString(),
    }));

    const rows = await db
      .select({
        setId: setLogs.id,
        isWarmup: setLogs.isWarmup,
        sessionStartedAt: workoutSessions.startedAt,
        isDeload: workoutSessions.isDeload,
        muscleGroupId: exerciseMuscleContributions.muscleGroupId,
        role: exerciseMuscleContributions.role,
        weight: exerciseMuscleContributions.weight,
      })
      .from(setLogs)
      .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .innerJoin(
        exerciseMuscleContributions,
        eq(exerciseMuscleContributions.exerciseId, sessionExercises.exerciseId),
      )
      .where(eq(workoutSessions.blockId, block.id));

    const mapped = rows.map((r) => ({
      setId: r.setId,
      sessionStartedAt: r.sessionStartedAt.toISOString(),
      isDeload: r.isDeload,
      isWarmup: r.isWarmup,
      muscleGroupId: r.muscleGroupId as "quads",
      role: r.role as "primary",
      weight: r.weight,
    }));

    const [week2, week1] = aggregateVolume(mapped, instantWindows);
    expect(week1!.leaves.quads).toEqual({ effective: 2, raw: 2 });
    expect(week2!.leaves.quads).toEqual({ effective: 1, raw: 1 });
  });
});
