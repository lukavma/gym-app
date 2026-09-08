import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { exercises, sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";

// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md A-20
// — "Concurrent renumbering on a load_distance slot under the deferrable
// constraint and both composite FKs (extend the PG concurrency suites)."
//
// Following the exact precedent `metricsSelectionConcurrency
// .integration.test.ts` / `volumeLandmarksConcurrency.integration.test.ts` /
// `reconcileContributionsConcurrency.integration.test.ts` /
// `recoveryConcurrency.integration.test.ts` /
// `warmupAssociationConcurrency.integration.test.ts` established for
// "PGlite is a single in-process backend, so there is no interleaving for a
// real race to manifest" — the existing single-connection proofs in
// `sync.integration.test.ts` ("set deletion renumbering (PGlite
// integration)") only ever apply one renumber op at a time, strictly
// sequentially, so `uq_set_number DEFERRABLE INITIALLY DEFERRED` is never
// actually raced against a genuinely concurrent commit. This file is that
// real coverage: a real node-postgres Pool against a dedicated disposable
// database, gated on its own opt-in variable, never `DATABASE_URL`.
//
// Scope note (a deliberate, disclosed limitation): `applySyncBatch` runs
// ONE transaction per op (src/server/sync/service.ts), so a renumber
// "batch" never shares a single transaction across statements — the
// deferred-vs-immediate distinction that matters for a same-transaction
// multi-statement renumber (already covered, single-connection, by
// sync.integration.test.ts's "rejects the renumbering if the ops are
// applied in descending order") is not what this file exercises. What is
// new and real-PostgreSQL-only here: two GENUINELY concurrent top-level
// `applySyncBatch` calls (separate pool connections, separate
// transactions) each renumbering a DIFFERENT existing set_logs row on the
// SAME load_distance slot onto the SAME target set_number. Only one
// transaction's COMMIT can win uq_set_number; the loser must see a real
// 23505 at its own commit (not at statement time, since neither
// transaction can see the other's uncommitted row before that), mapped by
// the service to `set_number_conflict` exactly as the single-connection
// tests already prove for the synchronous case. This also exercises both
// new composite FKs end-to-end for a non-`load_reps` profile under real
// concurrent load: `fk_set_logs_parent_profile` (set_logs -> session_
// exercises on (session_exercise_id, measurement_profile)) and the mirror
// `fk_session_exercises_exercise_profile` (session_exercises -> exercises
// on (exercise_id, measurement_profile)) must both still hold for every
// surviving row once the race settles.
//
//   $env:SET_RENUMBER_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_renumconc"
//   pnpm exec vitest run --config vitest.integration.config.ts tests/integration/setRenumberConcurrency.integration.test.ts
//
// Unset (CI, and any ordinary `pnpm test:integration` run) -> skipped.
const CONCURRENCY_DATABASE_URL = process.env.SET_RENUMBER_CONCURRENCY_DATABASE_URL;

function db(pool: Pool): AppDb {
  return drizzle(pool, { schema }) as unknown as AppDb;
}

describe.skipIf(!CONCURRENCY_DATABASE_URL)(
  "concurrent set-log renumbering on a load_distance slot (real PostgreSQL)",
  () => {
    let pool: Pool;
    let testUserId: string;
    let exerciseId: string;
    let sessionExerciseId: string;
    let rowAId: string;
    let rowBId: string;

    beforeAll(async () => {
      pool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL, max: 16 });
      await seedMuscleGroups(db(pool));

      const existingUsers = await db(pool).select({ id: users.id }).from(users);
      if (existingUsers.length !== 0) {
        throw new Error(
          `setRenumberConcurrency expects SET_RENUMBER_CONCURRENCY_DATABASE_URL to point at an ` +
            `empty-of-users database, found ${existingUsers.length}. Run this file against a ` +
            "dedicated disposable database, not a shared dev database.",
        );
      }

      const [user] = await db(pool)
        .insert(users)
        .values({ email: `renumconc-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
        .returning();
      if (!user) throw new Error("failed to insert concurrency test user");
      testUserId = user.id;

      const exercise = await createExercise(db(pool), testUserId, {
        name: "Concurrency Farmer's Carry",
        equipment: "dumbbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
        measurementProfile: "load_distance",
        loadBasis: "per_hand",
      });
      exerciseId = exercise.id;

      const sessionId = newId();
      const sessionResult = await applySyncBatch(db(pool), testUserId, [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, startedAt: new Date().toISOString() },
        },
      ]);
      if (sessionResult.rejected.length > 0) {
        throw new Error("expected concurrency-fixture session create to apply");
      }

      sessionExerciseId = newId();
      const slotResult = await applySyncBatch(db(pool), testUserId, [
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId,
            position: 0,
            source: "adhoc",
          },
        },
      ]);
      if (slotResult.rejected.length > 0) {
        throw new Error("expected concurrency-fixture slot create to apply");
      }

      // Two baseline load_distance sets, numbered 1 and 2 — a normal,
      // uncontested shape. `rowA`/`rowB` are the two rows the race below
      // will both try to renumber onto the SAME free target number.
      rowAId = newId();
      rowBId = newId();
      const loggedAt = new Date().toISOString();
      const seedRowsResult = await applySyncBatch(db(pool), testUserId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: rowAId,
            sessionExerciseId,
            setNumber: 1,
            isWarmup: false,
            weightKg: 40,
            distanceM: 20,
            loggedAt,
            notes: null,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: rowBId,
            sessionExerciseId,
            setNumber: 2,
            isWarmup: false,
            weightKg: 42.5,
            distanceM: 22,
            loggedAt,
            notes: null,
          },
        },
      ]);
      if (seedRowsResult.rejected.length > 0) {
        throw new Error("expected concurrency-fixture baseline sets to apply");
      }
    });

    afterAll(async () => {
      await db(pool).delete(setLogs).where(eq(setLogs.sessionExerciseId, sessionExerciseId));
      await db(pool).delete(sessionExercises).where(eq(sessionExercises.id, sessionExerciseId));
      await db(pool).delete(workoutSessions).where(eq(workoutSessions.userId, testUserId));
      await db(pool).delete(exercises).where(eq(exercises.userId, testUserId));
      await db(pool).delete(users).where(eq(users.id, testUserId));
      await pool.end();
    });

    it("two genuinely concurrent renumber upserts racing for the same target set_number: exactly one commits, the other rejects set_number_conflict, and both composite FKs still hold for every surviving row", async () => {
      const loggedAt = new Date().toISOString();
      const opAId = newId();
      const opBId = newId();

      const [resultA, resultB] = await Promise.all([
        applySyncBatch(db(pool), testUserId, [
          {
            opId: opAId,
            entity: "setLog",
            operation: "upsert",
            payload: {
              id: rowAId,
              sessionExerciseId,
              setNumber: 3,
              isWarmup: false,
              weightKg: 40,
              distanceM: 20,
              loggedAt,
              notes: null,
            },
          },
        ]),
        applySyncBatch(db(pool), testUserId, [
          {
            opId: opBId,
            entity: "setLog",
            operation: "upsert",
            payload: {
              id: rowBId,
              sessionExerciseId,
              setNumber: 3,
              isWarmup: false,
              weightKg: 42.5,
              distanceM: 22,
              loggedAt,
              notes: null,
            },
          },
        ]),
      ]);

      const aApplied = resultA.applied.includes(opAId);
      const bApplied = resultB.applied.includes(opBId);
      // Exactly one side's commit wins the race — never both (that would be
      // a real duplicate set_number surviving in PostgreSQL) and never
      // neither (a spurious deadlock/abort would mean the deferred
      // constraint or the composite FKs mishandled genuine concurrency).
      expect(
        aApplied !== bApplied,
        `expected exactly one side applied; A=${aApplied} B=${bApplied}`,
      ).toBe(true);

      const loserResult = aApplied ? resultB : resultA;
      const loserOpId = aApplied ? opBId : opAId;
      expect(loserResult.rejected).toEqual([
        { opId: loserOpId, entity: "setLog", reason: "set_number_conflict" },
      ]);

      const rows = await db(pool)
        .select({
          id: setLogs.id,
          setNumber: setLogs.setNumber,
          measurementProfile: setLogs.measurementProfile,
          sessionExerciseId: setLogs.sessionExerciseId,
        })
        .from(setLogs)
        .where(inArray(setLogs.id, [rowAId, rowBId]));
      expect(rows).toHaveLength(2);

      const setNumbers = rows.map((r) => r.setNumber).sort();
      // The winner is now 3; the loser's commit never happened, so it kept
      // its original number (1 for row A, 2 for row B) — never a duplicate,
      // never both stuck at their originals.
      expect(setNumbers).toEqual(aApplied ? [2, 3] : [1, 3]);

      // Both composite FKs (fk_set_logs_parent_profile,
      // fk_session_exercises_exercise_profile) still hold for every
      // surviving row: every row is still the slot's own `load_distance`
      // profile and still points at the same slot — the race never let a
      // row drift to a mismatched profile or an orphaned parent, which is
      // exactly what those FKs exist to forbid.
      for (const row of rows) {
        expect(row.measurementProfile).toBe("load_distance");
        expect(row.sessionExerciseId).toBe(sessionExerciseId);
      }
      const [slot] = await db(pool)
        .select({ measurementProfile: sessionExercises.measurementProfile })
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId));
      expect(slot?.measurementProfile).toBe("load_distance");
    });
  },
);
