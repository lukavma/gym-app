import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { exercisePrescriptions, exercises, programs, users, workoutTemplates } from "@/db/schema";
import {
  MEASUREMENT_PROFILE_RECONCILE_SLUGS,
  reconcileMeasurementProfiles,
  runSeed,
  seedMuscleGroups,
} from "@/db/seed";
import { seededExerciseId } from "@/db/seed/exercises";
import { newId } from "@/domain/ids/uuidv7";
import { applySyncBatch } from "@/server/sync/service";
import { getExerciseStrengthReport } from "@/server/strength/service";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Binding source: docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §14.3 (owner decision O-5), §14.4 (clean-database path, A-17), §11.6
// (A-15's refusal-code transition). Everything runs against real SQL
// (PGlite) applying the same committed migrations production applies —
// exactly the `reconcileStrengthEstimates.ts` precedent this file mirrors.

const {
  assistedPullUp: ASSISTED_PULL_UP_SLUG,
  farmersCarry: FARMERS_CARRY_SLUG,
  plank: PLANK_SLUG,
} = MEASUREMENT_PROFILE_RECONCILE_SLUGS;

async function insertTestUser(db: AppDb, email = "athlete@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const AS_OF = new Date("2026-09-08T12:00:00.000Z");
function daysBefore(days: number): string {
  return new Date(AS_OF.getTime() - days * 86_400_000).toISOString();
}

// The load_reps op sequence one completed workout produces on the wire —
// used to give an exercise real `session_exercises` history (the
// "referenced" predicate half) before its profile has been converted, so
// this is always a plain `weightKg`/`reps` set, never an athletic one.
function buildLoadRepsSessionOps(input: { exerciseId: string; startedAt: string }): {
  ops: SyncOpEnvelope[];
} {
  const sessionId = newId();
  const sessionExerciseId = newId();
  const setId = newId();
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
        isDeload: false,
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
    {
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: setId,
        sessionExerciseId,
        setNumber: 1,
        isWarmup: false,
        weightKg: 20,
        reps: 12,
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
  return { ops };
}

// Raw insert — the minimal `programs -> workout_templates -> exercise_prescriptions`
// ownership chain (data-model.md §2.6-§2.8), for the "prescribed but never
// logged" fixture. Bypasses `createPrescription`'s compatibility checks
// deliberately: this test only needs a *referencing row* to exist, not a
// realistic prescription.
async function insertPrescriptionReferencing(db: AppDb, userId: string, exerciseId: string) {
  const programId = newId();
  const templateId = newId();
  await db.insert(programs).values({ id: programId, userId, name: "Test Program" });
  await db
    .insert(workoutTemplates)
    .values({ id: templateId, programId, name: "Test Template", position: 1 });
  await db.insert(exercisePrescriptions).values({
    id: newId(),
    templateId,
    exerciseId,
    position: 1,
    scheme: { type: "fixed", sets: 3, reps: 8 },
    progression: { type: "manual" },
  });
}

interface ExerciseShapeRow {
  measurementProfile: string;
  loadBasis: string | null;
  volumeCounting: string;
  strengthEstimate: string;
}

async function readShape(db: AppDb, exerciseId: string): Promise<ExerciseShapeRow | undefined> {
  const [row] = await db
    .select({
      measurementProfile: exercises.measurementProfile,
      loadBasis: exercises.loadBasis,
      volumeCounting: exercises.volumeCounting,
      strengthEstimate: exercises.strengthEstimate,
    })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  return row;
}

// Simulates a database seeded BEFORE `exerciseCatalog.ts` carried these three
// entries' Release-2 explicit values (§14.4) — i.e. the state a real
// pre-Release-2 production database is in. Reverting after `runSeed` (rather
// than seeding a differently-shaped catalog) is the same simulation trick
// `reconcileStrengthEstimates.integration.test.ts` uses for its own
// pre-column fixture.
async function revertToPreRelease2Shape(db: AppDb, userId: string) {
  await db
    .update(exercises)
    .set({ loadBasis: "unspecified" })
    .where(eq(exercises.id, seededExerciseId(userId, ASSISTED_PULL_UP_SLUG)));
  await db
    .update(exercises)
    .set({ measurementProfile: "load_reps", loadBasis: "unspecified", volumeCounting: "auto" })
    .where(eq(exercises.id, seededExerciseId(userId, FARMERS_CARRY_SLUG)));
  await db
    .update(exercises)
    .set({ measurementProfile: "load_reps", loadBasis: "unspecified", volumeCounting: "auto" })
    .where(eq(exercises.id, seededExerciseId(userId, PLANK_SLUG)));
}

describe("reconcileMeasurementProfiles (§14.3, O-5)", () => {
  describe("A-17 — clean database", () => {
    it("is a no-op: the catalog already seeds the three legacy entries correctly shaped", async () => {
      const db = await createTestDb();
      const user = await insertTestUser(db);
      await runSeed(db);

      const pullUpId = seededExerciseId(user.id, ASSISTED_PULL_UP_SLUG);
      const carryId = seededExerciseId(user.id, FARMERS_CARRY_SLUG);
      const plankId = seededExerciseId(user.id, PLANK_SLUG);

      expect(await readShape(db, pullUpId)).toMatchObject({
        measurementProfile: "load_reps",
        loadBasis: "assistance",
      });
      expect(await readShape(db, carryId)).toMatchObject({
        measurementProfile: "load_distance",
        loadBasis: "per_hand",
        volumeCounting: "off",
      });
      expect(await readShape(db, plankId)).toMatchObject({
        measurementProfile: "duration",
        loadBasis: null,
        volumeCounting: "off",
      });

      // `runSeed` already ran the reconcile once; an explicit second call has
      // nothing left to do either.
      const summary = await reconcileMeasurementProfiles(db);
      expect(summary.updated).toBe(0);
      expect(summary.users).toBe(1);
    });
  });

  describe("A-15 — the assisted pull-up's refusal-code transition", () => {
    let db: AppDb;
    let userId: string;
    let pullUpId: string;

    beforeEach(async () => {
      db = await createTestDb();
      userId = (await insertTestUser(db)).id;
      await runSeed(db);
      pullUpId = seededExerciseId(userId, ASSISTED_PULL_UP_SLUG);
      // Simulate the pre-Release-2 row this reconcile exists to fix.
      await db
        .update(exercises)
        .set({ loadBasis: "unspecified" })
        .where(eq(exercises.id, pullUpId));
    });

    it("refuses EXERCISE_ESTIMATE_DISABLED before the reconcile, LOAD_BASIS_UNSUPPORTED after", async () => {
      const before = await getExerciseStrengthReport(db, userId, pullUpId, {}, AS_OF);
      expect(before?.eligible).toBe(false);
      expect(before?.estimate.reasonCodes).toEqual(["EXERCISE_ESTIMATE_DISABLED"]);

      await reconcileMeasurementProfiles(db);

      const after = await getExerciseStrengthReport(db, userId, pullUpId, {}, AS_OF);
      expect(after?.eligible).toBe(false);
      expect(after?.estimate.reasonCodes).toEqual(["LOAD_BASIS_UNSUPPORTED"]);
      expect(after?.exercise.measurementProfile).toBe("load_reps");
      expect(after?.exercise.loadBasis).toBe("assistance");
    });

    it("leaves every other seeded exercise's shape byte-for-byte unchanged", async () => {
      const before = await db
        .select({
          id: exercises.id,
          measurementProfile: exercises.measurementProfile,
          loadBasis: exercises.loadBasis,
          volumeCounting: exercises.volumeCounting,
          strengthEstimate: exercises.strengthEstimate,
        })
        .from(exercises)
        .where(eq(exercises.userId, userId));

      await reconcileMeasurementProfiles(db);

      const after = await db
        .select({
          id: exercises.id,
          measurementProfile: exercises.measurementProfile,
          loadBasis: exercises.loadBasis,
          volumeCounting: exercises.volumeCounting,
          strengthEstimate: exercises.strengthEstimate,
        })
        .from(exercises)
        .where(eq(exercises.userId, userId));

      const carryId = seededExerciseId(userId, FARMERS_CARRY_SLUG);
      const plankId = seededExerciseId(userId, PLANK_SLUG);
      const touchedIds = new Set([pullUpId, carryId, plankId]);

      const beforeById = new Map(before.map((row) => [row.id, row]));
      let untouchedChecked = 0;
      for (const row of after) {
        if (touchedIds.has(row.id)) continue;
        expect(row).toEqual(beforeById.get(row.id));
        untouchedChecked++;
      }
      // Sanity: the "every other" claim above was actually exercised against
      // a non-trivial number of rows, not vacuously true.
      expect(untouchedChecked).toBeGreaterThan(80);
    });
  });

  describe("dumbbell-farmers-carry — referenced (by a session)", () => {
    it("stays load_reps and flips volume_counting to 'off'", async () => {
      const db = await createTestDb();
      const userId = (await insertTestUser(db)).id;
      await runSeed(db);
      await revertToPreRelease2Shape(db, userId);

      const carryId = seededExerciseId(userId, FARMERS_CARRY_SLUG);
      const { ops } = buildLoadRepsSessionOps({ exerciseId: carryId, startedAt: daysBefore(4) });
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);

      const before = await readShape(db, carryId);
      expect(before).toMatchObject({ measurementProfile: "load_reps", volumeCounting: "auto" });

      const summary = await reconcileMeasurementProfiles(db);
      expect(summary.updated).toBeGreaterThan(0);

      const after = await readShape(db, carryId);
      expect(after?.measurementProfile).toBe("load_reps");
      expect(after?.loadBasis).toBe("unspecified");
      expect(after?.volumeCounting).toBe("off");
    });
  });

  describe("bodyweight-plank — referenced (by a session)", () => {
    it("stays load_reps and flips volume_counting to 'off' (L-5)", async () => {
      const db = await createTestDb();
      const userId = (await insertTestUser(db)).id;
      await runSeed(db);
      await revertToPreRelease2Shape(db, userId);

      const plankId = seededExerciseId(userId, PLANK_SLUG);
      const { ops } = buildLoadRepsSessionOps({ exerciseId: plankId, startedAt: daysBefore(4) });
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);

      const before = await readShape(db, plankId);
      expect(before).toMatchObject({ measurementProfile: "load_reps", volumeCounting: "auto" });

      const summary = await reconcileMeasurementProfiles(db);
      expect(summary.updated).toBeGreaterThan(0);

      const after = await readShape(db, plankId);
      expect(after?.measurementProfile).toBe("load_reps");
      expect(after?.loadBasis).toBe("unspecified");
      expect(after?.volumeCounting).toBe("off");
    });
  });

  describe("dumbbell-farmers-carry — prescribed but never session-referenced", () => {
    it("is untouched by both farmers-carry predicates (neither matches)", async () => {
      const db = await createTestDb();
      const userId = (await insertTestUser(db)).id;
      await runSeed(db);
      await revertToPreRelease2Shape(db, userId);

      const carryId = seededExerciseId(userId, FARMERS_CARRY_SLUG);
      await insertPrescriptionReferencing(db, userId, carryId);

      const before = await readShape(db, carryId);
      expect(before).toMatchObject({
        measurementProfile: "load_reps",
        loadBasis: "unspecified",
        volumeCounting: "auto",
      });

      await reconcileMeasurementProfiles(db);

      // Neither the unreferenced-conversion predicate (blocked by the
      // existing exercise_prescriptions row, §14.3) nor the referenced-carry
      // predicate (requires a session_exercises row, which does not exist
      // here) can fire — the row is left exactly as it was.
      const after = await readShape(db, carryId);
      expect(after).toEqual(before);
    });
  });

  describe("unreferenced conversions", () => {
    let db: AppDb;
    let userId: string;

    beforeEach(async () => {
      db = await createTestDb();
      userId = (await insertTestUser(db)).id;
      await runSeed(db);
      await revertToPreRelease2Shape(db, userId);
    });

    it("converts dumbbell-farmers-carry to load_distance/per_hand and bodyweight-plank to duration", async () => {
      const carryId = seededExerciseId(userId, FARMERS_CARRY_SLUG);
      const plankId = seededExerciseId(userId, PLANK_SLUG);

      const summary = await reconcileMeasurementProfiles(db);
      expect(summary.updated).toBe(3); // pull-up basis + carry profile + plank profile

      const carry = await readShape(db, carryId);
      expect(carry?.measurementProfile).toBe("load_distance");
      expect(carry?.loadBasis).toBe("per_hand");
      // L-6: a reconciled unreferenced carry now matches a fresh seed's
      // volume_counting exactly.
      expect(carry?.volumeCounting).toBe("off");

      const plank = await readShape(db, plankId);
      expect(plank?.measurementProfile).toBe("duration");
      expect(plank?.loadBasis).toBeNull();
    });

    it("is state-predicated: running it twice in a row leaves the second run a no-op", async () => {
      const first = await reconcileMeasurementProfiles(db);
      expect(first.updated).toBeGreaterThan(0);

      const second = await reconcileMeasurementProfiles(db);
      expect(second.updated).toBe(0);
    });

    it("running the full seed script twice does not error or double-apply", async () => {
      await expect(runSeed(db)).resolves.not.toThrow();

      const carryId = seededExerciseId(userId, FARMERS_CARRY_SLUG);
      const plankId = seededExerciseId(userId, PLANK_SLUG);
      expect(await readShape(db, carryId)).toMatchObject({
        measurementProfile: "load_distance",
        loadBasis: "per_hand",
      });
      expect(await readShape(db, plankId)).toMatchObject({ measurementProfile: "duration" });

      const rows = await db.select().from(exercises).where(eq(exercises.userId, userId));
      // Still exactly one row per catalog slug — no duplicate insert from the
      // second `runSeed`.
      const { EXERCISE_CATALOG } = await import("@/db/seed/exerciseCatalog");
      expect(rows).toHaveLength(EXERCISE_CATALOG.length);
    });

    it("survives an interrupted/rolled-back run: a retry recovers cleanly with no partial state", async () => {
      const carryId = seededExerciseId(userId, FARMERS_CARRY_SLUG);
      const plankId = seededExerciseId(userId, PLANK_SLUG);
      const pullUpId = seededExerciseId(userId, ASSISTED_PULL_UP_SLUG);

      // Simulate an interrupted deploy: the reconcile runs (and, since it is
      // itself one transaction, fully applies) inside an OUTER transaction
      // that is then rolled back — e.g. a later step in the same deploy
      // transaction failing. `db.transaction` on the PGlite driver nests via
      // `SAVEPOINT`, so this genuinely exercises rollback-of-a-committed-
      // savepoint, not just "never ran".
      let caught: unknown;
      try {
        await db.transaction(async (outerTx) => {
          await reconcileMeasurementProfiles(outerTx as unknown as AppDb);
          throw new Error("simulated deploy failure after the reconcile step");
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);

      // Nothing committed — every row is still in the pre-Release-2 shape
      // this `describe` block's `beforeEach` put it in.
      expect(await readShape(db, carryId)).toMatchObject({ measurementProfile: "load_reps" });
      expect(await readShape(db, plankId)).toMatchObject({ measurementProfile: "load_reps" });
      expect(await readShape(db, pullUpId)).toMatchObject({ loadBasis: "unspecified" });

      // The retry, run for real (not inside a doomed outer transaction),
      // recovers exactly as if the first attempt had never happened.
      const retry = await reconcileMeasurementProfiles(db);
      expect(retry.updated).toBe(3);
      expect(await readShape(db, carryId)).toMatchObject({
        measurementProfile: "load_distance",
        loadBasis: "per_hand",
      });
      expect(await readShape(db, plankId)).toMatchObject({ measurementProfile: "duration" });
      expect(await readShape(db, pullUpId)).toMatchObject({ loadBasis: "assistance" });

      // And a further retry is the ordinary no-op steady state.
      const secondRetry = await reconcileMeasurementProfiles(db);
      expect(secondRetry.updated).toBe(0);
    });
  });

  it("never touches an exercise it did not seed (is_seeded guard)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const userId = (await insertTestUser(db)).id;
    const { createExercise } = await import("@/server/exercises/service");
    const mine = await createExercise(db, userId, {
      name: "Assisted Pull-Up",
      equipment: "machine",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 5,
      contributions: [{ muscleGroupId: "lats", role: "primary", weight: 1 }],
    });
    expect(mine.loadBasis).toBe("unspecified");

    await reconcileMeasurementProfiles(db);

    const row = await readShape(db, mine.id);
    expect(row?.loadBasis).toBe("unspecified");
  });
});
