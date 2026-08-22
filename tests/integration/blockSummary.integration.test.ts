import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock, activateBlock, getBlockSummary } from "@/server/blocks/service";
import { createPrescription } from "@/server/prescriptions/service";
import { newId } from "@/domain/ids/uuidv7";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

async function insertCompletedSession(
  db: AppDb,
  opts: {
    userId: string;
    blockId: string;
    templateId: string;
    exerciseId: string;
    startedAt: Date;
    isDeload: boolean;
    weightKg: number;
  },
) {
  const sessionId = newId();
  const sessionExerciseId = newId();
  await db.insert(workoutSessions).values({
    id: sessionId,
    userId: opts.userId,
    blockId: opts.blockId,
    templateId: opts.templateId,
    templateName: "Push Day",
    weekIndex: 1,
    isDeload: opts.isDeload,
    status: "completed",
    startedAt: opts.startedAt,
    completedAt: opts.startedAt,
  });
  await db.insert(sessionExercises).values({
    id: sessionExerciseId,
    sessionId,
    exerciseId: opts.exerciseId,
    position: 0,
    source: "template",
  });
  await db.insert(setLogs).values({
    id: newId(),
    sessionExerciseId,
    setNumber: 1,
    isWarmup: false,
    weightKg: opts.weightKg,
    reps: 5,
    rir: null,
    loggedAt: opts.startedAt,
  });
  return sessionId;
}

describe("getBlockSummary (PGlite integration)", () => {
  let db: AppDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
  });

  it("returns null for a block owned by another user", async () => {
    const user = await insertTestUser(db);
    const program = await createProgram(db, user.id, { name: "Program A" });
    const template = await createTemplate(db, user.id, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    const block = await createBlock(db, user.id, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");

    const otherUser = await insertTestUser(db, "other@example.com");
    expect(await getBlockSummary(db, otherUser.id, block.id)).toBeNull();
  });

  it("derives sessions-completed count, before->after per exercise, and hadDeloadSession", async () => {
    const user = await insertTestUser(db);
    const exercise = await createExercise(db, user.id, {
      name: "Back Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const program = await createProgram(db, user.id, { name: "Program A" });
    const template = await createTemplate(db, user.id, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    const prescription = await createPrescription(db, user.id, template.id, {
      exerciseId: exercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    });
    if (!prescription) throw new Error("expected prescription");

    const block = await createBlock(db, user.id, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, user.id, block.id);

    const dayMs = 24 * 60 * 60 * 1000;
    const base = new Date("2026-01-01T09:00:00.000Z");
    // Chronological: 100kg (first) -> 105kg -> deload at 50kg (excluded) -> 110kg (last, "after").
    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      exerciseId: exercise.id,
      startedAt: new Date(base.getTime()),
      isDeload: false,
      weightKg: 100,
    });
    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      exerciseId: exercise.id,
      startedAt: new Date(base.getTime() + 7 * dayMs),
      isDeload: false,
      weightKg: 105,
    });
    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      exerciseId: exercise.id,
      startedAt: new Date(base.getTime() + 14 * dayMs),
      isDeload: true,
      weightKg: 50,
    });
    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      exerciseId: exercise.id,
      startedAt: new Date(base.getTime() + 21 * dayMs),
      isDeload: false,
      weightKg: 110,
    });

    const summary = await getBlockSummary(db, user.id, block.id);
    expect(summary?.sessionsCompleted).toBe(4);
    expect(summary?.hadDeloadSession).toBe(true);
    expect(summary?.exercises).toEqual([
      { exerciseId: exercise.id, exerciseName: "Back Squat", beforeLoadKg: 100, afterLoadKg: 110 },
    ]);
  });

  it("omits an exercise with no completed non-deload session in the block", async () => {
    const user = await insertTestUser(db);
    const exercise = await createExercise(db, user.id, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    const program = await createProgram(db, user.id, { name: "Program A" });
    const template = await createTemplate(db, user.id, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    const prescription = await createPrescription(db, user.id, template.id, {
      exerciseId: exercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    });
    if (!prescription) throw new Error("expected prescription");
    const block = await createBlock(db, user.id, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");

    // No sessions ever logged for this block.
    const summary = await getBlockSummary(db, user.id, block.id);
    expect(summary).toEqual({ sessionsCompleted: 0, hadDeloadSession: false, exercises: [] });
  });
});
