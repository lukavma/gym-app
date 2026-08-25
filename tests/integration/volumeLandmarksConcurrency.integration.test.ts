import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { users, volumeLandmarks, volumePresets } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { seedVolumePresets, RP_GENERAL_PRESET_ID } from "@/db/seed/volumePresets";
import { getWeeklyVolumeReport, upsertVolumeLandmark } from "@/server/volume/service";

// docs/reviews/phase-6-review.md M-3 — the PGlite test in
// volumeLandmarks.integration.test.ts cannot exercise
// `pg_advisory_xact_lock` (PGlite is a single in-process backend; every
// `db.transaction()` call against it runs strictly in sequence, so there is
// no interleaving for an advisory lock to prevent — confirmed directly:
// that test still passes with the lock removed). This file is the real
// coverage, following the exact precedent
// `tests/integration/reconcileContributionsConcurrency.integration.test.ts`
// established for the identical PGlite limitation: a real node-postgres
// `Pool` against a dedicated disposable database, gated on its own opt-in
// variable (never `DATABASE_URL` — CI sets that to an unreachable
// placeholder, and the shared dev database must never be targeted here).
//
//   $env:VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_volconc"
//   pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarksConcurrency.integration.test.ts
//
// Unset (CI, and any ordinary `pnpm test:integration` run) -> skipped.
const CONCURRENCY_DATABASE_URL = process.env.VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL;

function db(pool: Pool): AppDb {
  return drizzle(pool, { schema }) as unknown as AppDb;
}

// Eight distinct (muscleGroupId, key) edits — each a genuinely separate
// "first edit of the builtin" request, fired concurrently over a real
// multi-connection Pool. Distinct target rows (not the same row eight
// times) is what makes "every distinct edited value survives" a meaningful
// assertion: a race that drops all but one writer's duplicate preset would
// also drop that writer's own value.
const CONCURRENT_EDITS = [
  { muscleGroupId: "chest", key: "mev", valueMin: 11 },
  { muscleGroupId: "quads", key: "mev", valueMin: 9 },
  { muscleGroupId: "biceps", key: "mev", valueMin: 7 },
  { muscleGroupId: "triceps", key: "mav", valueMin: 12, valueMax: 16 },
  { muscleGroupId: "calves", key: "mrv", valueMin: 21, openEnded: true },
  { muscleGroupId: "abs", key: "mv", valueMin: 1 },
  { muscleGroupId: "hamstrings", key: "mev", valueMin: 5 },
  { muscleGroupId: "glutes", key: "mav", valueMin: 5, valueMax: 13 },
] as const;

describe.skipIf(!CONCURRENCY_DATABASE_URL)(
  "upsertVolumeLandmark concurrency (real PostgreSQL)",
  () => {
    let pool: Pool;
    let testUserId: string;

    beforeAll(async () => {
      pool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL, max: 16 });
      await seedMuscleGroups(db(pool));
      // No users exist yet, so seedVolumePresets only creates the builtin —
      // its null-only default-init step has nothing to touch.
      await seedVolumePresets(db(pool));

      // This test's own counter assertions (exactly one user-owned preset)
      // are only meaningful against a database dedicated to this file — fail
      // loudly, not flakily, if VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL
      // points at a shared or already-populated database instead.
      const existingUsers = await db(pool).select({ id: users.id }).from(users);
      if (existingUsers.length !== 0) {
        throw new Error(
          `volumeLandmarksConcurrency expects VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL to point at an ` +
            `empty-of-users database, found ${existingUsers.length}. Run this file against a dedicated ` +
            "disposable database, not a shared dev database.",
        );
      }
      const existingUserOwnedPresets = await db(pool)
        .select({ id: volumePresets.id })
        .from(volumePresets)
        .where(eq(volumePresets.isBuiltin, false));
      if (existingUserOwnedPresets.length !== 0) {
        throw new Error(
          `volumeLandmarksConcurrency expects no pre-existing user-owned volume_presets rows, found ` +
            `${existingUserOwnedPresets.length}. Run this file against a dedicated disposable database.`,
        );
      }

      const [user] = await db(pool)
        .insert(users)
        .values({ email: `volconc-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
        .returning();
      if (!user) throw new Error("failed to insert concurrency test user");
      testUserId = user.id;
      // Re-run now that the user exists, so the null-only default-init step
      // (src/db/seed/volumePresets.ts) reaches this row and resolves it to
      // the builtin — mirrors the real deploy order (db:seed runs again
      // after an account is created) and matches "editing builtin RP
      // General" as the scenario under test, not "no active preset at all"
      // (that path is already covered non-concurrently in
      // volumeLandmarks.integration.test.ts).
      await seedVolumePresets(db(pool));
      const [refreshed] = await db(pool).select().from(users).where(eq(users.id, testUserId));
      if (refreshed?.defaultVolumePresetId !== RP_GENERAL_PRESET_ID) {
        throw new Error(
          "expected the concurrency test user's default preset to resolve to the builtin RP General " +
            "before the concurrent edits run",
        );
      }
    });

    afterAll(async () => {
      // CASCADE from volume_presets to volume_landmarks handles the
      // duplicate's landmark rows; only the user-owned preset row(s) and the
      // test user need explicit deletion. The builtin RP General row is
      // never touched by this file and is left in place.
      await db(pool).delete(volumePresets).where(eq(volumePresets.userId, testUserId));
      await db(pool).delete(users).where(eq(users.id, testUserId));
      await pool.end();
    });

    it(
      "resolves all concurrent first edits successfully, creates exactly one copy, loses no value, " +
        "leaves the builtin untouched, repoints the default slot to the one copy, and the next read " +
        "exposes every edit",
      async () => {
        const builtinLandmarksBefore = await db(pool)
          .select()
          .from(volumeLandmarks)
          .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));
        const builtinPresetBefore = (
          await db(pool)
            .select()
            .from(volumePresets)
            .where(eq(volumePresets.id, RP_GENERAL_PRESET_ID))
        )[0];

        // Genuinely separate connections: `upsertVolumeLandmark` opens its
        // own `db.transaction()` per call, and the shared `db(pool)` here is
        // backed by a real multi-connection node-postgres Pool (max: 16 >
        // 8 concurrent calls), so Node dispatches all eight `BEGIN` +
        // `pg_advisory_xact_lock` statements to Postgres without waiting for
        // any prior call to finish. Correctness under whatever interleaving
        // Postgres and the OS scheduler actually produce is exactly what the
        // lock is responsible for — that is the property under test, not a
        // specific forced ordering.
        const results = await Promise.allSettled(
          CONCURRENT_EDITS.map((edit) => upsertVolumeLandmark(db(pool), testUserId, edit)),
        );

        // 1. All concurrent edit requests resolve successfully.
        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(0);

        // 2. Exactly one user-owned preset is created (no orphans).
        const ownedPresets = await db(pool)
          .select()
          .from(volumePresets)
          .where(eq(volumePresets.userId, testUserId));
        expect(ownedPresets).toHaveLength(1);
        const copyPresetId = ownedPresets[0]!.id;
        expect(copyPresetId).not.toBe(RP_GENERAL_PRESET_ID);
        expect(ownedPresets[0]!.isBuiltin).toBe(false);
        expect(ownedPresets[0]!.classification).toBe("user_defined");

        // 6. The governing default slot points to the one copy.
        const [refreshedUser] = await db(pool).select().from(users).where(eq(users.id, testUserId));
        expect(refreshedUser?.defaultVolumePresetId).toBe(copyPresetId);

        // 4. Every distinct edited value survives — the copy carries all 52
        // builtin rows plus these 8 edits applied on top, never fewer.
        const copyLandmarks = await db(pool)
          .select()
          .from(volumeLandmarks)
          .where(eq(volumeLandmarks.presetId, copyPresetId));
        expect(copyLandmarks).toHaveLength(builtinLandmarksBefore.length);
        for (const edit of CONCURRENT_EDITS) {
          const row = copyLandmarks.find(
            (l) => l.muscleGroupId === edit.muscleGroupId && l.key === edit.key,
          );
          expect(row?.valueMin).toBe(edit.valueMin);
          if ("valueMax" in edit) expect(row?.valueMax).toBe(edit.valueMax);
          if ("openEnded" in edit) expect(row?.openEnded).toBe(edit.openEnded);
        }

        // 5. The builtin remains byte-identical (all columns, all 52 rows).
        const builtinPresetAfter = (
          await db(pool)
            .select()
            .from(volumePresets)
            .where(eq(volumePresets.id, RP_GENERAL_PRESET_ID))
        )[0];
        expect(builtinPresetAfter).toEqual(builtinPresetBefore);
        const builtinLandmarksAfter = await db(pool)
          .select()
          .from(volumeLandmarks)
          .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));
        expect(builtinLandmarksAfter).toEqual(builtinLandmarksBefore);

        // 7. The next read exposes every edit.
        const report = await getWeeklyVolumeReport(
          db(pool),
          testUserId,
          new Date("2026-08-06T12:00:00.000Z"),
        );
        expect(report.activePreset?.id).toBe(copyPresetId);
        for (const edit of CONCURRENT_EDITS) {
          const row = report.activePreset?.landmarks.find(
            (l) => l.muscleGroupId === edit.muscleGroupId && l.key === edit.key,
          );
          expect(row?.valueMin).toBe(edit.valueMin);
        }
      },
    );
  },
);
