import { beforeEach, describe, expect, it } from "vitest";
import { asc } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { recommendations, users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock, activateBlock } from "@/server/blocks/service";
import { createPrescription } from "@/server/prescriptions/service";
import { buildTodayBundle } from "@/server/today/service";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";
import { loadProgressionConfigSchema } from "@/domain/progression/registry";
import {
  wrapPrescriptionSnapshot,
  type PrescriptionSnapshot,
} from "@/domain/schemas/prescriptionSnapshot";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Warm-up Set Classification remediation
// (docs/reviews/estimated-1rm-load-translation-architecture-review.md §9 /
// F-1) — proves, against real SQL (PGlite) through the actual sync write
// path (applySyncBatch), that progression completion, carry-forward, the
// all-warm-up-session case, and pending-recommendation reevaluation on
// reclassification all already behave correctly once `isWarmup` is real —
// which, before the set-entry/history-edit UI remediation, no caller ever
// made true. None of the algorithms exercised here (loadProgression,
// carryForward, evaluateSession) are modified by this remediation; this
// file exists to prove they were already correct on this input.

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const fixedScheme = { v: 1 as const, scheme: { type: "fixed" as const, sets: 3, reps: 5 } };
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

interface RampSet {
  weightKg: number;
  reps: number;
  isWarmup?: boolean;
  rir?: number | null;
}

// The full op sequence one completed workout produces on the wire, with
// per-set weight/reps/isWarmup control (unlike progression.integration.test's
// buildSessionOps, which assumes one uniform weight — exactly what a warm-up
// ramp needs to not assume).
function buildRampSessionOps(input: {
  blockId: string | null;
  templateId: string | null;
  exerciseId: string;
  exerciseName: string;
  sets: RampSet[];
  startedAt?: string;
  isDeload?: boolean;
}) {
  const sessionId = newId();
  const sessionExerciseId = newId();
  const startedAt = input.startedAt ?? new Date().toISOString();
  const completedAt = new Date(new Date(startedAt).getTime() + 60 * 60 * 1000).toISOString();
  const setIds = input.sets.map(() => newId());

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
    ...input.sets.map((s, index): SyncOpEnvelope => ({
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: setIds[index]!,
        sessionExerciseId,
        setNumber: index + 1,
        isWarmup: s.isWarmup ?? false,
        weightKg: s.weightKg,
        reps: s.reps,
        rir: s.rir ?? null,
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

describe("warm-up set classification — real-path proofs (PGlite integration)", () => {
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

  describe("outcomes 1/5 — progression completion and rep shortfall use work sets only", () => {
    it("a 3-set ramp correctly flagged isWarmup=true is excluded from completion: shortfall 0, increase_load", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        sets: [
          { weightKg: 60, reps: 5, isWarmup: true },
          { weightKg: 80, reps: 3, isWarmup: true },
          { weightKg: 100, reps: 2, isWarmup: true },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
        ],
      });
      const result = await applySyncBatch(db, userId, built.ops);
      expect(result.rejected).toEqual([]);

      const rows = await db.select().from(recommendations);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.action).toBe("increase_load");
      expect(rows[0]!.reasonCodes).toContain("ALL_PRESCRIBED_REPS_COMPLETED");
      expect(rows[0]!.inputs).toMatchObject({
        derived: { setsCompleted: 3, prescribedSets: 3, workingLoadKg: 110 },
      });
    });

    it("negative control: the identical ramp left unflagged (isWarmup=false, the pre-remediation defect) corrupts completion into a hold", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        sets: [
          { weightKg: 60, reps: 5, isWarmup: false },
          { weightKg: 80, reps: 3, isWarmup: false },
          { weightKg: 100, reps: 2, isWarmup: false },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
        ],
      });
      const result = await applySyncBatch(db, userId, built.ops);
      expect(result.rejected).toEqual([]);

      const rows = await db.select().from(recommendations);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.action).toBe("hold");
      expect(rows[0]!.reasonCodes).toContain("PRESCRIBED_REPS_NOT_COMPLETED");
    });
  });

  describe("outcome 4 — carry-forward chooses the first work-set load, never the ramp load", () => {
    it("prefills from the work set once the ramp is correctly flagged", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        startedAt: "2026-08-03T10:00:00.000Z",
        sets: [
          { weightKg: 60, reps: 5, isWarmup: true },
          { weightKg: 80, reps: 5, isWarmup: true },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
        ],
      });
      const result = await applySyncBatch(db, userId, built.ops);
      expect(result.rejected).toEqual([]);

      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-04T10:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.exercises[0]?.prefill.loadKg).toBe(110);
    });

    it("negative control: an unflagged ramp leaks the lightest ramp weight into the prefill", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        startedAt: "2026-08-03T10:00:00.000Z",
        sets: [
          { weightKg: 60, reps: 5, isWarmup: false },
          { weightKg: 80, reps: 5, isWarmup: false },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
        ],
      });
      const result = await applySyncBatch(db, userId, built.ops);
      expect(result.rejected).toEqual([]);

      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-04T10:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected scheduled");
      expect(bundle.today.exercises[0]?.prefill.loadKg).toBe(60);
    });
  });

  describe("outcome 7 — a session containing only warm-up sets completes safely", () => {
    it("produces a NO_WORK_SETS_LOGGED / action:none recommendation, no crash", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        sets: [
          { weightKg: 60, reps: 5, isWarmup: true },
          { weightKg: 80, reps: 5, isWarmup: true },
          { weightKg: 100, reps: 5, isWarmup: true },
        ],
      });
      const result = await applySyncBatch(db, userId, built.ops);
      expect(result.rejected).toEqual([]);

      const rows = await db.select().from(recommendations);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.action).toBe("none");
      expect(rows[0]!.reasonCodes).toContain("NO_WORK_SETS_LOGGED");
      expect(rows[0]!.decisionStatus).toBe("pending");
    });
  });

  describe("outcome 9 — reclassifying a historical set reevaluates a pending recommendation, and never rewrites a decided one", () => {
    it("flipping isWarmup on a source-session set while the rec is pending supersedes and re-evaluates", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        sets: [
          { weightKg: 60, reps: 5, isWarmup: true },
          { weightKg: 80, reps: 5, isWarmup: true },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
        ],
      });
      await applySyncBatch(db, userId, built.ops);
      const before = await db.select().from(recommendations);
      expect(before).toHaveLength(1);
      // Not completed: only 1 of 3 prescribed work sets.
      expect(before[0]!.action).toBe("hold");

      // Reclassify: the athlete actually performed the 80kg set as a work
      // set, mistagged as warm-up.
      const correction = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: built.setIds[1]!,
            sessionExerciseId: built.sessionExerciseId,
            isWarmup: false,
          },
        },
      ]);
      expect(correction.rejected).toEqual([]);

      const after = await db.select().from(recommendations).orderBy(asc(recommendations.createdAt));
      expect(after).toHaveLength(2);
      expect(after[0]!.decisionStatus).toBe("superseded");
      const fresh = after[1]!;
      expect(fresh.decisionStatus).toBe("pending");
      expect(fresh.inputs).toMatchObject({ derived: { setsCompleted: 2 } });
    });

    it("never rewrites an already-decided recommendation, even when an unrelated set in the same session is reclassified afterward", async () => {
      const built = buildRampSessionOps({
        blockId,
        templateId,
        exerciseId,
        exerciseName,
        sets: [
          { weightKg: 60, reps: 5, isWarmup: true },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
          { weightKg: 110, reps: 5, isWarmup: false, rir: 2 },
        ],
      });
      await applySyncBatch(db, userId, built.ops);
      const [rec] = await db.select().from(recommendations);
      if (!rec) throw new Error("expected a recommendation");

      const decide = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "recommendationDecision",
          operation: "upsert",
          payload: {
            recommendationId: rec.id,
            status: "accepted",
            chosen: { loadKg: 112.5 },
            decidedAt: "2026-08-12T10:00:00.000Z",
            source: "explicit",
          },
        },
      ]);
      expect(decide.rejected).toEqual([]);

      // Reclassify the warm-up set (already excluded, not the recommendation's
      // basis) — same session-exercise, must not resurrect evaluation.
      const correction = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: built.setIds[0]!,
            sessionExerciseId: built.sessionExerciseId,
            isWarmup: false,
          },
        },
      ]);
      expect(correction.rejected).toEqual([]);

      const rows = await db.select().from(recommendations);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.decisionStatus).toBe("accepted");
      expect(rows[0]!.decisionChosen).toEqual({ loadKg: 112.5 });
    });
  });
});
