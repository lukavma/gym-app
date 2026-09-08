import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import {
  createBlock,
  activateBlock,
  createWeekOverride,
  updateBlock,
} from "@/server/blocks/service";
import type { DeloadConfig } from "@/domain/blocks/schema";
import { createPrescription } from "@/server/prescriptions/service";
import { buildTodayBundle, getActiveSession } from "@/server/today/service";
import { applySyncBatch } from "@/server/sync/service";
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

  // H-1 remediation (athletic-measurement-profiles-release-2-review.md
  // §5.1) — getActiveSession's own ActiveSessionExerciseDto must carry the
  // slot's FROZEN measurement, read from `session_exercises`' own typed
  // `measurement_profile`/`load_basis` columns (already selected by the
  // existing query) — a DIFFERENT gap from buildTodayBundle's
  // `TodayBundleExerciseEntry.measurement`, covered separately below.
  // Without this fix, a cross-device adopt / post-eviction resume of a
  // non-`load_reps` session had no `measurement` to adopt at all, so the
  // client's own normalization silently defaulted it to
  // `load_reps`/`unspecified` — exactly the defect this proves fixed.
  // Driven through the real sync write path (`applySyncBatch`), the same
  // convention measurementSync.integration.test.ts's own `createAdhocSlot`/
  // "a duration create without weightKg/reps applies" case uses.
  it("H-1 — getActiveSession's own exercise DTO carries the slot's frozen non-load_reps measurement", async () => {
    const user = await insertTestUser(db);
    const exercise = await createExercise(db, user.id, {
      name: "Plank",
      equipment: "bodyweight",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 2.5,
      measurementProfile: "duration",
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });

    const sessionId = newId();
    const sessionExerciseId = newId();
    const startedAt = new Date("2026-01-15T10:00:00.000Z").toISOString();
    const applied = await applySyncBatch(db, user.id, [
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
        // measurementProfile/loadBasis deliberately omitted — derived
        // silently from the exercise's own "duration" profile (NC-14(c)),
        // exactly like a real ad-hoc add.
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId: exercise.id,
          position: 0,
          source: "adhoc",
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId,
          setNumber: 1,
          isWarmup: false,
          durationS: 45,
          loggedAt: startedAt,
        },
      },
    ]);
    expect(applied.rejected).toEqual([]);

    const active = await getActiveSession(db, user.id);
    if (!active) throw new Error("expected activeSession");
    const exerciseDto = active.exercises[0]!;
    // The fix under test: previously this key was entirely absent from the
    // server DTO, and the client's own normalization silently defaulted it
    // to load_reps/unspecified — masking exactly this case.
    expect(exerciseDto.measurement).toEqual({ profile: "duration", loadBasis: null });
    expect(exerciseDto.sets[0]).toMatchObject({ durationS: 45 });
  });

  it("resolves no_schedule with a null activeSession when the user has no active program", async () => {
    const user = await insertTestUser(db);
    const bundle = await buildTodayBundle(db, user.id, new Date("2026-01-15T10:00:00.000Z"));
    expect(bundle.today).toEqual({ kind: "no_schedule" });
    expect(bundle.activeSession).toBeNull();
  });

  // athletic-measurement-profiles-architecture-evaluation.md §12.1, A-12.
  // No seeded athletic exercise exists yet (R3) and the R1 editor never
  // offers a `distanceRounds`/`durationRounds` scheme (the hard boundary),
  // so every fixture below is hand-built directly through the service
  // layer, exactly the pattern `checkPrescriptionCompatibility`'s own
  // integration coverage already uses.
  describe("§12.1/A-12 — measurement on the bundle entry, athletic prefill", () => {
    async function insertCompletedDistanceHistorySession(opts: {
      userId: string;
      blockId: string;
      templateId: string;
      exercise: { id: string; measurementProfile: string; loadBasis: string | null };
      startedAt: Date;
      weightKg: number;
      distanceM: number;
    }) {
      const sessionId = newId();
      const sessionExerciseId = newId();
      await db.insert(workoutSessions).values({
        id: sessionId,
        userId: opts.userId,
        blockId: opts.blockId,
        templateId: opts.templateId,
        templateName: "Sled Day",
        weekIndex: 1,
        isDeload: false,
        status: "completed",
        startedAt: opts.startedAt,
        completedAt: opts.startedAt,
      });
      await db.insert(sessionExercises).values({
        id: sessionExerciseId,
        sessionId,
        exerciseId: opts.exercise.id,
        position: 0,
        source: "template",
        measurementProfile: opts.exercise.measurementProfile,
        loadBasis: opts.exercise.loadBasis,
      });
      // The warm-up round comes first so the carry-forward rule ("first
      // *work* set") has something to skip past (I-13 — no `reps`/`rir` on a
      // load_distance row, per its shape CHECK).
      await db.insert(setLogs).values([
        {
          id: newId(),
          sessionExerciseId,
          setNumber: 1,
          isWarmup: true,
          weightKg: 10,
          distanceM: 10,
          measurementProfile: opts.exercise.measurementProfile,
          loggedAt: opts.startedAt,
        },
        {
          id: newId(),
          sessionExerciseId,
          setNumber: 2,
          isWarmup: false,
          weightKg: opts.weightKg,
          distanceM: opts.distanceM,
          measurementProfile: opts.exercise.measurementProfile,
          loggedAt: opts.startedAt,
        },
      ]);
      return sessionId;
    }

    it("carries `measurement` on an ordinary load_reps entry", async () => {
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
      const block = await createBlock(db, user.id, program.id, {
        name: "Block A",
        goal: "general",
        startDate: "2026-01-01",
        weeksPlanned: 16,
        schedule: [{ templateId: template.id }],
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, user.id, block.id);

      const bundle = await buildTodayBundle(db, user.id, new Date("2026-01-15T10:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.exercises[0]!.measurement).toEqual({
        profile: "load_reps",
        loadBasis: "unspecified",
      });
    });

    it("carries the exercise's basis, and carry-forward on a hand-built load_distance slot uses the first NON-warm-up round's load (prefill.reps null — no reps dimension in `distanceRounds`)", async () => {
      const user = await insertTestUser(db);
      const exercise = await createExercise(db, user.id, {
        name: "Sled Push",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
        measurementProfile: "load_distance",
        loadBasis: "total",
      });
      const program = await createProgram(db, user.id, { name: "Program A" });
      const template = await createTemplate(db, user.id, program.id, { name: "Sled Day" });
      if (!template) throw new Error("expected template");
      const prescription = await createPrescription(db, user.id, template.id, {
        exerciseId: exercise.id,
        scheme: { v: 1, scheme: { type: "distanceRounds", sets: 4, distanceM: 20 } },
        progression: { strategyId: "manual" },
      });
      if (!prescription) throw new Error("expected prescription");
      const block = await createBlock(db, user.id, program.id, {
        name: "Block A",
        goal: "general",
        startDate: "2026-01-01",
        weeksPlanned: 16,
        schedule: [{ templateId: template.id }],
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, user.id, block.id);

      await insertCompletedDistanceHistorySession({
        userId: user.id,
        blockId: block.id,
        templateId: template.id,
        exercise,
        startedAt: new Date("2026-01-14T10:00:00.000Z"),
        weightKg: 25,
        distanceM: 20,
      });

      const bundle = await buildTodayBundle(db, user.id, new Date("2026-01-15T10:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      const entry = bundle.today.exercises[0]!;
      expect(entry.measurement).toEqual({ profile: "load_distance", loadBasis: "total" });
      // The warm-up round's 10 kg is skipped; the first WORK round's 25 kg
      // carries forward (H-12 — never coerced, never the warm-up's load).
      expect(entry.prefill.loadKg).toBe(25);
      expect(entry.prefill.reps).toBeNull();
    });

    it("prefill.loadKg AND prefill.reps are both null for a `duration`/`durationRounds` slot (no load dimension, no reps dimension)", async () => {
      const user = await insertTestUser(db);
      const exercise = await createExercise(db, user.id, {
        name: "Plank",
        equipment: "other",
        mechanics: "isolation",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "abs", role: "primary", weight: 1 }],
        measurementProfile: "duration",
      });
      expect(exercise.loadBasis).toBeNull();
      const program = await createProgram(db, user.id, { name: "Program A" });
      const template = await createTemplate(db, user.id, program.id, { name: "Core Day" });
      if (!template) throw new Error("expected template");
      const prescription = await createPrescription(db, user.id, template.id, {
        exerciseId: exercise.id,
        scheme: { v: 1, scheme: { type: "durationRounds", sets: 3, durationS: 60 } },
        progression: { strategyId: "manual" },
      });
      if (!prescription) throw new Error("expected prescription");
      const block = await createBlock(db, user.id, program.id, {
        name: "Block A",
        goal: "general",
        startDate: "2026-01-01",
        weeksPlanned: 16,
        schedule: [{ templateId: template.id }],
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, user.id, block.id);

      const bundle = await buildTodayBundle(db, user.id, new Date("2026-01-15T10:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      const entry = bundle.today.exercises[0]!;
      expect(entry.measurement).toEqual({ profile: "duration", loadBasis: null });
      expect(entry.prefill.loadKg).toBeNull();
      expect(entry.prefill.reps).toBeNull();
    });
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

  // Active-schedule remediation — Today must resolve from the block's
  // *current* schedule immediately after an active-block edit, both in
  // fixed-weekday mode (domain/scheduling/todayTemplate.ts's weekday match)
  // and rotation mode (its latest-completed-template continuation rule).
  describe("Today resolution after active-schedule edits", () => {
    async function setUpThreeTemplateProgram(user: { id: string }) {
      const exercise = await createExercise(db, user.id, {
        name: "Overhead Press",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "front_delts", role: "primary", weight: 1 }],
      });
      const program = await createProgram(db, user.id, { name: "Program A" });
      const templateA = await createTemplate(db, user.id, program.id, { name: "Upper A" });
      const templateB = await createTemplate(db, user.id, program.id, { name: "Lower A" });
      const templateC = await createTemplate(db, user.id, program.id, { name: "Upper B" });
      if (!templateA || !templateB || !templateC) throw new Error("expected templates");
      for (const template of [templateA, templateB, templateC]) {
        const prescription = await createPrescription(db, user.id, template.id, {
          exerciseId: exercise.id,
          scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
          progression: { strategyId: "manual" },
        });
        if (!prescription) throw new Error("expected prescription");
      }
      return { exercise, program, templateA, templateB, templateC };
    }

    it("resolves the newly assigned weekday immediately after a fixed schedule is edited on an active block", async () => {
      const user = await insertTestUser(db);
      const { program, templateA, templateB } = await setUpThreeTemplateProgram(user);
      const block = await createBlock(db, user.id, program.id, {
        name: "Block 1",
        goal: "general",
        startDate: "2026-01-01",
        weeksPlanned: 8,
        schedule: [
          { templateId: templateA.id, weekdays: [1] },
          { templateId: templateB.id, weekdays: [2] },
        ],
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, user.id, block.id);

      // 2026-01-05 is a Monday (ISO weekday 1).
      const monday = new Date("2026-01-05T09:00:00.000Z");
      const before = await buildTodayBundle(db, user.id, monday);
      if (before.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(before.today.templateId).toBe(templateA.id);

      // Swap which template owns Monday.
      await updateBlock(db, user.id, block.id, {
        schedule: [
          { templateId: templateA.id, weekdays: [2] },
          { templateId: templateB.id, weekdays: [1] },
        ],
      });

      const after = await buildTodayBundle(db, user.id, monday);
      if (after.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(after.today.templateId).toBe(templateB.id);
    });

    // V-4 (verification) — this case adds and removes schedule entries; it
    // does not reorder any. Reorder resolution is covered at the resolver
    // level by tests/unit/todayTemplate.test.ts ("reorders explainably:
    // moving the latest-completed entry to the end still advances to its
    // old neighbor"). The title used to claim reordering it never performed.
    it("advances rotation from the latest completed template, and falls back to the first entry once that template is removed from the schedule", async () => {
      const user = await insertTestUser(db);
      const { exercise, program, templateA, templateB, templateC } =
        await setUpThreeTemplateProgram(user);
      const block = await createBlock(db, user.id, program.id, {
        name: "Block 1",
        goal: "general",
        startDate: "2026-01-01",
        weeksPlanned: 8,
        schedule: [{ templateId: templateA.id }, { templateId: templateB.id }],
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, user.id, block.id);

      const start = await buildTodayBundle(db, user.id, new Date("2026-01-01T09:00:00.000Z"));
      if (start.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(start.today.templateId).toBe(templateA.id);

      await insertCompletedHistorySession(db, {
        userId: user.id,
        blockId: block.id,
        templateId: templateA.id,
        exerciseId: exercise.id,
        startedAt: new Date("2026-01-01T09:00:00.000Z"),
        isDeload: false,
        weightKg: 40,
      });

      const next = await buildTodayBundle(db, user.id, new Date("2026-01-02T09:00:00.000Z"));
      if (next.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(next.today.templateId).toBe(templateB.id);

      // Add a third entry and remove templateA (the latest-completed
      // template) from the schedule entirely.
      await updateBlock(db, user.id, block.id, {
        schedule: [{ templateId: templateB.id }, { templateId: templateC.id }],
      });

      const afterRemoval = await buildTodayBundle(
        db,
        user.id,
        new Date("2026-01-03T09:00:00.000Z"),
      );
      if (afterRemoval.today.kind !== "scheduled") throw new Error("expected scheduled");
      // templateA no longer exists in the schedule -> falls back to the
      // first entry (templateB), not a modulo jump against the new length.
      expect(afterRemoval.today.templateId).toBe(templateB.id);
    });
  });
});
