import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise, setExerciseArchived } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import {
  createPrescription,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  PrescriptionCompatibilityError,
  PrescriptionExerciseArchivedError,
  PrescriptionExerciseNotFoundError,
  PrescriptionNotFoundError,
  PrescriptionReorderMismatchError,
  reorderPrescriptions,
  updatePrescription,
} from "@/server/prescriptions/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

async function insertSquat(db: AppDb, userId: string) {
  return createExercise(db, userId, {
    name: "Back Squat",
    equipment: "barbell",
    mechanics: "compound",
    laterality: "bilateral",
    loadStepKg: 2.5,
    contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
  });
}

const fixedScheme = { v: 1 as const, scheme: { type: "fixed" as const, sets: 3, reps: 10 } };
const repRangeScheme = {
  v: 1 as const,
  scheme: { type: "repRange" as const, sets: 3, minReps: 8, maxReps: 12 },
};

describe("prescriptions service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let templateId: string;
  let exerciseId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    const programId = (await createProgram(db, userId, { name: "Program A" })).id;
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    templateId = template.id;
    exerciseId = (await insertSquat(db, userId)).id;
  });

  it("assigns sequential positions to newly created prescriptions", async () => {
    const otherExercise = await createExercise(db, userId, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });

    const first = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    const second = await createPrescription(db, userId, templateId, {
      exerciseId: otherExercise.id,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    expect(first?.position).toBe(0);
    expect(second?.position).toBe(1);
  });

  it("returns null when the template is owned by another user", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await expect(
      createPrescription(db, otherUserId, templateId, {
        exerciseId,
        scheme: fixedScheme,
        progression: { strategyId: "manual" },
      }),
    ).resolves.toBeNull();
  });

  it("throws PrescriptionExerciseNotFoundError for an exercise owned by another user", async () => {
    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const otherExercise = await insertSquat(db, otherUserId);
    await expect(
      createPrescription(db, userId, templateId, {
        exerciseId: otherExercise.id,
        scheme: fixedScheme,
        progression: { strategyId: "manual" },
      }),
    ).rejects.toThrow(PrescriptionExerciseNotFoundError);
  });

  it("throws PrescriptionExerciseArchivedError when targeting an archived exercise", async () => {
    await setExerciseArchived(db, userId, exerciseId, "archive");
    await expect(
      createPrescription(db, userId, templateId, {
        exerciseId,
        scheme: fixedScheme,
        progression: { strategyId: "manual" },
      }),
    ).rejects.toThrow(PrescriptionExerciseArchivedError);
  });

  it("throws PrescriptionCompatibilityError for a fixed scheme with rep-progression and no repCap", async () => {
    await expect(
      createPrescription(db, userId, templateId, {
        exerciseId,
        scheme: fixedScheme,
        progression: { strategyId: "rep-progression", config: {} },
      }),
    ).rejects.toThrow(PrescriptionCompatibilityError);
  });

  it("accepts a fixed scheme with rep-progression when repCap is provided", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "rep-progression", config: { repCap: 15 } },
    });
    expect(created?.progression.config.repCap).toBe(15);
  });

  it("does not require repCap for rep-progression with a repRange scheme, and defaults+classifies it as heuristic", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: repRangeScheme,
      progression: { strategyId: "rep-progression", config: {} },
    });
    // M2: repCap materialises from scheme.maxReps for repRange.
    expect(created?.progression.config.repCap).toBe(12);
    // H1: the materialised default is heuristic, not user_defined.
    expect(created?.progression.classification).toBe("heuristic");
  });

  it("classifies the default load-progression config (UI default path, config {}) as heuristic", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "load-progression", config: {} },
    });
    // H1: incrementKg materialises from the exercise's loadStepKg and the
    // resulting config matches the shipped default, so it's heuristic.
    expect(created?.progression.classification).toBe("heuristic");
    expect(created?.progression.config.incrementKg).toBe(2.5);
  });

  it("classifies a load-progression config matching the exercise's loadStepKg as heuristic", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "load-progression", config: { incrementKg: 2.5 } },
    });
    expect(created?.progression.classification).toBe("heuristic");
  });

  it("rejects a PATCH that leaves the effective scheme/progression combination incompatible", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!created) throw new Error("expected prescription");

    await expect(
      updatePrescription(db, userId, created.id, {
        progression: { strategyId: "rep-progression", config: {} },
      }),
    ).rejects.toThrow(PrescriptionCompatibilityError);
  });

  it("PATCH preserves fields that are omitted from the patch", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
      restSeconds: 90,
    });
    if (!created) throw new Error("expected prescription");

    const updated = await updatePrescription(db, userId, created.id, { notes: "go heavy" });
    expect(updated.restSeconds).toBe(90);
    expect(updated.notes).toBe("go heavy");
  });

  it("throws PrescriptionNotFoundError when updating or deleting another user's prescription", async () => {
    const otherUserId = (await insertTestUser(db, "other3@example.com")).id;
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!created) throw new Error("expected prescription");

    await expect(
      updatePrescription(db, otherUserId, created.id, { notes: "hijacked" }),
    ).rejects.toThrow(PrescriptionNotFoundError);
    await expect(deletePrescription(db, otherUserId, created.id)).rejects.toThrow(
      PrescriptionNotFoundError,
    );
  });

  it("returns null from getPrescription/listPrescriptions for another user", async () => {
    const otherUserId = (await insertTestUser(db, "other4@example.com")).id;
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!created) throw new Error("expected prescription");

    await expect(getPrescription(db, otherUserId, created.id)).resolves.toBeNull();
    await expect(listPrescriptions(db, otherUserId, templateId)).resolves.toBeNull();
  });

  it("deletes a prescription", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!created) throw new Error("expected prescription");
    await deletePrescription(db, userId, created.id);
    await expect(getPrescription(db, userId, created.id)).resolves.toBeNull();
  });

  it("reorders prescriptions to match the submitted id order (deferred position constraint)", async () => {
    const otherExercise = await createExercise(db, userId, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    const first = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    const second = await createPrescription(db, userId, templateId, {
      exerciseId: otherExercise.id,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!first || !second) throw new Error("expected prescriptions");

    const reordered = await reorderPrescriptions(db, userId, templateId, [second.id, first.id]);
    expect(reordered?.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(reordered?.map((p) => p.position)).toEqual([0, 1]);
  });

  it("rejects a reorder whose ids don't match the template's current prescriptions", async () => {
    const created = await createPrescription(db, userId, templateId, {
      exerciseId,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });
    if (!created) throw new Error("expected prescription");
    await expect(
      reorderPrescriptions(db, userId, templateId, ["00000000-0000-7000-8000-000000000000"]),
    ).rejects.toThrow(PrescriptionReorderMismatchError);
  });
});
