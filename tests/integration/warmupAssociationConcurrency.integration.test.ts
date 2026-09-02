import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  programs,
  users,
  warmupRoutines,
  workoutTemplates,
  workoutTemplateWarmupRoutines,
} from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import {
  createWarmupRoutine,
  deleteWarmupRoutine,
  setTemplateWarmupRoutines,
  WarmupRoutineAssociationConflictError,
  WarmupRoutineLinkTargetNotFoundError,
} from "@/server/warmupRoutines/service";

// warmup-routines-review.md MEDIUM-1 / LOW-1 — the association write path's
// real concurrency behaviour, against real PostgreSQL over independent
// connections.
//
// Why this file exists at all, and why it cannot live in the ordinary PGlite
// suite: PGlite is a single in-process backend and never interleaves two
// concurrent transactions, so `warmupRoutines.integration.test.ts` passes
// identically with and without the fix under test. That is the same
// limitation `recoveryConcurrency.integration.test.ts`,
// `volumeLandmarksConcurrency.integration.test.ts` and
// `reconcileContributionsConcurrency.integration.test.ts` already document,
// and this file follows their established shape exactly: a dedicated
// env-var-gated connection string, a real `pg` pool, an empty-of-users guard,
// and `describe.skipIf` so an ordinary `pnpm test:integration` run skips it.
//
// What the review reproduced BEFORE the fix (8/8 over real HTTP, 40/40 at the
// service layer): two simultaneous replacements → one side raised an unmapped
// `23505` on `uq_template_warmup_routine_position`, surfacing as HTTP 500,
// because under READ COMMITTED the second transaction's `DELETE` cannot see
// the first's not-yet-committed rows, deletes nothing, and then collides at
// `position 0`. LOW-1 was the mirror: a later-committing "clear all" deleted
// nothing, inserted nothing, and reported success while the earlier writer's
// links survived.
//
// The fix is the `SELECT … FROM workout_templates … FOR UPDATE OF
// workout_templates` that now opens the transaction. Each test below asserts
// the post-fix contract: coherent, honest last-writer-wins.
//
//   $env:WARMUP_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_wuconc"
//   pnpm exec vitest run --config vitest.integration.config.ts tests/integration/warmupAssociationConcurrency.integration.test.ts
//
// Unset (CI, and any ordinary `pnpm test:integration` run) -> skipped.
const CONCURRENCY_DATABASE_URL = process.env.WARMUP_CONCURRENCY_DATABASE_URL;

function db(pool: Pool): AppDb {
  return drizzle(pool, { schema }) as unknown as AppDb;
}

interface LinkRow {
  routineId: string;
  position: number;
  isDefault: boolean;
}

async function readLinks(pool: Pool, templateId: string): Promise<LinkRow[]> {
  return db(pool)
    .select({
      routineId: workoutTemplateWarmupRoutines.routineId,
      position: workoutTemplateWarmupRoutines.position,
      isDefault: workoutTemplateWarmupRoutines.isDefault,
    })
    .from(workoutTemplateWarmupRoutines)
    .where(eq(workoutTemplateWarmupRoutines.templateId, templateId))
    .orderBy(asc(workoutTemplateWarmupRoutines.position));
}

// A stable, comparable description of a template's whole association set.
function describeSet(links: LinkRow[], names: Map<string, string>): string {
  return links
    .map((l) => `${names.get(l.routineId) ?? l.routineId}@${l.position}${l.isDefault ? "*" : ""}`)
    .join(",");
}

describe.skipIf(!CONCURRENCY_DATABASE_URL)(
  "warm-up association replacement concurrency (real PostgreSQL, independent connections)",
  () => {
    let pool: Pool;
    let userId: string;
    let programId: string;
    // Routine ids stay fixed for the whole file; only the association rows
    // (and, in the routine-delete probe, purpose-built throwaway routines)
    // change between trials.
    let routineA: string;
    let routineB: string;
    let routineC: string;
    let routineD: string;
    let names: Map<string, string>;

    beforeAll(async () => {
      pool = new Pool({ connectionString: CONCURRENCY_DATABASE_URL, max: 16 });

      const existingUsers = await db(pool).select({ id: users.id }).from(users);
      if (existingUsers.length !== 0) {
        throw new Error(
          `warmupAssociationConcurrency expects WARMUP_CONCURRENCY_DATABASE_URL to point at an ` +
            `empty-of-users database, found ${existingUsers.length}. Run this file against a ` +
            "dedicated disposable database, not a shared dev database.",
        );
      }

      const [user] = await db(pool)
        .insert(users)
        .values({ email: `wuconc-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
        .returning();
      if (!user) throw new Error("failed to insert concurrency test user");
      userId = user.id;

      const [program] = await db(pool)
        .insert(programs)
        .values({ id: newId(), userId, name: "Concurrency Program", status: "active" })
        .returning();
      if (!program) throw new Error("failed to insert program");
      programId = program.id;

      const created = await Promise.all(
        (["A", "B", "C", "D"] as const).map((label) =>
          createWarmupRoutine(db(pool), userId, {
            name: `Routine ${label}`,
            items: [{ label: `${label} item`, instruction: null }],
          }),
        ),
      );
      [routineA, routineB, routineC, routineD] = created.map((r) => r.id) as [
        string,
        string,
        string,
        string,
      ];
      names = new Map(created.map((r) => [r.id, r.name]));
    });

    afterAll(async () => {
      await db(pool).delete(programs).where(eq(programs.userId, userId));
      await db(pool).delete(warmupRoutines).where(eq(warmupRoutines.userId, userId));
      await db(pool).delete(users).where(eq(users.id, userId));
      await pool.end();
    });

    // Every trial gets its own template, so trials can never interfere and a
    // failure names the exact trial.
    const createdTemplateIds: string[] = [];
    async function newTemplate(name: string): Promise<string> {
      const id = newId();
      await db(pool)
        .insert(workoutTemplates)
        .values({ id, programId, name, position: createdTemplateIds.length });
      createdTemplateIds.push(id);
      return id;
    }

    afterEach(async () => {
      // Templates cascade their links away; routines and the program stay.
      for (const id of createdTemplateIds.splice(0)) {
        await db(pool).delete(workoutTemplates).where(eq(workoutTemplates.id, id));
      }
    });

    const TRIAL_COUNT = 12;

    // ---- Probe 1: replacement vs replacement ---------------------------
    //
    // The review's primary reproduction. Pre-fix: one side raised an unmapped
    // 23505 in 100 % of raced trials. Post-fix: both sides must succeed, and
    // the persisted set must be exactly ONE of the two submitted sets — never
    // a union, never a mixture, never a partial.
    it("two concurrent replacements both succeed and leave exactly one submitted set, across repeated trials", async () => {
      const setOne = { routineIds: [routineA, routineB], defaultRoutineId: routineA };
      const setTwo = { routineIds: [routineC, routineD], defaultRoutineId: routineD };
      const expectedOne = describeSet(
        [
          { routineId: routineA, position: 0, isDefault: true },
          { routineId: routineB, position: 1, isDefault: false },
        ],
        names,
      );
      const expectedTwo = describeSet(
        [
          { routineId: routineC, position: 0, isDefault: false },
          { routineId: routineD, position: 1, isDefault: true },
        ],
        names,
      );

      for (let trial = 0; trial < TRIAL_COUNT; trial += 1) {
        const templateId = await newTemplate(`Race ${trial}`);
        // Seed a pre-existing set: an already-populated template is what
        // actually exposes the delete-then-insert race, since both writers
        // then have rows to remove as well as rows to add.
        await setTemplateWarmupRoutines(db(pool), userId, templateId, {
          routineIds: [routineA],
          defaultRoutineId: routineA,
        });

        const results = await Promise.allSettled([
          setTemplateWarmupRoutines(db(pool), userId, templateId, setOne),
          setTemplateWarmupRoutines(db(pool), userId, templateId, setTwo),
        ]);

        const rejected = results.filter((r) => r.status === "rejected");
        expect(
          rejected.map((r) => String((r as PromiseRejectedResult).reason)),
          `trial ${trial}: a concurrent replacement failed`,
        ).toEqual([]);

        const persisted = describeSet(await readLinks(pool, templateId), names);
        expect(
          [expectedOne, expectedTwo],
          `trial ${trial}: persisted set is neither submitted set (${persisted})`,
        ).toContain(persisted);
      }
    });

    // ---- Probe 2: replacement vs clear (LOW-1) -------------------------
    //
    // Pre-fix: 40/40 trials returned `ok|ok` while the CLEAR was silently
    // discarded — the later committer lost. Post-fix, honest last-writer-wins
    // means the outcome must be whichever transaction committed second, and a
    // clear that commits second must really clear. The winner is identified
    // from the RETURNED bodies, not guessed: each call returns the state its
    // own transaction produced.
    it("a concurrent clear resolves as honest last-writer-wins — when the clear commits second it really clears", async () => {
      let clearedCount = 0;
      let populatedCount = 0;

      for (let trial = 0; trial < TRIAL_COUNT; trial += 1) {
        const templateId = await newTemplate(`Clear ${trial}`);
        await setTemplateWarmupRoutines(db(pool), userId, templateId, {
          routineIds: [routineA],
          defaultRoutineId: routineA,
        });

        // A tiny stagger on alternate trials so both commit orders occur.
        const clearFirst = trial % 2 === 0;
        const populate = () =>
          setTemplateWarmupRoutines(db(pool), userId, templateId, {
            routineIds: [routineB, routineC],
            defaultRoutineId: routineB,
          });
        const clear = () =>
          setTemplateWarmupRoutines(db(pool), userId, templateId, {
            routineIds: [],
            defaultRoutineId: null,
          });

        const results = await Promise.allSettled(
          clearFirst ? [clear(), populate()] : [populate(), clear()],
        );
        expect(
          results.filter((r) => r.status === "rejected"),
          `trial ${trial}: a concurrent clear/replace failed`,
        ).toEqual([]);

        const persisted = await readLinks(pool, templateId);
        if (persisted.length === 0) {
          clearedCount += 1;
        } else {
          populatedCount += 1;
          // If the populate committed last, its set must be complete and
          // correct — never half of it, and never mixed with the old set.
          expect(describeSet(persisted, names), `trial ${trial}`).toBe(
            describeSet(
              [
                { routineId: routineB, position: 0, isDefault: true },
                { routineId: routineC, position: 1, isDefault: false },
              ],
              names,
            ),
          );
        }
      }

      // The decisive LOW-1 assertion: pre-fix this was 0 — a clear could
      // never win, because its DELETE saw nothing and it inserted nothing.
      expect(
        clearedCount,
        "a later-committing clear never actually cleared — LOW-1 has regressed",
      ).toBeGreaterThan(0);
      expect(clearedCount + populatedCount).toBe(TRIAL_COUNT);
    });

    // ---- Probe 3: different templates must not block each other ---------
    //
    // `FOR UPDATE OF workout_templates` deliberately does NOT lock the joined
    // `programs` row. If it did, every template in one program would
    // serialise behind every other — correct but needlessly coarse. This
    // asserts both templates' sets land intact and independently.
    it("concurrent replacements on DIFFERENT templates of the same program both apply in full", async () => {
      for (let trial = 0; trial < TRIAL_COUNT; trial += 1) {
        const first = await newTemplate(`Independent A ${trial}`);
        const second = await newTemplate(`Independent B ${trial}`);

        const results = await Promise.allSettled([
          setTemplateWarmupRoutines(db(pool), userId, first, {
            routineIds: [routineA, routineB],
            defaultRoutineId: routineB,
          }),
          setTemplateWarmupRoutines(db(pool), userId, second, {
            routineIds: [routineC],
            defaultRoutineId: routineC,
          }),
        ]);
        expect(
          results.filter((r) => r.status === "rejected"),
          `trial ${trial}: independent templates interfered`,
        ).toEqual([]);

        expect(describeSet(await readLinks(pool, first), names), `trial ${trial}: template 1`).toBe(
          describeSet(
            [
              { routineId: routineA, position: 0, isDefault: false },
              { routineId: routineB, position: 1, isDefault: true },
            ],
            names,
          ),
        );
        expect(
          describeSet(await readLinks(pool, second), names),
          `trial ${trial}: template 2`,
        ).toBe(describeSet([{ routineId: routineC, position: 0, isDefault: true }], names));
      }
    });

    // ---- Probe 4: replacement vs routine hard-delete --------------------
    //
    // The one race the anchor lock genuinely cannot cover: deleting a routine
    // never touches the template row, so the two transactions do not contend.
    // Pre-fix the review measured 15/15 unmapped `23503` → HTTP 500.
    //
    // warmup-routines-remediation-verification.md §5 — this race has THREE
    // legitimate outcomes, not two, and an earlier version of this probe
    // accepted only one of the two failure modes. Which typed error surfaces
    // depends purely on where the delete commits relative to this
    // transaction's statements:
    //
    //   delete commits BEFORE the in-transaction ownership SELECT
    //     -> the routine is simply not among the user's routines
    //     -> WarmupRoutineLinkTargetNotFoundError -> HTTP 400 routine_not_found
    //   delete commits AFTER that SELECT but before the INSERT
    //     -> the FK check fails (23503), caught and mapped
    //     -> WarmupRoutineAssociationConflictError -> HTTP 409 association_conflict
    //   delete commits after the whole transaction
    //     -> the replacement simply wins, links intact
    //
    // All three are correct, all are non-5xx, and a client that asked to link
    // a routine which no longer exists genuinely deserves `routine_not_found`.
    // What this probe actually guards is the property its title states and
    // that MEDIUM-1 was about: the failure is always a TYPED domain error and
    // never a raw driver error escaping as an unhandled 500 — plus no orphan
    // links, ever.
    const TYPED_REPLACEMENT_FAILURES = [
      WarmupRoutineAssociationConflictError,
      WarmupRoutineLinkTargetNotFoundError,
    ] as const;

    // A raw driver/Drizzle error is exactly what MEDIUM-1 was: something with
    // a SQLSTATE on it (or on its `cause` chain) reaching the caller
    // unmapped. Checked directly rather than inferred from "not one of the
    // typed classes", so a future third typed error cannot silently pass this
    // gate while an untyped one slips through the class list.
    function sqlStateOf(err: unknown): string | null {
      let current = err as { code?: unknown; cause?: unknown } | null | undefined;
      while (current && typeof current === "object") {
        if (typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) {
          return current.code;
        }
        current = current.cause as typeof current;
      }
      return null;
    }

    it("a concurrent routine hard-delete always fails with a TYPED domain error (never a raw PostgreSQL error) and never orphans a link", async () => {
      let conflicts = 0;
      let linkTargetMissing = 0;
      let clean = 0;

      for (let trial = 0; trial < TRIAL_COUNT; trial += 1) {
        const templateId = await newTemplate(`Delete race ${trial}`);
        // A throwaway routine per trial: it may or may not survive.
        const victim = await createWarmupRoutine(db(pool), userId, {
          name: `Victim ${trial}`,
          items: [{ label: "victim item", instruction: null }],
        });

        const [replaceResult, deleteResult] = await Promise.allSettled([
          setTemplateWarmupRoutines(db(pool), userId, templateId, {
            routineIds: [routineA, victim.id],
            defaultRoutineId: routineA,
          }),
          deleteWarmupRoutine(db(pool), userId, victim.id),
        ]);

        // The delete either succeeds or reports not-found; it must never
        // surface a raw driver error.
        if (deleteResult.status === "rejected") {
          expect(String(deleteResult.reason), `trial ${trial}: unexpected delete failure`).toMatch(
            /WarmupRoutineNotFoundError|Warm-up routine not found/,
          );
        }

        if (replaceResult.status === "rejected") {
          const reason = replaceResult.reason as unknown;

          // The load-bearing assertion, and the one MEDIUM-1 is about: no raw
          // PostgreSQL error escaped this path.
          expect(
            sqlStateOf(reason),
            `trial ${trial}: a raw PostgreSQL error escaped the association path ` +
              `(SQLSTATE ${sqlStateOf(reason)}) — it must be mapped to a typed domain error`,
          ).toBeNull();

          const isTyped = TYPED_REPLACEMENT_FAILURES.some((cls) => reason instanceof cls);
          expect(
            isTyped,
            `trial ${trial}: the replacement failed with an unexpected error type ` +
              `(${(reason as Error)?.name ?? typeof reason}); expected one of ` +
              TYPED_REPLACEMENT_FAILURES.map((cls) => cls.name).join(" | "),
          ).toBe(true);

          if (reason instanceof WarmupRoutineAssociationConflictError) conflicts += 1;
          else linkTargetMissing += 1;
        } else {
          clean += 1;
        }

        // Whatever happened, no link may reference a routine that no longer
        // exists. (The FK guarantees it; this asserts it directly rather
        // than trusting the constraint.)
        const orphans = await db(pool)
          .select({ id: workoutTemplateWarmupRoutines.id })
          .from(workoutTemplateWarmupRoutines)
          .leftJoin(warmupRoutines, eq(workoutTemplateWarmupRoutines.routineId, warmupRoutines.id))
          .where(and(eq(workoutTemplateWarmupRoutines.templateId, templateId)));
        const links = await readLinks(pool, templateId);
        expect(orphans.length, `trial ${trial}: orphaned link row`).toBe(links.length);

        // Clean up the victim if it survived the race.
        await deleteWarmupRoutine(db(pool), userId, victim.id).catch(() => undefined);
      }

      // Non-vacuous: every trial resolved into exactly one of the three
      // legitimate outcomes, and none was left unclassified.
      expect(conflicts + linkTargetMissing + clean).toBe(TRIAL_COUNT);
    });

    // ---- Probe 5: the lock does not break the ordinary path -------------
    it("sequential replacements are unaffected by the lock — each fully replaces the last", async () => {
      const templateId = await newTemplate("Sequential");

      await setTemplateWarmupRoutines(db(pool), userId, templateId, {
        routineIds: [routineA, routineB],
        defaultRoutineId: routineA,
      });
      expect(describeSet(await readLinks(pool, templateId), names)).toBe(
        "Routine A@0*,Routine B@1",
      );

      await setTemplateWarmupRoutines(db(pool), userId, templateId, {
        routineIds: [routineC],
        defaultRoutineId: null,
      });
      expect(describeSet(await readLinks(pool, templateId), names)).toBe("Routine C@0");

      await setTemplateWarmupRoutines(db(pool), userId, templateId, {
        routineIds: [],
        defaultRoutineId: null,
      });
      expect(await readLinks(pool, templateId)).toEqual([]);
    });

    // ---- Probe 6: ownership is still enforced under the lock ------------
    //
    // The ownership check moved INSIDE the transaction and is now the locking
    // statement itself, so it has to keep behaving exactly as before.
    it("a foreign template still returns null and writes nothing, now that the check is the locking read", async () => {
      const [otherUser] = await db(pool)
        .insert(users)
        .values({
          email: `wuconc-other-${Date.now()}@example.com`,
          passwordHash: "not-a-real-hash",
        })
        .returning();
      if (!otherUser) throw new Error("failed to insert second user");

      const templateId = await newTemplate("Owned by user one");
      await setTemplateWarmupRoutines(db(pool), userId, templateId, {
        routineIds: [routineA],
        defaultRoutineId: routineA,
      });

      try {
        await expect(
          setTemplateWarmupRoutines(db(pool), otherUser.id, templateId, {
            routineIds: [],
            defaultRoutineId: null,
          }),
        ).resolves.toBeNull();
        // ...and the owner's set is untouched.
        expect(describeSet(await readLinks(pool, templateId), names)).toBe("Routine A@0*");

        await expect(
          setTemplateWarmupRoutines(db(pool), userId, newId(), {
            routineIds: [],
            defaultRoutineId: null,
          }),
        ).resolves.toBeNull();
        await expect(
          setTemplateWarmupRoutines(db(pool), userId, "not-a-uuid", {
            routineIds: [],
            defaultRoutineId: null,
          }),
        ).resolves.toBeNull();
      } finally {
        await db(pool).delete(users).where(eq(users.id, otherUser.id));
      }
    });
  },
);
