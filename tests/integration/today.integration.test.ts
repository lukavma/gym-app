import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock, activateBlock, createWeekOverride } from "@/server/blocks/service";
import type { DeloadConfig } from "@/domain/blocks/schema";
import { createPrescription } from "@/server/prescriptions/service";
import { buildTodayBundle } from "@/server/today/service";
import { newId } from "@/domain/ids/uuidv7";

// MEDIUM-5 — the implementation report claimed test coverage for
// buildTodayBundle's bundle assembly that never existed. This directly
// exercises the fixed shape: loadStepKg threaded from the exercise,
// generatedAt stamped from `now`, and the previousPerformance (non-deload,
// last 3) / history (last 5) split pwa-offline-strategy.md §4 specifies.
async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

async function insertCompletedHistorySession(
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

const fixedScheme = { v: 1 as const, scheme: { type: "fixed" as const, sets: 3, reps: 5 } };

describe("buildTodayBundle (PGlite integration)", () => {
  let db: AppDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
  });

  it("threads loadStepKg, stamps generatedAt, and splits history into previousPerformance (non-deload, last 3) vs history (last 5)", async () => {
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
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!prescription) throw new Error("expected prescription");

    const now = new Date("2026-01-15T10:00:00.000Z");
    const block = await createBlock(db, user.id, program.id, {
      name: "Block A",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 16,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, user.id, block.id);

    // Six completed sessions, most recent first (i=1..6 days ago); i=2 and
    // i=5 are deload so previousPerformance's non-deload filter has
    // something to actually filter out.
    const dayMs = 24 * 60 * 60 * 1000;
    const sessionIds: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const sessionId = await insertCompletedHistorySession(db, {
        userId: user.id,
        blockId: block.id,
        templateId: template.id,
        exerciseId: exercise.id,
        startedAt: new Date(now.getTime() - i * dayMs),
        isDeload: i === 2 || i === 5,
        weightKg: 100 + i,
      });
      sessionIds.push(sessionId);
    }
    const [s1, s2, s3, s4, s5] = sessionIds;

    const bundle = await buildTodayBundle(db, user.id, now);

    expect(bundle.generatedAt).toBe(now.toISOString());
    expect(bundle.today.kind).toBe("scheduled");
    if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
    expect(bundle.today.blockId).toBe(block.id);
    expect(bundle.today.templateId).toBe(template.id);
    expect(bundle.today.exercises).toHaveLength(1);

    const entry = bundle.today.exercises[0]!;
    expect(entry.exerciseId).toBe(exercise.id);
    expect(entry.loadStepKg).toBe(2.5);

    // history: five most recent regardless of deload — s6 (oldest) excluded.
    expect(entry.history.map((h) => h.sessionId)).toEqual([s1, s2, s3, s4, s5]);

    // previousPerformance: non-deload only (s2, s5 excluded), capped at 3 —
    // so s6 (6th most recent, non-deload) makes the cut where s2/s5 don't.
    expect(entry.previousPerformance.map((h) => h.sessionId)).toEqual([s1, s3, s4]);
    expect(entry.previousPerformance.every((h) => !h.isDeload)).toBe(true);
  });

  it("assembles the in-progress activeSession with per-exercise and per-set notes", async () => {
    const user = await insertTestUser(db);
    const exercise = await createExercise(db, user.id, {
      name: "Back Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });

    const now = new Date("2026-01-15T10:00:00.000Z");
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    await db.insert(workoutSessions).values({
      id: sessionId,
      userId: user.id,
      status: "in_progress",
      startedAt: now,
      notes: "felt strong today",
    });
    await db.insert(sessionExercises).values({
      id: sessionExerciseId,
      sessionId,
      exerciseId: exercise.id,
      position: 0,
      source: "adhoc",
      notes: "left knee twinge",
    });
    await db.insert(setLogs).values({
      id: setId,
      sessionExerciseId,
      setNumber: 1,
      isWarmup: false,
      weightKg: 105,
      reps: 3,
      rir: 1,
      loggedAt: now,
    });

    const bundle = await buildTodayBundle(db, user.id, now);

    expect(bundle.activeSession).not.toBeNull();
    expect(bundle.activeSession?.id).toBe(sessionId);
    expect(bundle.activeSession?.notes).toBe("felt strong today");
    expect(bundle.activeSession?.exercises).toHaveLength(1);
    if (!bundle.activeSession) throw new Error("expected activeSession");
    const exerciseDto = bundle.activeSession.exercises[0]!;
    expect(exerciseDto.source).toBe("adhoc");
    expect(exerciseDto.notes).toBe("left knee twinge");
    expect(exerciseDto.sets).toHaveLength(1);
    expect(exerciseDto.sets[0]).toMatchObject({ id: setId, weightKg: 105, reps: 3, rir: 1 });
  });

  it("resolves no_schedule with a null activeSession when the user has no active program", async () => {
    const user = await insertTestUser(db);
    const bundle = await buildTodayBundle(db, user.id, new Date("2026-01-15T10:00:00.000Z"));
    expect(bundle.today).toEqual({ kind: "no_schedule" });
    expect(bundle.activeSession).toBeNull();
  });

  // implementation-plan.md Phase 5 — effective-modifier resolution.
  describe("deload / week-override modifiers (Phase 5)", () => {
    async function setUpBlock(user: { id: string }, deload?: DeloadConfig) {
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
        scheme: { v: 1, scheme: { type: "fixed", sets: 5, reps: 5 } },
        targetRir: { min: 0, max: 2 },
        baselineLoadKg: 100,
        progression: { strategyId: "manual" },
      });
      if (!prescription) throw new Error("expected prescription");
      const block = await createBlock(db, user.id, program.id, {
        name: "Block 1",
        goal: "general",
        startDate: "2026-01-01",
        weeksPlanned: 8,
        schedule: [{ templateId: template.id }],
        ...(deload ? { deload } : {}),
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, user.id, block.id);
      return { exercise, block };
    }

    // startDate 2026-01-01, week 3 spans days 14-20 (weekIndex = floor(d/7)+1).
    const weekThreeDate = new Date("2026-01-18T10:00:00.000Z");

    it("applies a scheduled deload's modifiers to the current week and marks isDeload", async () => {
      const user = await insertTestUser(db);
      await setUpBlock(user, {
        mode: "scheduled",
        weekIndex: 3,
        modifiers: { setMultiplier: 0.5, loadMultiplier: 0.9, targetRirShift: 2 },
      });

      const bundle = await buildTodayBundle(db, user.id, weekThreeDate);
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.isDeload).toBe(true);
      const entry = bundle.today.exercises[0]!;
      expect(entry.scheme).toEqual({ type: "fixed", sets: 2, reps: 5 });
      expect(entry.targetRir).toEqual({ min: 2, max: 4 });
      expect(entry.prefill.loadKg).toBe(90); // 100 * 0.9, already a 2.5 multiple
      expect(entry.appliedModifiers).toEqual({
        setMultiplier: 0.5,
        loadMultiplier: 0.9,
        targetRirShift: 2,
      });
    });

    // M-1 regression — weekModifiersSchema now rejects setMultiplier > 2 at
    // the API boundary (createBlock/createWeekOverride), but createBlock's
    // *service* function (called directly here, bypassing the route's
    // zod parse — exactly what a config stored before this bound existed
    // would look like) doesn't re-validate it. The clamp in
    // applyWeekModifiers.ts is what must hold regardless: the resolved
    // scheme still has to satisfy PrescriptionSnapshot's 1..20 sets range.
    it("clamps an out-of-range stored setMultiplier to SETS_MAX instead of producing an invalid scheme", async () => {
      const user = await insertTestUser(db);
      await setUpBlock(user, {
        mode: "scheduled",
        weekIndex: 3,
        modifiers: { setMultiplier: 5 },
      });

      const bundle = await buildTodayBundle(db, user.id, weekThreeDate);
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.isDeload).toBe(true);
      expect(bundle.today.exercises[0]?.scheme).toEqual({ type: "fixed", sets: 20, reps: 5 });
    });

    it("does not apply deload modifiers on a week that doesn't match", async () => {
      const user = await insertTestUser(db);
      await setUpBlock(user, {
        mode: "scheduled",
        weekIndex: 3,
        modifiers: { setMultiplier: 0.5 },
      });

      // Week 1 (the block's start date) — not the scheduled deload week.
      const bundle = await buildTodayBundle(db, user.id, new Date("2026-01-02T10:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.isDeload).toBe(false);
      expect(bundle.today.exercises[0]?.appliedModifiers).toBeNull();
      expect(bundle.today.exercises[0]?.scheme).toEqual({ type: "fixed", sets: 5, reps: 5 });
    });

    it("a manual week override for the same week takes precedence over the scheduled deload", async () => {
      const user = await insertTestUser(db);
      const { block } = await setUpBlock(user, {
        mode: "scheduled",
        weekIndex: 3,
        modifiers: { setMultiplier: 0.5 },
      });
      await createWeekOverride(db, user.id, block.id, {
        weekIndex: 3,
        type: "custom",
        modifiers: { loadMultiplier: 0.8 },
      });

      const bundle = await buildTodayBundle(db, user.id, weekThreeDate);
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      // type: 'custom' -> not a deload, even though it's the same week the
      // block also scheduled a deload for.
      expect(bundle.today.isDeload).toBe(false);
      const entry = bundle.today.exercises[0]!;
      expect(entry.scheme).toEqual({ type: "fixed", sets: 5, reps: 5 }); // no setMultiplier in the override
      expect(entry.prefill.loadKg).toBe(80); // 100 * 0.8
      expect(entry.appliedModifiers).toEqual({ loadMultiplier: 0.8 });
    });

    it("carries forward from the latest pre-deload non-deload session, skipping the deload session", async () => {
      const user = await insertTestUser(db);
      const { exercise, block } = await setUpBlock(user);

      const dayMs = 24 * 60 * 60 * 1000;
      const base = new Date("2026-01-02T09:00:00.000Z");
      await insertCompletedHistorySession(db, {
        userId: user.id,
        blockId: block.id,
        templateId: block.schedule[0]!.templateId,
        exerciseId: exercise.id,
        startedAt: base,
        isDeload: false,
        weightKg: 100,
      });
      await insertCompletedHistorySession(db, {
        userId: user.id,
        blockId: block.id,
        templateId: block.schedule[0]!.templateId,
        exerciseId: exercise.id,
        startedAt: new Date(base.getTime() + dayMs),
        isDeload: true,
        weightKg: 50,
      });

      const bundle = await buildTodayBundle(db, user.id, weekThreeDate);
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.exercises[0]?.prefill.loadKg).toBe(100);
    });
  });
});
