import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { createTestDb } from "./testDb";
import { exerciseCatalogSeedLog, exerciseMuscleContributions, exercises, users } from "@/db/schema";
import {
  EXERCISE_CATALOG,
  RECONCILED_BACK_SLUGS,
  reconcileContributions,
  runSeed,
  seedExerciseCatalogForAllUsers,
  seedMuscleGroups,
  seededExerciseId,
  type ReconciliationSummary,
} from "@/db/seed";
import type { SeedCatalogExercise } from "@/db/seed/exerciseCatalog";
import { newId } from "@/domain/ids/uuidv7";
import {
  DEFAULT_CONTRIBUTION_WEIGHT,
  DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT,
} from "@/domain/exercises/schema";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const MAPPED_SLUGS = Object.keys(RECONCILED_BACK_SLUGS);
// Confirmed against the catalog source (exerciseCatalog.ts's own "Phase 5.5
// Light — 52 additions" marker sits after exactly 40 entries): 7 of the 14
// mapped slugs were in the original 40, 7 were added by Phase 5.5 Light.
const ORIGINAL_40_SLUGS = EXERCISE_CATALOG.slice(0, 40).map((item) => item.slug);
const MAPPED_IN_ORIGINAL_40 = MAPPED_SLUGS.filter((slug) => ORIGINAL_40_SLUGS.includes(slug));
const MAPPED_IN_PHASE_5_5 = MAPPED_SLUGS.filter((slug) => !ORIGINAL_40_SLUGS.includes(slug));

async function insertUser(db: TestDb, email: string) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

// Reconstructs a pre-Release-2 seeded exercise exactly as the old
// `back`-targeting catalog would have produced it: same id (deterministic,
// slug-derived), same metadata, same contributions — except any contribution
// this slug's ADR-010 mapping targets is written as `back` instead of the
// leaf, since that's what "pre-v2" means for these 14 slugs. Also records
// the ledger entry, matching a database that has genuinely already applied
// this slug to this user.
async function insertPreV2CatalogEntry(db: TestDb, userId: string, item: SeedCatalogExercise) {
  const id = seededExerciseId(userId, item.slug);
  await db.insert(exercises).values({
    id,
    userId,
    name: item.name,
    equipment: item.equipment,
    mechanics: item.mechanics,
    laterality: item.laterality ?? "bilateral",
    loadStepKg: DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[item.equipment],
    isSeeded: true,
  });
  const target = RECONCILED_BACK_SLUGS[item.slug];
  await db.insert(exerciseMuscleContributions).values(
    item.contributions.map((c) => ({
      exerciseId: id,
      muscleGroupId: target && c.muscleGroupId === target ? "back" : c.muscleGroupId,
      role: c.role,
      weight: DEFAULT_CONTRIBUTION_WEIGHT[c.role],
    })),
  );
  await db.insert(exerciseCatalogSeedLog).values({ userId, slug: item.slug });
  return id;
}

// Reconstructs a pre-v2 user who already had every slug in `slugs` applied
// (typically ORIGINAL_40_SLUGS or every non-machine-hip-adduction catalog
// slug — machine-hip-adduction is new in Release 2 and never existed pre-v2).
async function seedPreV2User(db: TestDb, userId: string, slugs: readonly string[]) {
  for (const item of EXERCISE_CATALOG) {
    if (!slugs.includes(item.slug)) continue;
    await insertPreV2CatalogEntry(db, userId, item);
  }
}

async function contributionsOf(db: TestDb, exerciseId: string) {
  return db
    .select()
    .from(exerciseMuscleContributions)
    .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
}

// The symmetric row-level preservation assertion (ADR-010 sum-preservation
// invariant, architecture-review LOW #2): the multiset of (role, weight)
// over {lats, upper_back, back} for one exercise, order-independent.
async function backLeafMultiset(db: TestDb, exerciseId: string) {
  const rows = await db
    .select({
      muscleGroupId: exerciseMuscleContributions.muscleGroupId,
      role: exerciseMuscleContributions.role,
      weight: exerciseMuscleContributions.weight,
    })
    .from(exerciseMuscleContributions)
    .where(
      and(
        eq(exerciseMuscleContributions.exerciseId, exerciseId),
        inArray(exerciseMuscleContributions.muscleGroupId, ["lats", "upper_back", "back"]),
      ),
    );
  return rows
    .map((r) => ({ role: r.role, weight: r.weight }))
    .sort((a, b) => (a.role === b.role ? a.weight - b.weight : a.role.localeCompare(b.role)));
}

describe("reconcileContributions (PGlite integration)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
  });

  it("has 7 mapped slugs in the original 40 and 7 added by Phase 5.5 Light (fixture sanity check)", () => {
    expect(MAPPED_IN_ORIGINAL_40).toHaveLength(7);
    expect(MAPPED_IN_PHASE_5_5).toHaveLength(7);
  });

  describe("fresh and partially seeded convergence", () => {
    it("is a true no-op on a fresh database with no users", async () => {
      const summary = await reconcileContributions(db);
      expect(summary).toEqual<ReconciliationSummary>({
        users: 0,
        mapped: 14,
        updated: 0,
        noop: 0,
        conflicts: 0,
        customDirectBack: 0,
        seededDirectBackUnmapped: 0,
      });
    });

    it("converges a fresh user seeded straight onto the leaf-targeting catalog", async () => {
      const user = await insertUser(db, "fresh@example.com");
      await runSeed(db); // seedMuscleGroups is idempotent; reconcile then seeds the catalog fresh.

      const exerciseRows = await db.select().from(exercises).where(eq(exercises.userId, user.id));
      expect(exerciseRows).toHaveLength(EXERCISE_CATALOG.length);

      const backRows = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.muscleGroupId, "back"));
      expect(backRows).toHaveLength(0);

      const hipAdductionId = seededExerciseId(user.id, "machine-hip-adduction");
      const hipAdductionContributions = await contributionsOf(db, hipAdductionId);
      expect(hipAdductionContributions).toEqual([
        expect.objectContaining({ muscleGroupId: "adductors", role: "primary" }),
      ]);
    });

    it("reconciles a full-92 pre-v2 user: all 14 mapped rows move, machine-hip-adduction seeds fresh", async () => {
      const user = await insertUser(db, "full92@example.com");
      const preV2Slugs = EXERCISE_CATALOG.filter(
        (item) => item.slug !== "machine-hip-adduction",
      ).map((item) => item.slug);
      await seedPreV2User(db, user.id, preV2Slugs);

      const summary = await reconcileContributions(db);
      expect(summary.users).toBe(1);
      expect(summary.mapped).toBe(14);
      expect(summary.updated).toBe(14);
      expect(summary.noop).toBe(0);
      expect(summary.conflicts).toBe(0);

      await seedExerciseCatalogForAllUsers(db);
      const exerciseRows = await db.select().from(exercises).where(eq(exercises.userId, user.id));
      expect(exerciseRows).toHaveLength(EXERCISE_CATALOG.length);

      const backRows = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.muscleGroupId, "back"));
      expect(backRows).toHaveLength(0);

      for (const [slug, target] of Object.entries(RECONCILED_BACK_SLUGS)) {
        const contributions = await contributionsOf(db, seededExerciseId(user.id, slug));
        expect(contributions.some((c) => c.muscleGroupId === target)).toBe(true);
      }
    });

    it("reconciles a partially seeded (original 40 only) user: 7 rows move, 7 mapped slugs plus 45 others seed fresh from the leaf catalog", async () => {
      const user = await insertUser(db, "original40@example.com");
      await seedPreV2User(db, user.id, ORIGINAL_40_SLUGS);

      const summary = await reconcileContributions(db);
      expect(summary.updated).toBe(7); // the 7 mapped slugs already in the original 40
      expect(summary.noop).toBe(7); // the 7 mapped slugs not yet applied to this user
      expect(summary.conflicts).toBe(0);

      await seedExerciseCatalogForAllUsers(db);
      const exerciseRows = await db.select().from(exercises).where(eq(exercises.userId, user.id));
      expect(exerciseRows).toHaveLength(EXERCISE_CATALOG.length);

      const backRows = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.muscleGroupId, "back"));
      expect(backRows).toHaveLength(0);

      // The 7 Phase-5.5-added mapped slugs never carried `back` for this
      // user at all — they seed directly onto their leaf target.
      for (const slug of MAPPED_IN_PHASE_5_5) {
        const target = RECONCILED_BACK_SLUGS[slug];
        const contributions = await contributionsOf(db, seededExerciseId(user.id, slug));
        expect(contributions.some((c) => c.muscleGroupId === target)).toBe(true);
      }
    });
  });

  describe("preservation", () => {
    it("proves deterministic ids reconcile a renamed seeded exercise", async () => {
      const user = await insertUser(db, "renamed@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "barbell-row");
      if (!item) throw new Error("catalog missing barbell-row");
      const id = await insertPreV2CatalogEntry(db, user.id, item);

      await db.update(exercises).set({ name: "My Custom Row Name" }).where(eq(exercises.id, id));

      const summary = await reconcileContributions(db);
      expect(summary.updated).toBe(1);

      const [row] = await db.select().from(exercises).where(eq(exercises.id, id));
      expect(row?.name).toBe("My Custom Row Name"); // untouched by the rename check — matched by id
      const contributions = await contributionsOf(db, id);
      expect(contributions.some((c) => c.muscleGroupId === "upper_back")).toBe(true);
      expect(contributions.some((c) => c.muscleGroupId === "back")).toBe(false);
    });

    it("preserves an edited weight (0.75) exactly, moving only muscle_group_id and updated_at", async () => {
      const user = await insertUser(db, "editedweight@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "cable-lat-pulldown");
      if (!item) throw new Error("catalog missing cable-lat-pulldown");
      const id = await insertPreV2CatalogEntry(db, user.id, item);

      await db
        .update(exerciseMuscleContributions)
        .set({ weight: 0.75 })
        .where(
          and(
            eq(exerciseMuscleContributions.exerciseId, id),
            eq(exerciseMuscleContributions.muscleGroupId, "back"),
          ),
        );

      await reconcileContributions(db);

      const [row] = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(
          and(
            eq(exerciseMuscleContributions.exerciseId, id),
            eq(exerciseMuscleContributions.muscleGroupId, "lats"),
          ),
        );
      expect(row?.weight).toBe(0.75);
      expect(row?.role).toBe("primary");
    });

    it("preserves an edited role, not just weight", async () => {
      const user = await insertUser(db, "editedrole@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "bodyweight-pull-up");
      if (!item) throw new Error("catalog missing bodyweight-pull-up");
      const id = await insertPreV2CatalogEntry(db, user.id, item);

      await db
        .update(exerciseMuscleContributions)
        .set({ role: "secondary", weight: DEFAULT_CONTRIBUTION_WEIGHT.secondary })
        .where(
          and(
            eq(exerciseMuscleContributions.exerciseId, id),
            eq(exerciseMuscleContributions.muscleGroupId, "back"),
          ),
        );

      await reconcileContributions(db);

      const [row] = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(
          and(
            eq(exerciseMuscleContributions.exerciseId, id),
            eq(exerciseMuscleContributions.muscleGroupId, "lats"),
          ),
        );
      expect(row?.role).toBe("secondary");
      expect(row?.weight).toBe(DEFAULT_CONTRIBUTION_WEIGHT.secondary);
    });

    it("leaves a removed back contribution absent — nothing is resurrected on the target leaf", async () => {
      const user = await insertUser(db, "removed@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "machine-seated-row");
      if (!item) throw new Error("catalog missing machine-seated-row");
      const id = await insertPreV2CatalogEntry(db, user.id, item);

      await db
        .delete(exerciseMuscleContributions)
        .where(
          and(
            eq(exerciseMuscleContributions.exerciseId, id),
            eq(exerciseMuscleContributions.muscleGroupId, "back"),
          ),
        );

      const summary = await reconcileContributions(db);
      expect(summary.updated).toBe(0);
      // 1 for this exercise's removed contribution, 13 for the other mapped
      // slugs, which were never seeded for this user at all.
      expect(summary.noop).toBe(14);

      const contributions = await contributionsOf(db, id);
      expect(contributions.some((c) => c.muscleGroupId === "upper_back")).toBe(false);
      expect(contributions.some((c) => c.muscleGroupId === "back")).toBe(false);
    });

    it("leaves a hard-deleted seeded pull absent, and reseeding does not resurrect it", async () => {
      const user = await insertUser(db, "deleted@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "bodyweight-chin-up");
      if (!item) throw new Error("catalog missing bodyweight-chin-up");
      const id = await insertPreV2CatalogEntry(db, user.id, item);

      await db.delete(exercises).where(eq(exercises.id, id));

      const summary = await reconcileContributions(db);
      expect(summary.updated).toBe(0);
      // 1 for this hard-deleted exercise, 13 for the other mapped slugs,
      // which were never seeded for this user at all.
      expect(summary.noop).toBe(14);

      await seedExerciseCatalogForAllUsers(db);
      const [row] = await db.select().from(exercises).where(eq(exercises.id, id));
      expect(row).toBeUndefined();
    });

    it("skips a catalog slug colliding with an active custom name, without touching the custom exercise or misreporting it", async () => {
      const user = await insertUser(db, "collision@example.com");
      // A custom exercise takes the name of a mapped catalog slug before that
      // slug has ever been applied to this user (no ledger row, no seeded
      // row at the derived id) — the arbiter-less onConflictDoNothing skip
      // this repo already relies on (Phase 1 review MED-1).
      const [custom] = await db
        .insert(exercises)
        .values({
          id: newId(),
          userId: user.id,
          name: "Barbell Row", // matches the "barbell-row" catalog entry's name
          equipment: "barbell",
          mechanics: "compound",
          laterality: "bilateral",
          loadStepKg: 2.5,
          isSeeded: false,
        })
        .returning();
      if (!custom) throw new Error("failed to insert custom exercise");
      await db
        .insert(exerciseMuscleContributions)
        .values({ exerciseId: custom.id, muscleGroupId: "chest", role: "primary", weight: 1 });

      const summary = await reconcileContributions(db);
      // No seeded exercise exists yet at seededExerciseId(user, "barbell-row")
      // — reconciliation must see this pair as noop, not touch the custom row.
      expect(summary.noop).toBeGreaterThan(0);
      expect(summary.updated).toBe(0);
      expect(summary.conflicts).toBe(0);

      await runSeed(db); // seedMuscleGroups (again, idempotent) + reconcile + catalog seed
      const [row] = await db.select().from(exercises).where(eq(exercises.id, custom.id));
      expect(row?.name).toBe("Barbell Row");
      expect(row?.isSeeded).toBe(false);
      const customContributions = await contributionsOf(db, custom.id);
      expect(customContributions).toEqual([
        expect.objectContaining({ muscleGroupId: "chest", role: "primary", weight: 1 }),
      ]);
      const seededBarbellRowId = seededExerciseId(user.id, "barbell-row");
      const [seededRow] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.id, seededBarbellRowId));
      expect(seededRow).toBeUndefined(); // name collision skips the seeded insert
    });

    it("leaves a custom exercise's direct back contribution byte-identical, and counts it in customDirectBack", async () => {
      const user = await insertUser(db, "customback@example.com");
      const [custom] = await db
        .insert(exercises)
        .values({
          id: newId(),
          userId: user.id,
          name: "My Custom Pull",
          equipment: "cable",
          mechanics: "compound",
          laterality: "bilateral",
          loadStepKg: 2.5,
          isSeeded: false,
        })
        .returning();
      if (!custom) throw new Error("failed to insert custom exercise");
      const fixedTimestamp = new Date("2026-01-01T00:00:00.000Z");
      await db.insert(exerciseMuscleContributions).values({
        exerciseId: custom.id,
        muscleGroupId: "back",
        role: "primary",
        weight: 0.9,
        updatedAt: fixedTimestamp,
      });

      const before = await contributionsOf(db, custom.id);
      const summary = await reconcileContributions(db);
      const after = await contributionsOf(db, custom.id);

      expect(summary.customDirectBack).toBe(1);
      expect(after).toEqual(before); // byte-identical, including updatedAt
      expect(after[0]?.muscleGroupId).toBe("back");
      expect(after[0]?.weight).toBe(0.9);
    });
  });

  describe("conflicts (architecture-review M-1)", () => {
    it("leaves both rows untouched, counts a conflict, and re-reports it identically on a second run", async () => {
      const user = await insertUser(db, "conflict@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "barbell-pendlay-row");
      if (!item) throw new Error("catalog missing barbell-pendlay-row");
      const id = await insertPreV2CatalogEntry(db, user.id, item);
      // Simulate the Release-1 "carry back through + add the target leaf as
      // a sibling in the same save" path M-1 describes.
      await db.insert(exerciseMuscleContributions).values({
        exerciseId: id,
        muscleGroupId: "upper_back",
        role: "secondary",
        weight: 0.6,
      });

      const before = await backLeafMultiset(db, id);
      const first = await reconcileContributions(db);
      expect(first.conflicts).toBe(1);
      expect(first.updated).toBe(0);
      const afterFirst = await backLeafMultiset(db, id);
      expect(afterFirst).toEqual(before); // both rows left exactly in place

      const second = await reconcileContributions(db);
      expect(second.conflicts).toBe(1); // sticky — still reported, not consumed
      expect(second.updated).toBe(0);
      const afterSecond = await backLeafMultiset(db, id);
      expect(afterSecond).toEqual(before);
    });
  });

  describe("unmapped seeded direct back (architecture-review M-2)", () => {
    it("reports a back row on a seeded exercise outside the 14 mapped ids as seededDirectBackUnmapped, without double-counting it as a conflict", async () => {
      const user = await insertUser(db, "unmapped@example.com");
      // A seeded, non-mapped exercise (never carries `back` in the catalog
      // in any version) that a pre-Release-1 user hand-edited onto `back`
      // via the old any-of-15 editor.
      const item = EXERCISE_CATALOG.find((i) => i.slug === "barbell-back-squat");
      if (!item) throw new Error("catalog missing barbell-back-squat");
      const id = seededExerciseId(user.id, item.slug);
      await db.insert(exercises).values({
        id,
        userId: user.id,
        name: item.name,
        equipment: item.equipment,
        mechanics: item.mechanics,
        laterality: item.laterality ?? "bilateral",
        loadStepKg: DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[item.equipment],
        isSeeded: true,
      });
      await db.insert(exerciseMuscleContributions).values({
        exerciseId: id,
        muscleGroupId: "back",
        role: "secondary",
        weight: 0.5,
      });
      await db.insert(exerciseCatalogSeedLog).values({ userId: user.id, slug: item.slug });

      const summary = await reconcileContributions(db);
      expect(summary.seededDirectBackUnmapped).toBe(1);
      expect(summary.conflicts).toBe(0); // not a mapped slug, so never a "conflict"

      const contributions = await contributionsOf(db, id);
      expect(contributions.some((c) => c.muscleGroupId === "back")).toBe(true); // untouched
    });
  });

  describe("second-run idempotency", () => {
    it("reports updated=0 on the second run of a full-92 user, with the DB unchanged between runs", async () => {
      const user = await insertUser(db, "tworuns@example.com");
      const preV2Slugs = EXERCISE_CATALOG.filter(
        (item) => item.slug !== "machine-hip-adduction",
      ).map((item) => item.slug);
      await seedPreV2User(db, user.id, preV2Slugs);

      const first = await reconcileContributions(db);
      expect(first.updated).toBe(14);

      const stateAfterFirst = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(
          eq(exerciseMuscleContributions.exerciseId, seededExerciseId(user.id, "barbell-row")),
        );

      const second = await reconcileContributions(db);
      expect(second).toEqual<ReconciliationSummary>({
        users: 1,
        mapped: 14,
        updated: 0,
        noop: 14,
        conflicts: 0,
        customDirectBack: 0,
        seededDirectBackUnmapped: 0,
      });

      const stateAfterSecond = await db
        .select()
        .from(exerciseMuscleContributions)
        .where(
          eq(exerciseMuscleContributions.exerciseId, seededExerciseId(user.id, "barbell-row")),
        );
      expect(stateAfterSecond).toEqual(stateAfterFirst);
    });

    it("runSeed run twice end-to-end reports the same second-run shape via the public entry point", async () => {
      const user = await insertUser(db, "runseedtwice@example.com");
      await seedPreV2User(db, user.id, ORIGINAL_40_SLUGS);

      await runSeed(db);
      const afterFirst = await db.select().from(exercises).where(eq(exercises.userId, user.id));
      expect(afterFirst).toHaveLength(EXERCISE_CATALOG.length);

      const secondSummary = await reconcileContributions(db);
      expect(secondSummary.updated).toBe(0);
      await seedExerciseCatalogForAllUsers(db);
      const afterSecond = await db.select().from(exercises).where(eq(exercises.userId, user.id));
      expect(afterSecond).toHaveLength(EXERCISE_CATALOG.length); // still no duplicates
    });
  });

  describe("counters exactly match database state", () => {
    it("cross-checks every counter against independent queries on a combined scenario", async () => {
      const userA = await insertUser(db, "combined-a@example.com");
      const userB = await insertUser(db, "combined-b@example.com");

      // userA: full-92 pre-v2, clean — all 14 should update.
      const preV2Slugs = EXERCISE_CATALOG.filter(
        (item) => item.slug !== "machine-hip-adduction",
      ).map((item) => item.slug);
      await seedPreV2User(db, userA.id, preV2Slugs);

      // userB: original-40 only, plus a conflict on one mapped slug and an
      // unmapped seeded direct-back row.
      await seedPreV2User(db, userB.id, ORIGINAL_40_SLUGS);
      const conflictId = seededExerciseId(userB.id, "dumbbell-row"); // in the original 40
      await db.insert(exerciseMuscleContributions).values({
        exerciseId: conflictId,
        muscleGroupId: "upper_back",
        role: "secondary",
        weight: 0.5,
      });
      // "barbell-back-squat" is in the original 40, so seedPreV2User above
      // already seeded it for userB — simulate a pre-Release-1 hand-edit
      // that added a direct `back` row to it, rather than re-inserting the
      // exercise itself.
      const squatItem = EXERCISE_CATALOG.find((i) => i.slug === "barbell-back-squat");
      if (!squatItem) throw new Error("catalog missing barbell-back-squat");
      const unmappedId = seededExerciseId(userB.id, squatItem.slug);
      await db.insert(exerciseMuscleContributions).values({
        exerciseId: unmappedId,
        muscleGroupId: "back",
        role: "secondary",
        weight: 0.5,
      });

      // A custom direct-back exercise for userB.
      const [custom] = await db
        .insert(exercises)
        .values({
          id: newId(),
          userId: userB.id,
          name: "Custom Direct Back",
          equipment: "cable",
          mechanics: "compound",
          laterality: "bilateral",
          loadStepKg: 2.5,
          isSeeded: false,
        })
        .returning();
      if (!custom) throw new Error("failed to insert custom exercise");
      await db
        .insert(exerciseMuscleContributions)
        .values({ exerciseId: custom.id, muscleGroupId: "back", role: "primary", weight: 1 });

      const summary = await reconcileContributions(db);

      // Independent cross-checks, not reusing the implementation's own query
      // shapes verbatim.
      const allUserRows = await db.select({ id: users.id }).from(users);
      expect(summary.users).toBe(allUserRows.length);
      expect(summary.mapped).toBe(14);
      expect(summary.updated + summary.noop + summary.conflicts).toBe(
        summary.users * summary.mapped,
      );

      const mappedIds = new Set<string>();
      for (const u of allUserRows) {
        for (const slug of MAPPED_SLUGS) mappedIds.add(seededExerciseId(u.id, slug));
      }
      const stillBackOnMapped = await db
        .select({ exerciseId: exerciseMuscleContributions.exerciseId })
        .from(exerciseMuscleContributions)
        .where(
          and(
            eq(exerciseMuscleContributions.muscleGroupId, "back"),
            inArray(exerciseMuscleContributions.exerciseId, [...mappedIds]),
          ),
        );
      expect(stillBackOnMapped).toHaveLength(summary.conflicts);

      const seededBackNotMapped = await db
        .select({ exerciseId: exercises.id })
        .from(exerciseMuscleContributions)
        .innerJoin(exercises, eq(exercises.id, exerciseMuscleContributions.exerciseId))
        .where(
          and(
            eq(exerciseMuscleContributions.muscleGroupId, "back"),
            eq(exercises.isSeeded, true),
            notInArray(exercises.id, [...mappedIds]),
          ),
        );
      expect(seededBackNotMapped).toHaveLength(summary.seededDirectBackUnmapped);
      expect(summary.seededDirectBackUnmapped).toBe(1);

      const customBack = await db
        .select({ exerciseId: exercises.id })
        .from(exerciseMuscleContributions)
        .innerJoin(exercises, eq(exercises.id, exerciseMuscleContributions.exerciseId))
        .where(
          and(eq(exerciseMuscleContributions.muscleGroupId, "back"), eq(exercises.isSeeded, false)),
        );
      expect(customBack).toHaveLength(summary.customDirectBack);
      expect(summary.customDirectBack).toBe(1);

      expect(summary.conflicts).toBe(1);
    });
  });

  // remediation regression coverage item 6 (real-PostgreSQL half lives in
  // reconcileContributionsConcurrency.integration.test.ts) — explicit proof
  // that `updated` is driven by the atomic UPDATE's actual affected-row
  // count on PGlite too, not just inferred from the other tests in this
  // file that would incidentally fail if it were wrong.
  describe("affected-row counting (PGlite)", () => {
    it("increments updated by exactly the number of rows the atomic UPDATE actually moved", async () => {
      const db = await createTestDb();
      await seedMuscleGroups(db);
      const user = await insertUser(db, "affectedrows@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "cable-lat-pulldown");
      if (!item) throw new Error("catalog missing cable-lat-pulldown");
      const id = await insertPreV2CatalogEntry(db, user.id, item);

      const summary = await reconcileContributions(db);
      expect(summary.updated).toBe(1);
      expect(summary.conflicts).toBe(0);

      const contributions = await contributionsOf(db, id);
      expect(contributions.some((c) => c.muscleGroupId === "lats")).toBe(true);
      expect(contributions.some((c) => c.muscleGroupId === "back")).toBe(false);
    });

    it("does not increment updated when the target leaf is already present (classified as a conflict before the UPDATE is even attempted)", async () => {
      const db = await createTestDb();
      await seedMuscleGroups(db);
      const user = await insertUser(db, "affectedrowsconflict@example.com");
      const item = EXERCISE_CATALOG.find((i) => i.slug === "cable-lat-pulldown");
      if (!item) throw new Error("catalog missing cable-lat-pulldown");
      const id = await insertPreV2CatalogEntry(db, user.id, item);
      await db
        .insert(exerciseMuscleContributions)
        .values({ exerciseId: id, muscleGroupId: "lats", role: "secondary", weight: 0.5 });

      const summary = await reconcileContributions(db);
      expect(summary.updated).toBe(0);
      expect(summary.conflicts).toBe(1);
    });
  });
});
