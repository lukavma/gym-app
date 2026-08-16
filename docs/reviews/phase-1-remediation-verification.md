# Phase 1 Remediation — Independent Verification

Date: 2026-08-16
Verifies: [phase-1-remediation.md](./phase-1-remediation.md) against [phase-1-review.md](./phase-1-review.md)
Base commit: `f5b9b45`; remediation is an uncommitted working tree on `main`
Reviewer role: verification only — no production code, tests, migrations, config, or docs were modified. Four temporary probe files were created under `tests/integration/`, executed, and deleted; `git status` and per-file checksums confirm the tree is byte-identical to the state I received.

> **Status note added after the fact (2026-08-16).** The findings and the verdict
> below are preserved as written — they are the record of what the repository
> looked like when this review ran. MED-1 and LOW-1 have since been remediated
> in [phase-1-remediation-2.md](./phase-1-remediation-2.md); see
> [§10 Post-report disposition](#10-post-report-disposition). Final Phase 1
> closure remains for an independent session to decide.

## 1. Executive verdict

**FAIL — ADDITIONAL REMEDIATION REQUIRED**

The remediation is substantially correct. The steady-state defect the review gated on is genuinely fixed: once a slug is in the ledger it is never reconsidered, and I could not construct any post-bootstrap scenario in which a deletion, edit, archive, or repeated deploy resurrects data. M1, M2, and L1 are fixed as prescribed. The migration is additive, drift-free, and safe.

One gating issue remains. The remediation discloses its bootstrap limitation as *"one exercise gets recreated exactly once."* That is incomplete. In the same bootstrap window there is a second, more serious outcome the report does not mention and its tests do not cover: if a pre-ledger hard-deleted seeded exercise's name is now held by an **active** exercise, the first post-remediation seed throws, the transaction rolls back the ledger to zero rows, and **every subsequent deploy fails identically, forever**, until production data is repaired by hand. This is precisely the third consequence the original review listed under H1 — the one it called "the pipeline is bricked by a legitimate user action" — and it is still live in the exact database state production is in right now.

It is a one-line fix, and I verified the fix works. Details in [MED-1](#med-1).

## 2. Verification scope

Inspected in full:

- [src/db/seed/exercises.ts](../../src/db/seed/exercises.ts), [seed/index.ts](../../src/db/seed/index.ts), [seed/run.ts](../../src/db/seed/run.ts), [seed/exerciseCatalog.ts](../../src/db/seed/exerciseCatalog.ts)
- [src/db/schema/exerciseCatalogSeedLog.ts](../../src/db/schema/exerciseCatalogSeedLog.ts), [schema/index.ts](../../src/db/schema/index.ts), [schema/exercises.ts](../../src/db/schema/exercises.ts), [schema/exerciseMuscleContributions.ts](../../src/db/schema/exerciseMuscleContributions.ts)
- [drizzle/0002_add_exercise_catalog_seed_log.sql](../../drizzle/0002_add_exercise_catalog_seed_log.sql), [drizzle/meta/0002_snapshot.json](../../drizzle/meta/0002_snapshot.json), [drizzle/meta/_journal.json](../../drizzle/meta/_journal.json)
- [src/server/exercises/service.ts](../../src/server/exercises/service.ts), all three exercise API routes, [src/domain/exercises/schema.ts](../../src/domain/exercises/schema.ts)
- [src/ui/exercises/ExerciseForm.tsx](../../src/ui/exercises/ExerciseForm.tsx), [ExerciseLibrary.tsx](../../src/ui/exercises/ExerciseLibrary.tsx)
- All modified test files, [tests/integration/testDb.ts](../../tests/integration/testDb.ts), both CI/CD workflows, `git diff` in full, and `git log` for catalog/migration history

Executed: `pnpm lint`, `format:check`, `typecheck`, `typecheck:sw`, `test:unit`, `test:integration`, `build`, `db:generate` (drift check), plus 31 purpose-written probe assertions across four temporary PGlite suites covering the seed lifecycle, candidate remediations, pre-remediation behavior discrimination, and constraint-check ordering.

## 3. Original finding closure table

| # | Sev | Original problem | Remediation approach | Verification evidence | Status |
|---|---|---|---|---|---|
| **H1** | HIGH | Seed re-derives the whole catalog every run; removed contributions and hard-deleted seeded exercises resurrect on every deploy, and a name collision bricks the pipeline | `exercise_catalog_seed_log` ledger keyed `(user_id, slug)`; slugs already logged are skipped entirely; contributions seeded only for rows `.returning()` proves were inserted; whole per-user seed in one transaction | Probes P1–P3, P7, P9–P13 confirm the steady-state model is correct and complete; D1/D2 confirm the two key new tests genuinely fail against pre-remediation behavior. **But** P4/P5 show the pipeline-brick consequence survives in the bootstrap window and is undisclosed | **PARTIALLY FIXED** |
| **M1** | MEDIUM | Unarchive into an active name collision → raw 23505 → HTTP 500 | `setExerciseArchived` gains the same try/catch as create/update; archive route maps `ExerciseNameConflictError` → 409 | Integration test passes; probe D4 confirms the pre-remediation path throws a raw driver error and the new test would fail against it. Route mapping verified by inspection (no route-level tests exist in this repo) | **VERIFIED FIXED** |
| **M2** | MEDIUM | `loadStepKg` not settable/editable in the UI | "Load step (kg)" number input; edit mode populates from the fetched exercise, create mode blank → equipment default via `createExerciseSchema`'s transform | Traced end to end: the transform at [schema.ts:103](../../src/domain/exercises/schema.ts#L103) supplies the equipment default when omitted; `updateExercise` applies `patch.loadStepKg`; build passes. Three constraint mismatches on the new input — see [LOW-2](#low-2) | **VERIFIED FIXED** (with LOW residual) |
| **L1** | LOW | Zod allowed `loadStepKg` ≤ 1000 against a `numeric(4,2)` column → 500 on overflow for [100, 1000] | `MAX_LOAD_STEP_KG = 99.99` as single source of truth for domain, API, and UI | Probe D7: 99.99 persists exactly; a raw insert of 100 into the column does throw, confirming the old ceiling was a real 500. Probe D5 confirms the replacement test discriminates (old schema accepted 100) | **VERIFIED FIXED** |

## 4. H1 deep-dive

### 4.1 Reconstructed state machine

Per `(user, slug)` the seed is a two-state machine — `UNLOGGED → LOGGED`, one-way, with no transition back:

```
UNLOGGED  --(seed run)-->  LOGGED  --(any seed run)-->  LOGGED   [no-op forever]
   |
   +-- insert exercise row (arbiter: id, DO NOTHING)
   +-- insert contributions ONLY if .returning() proved the row was inserted
   +-- write ledger row for the slug regardless of whether the row was inserted
   (all three inside one transaction; failure ⇒ nothing happens, state stays UNLOGGED)
```

The design decision that makes this work is step 3: the slug is logged even when the exercise row already existed. That is what converts a pre-ledger database into a logged one without touching any row. The corollary is that `LOGGED` means "this slug has been offered to this user," not "this row exists" — which is exactly the semantics the fix needs, and it is correctly implemented.

### 4.2 Lifecycle probe results

All executed against the real generated migrations via the PGlite harness. `preRemediationSeed()` in the probes is a verbatim copy of the seed at `f5b9b45`, so "pre-ledger DB" states are faithful.

| # | Scenario | Result |
|---|---|---|
| 1 | Fresh DB + first seed | 40 exercises, 40 ledger rows, 105 contributions ✓ |
| 2 | Pre-remediation DB + migration + first post-remediation seed (rows intact) | 0 rows inserted, ledger backfilled to 40, a pre-ledger rename and a pre-ledger contribution deletion both survive ✓ |
| 3 | Seed re-run ×5 | Counts identical, no duplicates ✓ |
| 4 | Post-ledger hard delete | Stays deleted across repeated seeds ✓ |
| 5 | Deploy/seed after that deletion | No-op ✓ |
| 6/7 | User edits a seeded exercise (name, equipment, loadStepKg, contribution weight) then reseeds | All edits survive; slug is skipped at row level ✓ |
| 8 | Archived seeded exercise + reseed (post-ledger and pre-ledger) | Row untouched, still archived, no duplicate ✓ |
| 9 | Catalog grows after the ledger exists | New slug inserted with its contributions; existing slugs untouched ✓ |
| 10 | Slug removed from the catalog | Ledger row persists (stale but harmless) ✓ |
| 11 | Slug later reintroduced | **Never re-seeded** — stale ledger entry suppresses it permanently (by design; see [INFO-1](#info-1)) |
| 12 | Upstream field change for an existing slug | Never propagated to existing users (by design) |
| 13 | Failure mid-transaction (invalid contribution FK) | Exercise rows **and** ledger both rolled back; counts unchanged ✓ |
| 14 | Retry after failure | Clean, no partial state ✓ |
| 15 | Ledger/exercise atomicity | Confirmed — a ledger row can never exist without its insert attempt having committed ✓ |
| 16 | Fresh-DB vs migrated-DB equivalence | Identical end state **except** for hard-deleted-pre-ledger rows (the disclosed caveat) ✓ |
| 17 | Stale ledger entries | Cannot cause resurrection or duplication; only suppression (scenario 11) ✓ |
| 18 | Duplicate/conflicting seed rows | Composite PK rejects duplicates; `select … group by slug having count(*) > 1` returns 0 ✓ |
| 19 | Rapid repeated execution | No corruption ✓ |
| 20 | Migration additive/safe | `CREATE TABLE` + one FK only; no existing table touched ✓ |

### 4.3 The disclosed bootstrap limitation — assessed

> "A seeded exercise that a user hard-deleted before the ledger migration may resurrect exactly once during the first post-remediation seed."

| Claim | Verdict | Evidence |
|---|---|---|
| Technically correct | **Yes** | Probe P3: pre-ledger DB, Plank hard-deleted, first post-remediation seed re-inserts it with its 2 contributions |
| Limited to one occurrence | **Yes** | Same probe: deleting it again and seeding 3 more times leaves it gone |
| No additional resurrection scenarios once the ledger exists | **Yes** | Probes 4–12 above found none; the only way back into `UNLOGGED` is deleting ledger rows, which nothing in the codebase does |
| No reasonable migration-time solution available from existing data | **No — the claim is wrong** | See below |
| Accurately documented | **No — materially incomplete** | The resurrection is documented; the pipeline-brick outcome in the same window is not. See [MED-1](#med-1) |

**On "no way to avoid this without … manually editing production data":** the database already carries sufficient evidence. `exercises.is_seeded` is written only by the seed — probe P6 confirms an API-created exercise always gets `is_seeded = false`, and neither `createExercise` nor `updateExercise` can set it. `git log` confirms `exerciseCatalog.ts` was introduced in `f5b9b45` and has never been modified, and the pre-remediation seed inserted the entire catalog in a single statement. Therefore *"user has ≥ 1 `is_seeded` row but zero ledger rows"* uniquely identifies a pre-ledger user to whom the full current catalog was already applied (probes R2/R3 confirm it separates that case cleanly from a genuinely fresh user). A bootstrap branch that logs the whole catalog without inserting anything in that case would have eliminated both the resurrection and the collision risk, in code, with no production data edits. This does not have to be the chosen fix — but the report should not assert that no option existed.

## 5. New findings

<a id="med-1"></a>
### MED-1 — MEDIUM — Bootstrap seed can permanently brick the deploy pipeline; undisclosed and untested

**Affected:** [src/db/seed/exercises.ts:68-72](../../src/db/seed/exercises.ts#L68-L72), [docs/reviews/phase-1-remediation.md](./phase-1-remediation.md) (H1 disclosure), [tests/integration/seed.integration.test.ts](../../tests/integration/seed.integration.test.ts)

**Behavior.** The exercises insert uses `onConflictDoNothing({ target: exercises.id })`. That arbiter absorbs a primary-key collision only. If a slug is `UNLOGGED` *and* its deterministic-id row no longer exists *and* an **active** exercise holds that name, the insert violates the partial index `uq_exercises_active_name`, which is not the arbiter, so Postgres raises 23505. The seed has no error handling, so `pnpm db:seed` exits 1. Because the whole per-user seed is one transaction, the ledger writes roll back to zero — so the *next* run repeats the identical failure. There is no self-healing path.

**Reproduction (probe P4, PGlite + real migrations):** pre-remediation seed → hard-delete seeded `bodyweight-plank` → `createExercise(name: "Plank")` → run the remediated seed.

```
P4 first post-ledger seed threw: true   (insert into "exercises" … on conflict ("id") do nothing)
P4 ledger rows written after failure: 0
P4 retry threw again: true
P4 ledger rows after retry: 0
```

Probe P5 reproduces the same permanent failure when the freed name is held by a *renamed* seeded exercise rather than a custom one.

**Scope, honestly bounded.** Probe A4 established that `ON CONFLICT (id) DO NOTHING` short-circuits *before* the name index is checked, so the far more likely archive-then-reuse-the-name workflow is safe (probes A1–A3: no throw, pre- or post-ledger). The trigger requires a **hard delete** specifically. It fails closed — no bad deploy, no data loss — and it is confined to the bootstrap window: after one successful seed, every current catalog slug is `LOGGED` and the insert never runs again.

**Impact.** If production is in this state, the next deploy fails and so does every deploy after it, including hotfixes, until someone hand-edits the production database. The original review rated exactly this consequence as part of a HIGH. The remediation report claims H1 "FIXED," and its test #3 (`lets a custom exercise reuse a hard-deleted seeded name without breaking reseeding`) reads as if this case is covered — but that test seeds *first*, so the slug is already logged and the seed is a no-op. It cannot fail on the path that matters.

**Recommended remediation** (any one; the first is one word and I verified it):

1. Drop the arbiter: `.onConflictDoNothing()`. Probe R1 confirms arbiter-less `DO NOTHING` absorbs the partial name index too — no throw, 0 rows inserted, and the slug still gets logged, so the state machine and every current test are unaffected.
2. Add the `is_seeded` bootstrap branch from §4.3, which prevents the collision *and* the disclosed resurrection.
3. At minimum: add an integration test that seeds from a pre-ledger state with the name taken, and document this outcome alongside the resurrection caveat.

**Before the next deploy**, this is decidable with one query — if every user's seeded-row count equals the catalog size, nothing was hard-deleted and there is zero risk:

```sql
select user_id, count(*) from exercises where is_seeded = true group by user_id;  -- expect 40
```

Note the same collision shape exists permanently for *future* catalog additions: probe P8 shows that when a newly added catalog item's name collides with an existing custom exercise, the transaction aborts, and every other new item in the same run is blocked too, on every deploy. Fix 1 resolves that as well.

<a id="low-1"></a>
### LOW-1 — Remediation report overstates its own evidence

**Affected:** [docs/reviews/phase-1-remediation.md](./phase-1-remediation.md) (H1 test table, "Unresolved issues")

Two of the five rows credited to H1 pass identically against pre-remediation code, so they are regression guards rather than proof: probe D3 shows the old seed already preserved an edited contribution weight (contributions used `onConflictDoNothing` on the composite key), and the pre-existing idempotency test always passed. A third (test #3) does not exercise the path it appears to cover, per MED-1. The genuinely discriminating tests are #1 and #2 — probes D1/D2 confirm the old seed resurrects both a removed contribution and a hard-deleted exercise. Combined with the incorrect "no way to avoid this" claim in §4.3, the report reads as better-evidenced than it is. The underlying code is fine; the reporting is what needs correcting.

<a id="low-2"></a>
### LOW-2 — New "Load step (kg)" input has three constraint mismatches

**Affected:** [src/ui/exercises/ExerciseForm.tsx:264-277](../../src/ui/exercises/ExerciseForm.tsx#L264-L277)

1. `min="0"` admits `0`, which the domain rejects (`.gt(0)`). The resulting 400 is rendered by the generic handler as *"Please check the muscle contributions: at least one primary is required"* — actively misleading. Should be `min="0.25"` (or any positive value).
2. `step="0.25"` with `min="0"` makes valid values multiples of 0.25, so the browser blocks submission of `99.99` — the very `max` the input advertises — and of any legal two-decimal value like `1.13`. Harmless for present data (every catalog default is a multiple of 0.25), but the input contradicts itself. `step="any"` or `step="0.01"` resolves it.
3. In edit mode, clearing the field sends `undefined`, which `updateExerciseSchema` reads as "no change," so the value silently persists despite the "Equipment default" placeholder promising otherwise. This is the same shape as deferred L2 (notes cannot be cleared) but newly introduced here; worth folding into whatever fixes L2.

<a id="low-3"></a>
### LOW-3 — M1's 409 is still invisible to the user

**Affected:** [src/ui/exercises/ExerciseForm.tsx:144-163](../../src/ui/exercises/ExerciseForm.tsx#L144-L163)

`handleArchiveToggle` renders *"Failed to update archive status."* for every non-OK response, so unarchiving into a name collision now returns a correct 409 that the UI reports exactly as generically as the old 500. The review's prescribed fix (route mapping) is complete and the server behavior is right; this is the leftover half. `handleSubmit` already has the pattern to copy — a `res.status === 409` branch with the name-conflict message.

<a id="info-1"></a>
### INFO findings

- **INFO-1 — Ledger entries are permanent, including for slugs the catalog no longer contains.** Probes P10/P11: a slug removed from the catalog leaves a stale ledger row, and if reintroduced it is never seeded again for existing users; upstream field changes to an existing slug never propagate. Both follow from the design and are almost certainly intended, but neither the code comments nor the remediation doc state it, and it will surprise whoever curates the catalog in a later phase.
- **INFO-2 — `exercise_catalog_seed_log.user_id` is `ON DELETE NO ACTION`.** Probe P16: ledger rows block deleting a user even after all their exercises are gone. No user-deletion path exists today; worth `ON DELETE CASCADE` whenever one is added.
- **INFO-3 — `numeric(4,2)` silently rounds.** Probe D6: `2.567` now passes validation and stores as `2.57`. Not the 500 L1 described; noting the residual only.
- **INFO-4 — Concurrent seed runs are not empirically testable here** (PGlite is single-connection). By inspection the pipeline serializes them (`concurrency: azure-deploy-production, cancel-in-progress: false`), and under READ COMMITTED a concurrent run would block on the PK and then no-op. No corruption path identified, but this is reasoning, not measurement.
- **INFO-5 — No route-level tests exist**, so the archive route's 409 mapping and the UI wiring for M2 are verified by inspection and build only.
- **INFO-6 — CI does not run `typecheck:sw`** (pre-existing; `ci.yml` runs lint, format, typecheck, unit, integration, build). Not introduced by this remediation.

## 6. Deferred findings

Confirmed untouched and still intentionally deferred — verified line by line against the diff:

| Finding | State |
|---|---|
| L2 — notes can't be cleared from the edit form | Unchanged: [ExerciseForm.tsx:109](../../src/ui/exercises/ExerciseForm.tsx#L109) still sends `undefined` for empty notes. (LOW-2.3 adds the same shape for `loadStepKg`) |
| L3 — `%`/`_` unescaped in the ILIKE search pattern | Unchanged: [service.ts:140](../../src/server/exercises/service.ts#L140) |
| L4 — contributions returned without ORDER BY | Unchanged: `contributionsByExerciseId` has no `orderBy` |
| `movementPattern` UI | Still API-only |
| Service-layer pre-delete reference check | Still absent; FK RESTRICT backstop unchanged |
| Playwright e2e for the exercise UI | Still deferred to Phase 3 |
| Phase 3 set-log 409 | Still deferred |

No deferred finding was accidentally altered, and nothing outside H1/M1/M2/L1 was modified. The diff is tight: 10 files, +270/−46, every hunk traceable to one of the four findings. No dead code, no unrelated refactors, no weakened validation — the only validation change tightens a bound. The one new abstraction (the ledger table) is proportionate to the problem.

## 7. Verification results

All commands run locally against the remediated working tree, Windows 11 / Node 24 / pnpm 11.21.0:

| Check | Command | Result |
|---|---|---|
| Lint (incl. boundary rules) | `pnpm lint` | **pass** (exit 0, no output) |
| Format | `pnpm format:check` | **pass** — "All matched files use Prettier code style!" |
| Typecheck (app) | `pnpm typecheck` | **pass** (exit 0) |
| Typecheck (service worker) | `pnpm typecheck:sw` | **pass** (exit 0) |
| Unit tests | `pnpm test:unit` | **pass — 58/58**, 6 files (matches the report's claim) |
| Integration tests | `pnpm test:integration` | **pass — 35/35**, 3 files (exercises 17, seed 10, auth 8) |
| Production build | `pnpm build` | **pass** — standalone output, 15 routes |
| Migration drift | `DATABASE_URL=… pnpm db:generate` | **"No schema changes, nothing to migrate"**; all 7 files in `drizzle/` byte-identical afterwards (md5-verified) |

**Migration review.** `0002_add_exercise_catalog_seed_log.sql` is `CREATE TABLE` + one FK — purely additive, no `ALTER`, `DROP`, `UPDATE`, or data migration; safe against a populated production database. Composite PK `(user_id, slug)` matches the Drizzle definition exactly and is the correct uniqueness grain; `seeded_at timestamptz DEFAULT now() NOT NULL` populates correctly (probe P15). The `WHERE user_id = ?` lookup is served by the PK's leading column, so no extra index is needed. Snapshot chain is intact (`0002.prevId = 0001.id = 83e0dd4e…`), journal entry `idx: 2` is append-only with a timestamp after `0001`, and the drift check confirms schema and generated SQL agree. Deployment ordering (migrate → seed → deploy, seed failure aborts before deploy) is unchanged and still correct.

**Probes.** 31 assertions across four temporary suites (seed lifecycle, candidate remediations, pre-remediation discrimination, constraint ordering); all created, run, and deleted. Post-cleanup `git status` matches the pre-verification state exactly.

## 8. Environment limitations

- **No Docker and no real PostgreSQL.** `docker` and `psql` are both absent from this machine. **No production-PostgreSQL verification occurred.** `pnpm db:migrate` and `pnpm db:seed` were not run against a real server — same limitation the original review and the remediation report disclosed.
- **PGlite substitute coverage is meaningful.** [testDb.ts](../../tests/integration/testDb.ts) runs `drizzle-orm/pglite/migrator` over the real `drizzle/` folder, so every test and probe above executed against the actual generated `0000`+`0001`+`0002` SQL, in order, with the `citext` extension loaded — not against a schema push. PGlite is real PostgreSQL compiled to WASM, so partial unique indexes, `ON CONFLICT` arbiter semantics, `numeric(4,2)` overflow and rounding, CHECK constraints, FK RESTRICT/CASCADE, and transactional rollback all behave natively. That is what makes MED-1's reproduction and R1's fix verification trustworthy. It cannot substitute for: multi-connection concurrency, real network/permission failures, or the actual Azure deploy path.
- **Not verified:** Playwright e2e, on-device iPhone UI, live production database state, and whether the last deploy actually succeeded (no `gh` CLI here).

## 9. Final Phase 1 readiness decision

> **Is Phase 1 safe to close and is the repository ready to proceed to Phase 2?**

**Not yet — but it is one small change away.**

The architecture verdict from the original review stands unchanged and is reconfirmed: the exercise model, lifecycle semantics, schema, boundaries, and identity policy are sound, and nothing here forces Phase 2 rework. The ledger is the right mechanism, correctly implemented, correctly atomic, and correctly per-user. M1, M2, and L1 are properly closed with tests that genuinely discriminate against the old behavior.

What blocks closure is narrow and concrete: the bootstrap collision in MED-1 is a live risk against the current production database on the very next deploy, its consequence is a permanently failing pipeline, and the remediation report states H1 is fixed without disclosing it. Phase 2 opens a heavier deploy cadence, which is exactly when this would surface.

To close Phase 1:

1. **Required —** apply MED-1 fix 1 (`.onConflictDoNothing()` without the arbiter) or fix 2 (the `is_seeded` bootstrap branch), plus a pre-ledger-state regression test. Fix 2 additionally removes the disclosed one-time resurrection.
2. **Required —** correct the H1 section of the remediation report: document the collision outcome, and drop or qualify the "no way to avoid this" claim (LOW-1).
3. **Recommended before the next deploy —** run the `is_seeded` count query in §MED-1 against production. If every user's count equals the catalog size, the risk is empirically zero and the fix becomes purely preventive.
4. **Optional —** LOW-2 and LOW-3 are small, contained, and can ride along or be deferred with L2–L4.

None of this is architectural. With item 1 done and the suite re-run, Phase 1 closes and Phase 2 can begin.

## 10. Post-report disposition

Added after this review was delivered. Nothing above was altered; MED-1 was a
real finding discovered during verification and this section records what was
done about it, not a retraction.

| Finding | Disposition |
|---|---|
| **MED-1** — bootstrap seed can brick the deploy pipeline | **Fixed** in [phase-1-remediation-2.md](./phase-1-remediation-2.md) via the arbiter-less `onConflictDoNothing()` (fix 1 of the three recommended), plus the `is_seeded` bootstrap branch (fix 2), plus the regression tests (fix 3). All three were applied, not just one |
| **LOW-1** — remediation report overstates its own evidence | **Fixed.** `phase-1-remediation.md` H1 corrected; the "no way to avoid this" claim retracted; the non-discriminating tests labelled as guards. New tests were run against the pre-fix implementation and three confirmed to fail |
| **LOW-2** — load-step input constraint mismatches | Open, deferred by scope |
| **LOW-3** — M1's 409 invisible in the UI | Open, deferred by scope |
| **INFO-1 … INFO-6** | Open; INFO-1 (permanent ledger entries) is now documented in the seed's comments and in remediation 2 |

Item 3 of §9 (`select user_id, count(*) from exercises where is_seeded = true
group by user_id` before the next deploy) is still worth running. With both
fixes in place it is no longer a gate — the seed cannot fail on this path — but
it tells you whether the bootstrap branch will do anything at all.

The environment limitations in §8 are unchanged: Docker and `psql` remain
unavailable, so no production-PostgreSQL verification has occurred.
