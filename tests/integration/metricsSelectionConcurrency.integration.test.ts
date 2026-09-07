import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { dashboardEstimateSelections, exercises, users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { replaceSelection } from "@/server/metrics/selectionService";

// docs/reviews/metrics-dashboard-architecture-evaluation.md §11.5, A-31 — the
// advisory lock's real coverage, following the exact precedent
// `volumeLandmarksConcurrency.integration.test.ts` / `recoveryConcurrency
// .integration.test.ts` established for "PGlite is a single in-process
// backend, so there is no interleaving for a real race to manifest": a real
// node-postgres Pool against a dedicated disposable database, gated on its
// own opt-in variable.
//
//   $env:METRICS_SELECTION_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_metricsconc"
//   pnpm exec vitest run --config vitest.integration.config.ts tests/integration/metricsSelectionConcurrency.integration.test.ts
//
// Unset (CI, and any ordinary `pnpm test:integration` run) -> skipped.
const CONCURRENCY_DATABASE_URL = process.env.METRICS_SELECTION_CONCURRENCY_DATABASE_URL;

function db(pool: Pool): AppDb {
  return drizzle(pool, { schema }) as unknown as AppDb;
}

describe.skipIf(!CONCURRENCY_DATABASE_URL)("replaceSelection concurrency (real PostgreSQL)", () => {
  let pool: Pool;
  let testUserId: string;
  let listAIds: string[];
  let listBIds: string[];

  beforeAll(async () => {
    pool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL, max: 16 });
    await seedMuscleGroups(db(pool));

    const existingUsers = await db(pool).select({ id: users.id }).from(users);
    if (existingUsers.length !== 0) {
      throw new Error(
        `metricsSelectionConcurrency expects METRICS_SELECTION_CONCURRENCY_DATABASE_URL to point at an ` +
          `empty-of-users database, found ${existingUsers.length}. Run this file against a dedicated ` +
          "disposable database, not a shared dev database.",
      );
    }

    const [user] = await db(pool)
      .insert(users)
      .values({ email: `metricsconc-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
      .returning();
    if (!user) throw new Error("failed to insert concurrency test user");
    testUserId = user.id;

    async function makeExercise(name: string) {
      const exercise = await createExercise(db(pool), testUserId, {
        name,
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      return exercise.id;
    }

    listAIds = [await makeExercise("Concurrency A1"), await makeExercise("Concurrency A2")];
    listBIds = [
      await makeExercise("Concurrency B1"),
      await makeExercise("Concurrency B2"),
      await makeExercise("Concurrency B3"),
    ];
  });

  afterAll(async () => {
    await db(pool)
      .delete(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, testUserId));
    await db(pool).delete(exercises).where(eq(exercises.userId, testUserId));
    await db(pool).delete(users).where(eq(users.id, testUserId));
    await pool.end();
  });

  it("two concurrent replaceSelection calls with different lists: exactly one list is stored whole, never a mix, and both calls resolve without error", async () => {
    const results = await Promise.allSettled([
      replaceSelection(db(pool), testUserId, listAIds),
      replaceSelection(db(pool), testUserId, listBIds),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);

    const stored = await db(pool)
      .select()
      .from(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, testUserId))
      .orderBy(dashboardEstimateSelections.position);
    const storedIds = stored.map((row) => row.exerciseId);

    const matchesA =
      storedIds.length === listAIds.length && storedIds.every((id, i) => id === listAIds[i]);
    const matchesB =
      storedIds.length === listBIds.length && storedIds.every((id, i) => id === listBIds[i]);
    expect(
      matchesA || matchesB,
      `stored selection ${JSON.stringify(storedIds)} matches neither list whole`,
    ).toBe(true);
    // Never an interleaving of the two lists' ids.
    expect(matchesA && matchesB).toBe(false);
  });
});
