import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./testDb";
import { exerciseMuscleContributions, exercises, muscleGroups, users } from "@/db/schema";
import {
  EXERCISE_CATALOG,
  seedExerciseCatalogForAllUsers,
  seedExerciseCatalogForUser,
  seedMuscleGroups,
  seededExerciseId,
} from "@/db/seed";
import { MUSCLE_GROUP_SLUGS } from "@/domain/exercises/muscleGroups";

async function insertTestUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [user] = await db
    .insert(users)
    .values({ email: "seed-test@example.com", passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("seed (PGlite integration)", () => {
  it("seeds all 15 canonical muscle groups", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);

    const rows = await db.select().from(muscleGroups);
    expect(rows).toHaveLength(MUSCLE_GROUP_SLUGS.length);
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(MUSCLE_GROUP_SLUGS));
  });

  it("reseeding muscle groups is idempotent", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    await seedMuscleGroups(db);

    const rows = await db.select().from(muscleGroups);
    expect(rows).toHaveLength(MUSCLE_GROUP_SLUGS.length);
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

  it("seeding for all users is a no-op when no users exist yet", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    await expect(seedExerciseCatalogForAllUsers(db)).resolves.not.toThrow();

    const exerciseRows = await db.select().from(exercises);
    expect(exerciseRows).toHaveLength(0);
  });
});
