# Pre-Phase-6 Muscle Taxonomy v2 — Release 2 Independent Review

Date: 2026-08-23
Reviewer: Claude Opus 5 — independent implementation review.
Gate on entry: READY FOR INDEPENDENT REVIEW. Release 1 live, CI-green, phone-accepted.

Scope: the complete local, uncommitted Release 2 change set — the 14-slug catalog remap, `machine-hip-adduction`, leaf-only catalog typing, `reconcileContributions` and its wiring into `runSeed`, the ADR-010 M-1/M-2/M-4 amendments, and the unit / integration / E2E test changes.

Inputs read in full: the working-tree diff and every untracked source file of the release; `docs/reviews/pre-phase-6-muscle-taxonomy-release-2-implementation.md`; `adr/ADR-010-muscle-taxonomy-v2.md`; `implementation-plan.md` §"Pre-Phase 6" (both releases) and §1.4; `docs/reviews/pre-phase-6-muscle-taxonomy-architecture-review.md`; `src/db/seed/{index,exercises,muscleGroups,exerciseCatalog,reconcileContributions,run}.ts`; `src/db/schema/{exerciseMuscleContributions,muscleGroups,exercises,users}.ts`; `src/domain/exercises/muscleGroups.ts`; `src/server/exercises/service.ts` (`updateExercise`); `src/ui/exercises/ContributionEditor.tsx`; `tests/{unit/exerciseCatalog,integration/reconcileContributions.integration,e2e/muscleTaxonomyV2}`; `tests/e2e/{seed,helpers}.ts`; `playwright.config.ts`; `.github/workflows/deploy.yml`.

Constraints honoured: no implementation file, test, ADR or user-owned file modified; no commit, push or deploy; no production access. Every database operation ran against the local Docker PostgreSQL 16 instance. The only repository write is this report — `git status` is byte-identical to the state at review start. Two disposable databases were created and dropped; the dev `gymapp` database was read but never written.

Nothing below is taken on the word of the implementation report or of a shipped test: every claim was re-derived from source, from the database, or from a live probe.

---

## 1. Summary

The release is **substantively correct**. The mapping is exact, the reconciliation is genuinely state-predicated and idempotent, row-level sum preservation holds under mutation, every tabulated deployment scenario behaves as ADR-010 specifies, there is no schema drift, and no Phase 6 scope leaked in. The corrected E2E fixture is a real fix, and the full suite is 21/21 green on a freshly created, freshly migrated, freshly bootstrapped PostgreSQL 16 database.

**The flagged concurrency question is answered: the race is real, and I reproduced it.** A Release-1 editor save that carries a legacy `back` row through while adding the target leaf, committing between `reconcileContributions`'s target-leaf-absent `SELECT` and its `UPDATE`, raises `SQLSTATE 23505` on the primary key `(exercise_id, muscle_group_id)`. Because the whole run is one transaction, the entire reconciliation rolls back, `runSeed` rejects, `pnpm db:seed` exits 1, and the `Deploy to Azure App Service` step never runs. That contradicts ADR-010's stated guarantee that conflicts "never fail the deploy".

**ADR-010's own literal single-statement conditional `UPDATE` is immune to the identical interleaving** — I ran it as a control under the same forced schedule and it returned `rowsUpdated=0` with no error. The implementation is therefore strictly weaker than the mechanism the binding documents specify, and the three reasons given for departing from that mechanism do not hold up.

A second, independent defect fell out of the same investigation: `updated` is incremented without consulting the affected-row count, so an overlapping save can produce a summary line reading `updated=1 … conflicts=0` while a direct `back` row is still sitting on a mapped seeded exercise. That summary line is Release 2's acceptance artifact.

Neither defect can corrupt data, and a failed deploy self-heals on re-run (verified). One well-understood ~6-line correction closes both and restores conformance with ADR-010.

Two MEDIUM findings must be corrected before deployment; one MEDIUM is documentation conformance; four LOW findings need no action. **Verdict: READY FOR REMEDIATION.**

---

## 2. What I verified independently

### 2.1 The 14-slug mapping, roles, weights, and leaf-only typing

Method: loaded the committed (`HEAD`) catalog and the working-tree catalog side by side in one process, together with `RECONCILED_BACK_SLUGS`, and diffed them structurally. Separately, parsed ADR-010's markdown mapping table and compared it row-for-row against the code constant.

| Check | Result |
|---|---|
| `HEAD` catalog size / unique slugs | 92 / 92 |
| Working-tree catalog size / unique slugs | 93 / 93 |
| `HEAD` entries carrying a direct `back` contribution | **14** |
| `RECONCILED_BACK_SLUGS` size | **14** |
| Set equality (`HEAD` back-carrying slugs ≡ mapping keys) | **true** — no slug in either direction is missing |
| ADR-010 table rows parsed / mismatches against the code constant | 14 / **0** |
| Role preserved on every mapped entry (`HEAD` `back` role → target leaf role) | **14/14**, 0 mismatches |
| Role split | **12 primary + 2 secondary** (`barbell-deadlift`, `other-trap-bar-deadlift`) |
| Target split | **5 `lats` + 9 `upper_back`**, both members of `ROLLUP_MEMBERS.back`; 0 targets outside |
| Sibling contributions on the 14 entries | **byte-identical**, including array position (the moved row keeps its index: 0 for the twelve rows, 3 for both deadlifts) |
| Non-mapped catalog entries changed | **none** |
| Catalog entries removed | **none** |
| Entries added | exactly one — `machine-hip-adduction` |
| `back` remaining anywhere in the catalog | **0** |
| Non-leaf contribution slug anywhere in the catalog | **none** |
| `adductors` users in the catalog | exactly `machine-hip-adduction`; `HEAD` had **0** — no retrofit onto any existing compound |
| `machine-hip-adduction` shape | `{"slug":"machine-hip-adduction","name":"Hip Adduction Machine","equipment":"machine","mechanics":"isolation","contributions":[{"muscleGroupId":"adductors","role":"primary"}]}` |

Leaf-only typing is a genuine compile-time gate, not a lint convention: `SeedContribution.muscleGroupId` is `LeafMuscleGroupSlug`, `LEAF_MUSCLE_GROUP_SLUGS` does not contain `"back"`, and `pnpm typecheck` is clean.

The ADR diff is 2 changed lines (M-1/M-2 into step 4, M-4 into the rule paragraph). **The mapping table itself is untouched**, and M-3 is correctly left for the Phase 6 build. The M-4 correction is factually right: `other-trap-bar-deadlift` carries `glutes`/`quads` primary and `hamstrings`/`back`/`forearms` secondary, with no `traps` row — confirmed against the source.

### 2.2 Deterministic-ID reconciliation and seed ordering

`seededExerciseId(userId, slug)` is SHA-1 over `exercise:<userId>:<slug>`, independent of `exercises.name` — so a renamed seeded exercise is matched by id. Verified live: after renaming `barbell-row` to `My Row` on a full-92 fixture, the row still reconciled and the name was untouched.

`runSeed` is `seedMuscleGroups → reconcileContributions → seedExerciseCatalogForAllUsers`, matching ADR-010 step 2 exactly. The `seedMuscleGroups`-first ordering is load-bearing (the `RESTRICT` FK to `muscle_groups` requires `lats`/`upper_back` to exist). The `reconcileContributions`-before-catalog ordering is defensive rather than load-bearing (architecture-review LOW #5 said the same); the code comment claims it is required, which overstates it slightly but harms nothing.

### 2.3 Scenario coverage — verified against a real database, not only against tests

| ADR-010 scenario | How verified | Result |
|---|---|---|
| Fresh user / fresh database | Live: brand-new migrated DB, account created through the real UI, then `pnpm db:seed` | `updated=0 noop=14 conflicts=0`; 93 exercises, **0** `back` rows, 5 `lats` + 9 `upper_back` + 1 `adductors`, 18 `muscle_groups` with 1 `rollup` |
| Existing user, all 92 applied | Live on real PG: reconstructed the genuine pre-Release-2 state (catalog seeded, `machine-hip-adduction` removed, all 14 leaf rows moved back onto `back`) | run 1 `updated=14 noop=0`; run 2 `updated=0 noop=14`; **database byte-identical between runs** |
| Existing user, only the original 40 applied | Shipped integration test + fixture sanity check re-derived (7 of the 14 mapped slugs sit in the first 40 catalog entries, 7 were added by Phase 5.5 Light) | `updated=7 noop=7`, then the remaining 45 + `machine-hip-adduction` seed from the leaf catalog |
| Renamed seeded exercise | Live on real PG | reconciled by id; name preserved |
| Edited weight (0.75) | Live on real PG | landed as `lats/primary/0.75` — verbatim |
| Edited role (flipped to secondary) | Live on real PG | landed as `lats/secondary/0.50` — verbatim |
| Removed `back` contribution | Live on real PG + integration test | stays absent; nothing resurrected on the leaf; counts as `noop` |
| Hard-deleted seeded exercise | Live on real PG + integration test | no row → `noop`; ledger untouched → never resurrected |
| Name collision skips the seeded slug | Integration test, re-read | no row at the derived id → `noop`; the custom exercise untouched |
| Custom exercise holding direct `back` | Integration test, re-read | byte-identical including `updated_at`; counted in `customDirectBack`; never auto-remapped |
| Unmapped seeded direct `back` (M-2) | Integration test, re-read; implementation re-read | counted in `seededDirectBackUnmapped` with its own `::warning::`; never double-counted against `conflicts` (the scan excludes every mapped id) |
| Target leaf already present (conflict) | Live on real PG | both rows left exactly in place; `conflicts=1`; re-emitted identically on the next run (sticky) |
| Second run reports `updated=0` | Live on real PG, both entry points | confirmed, with the database byte-identical between runs |

Reporting matches the contract: the summary line carries all six required counters, `seededDirectBackUnmapped` is printed alongside rather than folded in (ADR-010 step 4), conflicts and unmapped rows use `::warning::` with the required fields, and `customDirectBack` lines are informational `console.log`. Output is emitted only after the transaction resolves.

### 2.4 Row-level sum preservation

Independent of the shipped tests. On real PostgreSQL 16 I built a full-92 pre-Release-2 user, applied the mutation set (weight edited to 0.75, role flipped to secondary, one exercise renamed, one `back` contribution removed, one seeded exercise hard-deleted), captured the per-exercise multiset of `(role, weight)` over `{lats, upper_back, back}` before and after, and compared symmetrically:

```
summary: updated=12 noop=2 conflicts=0 customDirectBack=0 seededDirectBackUnmapped=0
total contribution rows before=216 after=216
exercises with a {lats,upper_back,back} row: 12; multiset mismatches: 0
direct 'back' rows left on seeded exercises: 0
edited-weight row: lats / primary / 0.75      edited-role row: lats / secondary / 0.50
renamed exercise name preserved: "My Row"
```

Zero mismatches, zero row-count change, nothing merged, dropped or double-written. The invariant holds.

### 2.5 Schema drift and Phase 6 scope

`drizzle-kit generate` run against a **copy** of `drizzle/` outside the repository (so no migration file could be written into the tree): **"No schema changes, nothing to migrate"**. The repository's `drizzle/` directory still holds exactly the 8 committed migrations, and `git status` is unchanged. Correct for a data-only release — Release 1's `0007` already added `muscle_groups.kind`.

Grep across every file in the release surface for `volume_presets`, `volume_landmarks`, `domain/volume`, `landmark`, `ROLLUP_MEMBERS`, `effective(`, `raw(`: **no matches**. The only `src/` changes are `src/db/seed/{exerciseCatalog,index,reconcileContributions}.ts`. No Phase 6 scope leaked in.

### 2.6 Checks run

| Check | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm test:unit tests/unit/exerciseCatalog.test.ts` | **14/14 passed** |
| `pnpm test:integration tests/integration/reconcileContributions.integration.test.ts` | **17/17 passed** (9.0 s) |
| `pnpm build` | succeeds |
| Full `pnpm test:e2e`, fresh disposable database | **21/21 passed (45.3 s)** |

The E2E run used a database created, migrated and bootstrapped from scratch (`CREATE DATABASE` → `db:migrate` → `db:seed` → `smoke.spec.ts` to create the account through the real UI → `db:seed` again → `tests/e2e/seed.ts`), with a production server started against it. Every spec passed, including `deload.spec.ts` and `progression.spec.ts` — independently confirming the implementation report's account that their failures against the shared dev database are fixture-state drift, not a Release 2 defect. The corrected Release-1 fixture test (#10, "a legacy direct Back contribution renders as Unclassified Back and survives an unrelated save") passed on the first attempt.

**The E2E fixture correction is sound.** The test now inserts its own exercise plus a direct `back` contribution via `getDb()`, bypassing `createExercise`'s leaf-only Zod gate — the same direct-DB pattern the third test already uses. Every original behaviour assertion is preserved: the "Unclassified Back — pick Lats or Upper Back, or leave as-is." note before save, survival of an unrelated "Save changes" (which exercises the carry-through path in `updateExercise`), the library row showing "Unclassified Back", no literal `"undefined"`, and the note still visible on reopen. Cleanup was added, matching the third test's convention. No production code was touched to make it pass.

---

## 3. The critical question — reproduced, not theorised

### 3.1 The concern, restated precisely

`exercise_muscle_contributions`'s primary key is `(exercise_id, muscle_group_id)` (`src/db/schema/exerciseMuscleContributions.ts:32`). `reconcileContributions` classifies with three `SELECT`s and then issues an unconditional

```sql
UPDATE exercise_muscle_contributions
SET muscle_group_id = $target, updated_at = $now
WHERE exercise_id = $id AND muscle_group_id = 'back'
```

If the target-leaf row appears between the third `SELECT` and that `UPDATE`, the `UPDATE` rewrites a row into a key that now exists.

The write that can produce it is reachable through the shipped Release-1 UI, not only in theory. `ContributionEditor.tsx` keeps a legacy `back` row selectable in its own row (`currentRollup` self-only option) while offering all 17 leaves to a newly added row, and `updateExercise` (`src/server/exercises/service.ts`) accepts a submitted rollup slug as carry-through whenever the exercise already had it — it constrains only the carried row, never its siblings. It then performs delete-all-and-reinsert. So "keep Back, add Upper Back, Save" is two taps.

### 3.2 Method

I drove the **real, unmodified** `src/db/seed/reconcileContributions.ts` against real PostgreSQL 16 (`PostgreSQL 16.14 … Debian`, `default_transaction_isolation = read committed`) on a disposable database, and forced the interleaving at the `pg` driver boundary — `pool.connect` was wrapped to return a client whose `query` runs a hook when it first sees the reconciliation `UPDATE`. The hook opens a **separate connection**, performs Release 1's exact write shape (`UPDATE exercises` → `DELETE` all contributions → `INSERT` `back` primary 1.00 + `upper_back` secondary 0.50), and **commits**, before the `UPDATE` is sent. No application source was modified; the interception is outside the code under test.

### 3.3 Results

**Probe 0 — control, no concurrency.** `updated=1 noop=13 conflicts=0`; final state `upper_back/primary/1.00`. Works.

**Probe A — editor save commits between the target-check `SELECT` and the `UPDATE`. RACE REPRODUCED.**

```
outcome: THREW code=23505 constraint=exercise_muscle_contributions_exercise_id_muscle_group_id_pk
         duplicate key value violates unique constraint
         "exercise_muscle_contributions_exercise_id_muscle_group_id_pk"
summary: null
after  : back/primary/1.00 + upper_back/secondary/0.50
statement log: begin → select users → 14×(exercise probe) → select back-row → select target-row
               → [concurrent editor save commits] → UPDATE → rollback
```

`reconcileContributions` rejected. The transaction rolled back; no summary was printed.

**Probe A2 — the same interleave through the public `runSeed` entry point. DEPLOY-FATAL.**

```
outcome: runSeed REJECTED - code=23505 :: duplicate key value violates unique constraint …
exercises rows after the failed runSeed: 1 (catalog seed step never ran)
```

The failure propagates out of `runSeed`, and `seedExerciseCatalogForAllUsers` never executes. `src/db/seed/run.ts:9-12` calls `process.exit(1)` on rejection; `.github/workflows/deploy.yml:109` runs `pnpm db:seed` with no `continue-on-error`, and `Deploy to Azure App Service` is a later step in the same job. So the deploy fails. (The `Close DB firewall` step is `if: always()`, so no infrastructure debris is left behind.)

**Probe B — control: ADR-010's literal single-statement conditional `UPDATE`, identical interleave. IMMUNE.**

```
outcome: NO ERROR  rowsUpdated=0
after  : back/primary/1.00 + upper_back/secondary/0.50
```

**Probe B2 — same statement, concurrent save still open when it starts. IMMUNE.** `NO ERROR rowsUpdated=0`.

This settles the implementation report's open question #1: ADR-010's mechanism is **not** exposed to the same interleaving. Under READ COMMITTED the statement's `NOT EXISTS` subquery is evaluated against the same statement snapshot as the row scan; that snapshot is taken after the concurrent commit, so the guard sees the target row and no row qualifies. In the still-open case, the delete-and-reinsert means the `back` tuple the scan matched is concurrently deleted, and `EvalPlanQual` drops it. Reaching a unique violation with the literal statement would require a concurrent transaction that inserts the target leaf *without* touching the `back` row — which Release 1's delete-all-and-reinsert `updateExercise` cannot produce. **The shipped implementation is strictly weaker than the mechanism the binding documents specify.**

**Probe C — the editor save is still open when the reconciliation `UPDATE` starts. No error, but the counters lie.**

```
outcome: NO ERROR
summary: updated=1 noop=13 conflicts=0 …
after  : back/primary/1.00 + upper_back/secondary/0.50
```

The `UPDATE` blocked on the row lock, `EvalPlanQual` dropped the concurrently deleted tuple, and **zero rows changed** — but `updated` was incremented anyway, because the implementation never reads the affected-row count. The committed state holds a direct `back` row on a mapped seeded exercise while the deploy output reports a clean `conflicts=0` run. The implementation report's own stated invariant — "the count of `back` rows remaining among the mapped ids equals exactly `conflicts`" — is violated (1 ≠ 0). See finding **M-2**.

**Probe D — a reclassify-only save (`back` → leaf, no carry-through) in the same window.** No error; end state correct (`upper_back/primary/1.00`); `updated=1` is again a miscount (the user's own save did the move, not the reconciliation). Benign but the same root cause.

**Probe E — how wide is the window?** On a realistic full-92 pre-Release-2 user (92 seeded exercises, 14 direct `back` rows) the whole `reconcileContributions` run takes **47.3 ms**, and the vulnerable target-check-`SELECT`→`UPDATE` gap is **0.56–0.86 ms per pair, mean 0.63 ms, 8.87 ms summed across all 14 pairs**. So per deploy, the exposure is a few milliseconds — and only for a save that adds the target leaf while keeping `back`, on one of those 14 exercises, landing inside it.

**Self-healing — verified.** Re-running the seed against exactly the state Probe A leaves behind:

```
re-run summary: updated=0 noop=13 conflicts=1 …
::warning::taxonomy-v2 reconciliation conflict: … slug=barbell-row … target=upper_back
full seed on re-run: runSeed OK
state after re-run: back/primary/1.00 + upper_back/secondary/0.50
```

The re-run succeeds, classifies the pair as a conflict, emits the warning, and completes the catalog seed. **No data can be corrupted, and a failed deploy is recovered by re-running it.** That is what keeps this out of BLOCKER territory.

**Transaction scope — the "exact snapshot" claim is not true as written.** The implementation comment (`reconcileContributions.ts:79-82`) and the report say the single transaction makes the returned counts "an exact snapshot of the database state the transaction commits". A READ COMMITTED transaction takes a fresh snapshot per statement. Demonstrated on the same server: inside one open transaction, a count returned `0`, a concurrent transaction committed an insert, and the *same* open transaction's next count returned `1`. Probe C is the practical consequence. The single-transaction scope is still worth keeping — it prevents a partial summary from being printed — but it does not deliver snapshot stability, and it does convert a single-pair failure into a rollback of every user's reconciliation.

---

## 4. Findings

### M-1 (correct before deployment) — the classify-then-act `UPDATE` can raise a PK violation and fail the deploy

Reproduced above (Probe A, Probe A2): `SQLSTATE 23505` on `exercise_muscle_contributions_exercise_id_muscle_group_id_pk`, whole-transaction rollback, `runSeed` rejection, `pnpm db:seed` exit 1, `Deploy to Azure App Service` skipped. ADR-010 step 4 states conflicts "never fail the deploy"; this path does.

Mitigating and aggravating, both stated plainly:

- Window is ~0.63 ms per mapped pair, ~8.9 ms per deploy, and requires a specific two-tap edit on one of exactly 14 exercises landing inside it. On a single-user app, the per-deploy probability is very small.
- ADR-010's "Residual race" paragraph does **not** already cover this. It covers a benign outcome — "the next seed run reconciles it and the counts show it" — not an aborted seed.
- No data can be corrupted; the state left behind is the honest conflict state, and re-running the deploy succeeds (verified).
- ADR-010's own specified statement is immune (Probe B/B2), so this is a defect introduced by the deviation, not an inherent property of the design.

### M-2 (correct before deployment) — `updated` is incremented without checking the affected-row count, so the summary line can misreport committed state

`reconcileContributions.ts:163-172` issues the `UPDATE` and unconditionally does `updated++`. Probe C: the `UPDATE` changed zero rows, yet the run reported `updated=1 noop=13 conflicts=0` while a direct `back` row remained on a mapped seeded exercise. Probe D shows the same miscount on a benign path.

This matters beyond tidiness: implementation-plan's Release 2 acceptance criterion is "the production summary line is quoted verbatim in the implementation report with `conflicts=0` (or every conflict explained)". A line that can read `conflicts=0` while a mapped `back` row survives is not a sound acceptance artifact. The condition is invisible to the M-2 reporting scan too, because `seededDirectBackUnmapped` deliberately excludes every mapped id. It would surface on the next deploy as a sticky conflict, so it is self-correcting — but only after the release has been signed off.

### M-3 (documentation conformance) — the implementation departs from a binding mechanism without amending the binding documents

ADR-010 §"Reconciliation mechanism" step 2 specifies the conditional `UPDATE … WHERE … AND EXISTS (…) AND NOT EXISTS (…)` as the mechanism, and implementation-plan's Release 2 bullet restates it in the same terms. ADR-010 declares its mapping table binding and states that further change "re-opens this ADR rather than a seed file"; the same expectation applies to the mechanism it specifies. The ADR *was* amended in this very change set (M-1, M-2, M-4) — so recording the deviation was available and was not done.

The three justifications given for the deviation do not survive checking:

- *"raw-SQL row-shape concerns"* — no raw SQL is needed. Drizzle's query builder with `notExists` + `alias` emits the ADR statement verbatim: `update "exercise_muscle_contributions" set "muscle_group_id" = $1, "updated_at" = $2 where (… "muscle_group_id" = $4 and not exists (select 1 from "exercise_muscle_contributions" "t" where ("t"."exercise_id" = $5 and "t"."muscle_group_id" = $6)))`.
- *"self-referencing-subquery-aliasing concerns"* — `alias()` handles it; the generated SQL above is correct and I ran it.
- *"portability across PGlite and node-postgres"* — I ran the builder-generated conditional update on **both**: node-postgres (clean run `rowCount=1`, correct move; under the Probe A interleave `rowCount=0`, no error) and PGlite (row moved correctly; conflict guard correctly a no-op). One real portability detail exists and is worth knowing: **node-postgres exposes `rowCount`, PGlite exposes `affectedRows` and leaves `rowCount` undefined** — a portable read is `res.rowCount ?? res.affectedRows ?? 0`.

Either restore the ADR mechanism (recommended — it also closes M-1 and M-2) or amend ADR-010 and implementation-plan to record the classify-then-act form as the accepted mechanism, with its concurrency properties stated.

### LOW — no remediation recommended

1. **`updated_at` uses the seeding process's clock.** `set({ updatedAt: new Date() })` rather than ADR-010's `now()`. Harmless at this scale; a clock-skewed runner would stamp a skewed timestamp.
2. **The whole-run single transaction amplifies any per-pair failure into a total rollback** of every user's reconciliation. Architecture-review LOW #8 judged transaction scope free — correctly, but on the assumption of an atomic conditional update that cannot fail. It becomes free again once M-1 is fixed.
3. **`reconcileContributions` before the catalog seed is described as required; it is defensive.** Only "after `seedMuscleGroups`" is load-bearing (the `RESTRICT` FK). Same observation as architecture-review LOW #5; the comment slightly overstates it.
4. **The corrected E2E fixture is now a custom exercise, not a seeded one.** Behaviourally identical (no editor or library path branches on `is_seeded`), and the test title was honestly updated to "a legacy direct Back contribution". The *seeded*-row variant of that scenario now has no E2E coverage — acceptable, since the reconciliation guarantees no seeded row keeps a `back` contribution after Release 2.
5. **Row-level sum preservation is asserted symmetrically only in the conflict test.** implementation-plan's Tests bullet asks for the before/after multiset comparison per exercise. The property is true — I verified it across all 93 exercises on real PostgreSQL with the full mutation set applied, 0 mismatches (§2.4) — but no shipped test applies `backLeafMultiset` before/after across a full-92 user. An optional test addition, not a defect.

---

## 5. Safest minimal correction (assessed, not implemented)

**Recommended: restore ADR-010's conditional `UPDATE` through Drizzle's query builder, and drive the counter off the affected-row count.** Roughly six lines in `reconcileContributions.ts`, no raw SQL, no structural change:

1. Keep the three classification `SELECT`s exactly as they are — they produce `noop`, `conflicts`, and the warning lines.
2. Add `notExists(select 1 from alias(exerciseMuscleContributions, "t") where t.exerciseId = exerciseId and t.muscleGroupId = target)` to the existing `.where(...)` of the `UPDATE`.
3. Read the affected-row count portably: `const moved = result.rowCount ?? result.affectedRows ?? 0`.
4. `moved === 1` → `updated++`. `moved === 0` → the target leaf appeared concurrently: `conflicts++` and emit the same conflict warning.

This closes M-1 (proven immune to the reproduced interleaving), closes M-2 (`updated` becomes a count of rows actually moved, and the invariant `back` rows remaining ≡ `conflicts` is restored), closes M-3 (the mechanism becomes the one the ADR specifies), and makes LOW #2 moot. It preserves every current behaviour: role and weight untouched, no merge, no drop, no double-write, conflicts sticky, counters partitioning as `updated + noop + conflicts = users × mapped`.

**Rejected alternatives, with reasons:**

- **Catch the `23505` around the plain `UPDATE`.** Not minimal and not sufficient. PostgreSQL aborts the whole transaction on any error: I confirmed that after catching the `23505`, the very next statement on the same connection fails with `25P02 current transaction is aborted, commands ignored until end of transaction block`. A working version needs a `SAVEPOINT` per pair (Drizzle's nested `tx.transaction`), which is more machinery than the conditional update — and it still leaves M-2 unfixed.
- **Accept the residual risk under ADR-010's existing "Residual race" language.** That paragraph describes a benign, self-correcting outcome, not an aborted seed and a failed deploy. Accepting this would require amending the ADR to say conflicts *can* fail a deploy — contradicting the guarantee two paragraphs earlier.
- **`SELECT … FOR UPDATE` on the `back` row during classification.** Would also close the window, but adds locking semantics for no benefit over the conditional update.

Verification the remediation should carry: an integration test that asserts a `rowCount`-driven `updated`, and — because it is the only thing that would have caught this — one driver-level or two-connection concurrency test forcing the Probe A interleave and asserting the run completes with `conflicts=1` instead of throwing.

---

## 6. Cleanup

- Disposable databases `gymapp_r2race` (concurrency and preservation probes) and `gymapp_r2review` (clean E2E run) were created, used, and **dropped**. Only `postgres` and `gymapp` remain.
- The production build server started for the E2E run was stopped; port 3000 is free.
- The dev `gymapp` database was read only, never written; it remains in the post-reconciliation state the implementation session left it in (93 exercises, 0 `back` rows, 5 `lats`, 9 `upper_back`, 18 muscle groups).
- Probe scripts, the schema-drift working copy of `drizzle/`, and the temporary `node_modules` junction lived entirely in the session scratchpad and were removed.
- No production access. No commit, push, or deploy. `git status` at the end of this review is identical to `git status` at the start, apart from this report.

---

## 7. Verdict

**READY FOR REMEDIATION**

No BLOCKER. The release does what ADR-010 says it should: the mapping is exact and role-preserving, the reconciliation is genuinely state-predicated and idempotent, sum preservation holds at the row level under mutation, every deployment scenario converges, there is no schema drift and no Phase 6 leakage, and the full E2E suite is green on a clean database including the corrected fixture.

Two MEDIUM findings must be corrected before the Release 2 deploy: a reproduced, deploy-fatal PK violation under a concurrent Release-1 editor save (M-1), and a summary line that can misreport committed state (M-2). Both are closed by the same ~6-line change, which is also what ADR-010 and implementation-plan already specify (M-3). Nothing is unsafe or unrecoverable — no data can be corrupted and a failed deploy self-heals on re-run — which is why this is remediation, not a block.

The implementation session was right to flag the concurrency question rather than assume it away, and right not to change production code in response to a concern it could not reproduce. The concern is real, and the fix is small.
