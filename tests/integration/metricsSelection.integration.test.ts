import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb, createTestDbWithStatementLog } from "./testDb";
import { dashboardEstimateSelections, exercises, users } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise, setExerciseArchived, updateExercise } from "@/server/exercises/service";
import { seedMuscleGroups } from "@/db/seed";
import {
  InvalidSelectionExerciseError,
  getSelection,
  replaceSelection,
} from "@/server/metrics/selectionService";
import { getMetricsDashboard } from "@/server/metrics/service";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §11.5, acceptance criteria A-26 through A-30, A-32.

const AS_OF = new Date("2026-09-06T12:00:00.000Z");

async function insertTestUser(db: AppDb, email: string) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

async function makeExercise(
  db: AppDb,
  userId: string,
  name: string,
  overrides: Partial<{ equipment: string; strengthEstimate: "auto" | "off" }> = {},
) {
  const exercise = await createExercise(db, userId, {
    name,
    equipment: (overrides.equipment ?? "barbell") as "barbell",
    mechanics: "compound",
    laterality: "bilateral",
    loadStepKg: 2.5,
    contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
  });
  if (overrides.strengthEstimate) {
    await updateExercise(db, userId, exercise.id, { strengthEstimate: overrides.strengthEstimate });
  }
  return exercise;
}

describe("replaceSelection / getSelection (§11.5)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db, "selection@example.com")).id;
  });

  it("A-26: an exercise id owned by another user is rejected as invalid_exercise; the stored selection is unchanged", async () => {
    const otherUserId = (await insertTestUser(db, "other-selection@example.com")).id;
    const mine = await makeExercise(db, userId, "Mine");
    const theirs = await makeExercise(db, otherUserId, "Theirs");

    await replaceSelection(db, userId, [mine.id]);

    await expect(replaceSelection(db, userId, [mine.id, theirs.id])).rejects.toThrow(
      InvalidSelectionExerciseError,
    );
    try {
      await replaceSelection(db, userId, [mine.id, theirs.id]);
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSelectionExerciseError);
      expect((err as InvalidSelectionExerciseError).exerciseId).toBe(theirs.id);
    }

    const stored = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.exerciseId).toBe(mine.id);
  });

  it("A-26: a random (non-existent) UUID is rejected the same way as a foreign one", async () => {
    await expect(replaceSelection(db, userId, [newId()])).rejects.toThrow(
      InvalidSelectionExerciseError,
    );
  });

  it("A-26: getSelection/step 8 never returns another user's rows even when a foreign exercise_id is inserted directly", async () => {
    const otherUserId = (await insertTestUser(db, "direct-insert@example.com")).id;
    const theirs = await makeExercise(db, otherUserId, "Direct Insert Target");
    // Bypasses the service layer entirely — simulates a row that should be
    // structurally impossible via the write contract, to prove the READ
    // path's ownership predicate (on BOTH tables) holds independently.
    await db
      .insert(dashboardEstimateSelections)
      .values({ userId, exerciseId: theirs.id, position: 1 });

    const { selection } = await getSelection(db, userId, AS_OF);
    expect(selection).toEqual([]);
    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.strength.selection).toEqual([]);
  });

  it("A-27: replaceSelection([c,a,b]) stores positions 1,2,3 in that order; the index returns them in stored order regardless of name or recency", async () => {
    const a = await makeExercise(db, userId, "Ab Wheel Rollout");
    const b = await makeExercise(db, userId, "Bench Press");
    const c = await makeExercise(db, userId, "Zercher Squat");

    await replaceSelection(db, userId, [c.id, a.id, b.id]);
    const stored = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId))
      .orderBy(dashboardEstimateSelections.position);
    expect(stored.map((row) => row.exerciseId)).toEqual([c.id, a.id, b.id]);

    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    expect(metrics.strength.selection.map((row) => row.exerciseId)).toEqual([c.id, a.id, b.id]);

    await replaceSelection(db, userId, [b.id, a.id, c.id]);
    const restored = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId))
      .orderBy(dashboardEstimateSelections.position);
    expect(restored.map((row) => row.exerciseId)).toEqual([b.id, a.id, c.id]);
    // No row survives at a stale position: the old (c,a,b) order is gone.
    expect(restored.map((row) => row.exerciseId)).not.toEqual([c.id, a.id, b.id]);
  });

  it("A-28: six ids are rejected by the Zod schema before any write; a duplicate id is rejected the same way", async () => {
    const ids = await Promise.all(
      Array.from({ length: 6 }, (_, i) => makeExercise(db, userId, `Six ${i}`)),
    );
    const { putSelectionInputSchema } = await import("@/domain/metrics/selection");
    expect(putSelectionInputSchema.safeParse({ exerciseIds: ids.map((e) => e.id) }).success).toBe(
      false,
    );
    expect(
      putSelectionInputSchema.safeParse({ exerciseIds: [ids[0]!.id, ids[0]!.id] }).success,
    ).toBe(false);

    const stored = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    expect(stored).toEqual([]);
  });

  it("A-28: five ids are stored; a direct SQL sixth row fails on the check constraint or the unique position index", async () => {
    const exs = await Promise.all(
      Array.from({ length: 5 }, (_, i) => makeExercise(db, userId, `Five ${i}`)),
    );
    await replaceSelection(
      db,
      userId,
      exs.map((e) => e.id),
    );
    const stored = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    expect(stored).toHaveLength(5);

    const sixth = await makeExercise(db, userId, "Sixth Direct");
    await expect(
      db.insert(dashboardEstimateSelections).values({ userId, exerciseId: sixth.id, position: 6 }),
    ).rejects.toThrow();
  });

  it("A-29: a bodyweight exercise, an 'off' exercise, or a not-yet-selected archived exercise is rejected as invalid_exercise", async () => {
    const bodyweightEx = await makeExercise(db, userId, "Pull-Up", { equipment: "bodyweight" });
    await expect(replaceSelection(db, userId, [bodyweightEx.id])).rejects.toThrow(
      InvalidSelectionExerciseError,
    );

    const offEx = await makeExercise(db, userId, "Turned Off Exercise", {
      strengthEstimate: "off",
    });
    await expect(replaceSelection(db, userId, [offEx.id])).rejects.toThrow(
      InvalidSelectionExerciseError,
    );

    const archivedEx = await makeExercise(db, userId, "Archived Not Selected");
    await setExerciseArchived(db, userId, archivedEx.id, "archive");
    await expect(replaceSelection(db, userId, [archivedEx.id])).rejects.toThrow(
      InvalidSelectionExerciseError,
    );
  });

  it("A-29: an exercise already stored is accepted on re-submission after being archived, turned off, or having its equipment changed", async () => {
    const exercise = await makeExercise(db, userId, "Later Archived");
    await replaceSelection(db, userId, [exercise.id]);

    await setExerciseArchived(db, userId, exercise.id, "archive");
    const afterArchive = await replaceSelection(db, userId, [exercise.id]);
    expect(afterArchive[0]).toMatchObject({ exerciseId: exercise.id, archived: true });

    await updateExercise(db, userId, exercise.id, { strengthEstimate: "off" });
    const afterOff = await replaceSelection(db, userId, [exercise.id]);
    expect(afterOff[0]).toMatchObject({ exerciseId: exercise.id, state: "turned_off" });

    await updateExercise(db, userId, exercise.id, { equipment: "other" });
    const afterEquip = await replaceSelection(db, userId, [exercise.id]);
    expect(afterEquip[0]).toMatchObject({ exerciseId: exercise.id, state: "not_available" });
  });

  // §11.2's "Metrics Current-estimates selection" row / A-16 — reuses the
  // e1RM structural gate, so a hand-built new-profile exercise is rejected
  // the same way a bodyweight/off exercise already is (A-29).
  it("A-16: replaceSelection rejects a hand-built new-profile exercise", async () => {
    const distanceEx = await createExercise(db, userId, {
      name: "Farmer's Carry",
      equipment: "other",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      measurementProfile: "load_distance",
      contributions: [{ muscleGroupId: "forearms", role: "primary", weight: 1 }],
    });
    await expect(replaceSelection(db, userId, [distanceEx.id])).rejects.toThrow(
      InvalidSelectionExerciseError,
    );
  });

  // A-16 / H-14 — an already-selected row for an exercise that later becomes
  // ineligible is RETAINED and shown `not_available`, never pruned. §10.3
  // blocks a profile edit through the service once an exercise is
  // referenced; the raw update below bypasses that lock deliberately, to
  // reach the edge state H-14 protects against — not a path the
  // athlete-facing API can produce in Release 1 (a locked exercise cannot
  // reach this shape any other way).
  it("A-16: a retained selected row for an exercise whose profile is later flipped to non-load_reps shows not_available, never deleted", async () => {
    const exercise = await makeExercise(db, userId, "Profile Flip Candidate");
    await replaceSelection(db, userId, [exercise.id]);

    await db
      .update(exercises)
      .set({ measurementProfile: "reps", loadBasis: null })
      .where(eq(exercises.id, exercise.id));

    const selection = await getSelection(db, userId);
    expect(selection.selection).toHaveLength(1);
    expect(selection.selection[0]).toMatchObject({
      exerciseId: exercise.id,
      state: "not_available",
    });

    const rows = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    expect(rows).toHaveLength(1); // never pruned.
  });

  it("A-30: the same body applied twice yields identical rows both times (only updated_at differs)", async () => {
    const exercise = await makeExercise(db, userId, "Idempotent Exercise");
    const first = await replaceSelection(db, userId, [exercise.id]);
    const second = await replaceSelection(db, userId, [exercise.id]);
    expect(second).toEqual(first);

    const rows1 = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    await replaceSelection(db, userId, [exercise.id]);
    const rows2 = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    expect(rows2[0]?.exerciseId).toBe(rows1[0]?.exerciseId);
    expect(rows2[0]?.position).toBe(rows1[0]?.position);
  });

  it("A-30: an empty array clears the selection; a re-submission after a clear restores it", async () => {
    const exercise = await makeExercise(db, userId, "Clear Me");
    await replaceSelection(db, userId, [exercise.id]);
    await replaceSelection(db, userId, []);
    const cleared = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    expect(cleared).toEqual([]);

    const restored = await replaceSelection(db, userId, [exercise.id]);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.exerciseId).toBe(exercise.id);
  });

  it("A-32: hard-deleting a selected exercise with no history removes its row and leaves the others at their positions", async () => {
    const a = await makeExercise(db, userId, "Cascade A");
    const b = await makeExercise(db, userId, "Cascade B");
    const c = await makeExercise(db, userId, "Cascade C");
    await replaceSelection(db, userId, [a.id, b.id, c.id]);

    await db.delete(exercises).where(and(eq(exercises.id, b.id), eq(exercises.userId, userId)));

    const remaining = await db
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId))
      .orderBy(dashboardEstimateSelections.position);
    expect(remaining.map((row) => row.exerciseId)).toEqual([a.id, c.id]);
    expect(remaining.map((row) => row.position)).toEqual([1, 3]);
  });

  it("A-32: a selection written by one call is returned by a fresh getMetricsDashboard and by getSelection with identical order", async () => {
    const a = await makeExercise(db, userId, "Cross Device A");
    const b = await makeExercise(db, userId, "Cross Device B");
    await replaceSelection(db, userId, [b.id, a.id]);

    const metrics = await getMetricsDashboard(db, userId, AS_OF);
    const { selection } = await getSelection(db, userId, AS_OF);
    expect(metrics.strength.selection.map((row) => row.exerciseId)).toEqual([b.id, a.id]);
    expect(selection.map((row) => row.exerciseId)).toEqual([b.id, a.id]);
  });

  it("M-2: getSelection's fact query is bounded in time, exactly like the dashboard's own step 9 — no statement scans all-time", async () => {
    const { db: loggedDb, log } = await createTestDbWithStatementLog();
    await seedMuscleGroups(loggedDb);
    const localUserId = (await insertTestUser(loggedDb, "m2-bound@example.com")).id;
    const exercise = await createExercise(loggedDb, localUserId, {
      name: "M-2 Bound Exercise",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    await replaceSelection(loggedDb, localUserId, [exercise.id]);

    log.reset();
    await getSelection(loggedDb, localUserId, AS_OF);

    const factQuery = log.statements.find((s) =>
      /"session_exercises"\."exercise_id"\s+in\s*\(/i.test(s),
    );
    expect(factQuery, "the selection-bounded fact query was not issued").toBeTruthy();
    // The load-bearing half of M-2's fix: a real `started_at` bound in the
    // statement's own text, not an all-time scan (§11.3's "no statement is
    // unbounded in time").
    expect(factQuery).toMatch(/"started_at"\s*>=\s*\$\d/);
    expect(factQuery).toMatch(/"started_at"\s*<\s*\$\d/);

    // L-13 — the selection-metadata query now selects the exercise's real
    // `load_step_kg` (previously hard-coded to `1` in the report call).
    const selectionQuery = log.statements.find((s) => s.includes("dashboard_estimate_selections"));
    expect(selectionQuery).toContain("load_step_kg");
  });
});

describe("getSelection — candidates (§11.5 read contract)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db, "candidates@example.com")).id;
  });

  it("offers only compatible, not-switched-off, not-archived, not-already-selected exercises, ordered by case-folded name then id", async () => {
    const zebra = await makeExercise(db, userId, "zebra press");
    const apple = await makeExercise(db, userId, "Apple Curl");
    const bodyweightEx = await makeExercise(db, userId, "Pull-Up", { equipment: "bodyweight" });
    const offEx = await makeExercise(db, userId, "Off Exercise", { strengthEstimate: "off" });
    const archivedEx = await makeExercise(db, userId, "Archived Candidate");
    await setExerciseArchived(db, userId, archivedEx.id, "archive");
    const alreadySelected = await makeExercise(db, userId, "Already Selected");
    await replaceSelection(db, userId, [alreadySelected.id]);

    const { candidates } = await getSelection(db, userId);
    const ids = candidates.map((c) => c.exerciseId);
    expect(ids).toContain(apple.id);
    expect(ids).toContain(zebra.id);
    expect(ids).not.toContain(bodyweightEx.id);
    expect(ids).not.toContain(offEx.id);
    expect(ids).not.toContain(archivedEx.id);
    expect(ids).not.toContain(alreadySelected.id);
    expect(candidates.map((c) => c.name)).toEqual(["Apple Curl", "zebra press"]);
  });

  it("empty candidate list is possible and distinct from an empty selection", async () => {
    const { candidates, selection } = await getSelection(db, userId);
    expect(candidates).toEqual([]);
    expect(selection).toEqual([]);
  });
});
