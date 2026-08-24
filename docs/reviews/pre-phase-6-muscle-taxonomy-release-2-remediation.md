# Pre-Phase-6 Muscle Taxonomy v2 — Release 2 Concurrency Remediation

Status: complete, locally verified against PGlite and real local PostgreSQL 16 (including a forced concurrency probe). Not committed, not pushed, not deployed. No production access. No user-owned file touched. `docs/reviews/pre-phase-6-muscle-taxonomy-release-2-review.md` not modified.

## Scope

Remediates exactly the two concurrency findings in the independent review (`docs/reviews/pre-phase-6-muscle-taxonomy-release-2-review.md`):

- **M-1** — the classify-then-act `UPDATE` could raise `SQLSTATE 23505` on `exercise_muscle_contributions`'s primary key under a real concurrent write, aborting the whole reconciliation transaction and failing `pnpm db:seed` / the deploy.
- **M-2** — `updated` was incremented unconditionally, so a raced (zero-row) `UPDATE` could report `conflicts=0` while a direct `back` row survived on a mapped seeded exercise.

Implements exactly the review's §5 "safest minimal correction" (also closes M-3 as a side effect, since the code now matches the mechanism ADR-010 already specifies — no ADR/implementation-plan text needed changing). Nothing else in the release was touched.

## Exact changes

### `src/db/seed/reconcileContributions.ts`

1. **The target-leaf `notExists(...)` guard now lives inside the mutating `UPDATE`'s own `.where()`**, built via Drizzle's query builder (`notExists` from `drizzle-orm`, `alias` from `drizzle-orm/pg-core` for the self-referencing subquery — same generated SQL shape the review confirmed: `update "exercise_muscle_contributions" set ... where (... and not exists (select ... from "exercise_muscle_contributions" "target_probe" where (...))`). This is ADR-010's literal mechanism, not raw SQL. The three preliminary classification `SELECT`s (exercise exists, `back` row exists, target row exists) are unchanged — they still produce `noop` and the synchronously-detected `conflicts` case exactly as before.
2. **`updated` is incremented only from the `UPDATE`'s real affected-row count**, read portably: `const moved = moveResult.rowCount ?? moveResult.affectedRows ?? 0;` (node-postgres exposes `rowCount`, PGlite exposes `affectedRows`), cast through a new local `PortableUpdateResult` interface (`AppDb`'s generic result type isn't otherwise indexable). `moved === 1` → `updated++`. Any other value (in practice only `0`, since the guard makes the statement match at most one row) → `conflicts++`, with the identical warning-line format the synchronous conflict path already used — so a raced pair is reported exactly like a conflict found ahead of time, not a new category.
3. **No try/catch around `23505`, no savepoints, no locks, no retries, no new architecture** — the guard is the entire fix; nothing catches an error because the guarded statement cannot raise one under this interleaving (proven below).
4. Header comment rewritten to describe the atomic mechanism and cite the review's Probe A/B findings; the previous "exact snapshot" claim about the whole-run transaction is corrected to state plainly that READ COMMITTED gives each statement its own snapshot, not the transaction as a whole — kept only for what it actually does (no partial summary on rollback).
5. **Unrelated behavior preserved exactly**: the whole run is still one `db.transaction`; `mapped`, `noop`, `customDirectBack`, `seededDirectBackUnmapped` computation is untouched; the M-2 unmapped-scan and `customDirectBack` scan are untouched; `runSeed`'s step order (`seedMuscleGroups → reconcileContributions → seedExerciseCatalogForAllUsers`) is untouched; the reporting contract (both console lines, `::warning::` format, per-row fields) is untouched; role and weight are still never written by the `UPDATE`.

No other production file was touched.

### New regression coverage

- **`tests/integration/reconcileContributionsConcurrency.integration.test.ts`** (new) — real PostgreSQL only (`describe.skipIf(!DATABASE_URL)`, matching this repo's existing convention for every other real-Postgres-only check). Forces the exact interleaving the review's Probe A used: a Release-1 editor save (`DELETE` all contributions, `INSERT` `back` primary + the target leaf secondary — the same shape `updateExercise`'s carry-through-plus-sibling-leaf path produces) commits on a **separate** connection between `reconcileContributions`'s preliminary target-row `SELECT` and its `UPDATE`. The interleaving is forced deterministically (no sleeps) by patching `pg.Client.prototype.query` for the duration of the call, intercepting the first `UPDATE ... exercise_muscle_contributions ...` statement any client issues and awaiting the concurrent transaction's full commit before letting the original statement proceed; the patch is always restored in a `finally`, and the whole file requires a database dedicated to it (asserted in `beforeAll`, since the reported counters aggregate across every user in the database). Four tests, mapped to the required coverage:
  1. **"1, 2, 4"** — races the concurrent insert; asserts `reconcileContributions` resolves (does not throw) and its own returned summary already shows `updated=0, conflicts=1, noop=13` for that run; asserts both the `back` and target-leaf rows survive untouched.
  2. **"5"** — same race, then a second, ordinary (unraced) call: `conflicts=1` again (sticky, re-reported), `updated=0`.
  3. **"3"** — same race driven through the public `runSeed` entry point; asserts the catalog-seed step still ran (far more than the one race-fixture exercise now exists for the test user) — before this fix, the raced `UPDATE` threw and `seedExerciseCatalogForAllUsers` never ran.
  4. **"6 (PostgreSQL)"** — a normal, unraced move: `updated=1`, `conflicts=0`, and the row is verified to have actually landed on the target leaf — the portable affected-row read is correct on node-postgres.
- **`tests/integration/reconcileContributions.integration.test.ts`** (existing file, extended) — new `describe("affected-row counting (PGlite)")` block, two tests: a normal move increments `updated` by exactly 1 and the row lands correctly; a preliminary-detected conflict (target already present) never increments `updated`. Explicit PGlite-side proof for regression-coverage item 6, alongside the real-Postgres proof above (the file's other 17 tests already exercised this path incidentally — these two make the affected-row-count property the direct point of the assertion).

## Results

### Real PostgreSQL concurrency probe

Run against a dedicated disposable database (`gymapp_r2concurrency`, created, migrated fresh through all 8 migrations, and dropped after use — never the shared dev database):

```
1, 2, 4: races a concurrent target-leaf insert into the atomic UPDATE — does not throw, and the raced row is not counted as updated
  taxonomy-v2 reconciliation: users=1 mapped=14 updated=0 noop=13 conflicts=1 customDirectBack=0
  taxonomy-v2 reconciliation: seededDirectBackUnmapped=0
  ::warning::taxonomy-v2 reconciliation conflict: user=... slug=barbell-row exercise=... target=upper_back
  ✓ passed

5: the surviving direct back row is reported as a sticky conflict on the next run
  (same race, then a second unraced run — identical conflicts=1, updated=0, re-emitted)
  ✓ passed

3: runSeed continues past a raced pair — the catalog seed step still runs
  (same race driven through runSeed(); catalog seed completed for the user)
  ✓ passed

6 (PostgreSQL): affected-row counting is correct on a normal, unraced move
  taxonomy-v2 reconciliation: users=1 mapped=14 updated=1 noop=13 conflicts=0 customDirectBack=0
  ✓ passed

Test Files  1 passed (1)
     Tests  4 passed (4)
```

No `SQLSTATE 23505` anywhere in any run. This directly contradicts nothing — it confirms the review's Probe B/B2 finding now applies to the shipped code, not just to ADR-010's literal statement in isolation.

### PGlite

```
tests/integration/reconcileContributions.integration.test.ts — 19/19 passed (11.1s)
  ... (the 17 tests already in this report's prior implementation pass) ...
  affected-row counting (PGlite) > increments updated by exactly the number of rows the atomic UPDATE actually moved — ✓
  affected-row counting (PGlite) > does not increment updated when the target leaf is already present (classified as a conflict before the UPDATE is even attempted) — ✓
```

### Targeted unit tests

```
tests/unit/exerciseCatalog.test.ts — 14/14 passed
tests/unit/muscleGroups.test.ts — 8/8 passed
pnpm test:unit (full suite, for confirmation) — 367/367 passed
```

### Checks

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm build` | succeeds |

### Not rerun, per instruction

Full `pnpm test:e2e` — not rerun; no browser-observable behavior changed (the fix is entirely inside `reconcileContributions`'s SQL and counter logic, never reached by any UI path).

## Why this closes M-1, M-2, and M-3

- **M-1**: the mutating statement is now ADR-010's literal atomic conditional `UPDATE`. The review's own control probes (B/B2) proved this exact statement shape immune to the identical forced interleaving; this session's probe against the *shipped* code (not an isolated control statement) confirms the same result — zero throws across four different race/no-race scenarios, including through the public `runSeed` entry point.
- **M-2**: `updated` now reflects the real affected-row count. A raced pair that moves zero rows is classified as `conflicts++` with the same warning shape a synchronously-detected conflict produces — the invariant "`back` rows remaining among mapped ids ≡ `conflicts`" the review asked to be restored holds again, verified by both the real-Postgres probe (state-checked directly) and the existing PGlite counter cross-check test.
- **M-3**: no ADR-010 or implementation-plan text needed changing — the code now performs the mechanism those documents already specify, so nothing is undocumented.

No try/catch, savepoint, lock, retry, or new architecture was introduced, matching the constraint. The existing transaction, mapping table, reporting contract, `runSeed` order, and every other tested behavior (role/weight preservation, noop classification, `customDirectBack`, `seededDirectBackUnmapped`, sticky conflicts, second-run `updated=0`) are unchanged and re-verified passing.

## Verdict

**READY FOR TARGETED REMEDIATION VERIFICATION**
