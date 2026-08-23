import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock, activateBlock, getBlockSummary, updateBlock } from "@/server/blocks/service";
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

// A minimal but schema-valid PrescriptionSnapshot JSONB
// (domain/schemas/prescriptionSnapshot.ts) — only `exerciseName` varies
// between test cases; everything else is filler that satisfies the schema
// so `extractSnapshotExerciseName`'s safeParse succeeds.
function buildPrescriptionSnapshot(exerciseId: string, exerciseName: string) {
  return {
    v: 1,
    snapshot: {
      exerciseId,
      exerciseName,
      scheme: { type: "fixed", sets: 3, reps: 5 },
      targetRir: null,
      restSeconds: null,
      progression: {
        strategyId: "manual",
        strategyVersion: 1,
        config: {},
        classification: "heuristic",
      },
      appliedModifiers: null,
      prefill: { loadKg: null, reps: null },
    },
  };
}

async function insertCompletedSession(
  db: AppDb,
  opts: {
    userId: string;
    blockId: string;
    templateId: string | null;
    exerciseId: string;
    startedAt: Date;
    isDeload: boolean;
    weightKg: number;
    source?: "template" | "adhoc";
    prescription?: unknown;
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
    source: opts.source ?? "template",
    prescription: opts.prescription ?? null,
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

  // L-3 remediation (docs/reviews/phase-5-review.md) — the summary must
  // derive its exercise list from what was actually performed
  // (session_exercises), never from the block's current mutable schedule.
  // Removing a template from an active block's schedule (now allowed —
  // active-schedule remediation) must not make its already-performed
  // exercise vanish from the eventual completed-block summary.
  it("keeps a previously performed exercise in the summary after its template is removed from the active schedule", async () => {
    const user = await insertTestUser(db);
    const squat = await createExercise(db, user.id, {
      name: "Back Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const bench = await createExercise(db, user.id, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    const program = await createProgram(db, user.id, { name: "Program A" });
    const lowerDay = await createTemplate(db, user.id, program.id, { name: "Lower Day" });
    const upperDay = await createTemplate(db, user.id, program.id, { name: "Upper Day" });
    if (!lowerDay || !upperDay) throw new Error("expected templates");
    await createPrescription(db, user.id, lowerDay.id, {
      exerciseId: squat.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    });
    await createPrescription(db, user.id, upperDay.id, {
      exerciseId: bench.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    });

    const block = await createBlock(db, user.id, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [
        { templateId: lowerDay.id, weekdays: [1] },
        { templateId: upperDay.id, weekdays: [4] },
      ],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, user.id, block.id);

    const base = new Date("2026-01-01T09:00:00.000Z");
    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: lowerDay.id,
      exerciseId: squat.id,
      startedAt: base,
      isDeload: false,
      weightKg: 100,
    });
    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: upperDay.id,
      exerciseId: bench.id,
      startedAt: new Date(base.getTime() + 3 * 24 * 60 * 60 * 1000),
      isDeload: false,
      weightKg: 60,
    });

    // Remove Upper Day from the active schedule — allowed now, and must not
    // touch bench's already-logged history.
    await updateBlock(db, user.id, block.id, {
      schedule: [{ templateId: lowerDay.id, weekdays: [1] }],
    });

    const summary = await getBlockSummary(db, user.id, block.id);
    expect(summary?.exercises.map((e) => e.exerciseId).sort()).toEqual([squat.id, bench.id].sort());
    expect(summary?.exercises).toContainEqual({
      exerciseId: bench.id,
      exerciseName: "Bench Press",
      beforeLoadKg: 60,
      afterLoadKg: 60,
    });
  });

  it("includes a performed ad-hoc exercise even though it was never prescribed", async () => {
    const user = await insertTestUser(db);
    const dbCurl = await createExercise(db, user.id, {
      name: "Cable Curl",
      equipment: "cable",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "biceps", role: "primary", weight: 1 }],
    });
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
    await activateBlock(db, user.id, block.id);

    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      exerciseId: dbCurl.id,
      startedAt: new Date("2026-01-01T09:00:00.000Z"),
      isDeload: false,
      weightKg: 15,
      source: "adhoc",
      prescription: null,
    });

    const summary = await getBlockSummary(db, user.id, block.id);
    expect(summary?.exercises).toEqual([
      { exerciseId: dbCurl.id, exerciseName: "Cable Curl", beforeLoadKg: 15, afterLoadKg: 15 },
    ]);
  });

  it("prefers the frozen snapshot exercise name over the exercise's current (renamed) name", async () => {
    const user = await insertTestUser(db);
    const exercise = await createExercise(db, user.id, {
      name: "Barbell Row",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "back", role: "primary", weight: 1 }],
    });
    const program = await createProgram(db, user.id, { name: "Program A" });
    const template = await createTemplate(db, user.id, program.id, { name: "Pull Day" });
    if (!template) throw new Error("expected template");
    const block = await createBlock(db, user.id, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, user.id, block.id);

    await insertCompletedSession(db, {
      userId: user.id,
      blockId: block.id,
      templateId: template.id,
      exerciseId: exercise.id,
      startedAt: new Date("2026-01-01T09:00:00.000Z"),
      isDeload: false,
      weightKg: 80,
      prescription: buildPrescriptionSnapshot(exercise.id, "Bent-Over Row"),
    });

    const summary = await getBlockSummary(db, user.id, block.id);
    expect(summary?.exercises).toEqual([
      { exerciseId: exercise.id, exerciseName: "Bent-Over Row", beforeLoadKg: 80, afterLoadKg: 80 },
    ]);
  });
});
