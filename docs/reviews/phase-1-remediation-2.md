# Phase 1 Remediation (follow-up) — MED-1

Date: 2026-08-16
Remediates: `docs/reviews/phase-1-remediation-verification.md` → **MED-1** and **LOW-1**
Follows: [phase-1-remediation.md](./phase-1-remediation.md) (H1, M1, M2, L1)

Scope was limited to MED-1 and the inaccurate H1/bootstrap documentation. M1's UI
error presentation, the load-step input constraints, L2–L4, and everything else
the verification listed as LOW/INFO are untouched and still deferred.

## Root cause

The ledger fix closed H1's steady state but left one path open. The exercises
insert used an id-targeted conflict arbiter:

```ts
.onConflictDoNothing({ target: exercises.id })
```

That arbiter only absorbs a primary-key collision. A catalog slug can be
*unlogged* while its deterministic-id row is gone and its **name** is held by an
active exercise — the user hard-deleted the seeded row before the ledger
existed, then created or renamed something into the freed name. The insert then
violates the partial unique index `uq_exercises_active_name`, which is not the
arbiter, so Postgres raises 23505 and the seed has no handler for it.

The damage came from the transaction that H1's fix introduced: the ledger writes
roll back with the failed insert, so the next run rediscovers the identical
state and fails identically. `pnpm db:seed` runs before the deploy step, so the
pipeline stayed blocked on every subsequent deploy until someone repaired
production data by hand. This was the third consequence the original review
listed under H1; the first remediation closed the other two and reported H1 as
fixed.

The same shape was latent beyond the bootstrap window: any *future* catalog
addition whose name matches an active custom exercise would abort the whole
transaction, blocking every other new item in that run, permanently.

## The fix

Two changes in [src/db/seed/exercises.ts](../../src/db/seed/exercises.ts), no
schema change, no migration.

### 1. Drop the conflict arbiter (fixes MED-1)

```ts
.onConflictDoNothing()   // was: .onConflictDoNothing({ target: exercises.id })
```

Without a target, Postgres skips any row that violates **any** unique index —
both the ordinary id collision and the active-name collision — and does so
per-row, so one colliding slug no longer aborts the batch or the transaction.
This is deliberately narrow: arbiter-less `DO NOTHING` covers unique and
exclusion violations only, so check-constraint, foreign-key, and not-null
violations still raise. A malformed catalog entry is not silently swallowed.

The resulting policy is the one the whole design already follows: the user's row
wins, and the slug is recorded as applied either way, so it is never
reconsidered.

### 2. Bootstrap the ledger from `is_seeded` (fixes the disclosed resurrection, LOW-1)

When a user has no ledger rows at all but has at least one `is_seeded` row, the
seed now records every catalog slug as applied and inserts nothing:

```ts
if (applied.size === 0) {
  const [preLedgerRow] = await tx.select({ id: exercises.id }).from(exercises)
    .where(and(eq(exercises.userId, userId), eq(exercises.isSeeded, true))).limit(1);
  if (preLedgerRow) {
    await recordApplied(tx, userId, EXERCISE_CATALOG);
    return;
  }
}
```

The first remediation stated this was impossible without production audit
history or manual data edits. It is not — the inference is available from
persisted state and is deterministic, resting on three facts verified against
the repository rather than assumed:

| Premise | How it was verified |
|---|---|
| `is_seeded = true` is written **only** by this seed | Column defaults to `false`; `createExercise` never sets it and `updateExercise` never patches it (`grep` over the whole tree finds writes only in `src/db/seed/exercises.ts`); it is absent from both Zod schemas |
| The pre-ledger seed applied the **whole** catalog atomically | `git show f5b9b45:src/db/seed/exercises.ts` — a single `db.insert(exercises).values(rows)` over all of `EXERCISE_CATALOG`. One statement, so all-or-nothing |
| The catalog is the same one that was applied | `git log -- src/db/seed/exerciseCatalog.ts` shows one commit, `f5b9b45`; never modified since |

So one surviving `is_seeded` row proves the entire catalog was already offered to
that user, and recording it costs no writes to `exercises` or
`exercise_muscle_contributions` at all. The branch is self-limiting: after it
runs the ledger is non-empty, and under the transaction an `is_seeded` row can
never again coexist with an empty ledger.

Both changes are kept. They are complementary, not redundant — the bootstrap
branch does nothing for a future catalog addition colliding with a custom name,
and it does not fire for a user who deleted *every* seeded row (see
[Remaining limitations](#remaining-limitations)). The arbiter fix is the durable
one; the bootstrap branch is a one-shot improvement on top of it.

## Bootstrap semantics after the fix

Per `(user, slug)` the state machine is unchanged — `UNLOGGED → LOGGED`,
one-way. What changed is how a pre-ledger database enters it:

| User state on first post-migration seed | Behavior |
|---|---|
| Ledger rows exist | Normal path; only unlogged slugs considered |
| Ledger empty, ≥ 1 `is_seeded` row | **Bootstrap**: all slugs recorded, nothing inserted, nothing touched |
| Ledger empty, no `is_seeded` row | Genuinely new user; full catalog seeded |

Consequences for the deploy that ships this, per pre-ledger user:

- Seeded rows that still exist: untouched, ledger backfilled. Unchanged from the
  first remediation.
- Seeded rows hard-deleted before the migration: **stay deleted**. Previously
  they came back once.
- A freed seeded name reused by an active exercise: **no longer an error**.
  Previously this aborted the seed and blocked every subsequent deploy.
- User edits (renames, contribution weights, removed contributions): preserved,
  as before.

## Tests added

Six tests in [tests/integration/seed.integration.test.ts](../../tests/integration/seed.integration.test.ts).
Two helpers reproduce the states involved: `simulatePreLedgerDb` (clear the
ledger — exact, since migration 0002 only adds an empty table) and
`simulateNewCatalogSlug` (drop a slug's ledger row and exercise row — state-
identical to shipping a new catalog entry, without mutating the catalog module).

To avoid repeating the first remediation's reporting problem, each test was run
against the pre-fix implementation. Three genuinely discriminate; three are
guards for behavior that was already correct and are labelled as such rather
than counted as proof.

| Test | Covers | Against pre-fix code |
|---|---|---|
| `bootstrapping the ledger does not resurrect a pre-ledger hard-deleted seeded exercise` | 1, 3, 4, 5, 9 + resurrection eliminated | **FAILS** — `expected { …(13) } to be undefined` (the row came back) |
| `bootstrapping the ledger does not throw when a pre-ledger hard-deleted seeded name is held by an active custom exercise` | 1, 2, 3, 4, 5 | **FAILS** — `promise rejected "Error: Failed query: insert into "exercis…"` |
| `a new catalog slug colliding with an active custom name is skipped without blocking the other new slugs` | 6, 7 | **FAILS** — same rejection; the non-colliding slug is not inserted either |
| `bootstrapping the ledger leaves a user's edits to seeded exercises untouched` | 8 | passes — regression guard, not proof |
| `rolls the ledger back with the exercises when the seed transaction fails, and a retry recovers` | 10 | passes — regression guard, not proof |
| `still surfaces non-uniqueness violations from the exercises insert` | arbiter scope | passes — guards specifically against the new arbiter-less insert swallowing FK/check errors |

The first two assert the ledger is fully populated *after* the run and that a
second run is a clean no-op — a rolled-back ledger is what made the pre-fix
failure permanent rather than transient. Requirement 9 (deletion preserved once
the ledger exists) is additionally covered by the pre-existing
`reseeding does not resurrect a hard-deleted seeded exercise`.

## Verification results

Run locally against the working tree after this remediation:

| Check | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm format:check` | pass ("All matched files use Prettier code style!") |
| `pnpm typecheck` | pass |
| `pnpm typecheck:sw` | pass |
| `pnpm test:unit` | **58/58 pass**, 6 files (unchanged) |
| `pnpm test:integration` | **41/41 pass**, 3 files (was 35; seed suite 10 → 16) |
| `pnpm build` | pass, standalone, 15 routes |
| `pnpm db:generate` | "No schema changes, nothing to migrate"; all 7 files under `drizzle/` byte-identical afterwards (md5-verified) |

Discrimination check: the pre-fix seed implementation was temporarily restored
and the seed suite re-run — 13 passed, **3 failed**, exactly the three tests
above. The fixed implementation was then restored and checksum-verified.

No new migration. `0002` is unchanged and remains the only migration this
Phase 1 work adds.

## Remaining limitations

1. **No real PostgreSQL verification.** Docker and `psql` are both unavailable in
   this environment (`command -v` returns nothing for either), so `pnpm db:migrate`
   and `pnpm db:seed` were **not** run against a real server. All evidence above
   comes from PGlite running the actual `drizzle/` migration files in order,
   which exercises the partial unique index and `ON CONFLICT` arbiter semantics
   natively — but it is not the production database.

2. **A pre-ledger user who hard-deleted *every* seeded row is indistinguishable
   from a new user.** With no `is_seeded` row left there is no evidence to
   bootstrap from, so the full catalog is re-seeded once. This is the current
   behavior, not a regression, and with the arbiter fix it can no longer fail;
   it is also implausible for this app's single user. Eliminating it would
   require evidence the database does not contain.

3. **The bootstrap branch trusts that the catalog has not grown since the
   pre-ledger seed.** True in this release (the catalog is untouched, and after
   one successful deploy the branch is dead for every existing user). If a
   release were ever to both add catalog entries *and* be the first to carry
   migration 0002, those new entries would be recorded as applied without being
   inserted, and the user would silently miss them. The failure mode is a
   missing convenience row, recoverable by deleting that ledger row — strictly
   milder than the resurrection of deleted data it replaces, which is why the
   inference is preferred over a frozen slug list.

4. **Concurrency is reasoned about, not measured.** PGlite is single-connection.
   The deploy pipeline serializes seeds (`concurrency: azure-deploy-production`,
   `cancel-in-progress: false`), and the ledger insert keeps its
   `onConflictDoNothing` guard, but no concurrent-run test exists.

5. **Pre-deploy check still worth running.** `select user_id, count(*) from
   exercises where is_seeded = true group by user_id` — if every count equals
   the catalog size, nothing was ever hard-deleted and both fixes are purely
   preventive for this database.

## Status

**READY FOR FINAL PHASE 1 VERIFICATION**

Phase 1 closure is not claimed here; it is for an independent verification
session to decide.
