import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { exerciseMuscleContributions, exercises, users } from "@/db/schema";
import { isUuidv7, newId } from "@/domain/ids/uuidv7";
import { seedMuscleGroups } from "@/db/seed";
import {
  createExercise,
  deleteExercise,
  ExerciseNameConflictError,
  ExerciseNotFoundError,
  ExerciseReferencedError,
  RollupContributionNotCarriedError,
  getExercise,
  listExercises,
  setExerciseArchived,
  updateExercise,
} from "@/server/exercises/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const SQUAT_INPUT = {
  name: "Back Squat",
  equipment: "barbell" as const,
  mechanics: "compound" as const,
  laterality: "bilateral" as const,
  loadStepKg: 2.5,
  contributions: [
    { muscleGroupId: "quads" as const, role: "primary" as const, weight: 1 },
    { muscleGroupId: "glutes" as const, role: "secondary" as const, weight: 0.5 },
  ],
};

describe("exercises service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
  });

  it("creates a custom exercise with two contributions and a UUIDv7 id", async () => {
    const created = await createExercise(db, userId, SQUAT_INPUT);
    expect(isUuidv7(created.id)).toBe(true);
    expect(created.isSeeded).toBe(false);
    expect(created.contributions).toHaveLength(2);

    const fetched = await getExercise(db, userId, created.id);
    expect(fetched?.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ muscleGroupId: "quads", role: "primary", weight: 1 }),
        expect.objectContaining({ muscleGroupId: "glutes", role: "secondary", weight: 0.5 }),
      ]),
    );
  });

  it("rejects a second active exercise with the same name for the same user", async () => {
    await createExercise(db, userId, SQUAT_INPUT);
    await expect(createExercise(db, userId, SQUAT_INPUT)).rejects.toThrow(
      ExerciseNameConflictError,
    );
  });

  it("allows the same name for two different users", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await createExercise(db, userId, SQUAT_INPUT);
    await expect(createExercise(db, otherUserId, SQUAT_INPUT)).resolves.toBeTruthy();
  });

  it("allows reusing a name after the original is archived", async () => {
    const original = await createExercise(db, userId, SQUAT_INPUT);
    await setExerciseArchived(db, userId, original.id, "archive");
    await expect(createExercise(db, userId, SQUAT_INPUT)).resolves.toBeTruthy();
  });

  it("excludes archived exercises from the default list but includes them with includeArchived", async () => {
    const created = await createExercise(db, userId, SQUAT_INPUT);
    await setExerciseArchived(db, userId, created.id, "archive");

    const defaultList = await listExercises(db, userId);
    expect(defaultList.find((e) => e.id === created.id)).toBeUndefined();

    const fullList = await listExercises(db, userId, { includeArchived: true });
    expect(fullList.find((e) => e.id === created.id)).toBeTruthy();
  });

  it("archived exercises remain retrievable by id", async () => {
    const created = await createExercise(db, userId, SQUAT_INPUT);
    await setExerciseArchived(db, userId, created.id, "archive");
    const fetched = await getExercise(db, userId, created.id);
    expect(fetched?.archivedAt).toBeInstanceOf(Date);
  });

  it("unarchiving clears archivedAt", async () => {
    const created = await createExercise(db, userId, SQUAT_INPUT);
    await setExerciseArchived(db, userId, created.id, "archive");
    const restored = await setExerciseArchived(db, userId, created.id, "unarchive");
    expect(restored.archivedAt).toBeNull();
  });

  it("throws ExerciseNameConflictError (not a raw DB error) when unarchiving into an active name collision", async () => {
    // Phase 1 review M1: archiving frees the name for reuse (uq_exercises_active_name
    // is partial on archived_at IS NULL); the reverse direction — unarchiving into a
    // name someone else now holds — must map the same way, not 500.
    const original = await createExercise(db, userId, SQUAT_INPUT);
    await setExerciseArchived(db, userId, original.id, "archive");
    await createExercise(db, userId, SQUAT_INPUT);

    await expect(setExerciseArchived(db, userId, original.id, "unarchive")).rejects.toThrow(
      ExerciseNameConflictError,
    );
  });

  it("filters the list by a case-insensitive name search", async () => {
    await createExercise(db, userId, SQUAT_INPUT);
    await createExercise(db, userId, { ...SQUAT_INPUT, name: "Bench Press" });

    const results = await listExercises(db, userId, { search: "squat" });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Back Squat");
  });

  it("returns null from getExercise for another user's exercise", async () => {
    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const created = await createExercise(db, otherUserId, SQUAT_INPUT);
    await expect(getExercise(db, userId, created.id)).resolves.toBeNull();
  });

  it("updates editable fields without touching contributions when omitted", async () => {
    const created = await createExercise(db, userId, SQUAT_INPUT);
    const updated = await updateExercise(db, userId, created.id, { name: "High Bar Squat" });
    expect(updated.name).toBe("High Bar Squat");
    expect(updated.contributions).toHaveLength(2);
  });

  it("replaces contributions when provided on update", async () => {
    // updateExercise receives already-Zod-resolved input in production (the
    // route parses the body through updateExerciseSchema, which fills in the
    // role-default weight) — mirror that here rather than passing a bare,
    // weight-less contribution the service was never meant to see directly.
    const created = await createExercise(db, userId, SQUAT_INPUT);
    const updated = await updateExercise(db, userId, created.id, {
      contributions: [{ muscleGroupId: "hamstrings", role: "primary", weight: 1 }],
    });
    expect(updated.contributions).toHaveLength(1);
    expect(updated.contributions[0]?.muscleGroupId).toBe("hamstrings");
  });

  it("round-trips fractional loadStepKg values through create, update, and read (Phase 5.5 Light)", async () => {
    const created = await createExercise(db, userId, { ...SQUAT_INPUT, loadStepKg: 1.25 });
    expect(created.loadStepKg).toBe(1.25);

    const fetched = await getExercise(db, userId, created.id);
    expect(fetched?.loadStepKg).toBe(1.25);

    const updated = await updateExercise(db, userId, created.id, { loadStepKg: 0.25 });
    expect(updated.loadStepKg).toBe(0.25);

    const refetched = await getExercise(db, userId, created.id);
    expect(refetched?.loadStepKg).toBe(0.25);

    const [listed] = await listExercises(db, userId, { search: "Back Squat" });
    expect(listed?.loadStepKg).toBe(0.25);
  });

  it("throws ExerciseNotFoundError when updating a nonexistent exercise", async () => {
    await expect(
      updateExercise(db, userId, "00000000-0000-7000-8000-000000000000", { name: "x" }),
    ).rejects.toThrow(ExerciseNotFoundError);
  });

  it("throws ExerciseNameConflictError when renaming into a collision", async () => {
    await createExercise(db, userId, SQUAT_INPUT);
    const bench = await createExercise(db, userId, { ...SQUAT_INPUT, name: "Bench Press" });
    await expect(updateExercise(db, userId, bench.id, { name: "Back Squat" })).rejects.toThrow(
      ExerciseNameConflictError,
    );
  });

  it("hard-deletes an exercise with no history references and cascades its contributions", async () => {
    const created = await createExercise(db, userId, SQUAT_INPUT);
    await deleteExercise(db, userId, created.id);
    await expect(getExercise(db, userId, created.id)).resolves.toBeNull();
  });

  it("throws ExerciseNotFoundError when deleting a nonexistent exercise", async () => {
    await expect(
      deleteExercise(db, userId, "00000000-0000-7000-8000-000000000000"),
    ).rejects.toThrow(ExerciseNotFoundError);
  });

  it("refuses to hard-delete an exercise referenced by history (409 via seeded fixture)", async () => {
    // Phase 3 (set_logs) doesn't exist yet, so this exercises the FK RESTRICT
    // backstop (data-model.md §1 soft-delete policy) via a throwaway fixture
    // table that stands in for a future history table referencing exercises.
    await db.execute(sql`
      CREATE TABLE test_history_fixture (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      )
    `);
    try {
      const created = await createExercise(db, userId, SQUAT_INPUT);
      await db.execute(sql`INSERT INTO test_history_fixture (exercise_id) VALUES (${created.id})`);

      await expect(deleteExercise(db, userId, created.id)).rejects.toThrow(ExerciseReferencedError);

      const [row] = await db.select().from(exercises).where(eq(exercises.id, created.id));
      expect(row).toBeTruthy();
    } finally {
      await db.execute(sql`DROP TABLE test_history_fixture`);
    }
  });
});

// ADR-010 Release 1 — leaf-only create, carry-through-only update. A legacy
// direct `back` contribution can no longer be produced by createExercise
// (it's leaf-only at the schema level), so these fixtures insert one
// directly, exactly reproducing what a pre-Release-1 row looks like.
describe("exercises service — muscle taxonomy v2 Release 1 (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
  });

  async function insertLegacyBackFixture(name: string): Promise<string> {
    const exerciseId = newId();
    await db.insert(exercises).values({
      id: exerciseId,
      userId,
      name,
      equipment: "cable",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
    });
    await db.insert(exerciseMuscleContributions).values({
      exerciseId,
      muscleGroupId: "back",
      role: "primary",
      weight: 1,
    });
    return exerciseId;
  }

  it("creates exercises with the new leaf muscle groups (lats, upper_back, adductors)", async () => {
    const created = await createExercise(db, userId, {
      name: "Weighted Pull-Up",
      equipment: "bodyweight",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [
        { muscleGroupId: "lats", role: "primary", weight: 1 },
        { muscleGroupId: "upper_back", role: "secondary", weight: 0.5 },
      ],
    });
    expect(created.contributions.map((c) => c.muscleGroupId).sort()).toEqual([
      "lats",
      "upper_back",
    ]);

    const adductorExercise = await createExercise(db, userId, {
      name: "Cable Hip Adduction",
      equipment: "cable",
      mechanics: "isolation",
      laterality: "unilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "adductors", role: "primary", weight: 1 }],
    });
    const fetched = await getExercise(db, userId, adductorExercise.id);
    expect(fetched?.contributions[0]?.muscleGroupId).toBe("adductors");
  });

  it("carries forward an existing back contribution on update", async () => {
    const exerciseId = await insertLegacyBackFixture("Legacy Barbell Row");
    const updated = await updateExercise(db, userId, exerciseId, {
      contributions: [{ muscleGroupId: "back", role: "primary", weight: 1 }],
    });
    expect(updated.contributions).toEqual([{ muscleGroupId: "back", role: "primary", weight: 1 }]);
  });

  it("leaves a legacy back contribution untouched by a metadata-only edit (contributions omitted)", async () => {
    const exerciseId = await insertLegacyBackFixture("Legacy Barbell Row");
    const updated = await updateExercise(db, userId, exerciseId, { name: "Renamed Row" });
    expect(updated.name).toBe("Renamed Row");
    expect(updated.contributions).toEqual([{ muscleGroupId: "back", role: "primary", weight: 1 }]);
  });

  it("allows explicitly replacing a legacy back contribution with a leaf", async () => {
    const exerciseId = await insertLegacyBackFixture("Legacy Barbell Row");
    const updated = await updateExercise(db, userId, exerciseId, {
      contributions: [{ muscleGroupId: "lats", role: "primary", weight: 1 }],
    });
    expect(updated.contributions).toEqual([{ muscleGroupId: "lats", role: "primary", weight: 1 }]);

    const fetched = await getExercise(db, userId, exerciseId);
    expect(fetched?.contributions.some((c) => c.muscleGroupId === "back")).toBe(false);
  });

  it("rejects introducing back on an update when the exercise never had it, and rolls back atomically", async () => {
    const created = await createExercise(db, userId, {
      name: "Fresh Pull-Up",
      equipment: "bodyweight",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "lats", role: "primary", weight: 1 }],
    });

    await expect(
      updateExercise(db, userId, created.id, {
        name: "Renamed Pull-Up",
        contributions: [{ muscleGroupId: "back", role: "primary", weight: 1 }],
      }),
    ).rejects.toThrow(RollupContributionNotCarriedError);

    // Atomic: neither the rejected contribution swap nor the accompanying
    // name change (same call) took effect.
    const fetched = await getExercise(db, userId, created.id);
    expect(fetched?.name).toBe("Fresh Pull-Up");
    expect(fetched?.contributions).toEqual([{ muscleGroupId: "lats", role: "primary", weight: 1 }]);
  });

  it("preserves no-existence-leak: a non-owner gets ExerciseNotFoundError, not RollupContributionNotCarriedError", async () => {
    const otherUserId = (await insertTestUser(db, "other-taxonomy@example.com")).id;
    const created = await createExercise(db, otherUserId, {
      name: "Someone Else's Pull-Up",
      equipment: "bodyweight",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "lats", role: "primary", weight: 1 }],
    });

    await expect(
      updateExercise(db, userId, created.id, {
        contributions: [{ muscleGroupId: "back", role: "primary", weight: 1 }],
      }),
    ).rejects.toThrow(ExerciseNotFoundError);
  });
});
