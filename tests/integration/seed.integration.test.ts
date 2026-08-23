import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "./testDb";
import {
  exerciseCatalogSeedLog,
  exerciseMuscleContributions,
  exercises,
  muscleGroups,
  users,
} from "@/db/schema";
import {
  EXERCISE_CATALOG,
  seedExerciseCatalogForAllUsers,
  seedExerciseCatalogForUser,
  seedMuscleGroups,
  seededExerciseId,
} from "@/db/seed";
import { MUSCLE_GROUP_SLUGS } from "@/domain/exercises/muscleGroups";
import { createExercise } from "@/server/exercises/service";

async function insertTestUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [user] = await db
    .insert(users)
    .values({ email: "seed-test@example.com", passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// Reproduces a database seeded *before* `exercise_catalog_seed_log` existed:
// seeded exercise rows present, ledger empty. Clearing the ledger is an exact
// reproduction — migration 0002 only adds the (empty) table, and the
// pre-ledger seed inserted the same deterministic rows and contributions this
// one does.
async function simulatePreLedgerDb(db: TestDb, userId: string) {
  await db.delete(exerciseCatalogSeedLog).where(eq(exerciseCatalogSeedLog.userId, userId));
}

// A catalog slug the user has never been offered. Post-bootstrap this is what
// a *newly added* catalog entry looks like to the seed: absent from the
// ledger, so it lands in `newItems`. Dropping the ledger row (and the
// exercise row, as a fresh catalog entry would have none) is state-identical
// to shipping a new entry, without needing to mutate the catalog module.
async function simulateNewCatalogSlug(db: TestDb, userId: string, slug: string) {
  await db.delete(exercises).where(eq(exercises.id, seededExerciseId(userId, slug)));
  await db
    .delete(exerciseCatalogSeedLog)
    .where(and(eq(exerciseCatalogSeedLog.userId, userId), eq(exerciseCatalogSeedLog.slug, slug)));
}

async function ledgerSlugs(db: TestDb, userId: string) {
  const rows = await db
    .select({ slug: exerciseCatalogSeedLog.slug })
    .from(exerciseCatalogSeedLog)
    .where(eq(exerciseCatalogSeedLog.userId, userId));
  return rows.map((r) => r.slug);
}

describe("seed (PGlite integration)", () => {
  // ADR-010 vocabulary v2 — 17 leaves + 1 rollup (`back`).
  it("seeds all 18 canonical muscle groups, with exactly one kind='rollup' row", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);

    const rows = await db.select().from(muscleGroups);
    expect(rows).toHaveLength(MUSCLE_GROUP_SLUGS.length);
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(MUSCLE_GROUP_SLUGS));

    const rollups = rows.filter((r) => r.kind === "rollup");
    expect(rollups).toHaveLength(1);
    expect(rollups[0]?.id).toBe("back");
    expect(rows.filter((r) => r.kind === "muscle")).toHaveLength(17);
  });

  it("defaults kind to 'muscle' and enforces the kind CHECK constraint", async () => {
    const db = await createTestDb();

    await db.insert(muscleGroups).values({ id: "test_group", displayName: "Test", position: 99 });
    const [defaulted] = await db
      .select()
      .from(muscleGroups)
      .where(eq(muscleGroups.id, "test_group"));
    expect(defaulted?.kind).toBe("muscle");

    await expect(
      db.insert(muscleGroups).values({
        id: "bogus_group",
        displayName: "Bogus",
        position: 100,
        kind: "bogus",
      }),
    ).rejects.toThrow();
  });

  it("reseeding muscle groups is idempotent, including kind", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    await seedMuscleGroups(db);

    const rows = await db.select().from(muscleGroups);
    expect(rows).toHaveLength(MUSCLE_GROUP_SLUGS.length);
  });

  it("reseeding corrects a drifted kind/displayName/position back to the domain constant", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);

    await db
      .update(muscleGroups)
      .set({ kind: "muscle", displayName: "Drifted", position: 1 })
      .where(eq(muscleGroups.id, "back"));

    await seedMuscleGroups(db);

    const [back] = await db.select().from(muscleGroups).where(eq(muscleGroups.id, "back"));
    expect(back?.kind).toBe("rollup");
    expect(back?.displayName).toBe("Back");
  });

  it("seeds the full exercise catalog for a user, each with >=1 primary contribution", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const exerciseRows = await db.select().from(exercises).where(eq(exercises.userId, user.id));
    expect(exerciseRows).toHaveLength(EXERCISE_CATALOG.length);
    expect(exerciseRows.every((r) => r.isSeeded)).toBe(true);

    for (const item of EXERCISE_CATALOG) {
      const id = seededExerciseId(user.id, item.slug);
      const contributions = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.exerciseId, id));
      expect(contributions.length).toBeGreaterThan(0);
      expect(contributions.some((c) => c.role === "primary")).toBe(true);
    }
  });

  it("reseeding the exercise catalog is idempotent (no duplicate rows)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);
    await seedExerciseCatalogForUser(db, user.id);

    const exerciseRows = await db.select().from(exercises).where(eq(exercises.userId, user.id));
    expect(exerciseRows).toHaveLength(EXERCISE_CATALOG.length);
  });

  it("reseeding never overwrites a user's edits to a seeded exercise", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const firstSlug = EXERCISE_CATALOG[0];
    if (!firstSlug) throw new Error("catalog is empty");
    const id = seededExerciseId(user.id, firstSlug.slug);

    await db.update(exercises).set({ name: "My Renamed Exercise" }).where(eq(exercises.id, id));

    await seedExerciseCatalogForUser(db, user.id);

    const [row] = await db.select().from(exercises).where(eq(exercises.id, id));
    expect(row?.name).toBe("My Renamed Exercise");
  });

  it("reseeding never reverts a user-edited contribution weight (Phase 1 review H1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const squat = EXERCISE_CATALOG.find((item) => item.slug === "barbell-back-squat");
    if (!squat) throw new Error("catalog missing barbell-back-squat");
    const exerciseId = seededExerciseId(user.id, squat.slug);

    await db
      .update(exerciseMuscleContributions)
      .set({ weight: 0.75 })
      .where(
        and(
          eq(exerciseMuscleContributions.exerciseId, exerciseId),
          eq(exerciseMuscleContributions.muscleGroupId, "glutes"),
        ),
      );

    await seedExerciseCatalogForUser(db, user.id);

    const [row] = await db
      .select()
      .from(exerciseMuscleContributions)
      .where(
        and(
          eq(exerciseMuscleContributions.exerciseId, exerciseId),
          eq(exerciseMuscleContributions.muscleGroupId, "glutes"),
        ),
      );
    expect(row?.weight).toBe(0.75);
  });

  it("reseeding does not resurrect a muscle contribution the user removed (Phase 1 review H1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const squat = EXERCISE_CATALOG.find((item) => item.slug === "barbell-back-squat");
    if (!squat) throw new Error("catalog missing barbell-back-squat");
    const exerciseId = seededExerciseId(user.id, squat.slug);

    const before = await db
      .select()
      .from(exerciseMuscleContributions)
      .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
    expect(before.some((c) => c.muscleGroupId === "lower_back")).toBe(true);

    await db
      .delete(exerciseMuscleContributions)
      .where(
        and(
          eq(exerciseMuscleContributions.exerciseId, exerciseId),
          eq(exerciseMuscleContributions.muscleGroupId, "lower_back"),
        ),
      );

    await seedExerciseCatalogForUser(db, user.id);

    const after = await db
      .select()
      .from(exerciseMuscleContributions)
      .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
    expect(after.some((c) => c.muscleGroupId === "lower_back")).toBe(false);
    expect(after).toHaveLength(before.length - 1);
  });

  it("reseeding does not resurrect a hard-deleted seeded exercise (Phase 1 review H1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const plankId = seededExerciseId(user.id, "bodyweight-plank");
    await db.delete(exercises).where(eq(exercises.id, plankId));

    await seedExerciseCatalogForUser(db, user.id);

    const [row] = await db.select().from(exercises).where(eq(exercises.id, plankId));
    expect(row).toBeUndefined();

    const remaining = await db.select().from(exercises).where(eq(exercises.userId, user.id));
    expect(remaining).toHaveLength(EXERCISE_CATALOG.length - 1);
  });

  it("lets a custom exercise reuse a hard-deleted seeded name without breaking reseeding (Phase 1 review H1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const plankId = seededExerciseId(user.id, "bodyweight-plank");
    await db.delete(exercises).where(eq(exercises.id, plankId));

    const custom = await createExercise(db, user.id, {
      name: "Plank",
      equipment: "bodyweight",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "abs", role: "primary", weight: 1 }],
    });

    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();

    const [customRow] = await db.select().from(exercises).where(eq(exercises.id, custom.id));
    expect(customRow?.name).toBe("Plank");
    expect(customRow?.isSeeded).toBe(false);
    const [seededPlankRow] = await db.select().from(exercises).where(eq(exercises.id, plankId));
    expect(seededPlankRow).toBeUndefined();
  });

  it("bootstrapping the ledger does not resurrect a pre-ledger hard-deleted seeded exercise (Phase 1 verification MED-1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const plankId = seededExerciseId(user.id, "bodyweight-plank");
    await simulatePreLedgerDb(db, user.id);
    await db.delete(exercises).where(eq(exercises.id, plankId));

    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();

    const [resurrected] = await db.select().from(exercises).where(eq(exercises.id, plankId));
    expect(resurrected).toBeUndefined();
    expect(await ledgerSlugs(db, user.id)).toHaveLength(EXERCISE_CATALOG.length);
    expect(await db.select().from(exercises).where(eq(exercises.userId, user.id))).toHaveLength(
      EXERCISE_CATALOG.length - 1,
    );

    // Deletions stay honoured once the ledger is established.
    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();
    const [stillGone] = await db.select().from(exercises).where(eq(exercises.id, plankId));
    expect(stillGone).toBeUndefined();
  });

  it("bootstrapping the ledger does not throw when a pre-ledger hard-deleted seeded name is held by an active custom exercise (Phase 1 verification MED-1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const plankId = seededExerciseId(user.id, "bodyweight-plank");
    await simulatePreLedgerDb(db, user.id);
    await db.delete(exercises).where(eq(exercises.id, plankId));
    const custom = await createExercise(db, user.id, {
      name: "Plank",
      equipment: "bodyweight",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "abs", role: "primary", weight: 1 }],
    });

    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();

    // The ledger must survive the run — a rolled-back ledger is what made the
    // pre-fix failure permanent rather than transient.
    expect(await ledgerSlugs(db, user.id)).toHaveLength(EXERCISE_CATALOG.length);
    const planks = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.userId, user.id), eq(exercises.name, "Plank")));
    expect(planks).toHaveLength(1);
    expect(planks[0]?.id).toBe(custom.id);
    expect(planks[0]?.isSeeded).toBe(false);

    // And a retry is a clean no-op rather than a repeat of the same failure.
    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();
    expect(await ledgerSlugs(db, user.id)).toHaveLength(EXERCISE_CATALOG.length);
    expect(
      await db
        .select()
        .from(exercises)
        .where(and(eq(exercises.userId, user.id), eq(exercises.name, "Plank"))),
    ).toHaveLength(1);
  });

  it("a new catalog slug colliding with an active custom name is skipped without blocking the other new slugs (Phase 1 verification MED-1)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    // Ledger stays non-empty, so this exercises the steady-state path, not
    // the bootstrap branch.
    await simulateNewCatalogSlug(db, user.id, "bodyweight-plank");
    await simulateNewCatalogSlug(db, user.id, "barbell-bench-press");
    await createExercise(db, user.id, {
      name: "Plank",
      equipment: "bodyweight",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "abs", role: "primary", weight: 1 }],
    });

    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();

    // The colliding slug is skipped, the non-colliding one still seeds fully.
    const benchId = seededExerciseId(user.id, "barbell-bench-press");
    const [bench] = await db.select().from(exercises).where(eq(exercises.id, benchId));
    expect(bench?.name).toBe("Barbell Bench Press");
    expect(bench?.isSeeded).toBe(true);
    const benchContributions = await db
      .select()
      .from(exerciseMuscleContributions)
      .where(eq(exerciseMuscleContributions.exerciseId, benchId));
    expect(benchContributions.length).toBeGreaterThan(0);
    expect(benchContributions.some((c) => c.role === "primary")).toBe(true);

    const [seededPlank] = await db
      .select()
      .from(exercises)
      .where(eq(exercises.id, seededExerciseId(user.id, "bodyweight-plank")));
    expect(seededPlank).toBeUndefined();

    // Both slugs are recorded, so the next deploy reconsiders neither.
    expect(await ledgerSlugs(db, user.id)).toHaveLength(EXERCISE_CATALOG.length);
    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();
    expect(
      await db
        .select()
        .from(exercises)
        .where(and(eq(exercises.userId, user.id), eq(exercises.name, "Plank"))),
    ).toHaveLength(1);
  });

  it("bootstrapping the ledger leaves a user's edits to seeded exercises untouched", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    await seedExerciseCatalogForUser(db, user.id);

    const squatId = seededExerciseId(user.id, "barbell-back-squat");
    await db.update(exercises).set({ name: "My Squat" }).where(eq(exercises.id, squatId));
    await db
      .delete(exerciseMuscleContributions)
      .where(
        and(
          eq(exerciseMuscleContributions.exerciseId, squatId),
          eq(exerciseMuscleContributions.muscleGroupId, "lower_back"),
        ),
      );
    const beforeCount = (await db.select().from(exercises).where(eq(exercises.userId, user.id)))
      .length;

    await simulatePreLedgerDb(db, user.id);
    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();

    const [squat] = await db.select().from(exercises).where(eq(exercises.id, squatId));
    expect(squat?.name).toBe("My Squat");
    const contributions = await db
      .select()
      .from(exerciseMuscleContributions)
      .where(eq(exerciseMuscleContributions.exerciseId, squatId));
    expect(contributions.some((c) => c.muscleGroupId === "lower_back")).toBe(false);
    expect(await db.select().from(exercises).where(eq(exercises.userId, user.id))).toHaveLength(
      beforeCount,
    );
    expect(await ledgerSlugs(db, user.id)).toHaveLength(EXERCISE_CATALOG.length);
  });

  it("rolls the ledger back with the exercises when the seed transaction fails, and a retry recovers", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);

    // Break a muscle group the catalog references so the contributions insert
    // fails mid-transaction, after the exercises insert has succeeded.
    const firstItem = EXERCISE_CATALOG[0];
    const referencedGroup = firstItem?.contributions[0]?.muscleGroupId;
    if (!referencedGroup) throw new Error("catalog item has no contributions");
    await db.delete(muscleGroups).where(eq(muscleGroups.id, referencedGroup));

    await expect(seedExerciseCatalogForUser(db, user.id)).rejects.toThrow();
    expect(await db.select().from(exercises).where(eq(exercises.userId, user.id))).toHaveLength(0);
    expect(await ledgerSlugs(db, user.id)).toHaveLength(0);

    await seedMuscleGroups(db);
    await expect(seedExerciseCatalogForUser(db, user.id)).resolves.not.toThrow();
    expect(await db.select().from(exercises).where(eq(exercises.userId, user.id))).toHaveLength(
      EXERCISE_CATALOG.length,
    );
    expect(await ledgerSlugs(db, user.id)).toHaveLength(EXERCISE_CATALOG.length);
  });

  it("still surfaces non-uniqueness violations from the exercises insert", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);

    // Arbiter-less `onConflictDoNothing` must swallow unique violations only —
    // a foreign-key violation (here: no such user) must still fail loudly.
    await expect(
      seedExerciseCatalogForUser(db, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow();
  });

  it("seeding for all users is a no-op when no users exist yet", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    await expect(seedExerciseCatalogForAllUsers(db)).resolves.not.toThrow();

    const exerciseRows = await db.select().from(exercises);
    expect(exerciseRows).toHaveLength(0);
  });
});
