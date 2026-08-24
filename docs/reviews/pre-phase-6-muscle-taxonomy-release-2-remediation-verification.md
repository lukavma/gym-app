# Pre-Phase-6 Muscle Taxonomy v2 — Release 2 Concurrency Remediation Verification

Date: 2026-08-24
Reviewer: Claude Opus 5 — targeted independent verification of the concurrency remediation only.
Gate on entry: READY FOR TARGETED REMEDIATION VERIFICATION.

Scope, as instructed: verify the six remediation properties listed below and nothing else. This is **not** a repeat of the Release 2 architecture or implementation review (`docs/reviews/pre-phase-6-muscle-taxonomy-release-2-review.md` §2 stands unchanged); no E2E run, no re-audit of the mapping rationale, rollout, or documents beyond what the six properties require.

Inputs read: `docs/reviews/pre-phase-6-muscle-taxonomy-release-2-review.md`; `docs/reviews/pre-phase-6-muscle-taxonomy-release-2-remediation.md`; the full current `src/db/seed/reconcileContributions.ts` diffed against its pre-remediation state; `tests/integration/reconcileContributionsConcurrency.integration.test.ts` (new); the new `affected-row counting (PGlite)` block in `tests/integration/reconcileContributions.integration.test.ts`; the tracked-file diffs for `src/db/seed/{exerciseCatalog,index}.ts`, `tests/unit/exerciseCatalog.test.ts`, `tests/e2e/muscleTaxonomyV2.spec.ts`, `ADR-010`; `vitest.integration.config.ts`.

Constraints honoured: no implementation file, test, ADR or user-owned file modified; no commit, push, deploy; no production access. All database work ran on the local Docker PostgreSQL 16 instance against two disposable databases, both dropped. The dev `gymapp` database was read but never written. The only repository write is this report.

**The original review's race probe was re-run from my own harness**, not delegated to the shipped regression test — and deliberately through a *different* interception mechanism (a `pool.connect` wrapper) from the one the shipped test uses (`pg.Client.prototype.query` patching), so the two are independent.

---

## 1. Summary

All six required properties verify. The remediation is exactly the review's §5 correction and nothing more: a textual diff against the pre-remediation file shows **only** the `notExists`/`alias` imports, a `PortableUpdateResult` interface, the rewritten header comment, the `targetProbe` alias, the `notExists(...)` guard moved into the `UPDATE`'s own `.where()`, and the `moved === 1 ? updated++ : conflicts++` branch. Mapping table, counter set, summary construction, reporting contract, transaction scope, seed order, and every classification path are byte-identical.

The previously reproduced schedule that raised `SQLSTATE 23505` and aborted `runSeed` now resolves cleanly, classifies the pair as a conflict, and lets the catalog seed run to completion (93 exercises, versus 1 before the fix). The `updated` counter is now driven by the real affected-row count on both drivers, and I confirmed the PGlite fallback is genuinely load-bearing rather than incidental.

One LOW observation, no action required: a *different* concurrent save shape — a reclassify that removes the `back` row inside the same window — is now reported as a conflict that is **not** sticky and leaves no `back` row behind. That is an over-report in the safe direction (the dangerous direction, a surviving `back` row going uncounted, is fully closed), but it makes `conflicts` an upper bound rather than an exact count, and the code comment's "Sticky" claim does not hold for that sub-case.

**Verdict: READY FOR RELEASE 2 DEPLOYMENT CLOSEOUT.**

---

## 2. Property-by-property verification

### 2.1 The emitted `UPDATE` contains the target-leaf `NOT EXISTS` predicate atomically ✓

Captured at the driver boundary during a real `reconcileContributions` run against PostgreSQL 16 — this is the statement actually sent to the server, not a `toSQL()` rendering or a source reading:

```sql
update "exercise_muscle_contributions"
   set "muscle_group_id" = $1, "updated_at" = $2
 where ("exercise_muscle_contributions"."exercise_id" = $3
    and "exercise_muscle_contributions"."muscle_group_id" = $4
    and not exists (select "exercise_id"
                      from "exercise_muscle_contributions" "target_probe"
                     where ("target_probe"."exercise_id" = $5
                        and "target_probe"."muscle_group_id" = $6)))
```

- `NOT EXISTS` is inside the same statement's `WHERE`, not a preceding query ✓
- the subquery self-references the same table under its own alias (`target_probe`) ✓
- the subquery is filtered on both `exercise_id` **and** the target slug ✓
- `SET` touches only `muscle_group_id` and `updated_at` — role and weight are still never written ✓
- exactly **1** `UPDATE` statement issued for the qualifying pair; the three preliminary classification `SELECT`s are still present and unchanged ✓

This is ADR-010 step 2's literal mechanism, so the review's M-3 (deviation from a binding document without amending it) is closed by conformance rather than by documentation.

### 2.2 The previously reproduced schedule no longer throws 23505 or aborts `runSeed` ✓

Re-ran the original review's **Probe A** verbatim: the real, unmodified `reconcileContributions`, with a Release-1 editor save (`UPDATE exercises` → `DELETE` all contributions → `INSERT` `back` primary 1.00 + `upper_back` secondary 0.50) committing on a separate connection strictly between the target-check `SELECT` and the `UPDATE`.

| | Before remediation (review §3) | Now |
|---|---|---|
| Outcome | `THREW 23505` on `exercise_muscle_contributions_exercise_id_muscle_group_id_pk` | **RESOLVED (no throw)** |
| Summary | `null` (transaction rolled back) | `updated=0 noop=13 conflicts=1` |
| Transaction | `rollback` issued | `commit` issued, **no rollback** |
| Row state | `back/primary/1.00 + upper_back/secondary/0.50` | `back/primary/1.00 + upper_back/secondary/0.50` — both rows untouched, neither merged, dropped, nor double-written |
| Warning | none (run aborted) | `::warning::taxonomy-v2 reconciliation conflict: user=… slug=barbell-row exercise=… target=upper_back` |

The conflict here is necessarily reported by the new affected-row branch, not by the preliminary `SELECT`: interception fires on the `UPDATE`'s statement text, which is only ever built after the target-check `SELECT` has returned empty (otherwise the loop `continue`s and emits no `UPDATE` at all).

Also re-ran the original **Probe C** (concurrent save still *open* when the `UPDATE` starts, committing while it blocks). Before remediation this produced a silent `updated=1 conflicts=0` while a direct `back` row survived — the review's M-2. Now: `updated=0 conflicts=1`, warning emitted, `back` row correctly reported. No throw.

No `SQLSTATE 23505` appeared in any probe.

### 2.3 Catalog seeding continues after the raced row ✓

Re-ran the original **Probe A2** — the same forced race, driven through the public `runSeed` entry point:

```
outcome: runSeed RESOLVED
exercises after runSeed: 93 (seeded 93) — catalog seed step RAN past the raced row
raced exercise state: back/primary/1.00 + upper_back/secondary/0.50
direct back rows in DB: 1
```

Before the remediation this run rejected and left **1** exercise, because `seedExerciseCatalogForAllUsers` never executed. The whole seed now completes, so `pnpm db:seed` exits 0 and the deploy's `Deploy to Azure App Service` step is reached. ADR-010's "conflicts never fail the deploy" guarantee now holds for this path.

### 2.4 `updated` is driven by `rowCount` on PostgreSQL and `affectedRows` on PGlite ✓

**PostgreSQL.** Normal unraced move: `updated=1 conflicts=0`, and the row is verified to have landed on the target leaf (`upper_back/primary/1.00`). Raced move: `updated=0 conflicts=1` with zero rows moved. The counter tracks the statement, not the classification.

**PGlite.** I first observed the raw driver result the implementation depends on:

```
PGlite update result: keys=["rows","fields","affectedRows"]  rowCount=undefined  affectedRows=1
```

`rowCount` is genuinely undefined on PGlite, so `moved = rowCount ?? affectedRows ?? 0` can only yield a non-zero value through the `affectedRows` fallback. Running the shipped `reconcileContributions` on PGlite then returned `updated=1 conflicts=0` with the row correctly on the leaf — which is unreachable if the code read `rowCount` alone (`undefined === 1` is false, and the pair would have been miscounted as a conflict). The fallback is load-bearing and correct on both drivers.

The new `affected-row counting (PGlite)` block's first test is a real proof of this for the same reason. Its second test ("target leaf already present") exercises the *preliminary* conflict path, which never reaches the `UPDATE` — a valid regression, though not actually about affected-row counting despite sitting in that block. No action.

### 2.5 The raced row reports `updated=0` and becomes a sticky conflict on the next run ✓

Immediately after the forced race, a second **unraced** run against the state it left behind:

```
second summary: updated=0 noop=13 conflicts=1 customDirectBack=0 seededDirectBackUnmapped=0
::warning::taxonomy-v2 reconciliation conflict: … slug=barbell-row … target=upper_back   (identical line)
state after second: back/primary/1.00 + upper_back/secondary/0.50   (unchanged)
invariant: back rows on seeded mapped ids = 1, conflicts = 1
```

Sticky, re-emitted identically, predicate never consumed, rows untouched — and the M-2 invariant the review asked to be restored (`back` rows remaining among mapped ids ≡ `conflicts`) holds exactly in this case. The shipped test's scenario "5" asserts the same thing and passes.

### 2.6 No mappings, counters, transaction scope, seed order, or unrelated behaviour changed ✓

**Textual diff.** `src/db/seed/reconcileContributions.ts` is untracked, so I reconstructed its pre-remediation content from the version read in full during the original review and diffed. Every hunk is accounted for by the remediation; nothing else differs:

1. `import { and, eq, notExists }` + `import { alias } from "drizzle-orm/pg-core"`
2. new `PortableUpdateResult` interface
3. header comment rewritten (including an honest correction of the old "exact snapshot" claim to state that READ COMMITTED gives each statement its own snapshot)
4. `const targetProbe = alias(exerciseMuscleContributions, "target_probe")`
5. the `notExists(...)` guard added to the `UPDATE`'s `.where()`; `moved` computed portably; `updated++` replaced by `moved === 1 ? updated++ : conflicts++ (+ identical warning line)`

Unchanged byte-for-byte: `RECONCILED_BACK_SLUGS` (all 14 rows), the `ReconciliationSummary` shape, `githubWarning`, `findCatalogSlugForExerciseId`, all three classification `SELECT`s, both `noop` paths, the synchronous conflict path and its warning string, the M-2 unmapped scan, the `customDirectBack` scan, the summary construction, and the `reconcileContributions` reporting entry point (both console lines, `::warning::` ordering, per-row fields).

**Mapping re-checked against the source of truth.** Re-parsed ADR-010's table and compared it to the code constant: 14 ADR rows, 14 code keys, **0 mismatches**, key sets identical, targets `lats=5 / upper_back=9 / other=0`.

**Transaction scope and seed order.** The captured statement log for a complete run shows `begin=1 commit=1 rollback=0 savepoint=0` — still exactly one transaction, no savepoints, no nested transaction, no try/catch, no retry, no locking added. `git diff` on `src/db/seed/index.ts` is unchanged from the reviewed state (`seedMuscleGroups → reconcileContributions → seedExerciseCatalogForAllUsers`).

**Other files.** `git diff --numstat` for every tracked file is identical to the values recorded in the original review — ADR-010 `2/2`, `exerciseCatalog.ts` `29/16`, `index.ts` `13/0`, `muscleTaxonomyV2.spec.ts` `56/20`, `exerciseCatalog.test.ts` `82/2`. The only other change in the tree is the existing integration test growing 654 → 694 lines (17 → 19 tests), which is the appended PGlite block.

**Behavioural re-proof on real PostgreSQL.** Full-92 pre-Release-2 user with the original review's mutation set (weight edited to 0.75, role flipped to secondary, one rename, one `back` contribution removed, one seeded exercise hard-deleted):

```
run 1: updated=12 noop=2 conflicts=0 customDirectBack=0 seededDirectBackUnmapped=0
run 2: updated=0  noop=14 conflicts=0 …
contribution rows before=216 after=216
row-level {lats,upper_back,back} multiset mismatches: 0
database byte-identical between run 1 and run 2: true
direct back rows left on seeded exercises: 0
edited weight -> lats/primary/0.75    edited role -> lats/secondary/0.50    rename -> "My Row"
```

Identical to the pre-remediation numbers in the original review §2.4 — row-level sum preservation, idempotency, and preservation of user edits are all unaffected.

---

## 3. Test and check results

| Check | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm test:unit tests/unit/exerciseCatalog.test.ts tests/unit/muscleGroups.test.ts` | **22/22 passed** |
| `pnpm test:integration tests/integration/reconcileContributions.integration.test.ts` (PGlite) | **19/19 passed** (17 pre-existing + 2 new) |
| `pnpm test:integration …Concurrency…` with `DATABASE_URL` → dedicated disposable DB | **4/4 passed** (360 ms) |
| Same file with `DATABASE_URL` unset | **4 skipped**, suite green — `describe.skipIf` behaves, no false green and no failure |

Not re-run, per instruction: full `pnpm test:unit`, `pnpm build`, `pnpm test:e2e`. Nothing in the remediation is reachable from a UI path, and `pnpm typecheck` covers the compile surface.

**The shipped regression test is not vacuous.** Its scenario "1, 2, 4" asserts `updated=0, conflicts=1`; if the interception failed to fire, the unraced path would produce `updated=1, conflicts=0` and the test would fail. Its scenario "3" asserts more than one seeded exercise exists after `runSeed`, which was exactly the pre-remediation failure signature.

**Its shared-database guard works and is safe.** Run deliberately against a database holding two other users, it fails loudly with the intended message (`…expects DATABASE_URL to point at a database with exactly this test's one user, found 3…`) and skips all four tests. It does insert its own user row before that check, but `afterAll` still runs and removes it: I verified the database afterwards held only the two pre-existing users, 0 exercises, 0 ledger rows, 0 contributions. The only residue is the idempotent `muscle_groups` reference upsert, which is what every seed run performs anyway.

---

## 4. LOW observation (no action required)

**A concurrent *reclassify* in the same window is reported as a conflict that is not sticky.** Probed directly: a concurrent save that deletes the `back` row and inserts the target leaf (Release 1's explicit "pick Lats or Upper Back" affordance), committing inside the same window, makes the guarded `UPDATE` match zero rows, so the `moved === 0` branch reports `conflicts=1` with a `::warning::`. But the resulting state is `upper_back/primary/1.00` with **no `back` row**, and the next run reports `noop=14 conflicts=0` — the warning appears once and then clears.

Consequences, stated plainly:

- This is strictly better than the pre-remediation behaviour, which silently reported `updated=1 conflicts=0` for the same schedule.
- It errs in the safe direction: `conflicts` is now an **upper bound** on surviving mapped `back` rows, never an undercount. The dangerous direction M-2 identified — a surviving `back` row going uncounted — is fully closed (verified in §2.2 and §2.5).
- It cannot fail the deploy, cannot corrupt data, and self-clears on the next run.
- Two statements are slightly optimistic as a result: the code comment's "Sticky — the next run's classification `SELECT`s will see it and re-report it" (true for the target-leaf-insert race, not for this one), and the remediation report's claim that the equality invariant "holds again" (it holds as `≤`, and as `=` in the raced-conflict case). Any concurrent commit that removes the `back` row inside the window lands in the same branch, which is evident from the code.

No change is recommended. If a warning of this shape is ever seen in deployment output with `conflicts=1` and no visible conflict in the editor, this is the explanation — worth knowing at closeout, since the acceptance criterion asks for `conflicts=0` "or every conflict explained".

---

## 5. Cleanup

- Disposable databases `gymapp_r2verify` (my own probes) and `gymapp_r2conc` (the shipped concurrency test and its guard check) were created, migrated, used, and **dropped**. Only `postgres` and `gymapp` remain.
- The dev `gymapp` database was read only, never written; still 1 user, 93 exercises, 0 `back` rows, 5 `lats`, 9 `upper_back`.
- Probe scripts and the temporary `node_modules` junction lived entirely in the session scratchpad and were removed.
- No production access, no commit, push, or deploy. The working tree is unchanged apart from this report.

---

## 6. Verdict

**READY FOR RELEASE 2 DEPLOYMENT CLOSEOUT**

Both findings the remediation targeted are closed, verified against real PostgreSQL 16 by re-running the original review's own race probes through an independent harness rather than trusting the shipped regression test:

- **M-1** — the emitted `UPDATE` carries ADR-010's target-leaf `NOT EXISTS` guard atomically. The schedule that reproducibly raised `SQLSTATE 23505` and aborted `runSeed` now resolves, reports the pair as a conflict, and lets the catalog seed complete (93 exercises, versus 1 before). No throw in any probe.
- **M-2** — `updated` reflects the statement's actual affected-row count on both drivers (`rowCount` on node-postgres, `affectedRows` on PGlite, the fallback proven load-bearing). The raced pair reports `updated=0`, and the surviving `back` row is a sticky, re-emitted conflict.
- **M-3** — closed by conformance: the code now performs the mechanism ADR-010 and implementation-plan already specify, so no document text is left describing something the code does not do.

Nothing else moved: mapping table, counters, summary and warning contract, single-transaction scope, `runSeed` order, classification paths, row-level sum preservation, idempotency, and preservation of user edits are all byte-identical or re-verified passing. The one LOW observation is an over-report in the safe direction and needs no code change.
