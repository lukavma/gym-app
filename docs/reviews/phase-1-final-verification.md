# Phase 1 — Final Independent Verification

Date: 2026-08-16
Verifies: [phase-1-remediation-2.md](./phase-1-remediation-2.md) (MED-1, LOW-1) on top of
[phase-1-remediation.md](./phase-1-remediation.md) (H1, M1, M2, L1) against
[phase-1-review.md](./phase-1-review.md) and
[phase-1-remediation-verification.md](./phase-1-remediation-verification.md)
Base commit: `f5b9b45`; the remediation is still an uncommitted working tree on `main`
Reviewer role: verification only. No production code, tests, migrations, config, or existing
documentation was modified. Two temporary probe files were created under `tests/integration/`,
executed, and deleted, and `src/db/seed/exercises.ts` was temporarily reverted to its pre-fix
shape three times to measure test discrimination, then restored. Per-file MD5 comparison over
`src/`, `tests/`, `drizzle/`, `docs/` (138 files) confirms the tree is byte-identical to the state
I received; `src/db/seed/exercises.ts` re-hashes to `BB0155C38773C4EE74E865E699240936`, its
original value. This file is the only addition.

## 1. Final verdict

**PASS WITH DOCUMENTED LIMITATIONS — PHASE 1 CLOSED**

No BLOCKER, HIGH, or MEDIUM finding remains. MED-1 is genuinely fixed — I reproduced the
deployment-bricking failure against the pre-fix implementation and confirmed it is gone against
the current one. H1, M1, M2, and L1 are all verified fixed. The limitations that remain are
narrow, correctly disclosed, cannot corrupt or resurrect data, and cannot block a deploy.

## 2. MED-1 verification

**Fully fixed.** Verified in three independent ways rather than by reading the remediation's claims.

### 2.1 The mechanism, confirmed natively

Raw-SQL probe against PGlite running the real `drizzle/` migrations (`exercises` carries the
partial index `uq_exercises_active_name` on `(user_id, lower(name)) WHERE archived_at IS NULL`,
four CHECK constraints, one FK, and a UUID PK):

| Insert conflicting on… | `ON CONFLICT (id) DO NOTHING` | `ON CONFLICT DO NOTHING` |
|---|---|---|
| Active-name index, different id | **raises 23505** | absorbed, 0 rows |
| Active-name index, case-differing name (`ALPHA` vs `Alpha`) | — | absorbed, 0 rows |
| Primary key | absorbed | absorbed, 0 rows |
| Duplicate name where the existing row is **archived** | — | **inserts** (predicate excludes it) |
| `ck_exercises_load_step_kg_positive` (`load_step_kg = 0`) | — | **raises 23514** |
| `ck_exercises_equipment` (unknown equipment) | — | **raises 23514** |
| `NOT NULL` on `name` | — | **raises 23502** |
| FK to a nonexistent `user_id` | — | **raises 23503** |

The first row is MED-1's exact mechanism, reproduced from first principles. The last four are the
answer to "does dropping the arbiter swallow malformed catalog data?" — it does not. Arbiter-less
`DO NOTHING` is scoped to unique/exclusion violations only, exactly as the remediation claims, and
this is now measured rather than reasoned.

### 2.2 The brick, reproduced and then shown gone

A probe placed the database in the precise production-reachable state (pre-ledger DB → seeded
`bodyweight-plank` hard-deleted → a custom exercise named `Plank` created) and ran the seed three
times in a row:

```
PRE-FIX  (id-arbiter, no bootstrap):  runs = [THROW, THROW, THROW]   ledger after each = [0, 0, 0]
FIXED    (current working tree):      runs = [OK,    OK,    OK]      ledger after each = [40, 40, 40]
```

The pre-fix result is the permanent-failure signature: the ledger rolls back to zero with the
failed insert, so every subsequent run rediscovers the identical state. `pnpm db:seed` runs before
the app-deploy step (`deploy.yml` — migrate → seed → deploy, `concurrency: azure-deploy-production`,
`cancel-in-progress: false`), so this was a genuine permanent pipeline block. It is gone.

### 2.3 Both fixes are load-bearing — attribution matrix

I reverted each half of the fix independently and re-ran the 16-test seed suite:

| Seed implementation | Seed suite result | Which test fails |
|---|---|---|
| Current (arbiter-less + bootstrap) | **16/16 pass** | — |
| Arbiter reverted, bootstrap kept | 15/16 | future-catalog-slug collision |
| Bootstrap removed, arbiter-less kept | 15/16 | pre-ledger hard-delete resurrection |
| Both reverted (= remediation-1 state) | **13/16, 3 failed** | all three above |

This independently reproduces remediation 2's discrimination claim exactly ("13 passed, 3 failed").
It also shows the two changes are complementary, not redundant, as the report states: the bootstrap
alone masks the bootstrap-window collision but leaves *future* catalog additions able to abort the
whole transaction; the arbiter alone stops every abort but still resurrects pre-ledger deletions.

## 3. H1 final lifecycle assessment

### 3.1 Required checklist — all verified

Verified by inspection of [src/db/seed/exercises.ts](../../src/db/seed/exercises.ts) plus 12
purpose-written probes (all passing) and the 16-test seed suite.

| Requirement | Status | Evidence |
|---|---|---|
| Active-name collisions no longer abort seeding | ✅ | §2.1 row 1 vs 2; §2.2; suite tests 2 & 3 of the MED-1 trio |
| PK collisions remain safe | ✅ | §2.1; 6 consecutive seeds leave 40/40/105 unchanged |
| Malformed catalog data still fails, not swallowed | ✅ | §2.1 — 23514 ×2, 23502, 23503 all still raise. Suite's `still surfaces non-uniqueness violations` covers the FK case only; the CHECK/NOT NULL cases are covered by my probe |
| `.returning()` gates contribution creation | ✅ | Probe: 3 slugs unlogged, 1 name-blocked → blocked slug gets **0** contributions, the other two get 3 and 6. Also implicitly proven: a contribution insert for a skipped slug would raise 23503, and none does |
| Transaction behavior remains atomic | ✅ | Forced mid-transaction FK failure → 0 exercises, 0 ledger rows; retry after repair → 40/40 |
| Retries after collision are safe | ✅ | §2.2 (3 consecutive OK runs); every MED-1 test re-runs the seed and asserts a clean no-op |
| Ledger cannot stay permanently empty from a recoverable collision | ✅ | §2.2 — ledger reaches 40 on the first run despite the collision. Only a genuinely non-recoverable error (missing muscle group) rolls it back, and that heals on retry |
| User edits preserved | ✅ | Rename, contribution-weight edit, removed contribution, equipment/loadStepKg — all survive, pre- and post-bootstrap |
| Post-ledger hard deletions preserved | ✅ | Deleted rows stay deleted across 4 further seeds |
| Future catalog additions remain safe | ✅ | New slug inserts with full contributions; a name-colliding new slug is skipped **without blocking the others in the same batch** |
| Bootstrap does not resurrect deletions when ≥1 `is_seeded` row survives | ✅ | Probe: bootstrap is a **byte-identical no-op** — every `exercises` and `exercise_muscle_contributions` row, including `updated_at`, is unchanged |
| Bootstrap cannot repeatedly execute | ✅ | Structurally one-shot (`applied.size === 0` is false forever after, and nothing deletes ledger rows); confirmed by deleting a second exercise post-bootstrap and reseeding 4× — it stays deleted, ledger stays 40 |

Additional checks not on the list: multi-user isolation across the bootstrap (user A bootstrapped,
fresh user B still gets 40 exercises + 105 contributions); archived-seeded-row + name-reuse in both
pre- and post-ledger states (no throw, row stays archived); zero orphan contribution rows.

### 3.2 The three bootstrap premises — checked against the repository, not assumed

| Premise | Verdict | How I checked |
|---|---|---|
| `is_seeded = true` originates only from catalog seeding | **Confirmed** | Column is `.notNull().default(false)`; a tree-wide grep finds exactly one write — `src/db/seed/exercises.ts:100`. Absent from `createExerciseSchema`/`updateExerciseSchema`; `updateExercise` patches named fields only, never spreads input |
| The pre-ledger seed inserted the catalog atomically | **Confirmed with a caveat** | `git show f5b9b45:src/db/seed/exercises.ts` — a single `db.insert(exercises).values(rows)` over all 40 items. Caveat: it was **two** separately-committed statements (exercises, then contributions), not one transaction. See LOW-4 |
| The catalog is unchanged since the original seed | **Confirmed** | `git log -- src/db/seed/exerciseCatalog.ts` → one commit, `f5b9b45`. 40 slugs / 40 names, all unique (also case-insensitively — the seed suite would insert 39 rows instead of 40 if any pair collided) |

### 3.3 The documented remaining edge case — accurate, and acceptable

> If every historical seeded row was deleted before ledger introduction, the state is
> indistinguishable from a fresh user and the catalog may be seeded once.

**Accurate.** Reproduced directly: all 40 seeded rows deleted, ledger cleared, one custom exercise
holding a catalog name → the seed re-inserts 39 slugs, skips the name-colliding one, logs all 40,
does **not** throw, and the second run is a no-op.

**Not a correctness blocker.** It is one-shot, self-terminating, cannot fail, cannot resurrect
anything a second time, preserves the user's custom row, and requires the user to have hard-deleted
all 40 catalog exercises before this migration ships. The failure mode is a re-offered convenience
catalog, not data corruption. Accepting it as a documented limitation is the right call; the
alternative would require evidence the database does not contain.

## 4. Original finding closure

| # | Sev | Finding | Status |
|---|---|---|---|
| **H1** | HIGH | Seed resets user deletions on every deploy and can crash the pipeline | **VERIFIED FIXED** — all three consequences closed: removed contributions stay removed, hard-deleted seeded exercises stay deleted (pre- and post-ledger), and the name-collision abort is gone in both the bootstrap window and the permanent future-catalog case |
| **M1** | MEDIUM | Unarchive into an active name collision → HTTP 500 | **VERIFIED FIXED** — `setExerciseArchived` maps 23505 → `ExerciseNameConflictError` (correctly re-throwing `ExerciseNotFoundError` first so the catch can't mask it), and `archive/route.ts` maps that to `409 { error: "name_conflict" }`. `isPostgresErrorCode` walks `.cause`, which is where drizzle puts the SQLSTATE. Integration test asserts the domain error, not a raw driver error |
| **M2** | MEDIUM | `loadStepKg` not settable/editable in the UI | **VERIFIED FIXED** (LOW-2 residual) — controlled input, populated from the fetched exercise in edit mode, blank in create mode so the equipment default applies via `createExerciseSchema`'s transform. Three input-attribute mismatches remain open as LOW-2 |
| **L1** | LOW | Zod allowed `loadStepKg` ≤ 1000 against a `numeric(4,2)` column | **VERIFIED FIXED** — `MAX_LOAD_STEP_KG = 99.99` shared by domain, API, and UI. Unit tests reject 100 and accept 99.99; the replacement test discriminates (the old `.max(1000)` accepted 100) |

## 5. Remaining findings / limitations

### BLOCKER / HIGH / MEDIUM

**None.**

### LOW

- **LOW-4 (new, mine) — the bootstrap's atomicity premise is slightly stronger than what the
  pre-ledger seed guaranteed.** At `f5b9b45` the seed was two separately-committed statements
  (`insert exercises`, then `insert exercise_muscle_contributions`) with no wrapping transaction.
  So "≥ 1 `is_seeded` row" proves the *exercises* were applied, not that their contributions were.
  If a pre-ledger seed run had committed statement 1 and died before statement 2, and the very next
  seed run were the post-0002 one, the bootstrap would record all 40 slugs and the user would be
  left with 40 catalog exercises and **zero** contributions, permanently — I verified repeated
  seeds do not heal it (contributions stay 0 across 4 runs), where the old seed would have healed
  it on the next deploy.
  **Not reachable for this deployment.** Production currently serves the Phase 1 build
  (`/api/exercises` → 401, `/exercises` → 307, `/api/health` → ok — routes that exist only at
  `f5b9b45`), and `deploy.yml` runs `pnpm db:seed` *before* the app-deploy step, so the running
  build is proof that a pre-ledger seed run committed both statements. The next deploy applies
  `0002` before the new seed runs, leaving no window for an old-seed run to intervene. Recorded
  because the remediation's premise table states this more strongly than the code history supports,
  and because the recommended pre-deploy query counts exercises only. A version that would also
  catch it:
  ```sql
  select e.user_id, count(*) filter (where e.is_seeded) as seeded,
         count(c.exercise_id) as contribs
  from exercises e
  left join exercise_muscle_contributions c on c.exercise_id = e.id
  where e.is_seeded group by e.user_id;   -- expect 40 and 105
  ```
- **LOW-2 (carried, open)** — the new "Load step (kg)" input has `min="0"` (domain requires `> 0`,
  and the resulting 400 renders as the misleading muscle-contribution message) and `step="0.25"`
  (browser blocks the advertised `max` of 99.99 and any legal two-decimal value). Confirmed
  unchanged at [ExerciseForm.tsx:261-276](../../src/ui/exercises/ExerciseForm.tsx#L261-L276).
- **LOW-3 (carried, open)** — `handleArchiveToggle` still renders "Failed to update archive status."
  for every non-OK response, so M1's correct 409 is as opaque to the user as the old 500.
  `handleSubmit` already has the `res.status === 409` pattern to copy.
- **L2, L3, L4 (deferred, intentionally)** — verified untouched line by line: notes still send
  `undefined` when emptied ([ExerciseForm.tsx:109](../../src/ui/exercises/ExerciseForm.tsx#L109));
  `%`/`_` still unescaped in the ILIKE pattern
  ([service.ts:140](../../src/server/exercises/service.ts#L140)); `contributionsByExerciseId` still
  has no `ORDER BY`.

Neither LOW-2 nor LOW-3 is blocking: both are presentation-layer polish on paths that behave
correctly server-side, and both are naturally folded into whatever fixes L2.

### Environment limitations

- **No real PostgreSQL validation occurred.** `docker` and `psql` are both absent from this machine
  (`command -v` returns nothing for either). `pnpm db:migrate` and `pnpm db:seed` were **not** run
  against a real PostgreSQL server. Every result above comes from PGlite — real PostgreSQL compiled
  to WASM — running the actual `0000` + `0001` + `0002` migration files in order via
  `drizzle-orm/pglite/migrator` with the `citext` extension loaded. That is what makes the
  `ON CONFLICT` arbiter, partial-index, CHECK, and rollback results in §2.1 trustworthy, but it is
  not the production database.
- **Concurrency is reasoned about, not measured** — PGlite is single-connection. The pipeline
  serializes seed runs, and `recordApplied` keeps its own `onConflictDoNothing` guard.
- **Not verified here:** Playwright e2e, on-device iPhone UI, live production data state, and CI
  run history (no `gh` CLI). Production was probed read-only over HTTP only.

### Accepted / deferred

`movementPattern` UI, the service-layer pre-delete reference check (the FK RESTRICT backstop already
produces correct 409s), Playwright e2e for the exercise UI, the Phase 3 set-log 409, INFO-1
(ledger entries are permanent, so a slug removed and later reintroduced is never re-seeded — by
design, now documented in the seed's comments), INFO-2 (`exercise_catalog_seed_log.user_id` is
`ON DELETE NO ACTION`; worth `CASCADE` whenever a user-deletion path appears), INFO-3
(`numeric(4,2)` rounds `2.567` → `2.57`), INFO-6 (CI does not run `typecheck:sw`; pre-existing).

### Unrelated changes

**None found.** The diff is 10 modified files (+540/−47) plus four new files — the migration
`0002_add_exercise_catalog_seed_log.sql`, its snapshot, `src/db/schema/exerciseCatalogSeedLog.ts`,
and the append-only journal entry — and the five review documents. Every hunk traces to H1, M1, M2,
or L1. No dead code, no refactors, no weakened validation (the one validation change tightens a
bound). Migration `0002` is `CREATE TABLE` + one FK, purely additive: no `ALTER`, `DROP`, `UPDATE`,
or data migration, safe against a populated database. Snapshot chain intact
(`0000 → a9c53a3e → 0001 → 83e0dd4e → 0002`), journal append-only at `idx: 2`.

## 6. Verification results

All run locally against the current working tree — Windows 11, Node 24, pnpm 11.21.0, vitest 3.2.7.

| Check | Command | Result |
|---|---|---|
| Lint (incl. boundary rules) | `pnpm lint` | **pass** — exit 0, no output |
| Format | `pnpm format:check` | **pass** — "All matched files use Prettier code style!" |
| Typecheck (app) | `pnpm typecheck` | **pass** — exit 0 |
| Typecheck (service worker) | `pnpm typecheck:sw` | **pass** — exit 0 |
| Unit tests | `pnpm test:unit` | **pass — 58/58**, 6 files (clientIp 9, uuidv7 5, exerciseSchema 24, middleware 7, argon2 3, throttle 10) |
| Integration tests | `pnpm test:integration` | **pass — 41/41**, 3 files (exercises 17, seed 16, auth 8) |
| Production build | `pnpm build` | **pass** — standalone output, 15 routes, middleware 37 kB |
| Migration drift | `pnpm db:generate` | **"No schema changes, nothing to migrate"** — 6 tables detected; all 7 files under `drizzle/` MD5-identical before and after |
| Real PostgreSQL | `pnpm db:migrate` / `pnpm db:seed` | **not run — Docker and `psql` unavailable** |

Counts match remediation 2's claims exactly (58 unit, 41 integration, 16 in the seed suite, 15 build
routes).

**Independent probes.** 12 assertions-heavy probes in one temporary suite (arbiter semantics on the
real schema, fresh-seed baseline, bootstrap no-op at row level, bootstrap one-shot behavior,
renamed-seeded name holder, all-rows-deleted limitation, mid-run pre-ledger failure, catalog-growth
limitation and its recovery, multi-user isolation, `.returning()` gating, archived-name interaction,
rollback + retry) — **12/12 pass** — plus one brick-reproduction probe run against both the pre-fix
and fixed implementations, and three controlled reverts of `src/db/seed/exercises.ts` for the
discrimination matrix in §2.3. All probe files deleted; the seed file restored and MD5-verified.

**Production probe** (read-only HTTP): `/api/health` → `{"status":"ok"}`, `/api/exercises` → 401
unauthenticated, `/exercises` → 307 to login, `/login` → 200. Confirms the Phase 1 build is live,
which is the evidence used in LOW-4.

## 7. Final readiness

> **Is Phase 1 closed and may Phase 2 begin?**

**Yes.** Phase 1 is closed and Phase 2 may begin.

The one gate the previous verification left open — MED-1, the bootstrap seed permanently bricking
the deploy pipeline — is fixed, and I confirmed that by reproducing the failure and then its
absence, not by accepting the report. The remediation's own evidence claims now hold up under
independent re-measurement, including the discrimination matrix that the first remediation got
wrong. The architecture verdict from the original review stands unchanged: identity policy,
archive/delete semantics, the muscle-contribution model, `loadStepKg`/`baselineLoadKg` separation,
FK-referencing for templates, and the lint-enforced layer boundaries are all sound, and nothing in
Phase 1 forces Phase 2 rework.

Two non-blocking recommendations to carry forward:

1. **Before or during the next deploy**, run the strengthened pre-deploy query in LOW-4. With both
   fixes in place it is no longer a gate — it tells you whether the bootstrap branch will do
   anything at all, and it is the one check that would surface LOW-4 if it ever mattered.
2. **A human still needs to confirm** the migrate + seed run cleanly against the real database (or
   simply watch the deploy), and the iPhone smoke test for the "under a minute on a phone"
   acceptance criterion is still outstanding. Neither is a Phase 1 code defect; both are
   environment gaps this session cannot close.

LOW-2, LOW-3, and L2–L4 can ride along with Phase 2 or be batched later; none of them affects
correctness or lifecycle semantics.
