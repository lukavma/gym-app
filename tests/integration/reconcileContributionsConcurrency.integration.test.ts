import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { exerciseCatalogSeedLog, exerciseMuscleContributions, exercises, users } from "@/db/schema";
import * as schema from "@/db/schema";
import {
  RECONCILED_BACK_SLUGS,
  reconcileContributions,
  runSeed,
  seedMuscleGroups,
} from "@/db/seed";
import { seededExerciseId } from "@/db/seed/exercises";
import type { LeafMuscleGroupSlug } from "@/domain/exercises/muscleGroups";

// pre-phase-6-muscle-taxonomy-release-2-review.md §3 — the reproduced
// concurrency defect (M-1/M-2), and the remediation's own required
// regression coverage. This forces the exact interleaving the review's
// Probe A used: a Release-1 editor save (carry `back` through + add the
// target leaf as a sibling — the same write shape `updateExercise`
// produces) commits on a SEPARATE connection between
// `reconcileContributions`'s preliminary target-row `SELECT` and its
// mutating `UPDATE`. Requires a real PostgreSQL connection — genuine
// concurrent commits from two sessions aren't reachable against PGlite's
// single in-process instance.
//
// Deliberately keyed off its OWN variable rather than `DATABASE_URL`, for
// two reasons. First, `DATABASE_URL` being *set* does not mean a database
// is *reachable*: `.github/workflows/ci.yml` sets it to the placeholder
// `postgresql://ci:ci@localhost:5432/ci` with no Postgres service behind
// it, so a `skipIf(!process.env.DATABASE_URL)` guard does not skip in CI —
// the suite runs, `beforeAll` fails with ECONNREFUSED, and the whole
// quality gate goes red. Second, `beforeAll` below requires a database
// dedicated to this file (its counter assertions aggregate across every
// user), which the shared `DATABASE_URL` — the dev database, per
// tests/e2e/seed.ts — must never be. An explicit opt-in variable makes
// both conditions the caller's deliberate choice:
//
//   $env:RECONCILE_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_r2conc"
//   pnpm test:integration tests/integration/reconcileContributionsConcurrency.integration.test.ts
//
// Unset (CI, and any ordinary `pnpm test:integration` run) → skipped.
const CONCURRENCY_DATABASE_URL = process.env.RECONCILE_CONCURRENCY_DATABASE_URL;

function db(pool: Pool): AppDb {
  return drizzle(pool, { schema }) as unknown as AppDb;
}

function requireMappedTarget(slug: string): LeafMuscleGroupSlug {
  const target = RECONCILED_BACK_SLUGS[slug];
  if (!target) throw new Error(`RECONCILED_BACK_SLUGS is missing "${slug}"`);
  return target;
}

describe.skipIf(!CONCURRENCY_DATABASE_URL)(
  "reconcileContributions concurrency (real PostgreSQL)",
  () => {
    let editorPool: Pool;
    let testUserId: string;
    const raceSlug = "barbell-row";
    const raceTarget = requireMappedTarget(raceSlug);

    beforeAll(async () => {
      editorPool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL });
      await seedMuscleGroups(db(editorPool));
      const [user] = await db(editorPool)
        .insert(users)
        .values({ email: `race-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
        .returning();
      if (!user) throw new Error("failed to insert race test user");
      testUserId = user.id;

      // `reconcileContributions` aggregates its counters across every user in
      // the database, and this file's assertions on those totals (e.g.
      // `noop=13`) are only meaningful if this test's user is the only one —
      // fail loudly, not flakily, if RECONCILE_CONCURRENCY_DATABASE_URL points
      // at a shared database instead of one dedicated to this test file.
      const allUsers = await db(editorPool).select({ id: users.id }).from(users);
      if (allUsers.length !== 1) {
        throw new Error(
          `reconcileContributionsConcurrency expects RECONCILE_CONCURRENCY_DATABASE_URL to point at a database with exactly this test's one user, found ${allUsers.length}. Run this file against a dedicated disposable database, not a shared dev database.`,
        );
      }
    });

    afterAll(async () => {
      await db(editorPool).delete(exercises).where(eq(exercises.userId, testUserId));
      await db(editorPool)
        .delete(exerciseCatalogSeedLog)
        .where(eq(exerciseCatalogSeedLog.userId, testUserId));
      await db(editorPool).delete(users).where(eq(users.id, testUserId));
      await editorPool.end();
    });

    // Reconstructs the exact pre-Release-2 fixture the race needs: a seeded
    // exercise carrying a direct `back` row at "barbell-row"'s deterministic
    // id, and nothing else mapped for this user (so exactly one of the 14
    // mapped-slug iterations reaches the mutating UPDATE).
    async function seedRaceFixture(): Promise<string> {
      const exerciseId = seededExerciseId(testUserId, raceSlug);
      await db(editorPool).insert(exercises).values({
        id: exerciseId,
        userId: testUserId,
        name: "Barbell Row",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        isSeeded: true,
      });
      await db(editorPool)
        .insert(exerciseMuscleContributions)
        .values({ exerciseId, muscleGroupId: "back", role: "primary", weight: 1 });
      // Without a ledger row, seedExerciseCatalogForUser's ledger-bootstrap
      // branch (src/db/seed/exercises.ts) would read this one pre-existing
      // is_seeded row as proof the *entire* catalog was already applied to
      // this user, and mark every slug applied without inserting any of the
      // other 92 — a real, working-as-designed behavior for a genuinely
      // pre-ledger database, but not what this fixture means to simulate.
      // Recording just this one slug as applied keeps the other 92 "new".
      await db(editorPool)
        .insert(exerciseCatalogSeedLog)
        .values({ userId: testUserId, slug: raceSlug });
      return exerciseId;
    }

    async function clearRaceFixture(exerciseId: string): Promise<void> {
      await db(editorPool).delete(exercises).where(eq(exercises.id, exerciseId));
      await db(editorPool)
        .delete(exerciseCatalogSeedLog)
        .where(
          and(
            eq(exerciseCatalogSeedLog.userId, testUserId),
            eq(exerciseCatalogSeedLog.slug, raceSlug),
          ),
        );
    }

    // Release 1's exact write shape for "carry `back` through, add the target
    // leaf as a sibling in the same save" (architecture-review M-1;
    // `updateExercise`'s delete-all-and-reinsert path), performed on its OWN
    // connection so it can commit independently of the reconciliation
    // transaction under test.
    async function concurrentEditorSave(exerciseId: string): Promise<void> {
      const racePool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL });
      try {
        await db(racePool).transaction(async (tx) => {
          await tx
            .delete(exerciseMuscleContributions)
            .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
          await tx.insert(exerciseMuscleContributions).values([
            { exerciseId, muscleGroupId: "back", role: "primary", weight: 1 },
            { exerciseId, muscleGroupId: raceTarget, role: "secondary", weight: 0.5 },
          ]);
        });
      } finally {
        await racePool.end();
      }
    }

    // Runs `fn` with the FIRST reconciliation
    // `UPDATE ... exercise_muscle_contributions ...` statement any `pg.Client`
    // issues (process-wide, for the duration of `fn`) intercepted: `onIntercept`
    // runs to completion (and its own transaction commits) before the original
    // statement is allowed to proceed. This forces a real, deterministic
    // interleaving without any sleep/timing guesswork — Node's single-threaded
    // event loop guarantees `onIntercept` fully resolves first — and patches
    // `pg.Client.prototype.query` directly rather than wrapping `Pool.connect`,
    // so it works uniformly across every connection `runSeed`'s several
    // sequential transactions check out, not just the first. Always restores
    // the prototype method, even if `fn` throws. Bypassing `pg`'s query
    // overloads at the monkey-patch boundary needs `any` in a few spots.
    async function withInterceptedUpdate<T>(
      onIntercept: () => Promise<void>,
      fn: (db: AppDb) => Promise<T>,
    ): Promise<T> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalQuery = (Client.prototype as any).query;
      let fired = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Client.prototype as any).query = function (...queryArgs: any[]) {
        const text: unknown = queryArgs[0]?.text ?? queryArgs[0];
        if (
          !fired &&
          typeof text === "string" &&
          text.includes('update "exercise_muscle_contributions"')
        ) {
          fired = true;
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const self = this;
          return onIntercept().then(() => originalQuery.apply(self, queryArgs));
        }
        return originalQuery.apply(this, queryArgs);
      };

      const pool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL });
      try {
        return await fn(db(pool));
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Client.prototype as any).query = originalQuery;
        await pool.end();
      }
    }

    it("1, 2, 4: races a concurrent target-leaf insert into the atomic UPDATE — does not throw, and the raced row is not counted as updated", async () => {
      const exerciseId = await seedRaceFixture();
      try {
        // 1 + 2: the race is forced inside this call, on real PostgreSQL, and
        // the call must resolve — not throw SQLSTATE 23505.
        const summary = await withInterceptedUpdate(
          () => concurrentEditorSave(exerciseId),
          (raceUnderTestDb) => reconcileContributions(raceUnderTestDb),
        );

        // 4: the raced pair does not count as updated — the atomic UPDATE's
        // own `notExists` guard found the concurrently-inserted target row
        // (evaluated against its own statement snapshot, taken after the
        // concurrent commit) and moved zero rows, so it is classified as a
        // conflict instead of a phantom success.
        expect(summary.updated).toBe(0);
        expect(summary.conflicts).toBe(1);
        expect(summary.noop).toBe(13); // the other 13 mapped slugs: not seeded for this user.

        const rows = await db(editorPool)
          .select()
          .from(exerciseMuscleContributions)
          .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
        // Both rows survive the race untouched — neither merged, dropped, nor
        // double-written.
        expect(rows.find((r) => r.muscleGroupId === "back")).toBeTruthy();
        expect(rows.find((r) => r.muscleGroupId === raceTarget)).toBeTruthy();
      } finally {
        await clearRaceFixture(exerciseId);
      }
    });

    it("5: the surviving direct back row is reported as a sticky conflict on the next run", async () => {
      const exerciseId = await seedRaceFixture();
      try {
        await withInterceptedUpdate(
          () => concurrentEditorSave(exerciseId),
          (raceUnderTestDb) => reconcileContributions(raceUnderTestDb),
        );

        // A second, ordinary (unraced) run against the state the race left
        // behind: still a conflict, still zero updates, and it re-emits —
        // never consumed, matching M-1's "sticky" requirement.
        const second = await reconcileContributions(db(editorPool));
        expect(second.updated).toBe(0);
        expect(second.conflicts).toBe(1);
        expect(second.noop).toBe(13);
      } finally {
        await clearRaceFixture(exerciseId);
      }
    });

    it("3: runSeed continues past a raced pair — the catalog seed step still runs", async () => {
      const exerciseId = await seedRaceFixture();
      try {
        // runSeed = seedMuscleGroups -> reconcileContributions -> seedExerciseCatalogForAllUsers.
        // Before this remediation, the raced UPDATE threw and aborted the
        // whole reconciliation transaction, so seedExerciseCatalogForAllUsers
        // never ran and no catalog rows appeared for this user. Interception
        // is process-wide (patches `pg.Client.prototype.query`) for the
        // duration of this call, so it still catches the one qualifying
        // UPDATE regardless of which of runSeed's several sequential
        // transactions checks out the connection that issues it.
        await withInterceptedUpdate(
          () => concurrentEditorSave(exerciseId),
          (raceUnderTestDb) => runSeed(raceUnderTestDb),
        );

        const seededRows = await db(editorPool)
          .select()
          .from(exercises)
          .where(and(eq(exercises.userId, testUserId), eq(exercises.isSeeded, true)));
        // The catalog seed ran to completion: far more than just the one
        // race-fixture exercise now exists for this user.
        expect(seededRows.length).toBeGreaterThan(1);
      } finally {
        // This run seeds the entire catalog for testUserId (not just the race
        // fixture) — clear exercises and the ledger so later tests in this
        // file start from a clean slate again.
        void exerciseId;
        await db(editorPool).delete(exercises).where(eq(exercises.userId, testUserId));
        await db(editorPool)
          .delete(exerciseCatalogSeedLog)
          .where(eq(exerciseCatalogSeedLog.userId, testUserId));
      }
    });

    it("6 (PostgreSQL): affected-row counting is correct on a normal, unraced move", async () => {
      const exerciseId = await seedRaceFixture();
      try {
        const summary = await reconcileContributions(db(editorPool));
        expect(summary.updated).toBe(1);
        expect(summary.conflicts).toBe(0);

        const [row] = await db(editorPool)
          .select()
          .from(exerciseMuscleContributions)
          .where(
            and(
              eq(exerciseMuscleContributions.exerciseId, exerciseId),
              eq(exerciseMuscleContributions.muscleGroupId, raceTarget),
            ),
          );
        expect(row).toBeTruthy();
      } finally {
        await clearRaceFixture(exerciseId);
      }
    });
  },
);
