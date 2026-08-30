import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { users, recoveryEntries } from "@/db/schema";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// phase-8-review.md HIGH-1 — the recovery upsert's real concurrency defect,
// against real PostgreSQL, following the exact precedent
// `tests/integration/volumeLandmarksConcurrency.integration.test.ts` /
// `reconcileContributionsConcurrency.integration.test.ts` established for
// "PGlite is a single in-process backend, so there is no interleaving for a
// real race to manifest" — confirmed true here too: syncDailyLogs.integration
// .test.ts's PGlite-backed recovery cases all pass regardless of whether the
// old pre-read/backfill bug is present, because PGlite never actually
// interleaves two concurrent sync-apply calls.
//
// Drives the REAL sync-apply entry point (`applySyncBatch`,
// src/server/sync/service.ts) — the exact layer the review's bug lived in
// (`applyRecoveryEntryUpsert`'s now-removed pre-read/backfill), not
// `logRecovery` in isolation, which never had this bug itself (a touched
// field's own non-null value already satisfies the eager CHECK on the
// proposed insert tuple, so the online routes — which always resend every
// metric they own — were never exposed to it). Each concurrent participant
// below is its OWN top-level `applySyncBatch` call (a real, independent
// connection acquisition from the pool), not ops bundled into one batch
// (which `applySyncBatch` applies strictly sequentially, in-process, and so
// could never race at all).
//
// The review's own reproduction: with the OLD adapter, 5 of 6 concurrent
// partial-update pairs on DIFFERENT metrics for the same day lost one of
// them — each call's stale pre-read clobbered whatever the other had just
// committed.
//
//   $env:RECOVERY_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_recconc"
//   pnpm exec vitest run --config vitest.integration.config.ts tests/integration/recoveryConcurrency.integration.test.ts
//
// Unset (CI, and any ordinary `pnpm test:integration` run) -> skipped.
const CONCURRENCY_DATABASE_URL = process.env.RECOVERY_CONCURRENCY_DATABASE_URL;

function db(pool: Pool): AppDb {
  return drizzle(pool, { schema }) as unknown as AppDb;
}

function recoveryOp(
  id: string,
  date: string,
  fields: Partial<{
    sleepHours: number | null;
    sleepQuality: number | null;
    readiness: number | null;
    soreness: number | null;
    note: string | null;
  }>,
): SyncOpEnvelope {
  return {
    opId: newId(),
    entity: "recoveryEntry",
    operation: "upsert",
    payload: { id, date, ...fields },
  };
}

async function getEntry(pool: Pool, userId: string, date: string) {
  const [row] = await db(pool)
    .select()
    .from(recoveryEntries)
    .where(and(eq(recoveryEntries.userId, userId), eq(recoveryEntries.date, date)));
  return row;
}

describe.skipIf(!CONCURRENCY_DATABASE_URL)(
  "recoveryEntry sync-apply concurrency (real PostgreSQL)",
  () => {
    let pool: Pool;
    let testUserId: string;

    beforeAll(async () => {
      pool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL, max: 16 });

      const existingUsers = await db(pool).select({ id: users.id }).from(users);
      if (existingUsers.length !== 0) {
        throw new Error(
          `recoveryConcurrency expects RECOVERY_CONCURRENCY_DATABASE_URL to point at an empty-of-users ` +
            `database, found ${existingUsers.length}. Run this file against a dedicated disposable database, ` +
            "not a shared dev database.",
        );
      }

      const [user] = await db(pool)
        .insert(users)
        .values({ email: `recconc-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
        .returning();
      if (!user) throw new Error("failed to insert concurrency test user");
      testUserId = user.id;
    });

    afterAll(async () => {
      await db(pool).delete(recoveryEntries).where(eq(recoveryEntries.userId, testUserId));
      await db(pool).delete(users).where(eq(users.id, testUserId));
      await pool.end();
    });

    // The review's exact reproduction, run across several independent trials
    // (each a fresh day, so trials can't interfere with each other) rather
    // than once — "5/6" was a rate, not a one-off, so the fix needs to hold
    // reliably across repeated concurrent pairs, not just once by luck.
    const TRIAL_COUNT = 8;
    const trialDates = Array.from(
      { length: TRIAL_COUNT },
      (_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`,
    );

    it("concurrent partial updates to DIFFERENT metrics on the same day both survive, across repeated trials", async () => {
      // Seed each trial day with an initial value for BOTH metrics first. A
      // pre-existing row is what actually exposes the lost-update race: a
      // brand-new day where both concurrent creates start from "no row yet"
      // doesn't, because a stale pre-read of "nothing" behaves identically
      // to plain field omission either way. The real race is two concurrent
      // UPDATEs to an already-existing row, each backfilling the OTHER
      // field from what could be a now-stale read of it.
      for (const date of trialDates) {
        await applySyncBatch(db(pool), testUserId, [
          recoveryOp(newId(), date, { readiness: 1, soreness: 1 }),
        ]);
      }

      const results = await Promise.allSettled(
        trialDates.flatMap((date) => [
          applySyncBatch(db(pool), testUserId, [recoveryOp(newId(), date, { readiness: 4 })]),
          applySyncBatch(db(pool), testUserId, [recoveryOp(newId(), date, { soreness: 2 })]),
        ]),
      );

      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(0);
      for (const r of results) {
        if (r.status === "fulfilled") expect(r.value.rejected).toEqual([]);
      }

      for (const date of trialDates) {
        const row = await getEntry(pool, testUserId, date);
        expect(row?.readiness, `trial ${date}: readiness lost to a concurrent write`).toBe(4);
        expect(row?.soreness, `trial ${date}: soreness lost to a concurrent write`).toBe(2);
      }
    });

    it("a note-only op on a day whose only existing metric is untouched does not clear it (no backfill needed)", async () => {
      const date = "2026-02-20";
      await applySyncBatch(db(pool), testUserId, [recoveryOp(newId(), date, { sleepQuality: 5 })]);

      // Touches only `note` — every metric field is omitted (undefined), so
      // the proposed insert tuple's own metrics are all null, but `note`
      // alone never threatened `sleepQuality`, which the presence-aware SET
      // clause leaves untouched on the real row regardless of the tuple
      // used to detect the conflict.
      const result = await applySyncBatch(db(pool), testUserId, [
        recoveryOp(newId(), date, { note: "felt fine" }),
      ]);
      expect(result.rejected).toEqual([]);

      const row = await getEntry(pool, testUserId, date);
      expect(row?.sleepQuality).toBe(5);
      expect(row?.note).toBe("felt fine");
    });

    it("clearing the day's only metric is rejected (no_metric) and leaves the row unmodified", async () => {
      const date = "2026-02-21";
      await applySyncBatch(db(pool), testUserId, [recoveryOp(newId(), date, { readiness: 3 })]);

      const clearOp = recoveryOp(newId(), date, { readiness: null });
      const result = await applySyncBatch(db(pool), testUserId, [clearOp]);
      expect(result.applied).toEqual([]);
      expect(result.rejected).toEqual([
        { opId: clearOp.opId, entity: "recoveryEntry", reason: "no_metric" },
      ]);

      const row = await getEntry(pool, testUserId, date);
      expect(row?.readiness).toBe(3);
    });

    it("two concurrent explicit-clear ops that would TOGETHER empty the row: exactly one applies, the other correctly rejects (no_metric), and the row is never left empty", async () => {
      const date = "2026-02-22";
      await applySyncBatch(db(pool), testUserId, [
        recoveryOp(newId(), date, { readiness: 5, soreness: 4 }),
      ]);

      const clearReadiness = recoveryOp(newId(), date, { readiness: null });
      const clearSoreness = recoveryOp(newId(), date, { soreness: null });
      const results = await Promise.allSettled([
        applySyncBatch(db(pool), testUserId, [clearReadiness]),
        applySyncBatch(db(pool), testUserId, [clearSoreness]),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof applySyncBatch>>> =>
          r.status === "fulfilled",
      );
      expect(fulfilled).toHaveLength(2); // neither call itself throws...
      const applied = fulfilled.flatMap((r) => r.value.applied);
      const rejected = fulfilled.flatMap((r) => r.value.rejected);
      // ...but exactly one of the two OPS applies and the other rejects
      // no_metric — never both, never neither.
      expect(applied).toHaveLength(1);
      expect(rejected).toEqual([
        {
          opId: applied[0] === clearReadiness.opId ? clearSoreness.opId : clearReadiness.opId,
          entity: "recoveryEntry",
          reason: "no_metric",
        },
      ]);

      const row = await getEntry(pool, testUserId, date);
      expect(row?.readiness === null && row?.soreness === null).toBe(false);
    });
  },
);
