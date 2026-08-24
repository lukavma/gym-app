# Pre-Phase-6 Muscle Taxonomy v2 — Release 2 Implementation Report

Status: implementation complete, locally verified against PGlite and real local PostgreSQL 16. Not committed, not pushed, not deployed. Production reconciliation and the second-deploy `updated=0` proof remain deployment-closeout steps, not claimed here.

## Gate

Confirmed by the user before starting: Release 1 is committed, deployed, CI-green, and manually accepted on the real iPhone. This session implemented directly (no Plan Mode, no implementation subagents), per instruction.

## Scope

Implements Release 2 (data) of ADR-010 exactly as scoped in `implementation-plan.md`'s "Pre-Phase 6 — Muscle taxonomy v2" section: the 14-slug catalog remap, `machine-hip-adduction`, the state-predicated `reconcileContributions` step wired into `runSeed`, and the reporting it requires (including the architecture-review M-2 widening). No Phase 6 volume code, no automatic remapping of custom exercises, no additional muscles/rollups/hierarchies, no catalog cleanup beyond the exact 14 mappings and one new entry, no E2E harness remediation.

## The exact mapping applied

Identical to ADR-010's authoritative table, now expressed in code as `RECONCILED_BACK_SLUGS` (`src/db/seed/reconcileContributions.ts`) and applied to the catalog (`src/db/seed/exerciseCatalog.ts`):

| Catalog slug | Role | Target |
|---|---|---|
| `cable-lat-pulldown` | primary | `lats` |
| `bodyweight-pull-up` | primary | `lats` |
| `bodyweight-chin-up` | primary | `lats` |
| `machine-assisted-pull-up` | primary | `lats` |
| `cable-straight-arm-pulldown` | primary | `lats` |
| `barbell-row` | primary | `upper_back` |
| `dumbbell-row` | primary | `upper_back` |
| `cable-seated-row` | primary | `upper_back` |
| `machine-seated-row` | primary | `upper_back` |
| `barbell-pendlay-row` | primary | `upper_back` |
| `machine-t-bar-row` | primary | `upper_back` |
| `bodyweight-inverted-row` | primary | `upper_back` |
| `barbell-deadlift` | secondary | `upper_back` |
| `other-trap-bar-deadlift` | secondary | `upper_back` |

12 primary + 2 secondary, matching ADR-010 row for row (`tests/unit/exerciseCatalog.test.ts`, "preserves role exactly as ADR-010's mapping table specifies"). `machine-hip-adduction` ("Hip Adduction Machine", `adductors` primary) added once, at the end of the Machine section; grepped to confirm it is the *only* catalog entry using `adductors` — no retrofit onto any existing compound. The catalog's `SeedContribution.muscleGroupId` type is narrowed from `MuscleGroupSlug` to `LeafMuscleGroupSlug`, so a stray `"back"` anywhere in the 93-entry catalog is now a compile error, not just a lint finding — confirmed by `grep -c 'muscleGroupId: "back"' src/db/seed/exerciseCatalog.ts` → `0`.

## Reconciliation / query design

`reconcileContributions(db)` (`src/db/seed/reconcileContributions.ts`) implements ADR-010's mechanism as **classify-then-act** rather than a single raw SQL statement with `EXISTS`/`NOT EXISTS` subqueries: for each (user, mapped slug) pair it derives the exercise id via the existing `seededExerciseId(userId, slug)`, then runs three read queries through Drizzle's query builder — does the seeded exercise exist, does it still carry `back`, does the target leaf already exist — and only in the exactly-one qualifying case (exists, has `back`, target absent) issues the `UPDATE ... SET muscle_group_id, updated_at`. Same predicate, same resulting state, same idempotency as the ADR's literal SQL; chosen for readability and to avoid raw-SQL row-shape and self-referencing-subquery-aliasing differences between the PGlite and node-postgres drivers this repo runs on. Only `muscle_group_id` and `updated_at` are ever written — `role` and `weight` are never touched.

Two reporting-only queries follow the main loop, both scoped to what the loop's own mapped-id set did **not** already classify (`architecture-review M-2`):
- every `is_seeded = true` exercise still carrying `back`, excluding the 14×N mapped ids → `seededDirectBackUnmapped`, each with its own `::warning::` line (user id, slug — resolved by re-deriving `seededExerciseId` against all 93 catalog slugs, exercise id).
- every `is_seeded = false` exercise carrying `back` → `customDirectBack`, one informational line per row (ids only, never names, per the rescope closeout's own recommended default).

**Transaction scope:** the entire run — every (user, slug) decision, plus both reporting queries — executes inside one `db.transaction`. Console output is emitted only after the transaction resolves, so a rolled-back run can never print a misleading partial summary, and the returned/reported counts are always an exact snapshot of the state the transaction commits (closes architecture-review LOW #8).

**Wiring:** `runSeed` is now `seedMuscleGroups → reconcileContributions → seedExerciseCatalogForAllUsers` (`src/db/seed/index.ts`), matching the required order exactly.

## Counter definitions

- `users` — number of user rows the run iterated (0 on an empty database).
- `mapped` — constant `14`, the size of `RECONCILED_BACK_SLUGS`.
- `updated` — (user, slug) pairs where a `back` row existed on a seeded exercise and was moved to its target leaf this run.
- `noop` — (user, slug) pairs where the seeded exercise is missing (never applied, removed, hard-deleted, name-collided) or no longer carries `back` (already reconciled, or the user removed it).
- `conflicts` — (user, slug) pairs where a `back` row exists **and** the target leaf already exists too; the `back` row is left untouched and a `::warning::` line is emitted (user id, slug, exercise id, target).
- `customDirectBack` — user-created (`is_seeded = false`) exercises still holding a direct `back` row (informational).
- `seededDirectBackUnmapped` — seeded exercises **outside** the 14 mapped slugs still holding a direct `back` row (new counter, M-2). Never double-counted against `conflicts`, since it explicitly excludes every mapped-slug exercise id.

Invariant asserted directly in tests: `updated + noop + conflicts === users * mapped`, and independently, the count of `back` rows remaining among the mapped ids equals exactly `conflicts` (since by construction a `noop` case has none and an `updated` case no longer has one).

## Local first- and second-run summary lines (verbatim)

Against the local Docker PostgreSQL 16 dev database (`gymapp`), which held the genuine pre-Release-2 state (1 user, 92 seeded exercises, 14 direct `back` contributions, unchanged since Release 1):

**First run:**
```
taxonomy-v2 reconciliation: users=1 mapped=14 updated=14 noop=0 conflicts=0 customDirectBack=0
taxonomy-v2 reconciliation: seededDirectBackUnmapped=0
```

**Second run:**
```
taxonomy-v2 reconciliation: users=1 mapped=14 updated=0 noop=14 conflicts=0 customDirectBack=0
taxonomy-v2 reconciliation: seededDirectBackUnmapped=0
```

`conflicts=0` on both runs — the dev account had no pre-existing "carry-through + add sibling leaf" edit. Verified against the database directly: 0 `back` rows remain, 5 `lats` + 9 `upper_back` = 14 (matching the mapping's 5/9 split), 93 seeded exercises including "Hip Adduction Machine" (`adductors` primary), and the row count stayed at 93/221 contributions across both runs (no duplication).

**Deeper real-Postgres scenario proof (conflict + unmapped + custom, not present in the dev account):** built on a disposable database (`gymapp_r2check`, migrated from scratch through all 8 migrations, dropped after use — same disposable-database convention the Release 1 review used), with a partially-seeded (original-40) user carrying a hand-crafted conflict on `barbell-row`, an unmapped direct-`back` row on `barbell-back-squat`, and a custom exercise with a direct `back` row:

**First run:**
```
taxonomy-v2 reconciliation: users=1 mapped=14 updated=6 noop=7 conflicts=1 customDirectBack=1
taxonomy-v2 reconciliation: seededDirectBackUnmapped=1
::warning::taxonomy-v2 reconciliation conflict: user=db054398-5742-4fba-a306-d99d5b84140a slug=barbell-row exercise=9e935cac-2e2e-524e-aae2-c2e6c9fc2858 target=upper_back
::warning::taxonomy-v2 reconciliation: seeded exercise outside the mapped 14 still holds a direct back contribution — user=db054398-5742-4fba-a306-d99d5b84140a slug=barbell-back-squat exercise=a586f5d8-1e44-5300-9266-1893206a7a10
taxonomy-v2 reconciliation: customDirectBack exercise user=db054398-5742-4fba-a306-d99d5b84140a exercise=01a0304d-812e-7e91-80af-d60a10a0cfbb
```
(6 = the 7 mapped-in-original-40 slugs minus the 1 conflict; 7 = the 7 mapped slugs not yet applied to this partially-seeded user.)

**Second run** (sticky conflict re-reported identically, non-conflict work now `updated=0`):
```
taxonomy-v2 reconciliation: users=1 mapped=14 updated=0 noop=13 conflicts=1 customDirectBack=1
taxonomy-v2 reconciliation: seededDirectBackUnmapped=1
::warning::taxonomy-v2 reconciliation conflict: user=db054398-5742-4fba-a306-d99d5b84140a slug=barbell-row exercise=9e935cac-2e2e-524e-aae2-c2e6c9fc2858 target=upper_back
::warning::taxonomy-v2 reconciliation: seeded exercise outside the mapped 14 still holds a direct back contribution — user=db054398-5742-4fba-a306-d99d5b84140a slug=barbell-back-squat exercise=a586f5d8-1e44-5300-9266-1893206a7a10
taxonomy-v2 reconciliation: customDirectBack exercise user=db054398-5742-4fba-a306-d99d5b84140a exercise=01a0304d-812e-7e91-80af-d60a10a0cfbb
```
Row-level verification: `Barbell Row` still carries both `back` (primary, weight 1.00, untouched) and `upper_back` (secondary, weight 0.50, untouched) after both runs — neither merged, dropped, nor double-written. Exercise count stayed at 93 across both runs. Database dropped afterward.

## Preservation and conflict evidence

- **Role/weight preservation:** `tests/integration/reconcileContributions.integration.test.ts` — an edited weight (0.75) and an edited role (flipped to `secondary`) on a legacy `back` row both survive the move to the target leaf unchanged; only `muscle_group_id`/`updated_at` differ.
- **Removed/deleted rows stay absent:** a removed `back` contribution and a hard-deleted seeded exercise both classify as `noop` and nothing is resurrected on the leaf or the exercise row.
- **Deterministic-id reconciliation:** a renamed seeded exercise (`barbell-row` → "My Custom Row Name") still reconciles, matched by id, name untouched by the match itself.
- **Custom exercises byte-identical:** a custom exercise's direct `back` contribution (including `updated_at`) is asserted equal before and after a reconciliation run.
- **Symmetric row-level preservation:** `backLeafMultiset()` captures the multiset of `(role, weight)` over `{lats, upper_back, back}` for an exercise before and after reconciliation and asserts deep equality — used in the conflict test to prove both rows are left exactly in place.
- **Conflicts untouched and sticky:** the PGlite conflict test and the real-Postgres disposable-database run both show the same conflict re-reported identically (same user/slug/exercise/target) on a second run, with the underlying rows unchanged.
- **Counters match database state exactly:** a combined two-user PGlite scenario (clean full-92, plus original-40 with a conflict, an unmapped back row, and a custom back row) cross-checks every returned counter against independently-written queries (not the implementation's own query shapes) — `updated + noop + conflicts = users × mapped`; rows still `back` among mapped ids `=== conflicts`; unmapped/custom counts match direct joins.

## Files changed

- `src/db/seed/exerciseCatalog.ts` — 14 contributions remapped (`back` → `lats`/`upper_back` per the table above); `machine-hip-adduction` added; `SeedContribution.muscleGroupId` narrowed to `LeafMuscleGroupSlug`.
- `src/db/seed/reconcileContributions.ts` (new) — `RECONCILED_BACK_SLUGS`, `ReconciliationSummary`, `reconcileContributions()`.
- `src/db/seed/index.ts` — wires `reconcileContributions` into `runSeed` in the required order; exports the new module's public surface.
- `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` — M-1 correction (conflicts are reachable via a deliberate Release-1 edit, not "unreachable by construction"; documented as sticky); M-2 correction (reporting widened to `seededDirectBackUnmapped`, closing the gap where a `back` row on a non-mapped seeded exercise was invisible); M-4 correction (the "matching the `traps` secondary" rationale scoped to `barbell-deadlift`, since `other-trap-bar-deadlift` carries no `traps` row — no mapping target changed). M-3 deliberately **not** touched — carried into the Phase 6 build unchanged, per instruction.
- `tests/unit/exerciseCatalog.test.ts` — new `describe` block: no `back` anywhere, every mapped slug present and targeting exactly its ADR-010 leaf, role preserved 12/2, `machine-hip-adduction` present and the sole `adductors` user, catalog length 93.
- `tests/integration/reconcileContributions.integration.test.ts` (new) — 17 tests, detailed below.

User-owned files confirmed untouched throughout (`git status` identical before/after for these): `CLAUDE.md`, `HANDOFF.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`, `tsconfig.tsbuildinfo`.

## Tests — exact results

- `pnpm lint` — clean.
- `pnpm format:check` — clean.
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean.
- `pnpm test:unit` — **367/367 passed** (28 files); `exerciseCatalog.test.ts` grew from 9 to 14 tests.
- `pnpm test:integration` — **180/180 passed** (13 files) against PGlite, including the new 17-test `reconcileContributions.integration.test.ts` covering: fresh-database no-op, fresh-user convergence, full-92 pre-v2 convergence, original-40 partial convergence (fixture-verified: 7 of the 14 mapped slugs are in the original 40, 7 were added by Phase 5.5 Light), deterministic-id rename reconciliation, weight preservation, role preservation, removed-contribution noop, hard-deleted-exercise noop, name-collision safety, custom-exercise byte-identity, conflict untouched + sticky on a second run, unmapped-seeded-back reporting without double-counting, second-run `updated=0` (both via `reconcileContributions` directly and via the public `runSeed` entry point), and the combined independent-counter cross-check.
- `pnpm build` — succeeds.
- `pnpm db:migrate` against local PostgreSQL 16 — applied cleanly, no changes (already at migration `0007`).
- `pnpm db:generate` drift check — **"No schema changes, nothing to migrate"**, both before and after the real seed runs. No migration generated or hand-edited, as expected for a data-only release.
- Real local seed run twice against `gymapp` — summary lines above, verified against live query state.
- Deeper real-Postgres scenario run (disposable `gymapp_r2check`, migrated from scratch, dropped after use) — conflict/unmapped/custom paths confirmed identically to the PGlite predictions.
- `pnpm test:e2e` — **18/21 passed.** 3 failures, none a Release 2 defect:
  - `deload.spec.ts` and `progression.spec.ts` (both `Expected: 65, Received: 60`) — the same pre-existing, unrelated fixture-state drift documented and root-caused in the Release 1 independent review (§6: an unordered `select … limit 1` binds the e2e fixture to whichever exercise happens to sort first, and that exercise's accumulated real session history — 45+ logged sets on the shared dev database — drifts the load-progression engine's recommendation). Zero code-path overlap with this release; the Release 1 review already proved these pass on a clean database.
  - `muscleTaxonomyV2.spec.ts` › *"a legacy seeded Back contribution renders as Unclassified Back and survives an unrelated save"* — fails because "Barbell Row" **no longer has a legacy `back` contribution**: this session's own real-Postgres verification run (above) correctly reconciled it to `upper_back`, exactly as Release 2 is designed to do. This is the reconciliation working, not a defect — confirmed directly: `Barbell Row` now shows `upper_back` primary + the three original secondaries, zero `back` rows. The test's Release-1-era fixture assumption ("a real catalog exercise still carries legacy `back`") is permanently invalidated by a successful Release 2 reconciliation against the same database, which is the intended, one-time effect of this release. The other two `muscleTaxonomyV2.spec.ts` scenarios (picker/capacity, and the direct-DB-seeded legacy-back fixture) construct their own fixture rather than relying on catalog state, so they are unaffected and both pass. Updating this one Release-1 test's fixture is E2E harness maintenance unrelated to Release 2's own deliverables and is out of this task's explicit scope; left unmodified.

## Architecture-review dispositions

| Finding | Disposition |
|---|---|
| M-1 — "conflicts are unreachable by construction" | **Corrected in ADR-010.** Now states conflicts are reachable via a deliberate Release-1 carry-through-plus-sibling-leaf edit, are unreachable only through reconciliation itself or creation, and are sticky (re-reported every run until manually resolved). Matches the implemented and tested behavior exactly. |
| M-2 — reporting scoped only to the 14 mapped slugs | **Corrected in ADR-010 and implemented.** New `seededDirectBackUnmapped` counter + per-row `::warning::` lines close the gap; verified never to double-count a mapped conflict. |
| M-3 — the reconciliation line is an effective-series identity, unqualified | **Not touched, per instruction.** Carried into the Phase 6 build unchanged — no code or doc under this release states or renders that line, so nothing here is affected either way. |
| M-4 — the trap-bar/traps rationale is factually wrong for `other-trap-bar-deadlift` | **Corrected in ADR-010.** The clause is now scoped to `barbell-deadlift`, with `other-trap-bar-deadlift`'s actual contributions (no `traps` row) stated explicitly. Neither mapping target changed. |

## Deferred (deployment-closeout steps, not claimed here)

- Production reconciliation and its summary line.
- The second-production-deploy `updated=0` proof.
- Manual iPhone acceptance of Release 2 (seeded pulls showing Lats/Upper Back, the editor offering 17 leaves).

None of these were run or accessed — no production access, no commit, no push, no deploy, per instruction.

---

## Closeout correction — stale Release-1 E2E fixture (post-review)

**Problem.** `tests/e2e/muscleTaxonomyV2.spec.ts`'s second test ("a legacy seeded Back contribution renders as Unclassified Back and survives an unrelated save") opened the seeded catalog exercise "Barbell Row" and asserted it still carried a legacy direct `back` contribution. Release 2's reconciliation — proven working correctly earlier in this report — deliberately and permanently re-points "Barbell Row" (one of the 14 mapped slugs) onto `upper_back` the first time it runs against a database. This session's own real-Postgres verification runs against the shared dev database already did exactly that, so the test went red against that database: not a Release 2 defect, but a Release-1-era fixture assumption Release 2 intentionally invalidates.

**Fix.** Rewrote the test to build its **own** explicit legacy fixture — a freshly-created exercise with a direct `back` contribution inserted via the same direct-DB-access pattern the file's third test already uses (`getDb()` + a raw insert bypassing `createExercise`'s leaf-only Zod gate, since the app itself can never write a direct `back` row after Release 1) — instead of relying on catalog state. Every original behavior assertion is preserved unchanged: the "Unclassified Back — pick Lats or Upper Back, or leave as-is." note visible before save, the contribution surviving an unrelated ("Save changes" with no edits) save, the library row showing "Unclassified Back", no literal `"undefined"` anywhere, and the note still visible on reopen. Nothing was weakened or deleted — only the fixture source changed, plus test cleanup (delete the now test-owned exercise) was added, matching the third test's existing convention. The third test's own comment, which referenced "the Barbell Row lookup above," was corrected since that fixture no longer exists. No production code was touched — the fixture exposed no defect in `ContributionEditor.tsx`, `ExerciseForm.tsx`, or the service/API layer; the carry-through-and-render behavior worked correctly against the new fixture on the first try.

**Verification.**
- `pnpm lint` — clean.
- `pnpm format:check` — clean.
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean (run for completeness; the change is e2e-only).
- Unit (367/367) and integration (180/180) suites were not re-run — no unit/integration test file or production code changed in this correction, and both were already green in the body of this report.

**Fresh disposable-database E2E run.** Created a new disposable local PostgreSQL 16 database (`gymapp_r2closeout`), applied the full migration chain, bootstrapped it correctly (a lesson from the first attempt: the e2e account must exist *before* `pnpm db:seed` can seed its catalog, and `tests/e2e/seed.ts`'s own Phase 3 program/template/block fixture must be seeded before Phase 3+ specs can run — a first attempt without that bootstrap produced 15 unrelated timeouts, all traced to the missing fixture, not to this release), then ran the complete suite:

```
Running 21 tests using 1 worker
  ok  1 … active-schedule-edit.spec.ts
  ok  2 … deload.spec.ts (manual deload override)
  ok  3 … deload.spec.ts (pending recommendation hidden during deload)
  ok  4 … ensureNoActiveSession.spec.ts
  ok  5 … exerciseDecimalInput.spec.ts (loadStepKg comma)
  ok  6 … exerciseDecimalInput.spec.ts (set weight comma)
  ok  7 … exerciseDecimalInput.spec.ts (3-decimal contribution weight)
  ok  8 … exerciseDecimalInput.spec.ts (3-decimal baselineLoadKg)
  ok  9 … muscleTaxonomyV2.spec.ts (picker/capacity)
  ok 10 … muscleTaxonomyV2.spec.ts (legacy Back renders + survives unrelated save) — the corrected test
  ok 11 … muscleTaxonomyV2.spec.ts (coexistence + reclassify)
  ok 12 … offline-cold-launch.spec.ts
  ok 13 … offline-sync.spec.ts (process relaunch)
  ok 14 … offline-sync.spec.ts (same-process reload)
  ok 15 … progression.spec.ts (completion → recommendation → carry-forward)
  ok 16 … set-deletion.spec.ts
  ok 17 … smoke.spec.ts
  ok 18 … stale-completed-session.spec.ts
  ok 19 … today.spec.ts (same-device reload)
  ok 20 … today.spec.ts (second-session resume)
  ok 21 … today.spec.ts (second-session discard)

  21 passed (1.3m)
```

**21/21 green**, exactly as expected. `deload.spec.ts` and `progression.spec.ts` — the two specs that showed pre-existing fixture-state-drift failures on the shared dev database earlier in this report — both pass in ~1.3s each on the fresh database, consistent with the Release 1 independent review's own root-cause finding that this is dev-database history accumulation, not a defect in either release. Database dropped after the run; no other databases or files touched.

---

## Flag for independent reviewer: `reconcileContributions` concurrency

`reconcileContributions` (`src/db/seed/reconcileContributions.ts`) implements the per-(user, slug) decision as **classify-then-act**: three separate `SELECT` queries (exercise exists / `back` row exists / target-leaf row exists) followed, only in the one qualifying case, by a plain `UPDATE`. This is **not** ADR-010's literal mechanism, which specifies a single atomic conditional `UPDATE ... WHERE ... AND EXISTS (...) AND NOT EXISTS (...)` statement. The implementation report above documents this as a deliberate choice for readability and PGlite/node-postgres portability, justified by "same predicate, same resulting state, same idempotency" under sequential execution — which every test in this report (PGlite and real Postgres alike) confirms. None of that testing exercises genuine concurrent writes, so it cannot confirm or rule out a **specific failure mode** the independent reviewer should assess directly:

**The concern.** Release 1 is live in production during the Release 2 seed step (ADR-010's own two-stage-rollout premise), and Release 1's `updateExercise` permits a user to carry a legacy `back` row through *while adding the target leaf as a sibling contribution in the same save* — exactly architecture-review M-1's scenario, and exactly the row shape `reconcileContributions` calls a "conflict." If that user save commits **between** this implementation's target-leaf-absent check and its subsequent `UPDATE` for the *same exercise*, the `UPDATE` will attempt to set `muscle_group_id = <target>` on a row where `(exercise_id, <target>)` now already exists — a primary-key violation (`exercise_muscle_contributions` PK is `(exercise_id, muscle_group_id)`), not a graceful "conflict" classification. Because the **entire** reconciliation run — every user × every mapped slug, plus both reporting queries — executes inside one `db.transaction`, that single unique-violation would roll back the *whole* transaction, causing `reconcileContributions`, `runSeed`, and `pnpm db:seed` to reject outright. If the deploy pipeline treats a failed seed step as fatal (implied by "the pipeline runs `db:migrate → db:seed → app deploy`" as a blocking sequence), this would fail the deploy — squarely contradicting ADR-010's stated guarantee that "conflicts never fail the deploy."

**What is genuinely unclear and needs the reviewer's judgment, not this session's assumption:**
1. Whether ADR-010's own literal single-statement SQL is actually immune to the identical interleaving under PostgreSQL's READ COMMITTED semantics (per-statement snapshot for the `NOT EXISTS` subquery vs. row-level re-check behavior on the row being updated), or whether it carries the same exposure in a narrower window — this implementation should not be assumed strictly worse without that check.
2. How wide the real window is in practice: it requires a live user request to hit the *exact same exercise* the reconciliation loop is currently processing, within the span of a few sequential `SELECT`s — narrow, but not the "unreachable by construction" ADR-010 originally (and, per M-1's correction in this release, no longer) claims for conflicts in general.
3. Whether the correct remediation (if the reviewer judges one is warranted) is: catching the specific unique-violation on this one `UPDATE` and reclassifying that pair as a `conflict` instead of propagating; reverting to ADR-010's literal single-statement form; or accepting the residual risk as extending the already-accepted "residual race" language in ADR-010 (which currently covers only the simpler carry-through-without-a-sibling-leaf case, not this failure mode).

No production code was changed in response to this flag — per instruction, only a real defect surfaced by a fixture would warrant that, and no test in this session (PGlite, real single-connection Postgres, or the fresh-database E2E run) exercises genuine concurrent writes, so none reproduces this failure mode either way.

---

## Verdict

**READY FOR INDEPENDENT REVIEW**, with the `reconcileContributions` concurrency behavior above flagged as requiring the reviewer's explicit assessment before Release 2 is considered clear for a production deploy.
