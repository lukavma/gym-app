# Exercise catalog expansion — implementation report (Catalog Expansion 1)

Date: 2026-09-09
Implementer: Claude Sonnet 5, working directly in `C:\DEV\gym-app`.
Specification implemented: `docs/reviews/exercise-catalog-expansion-evaluation.md`, verdict **APPROVED — READY FOR CATALOG EXPANSION IMPLEMENTATION** (`docs/reviews/exercise-catalog-expansion-revision-verification-2.md`). O-1…O-5 and D-CE1-1(a) are accepted and are not reopened here.
Repository state at start: branch `main`, `HEAD = 56ec000`, working tree carrying the pre-existing uncommitted changes listed below (all preserved, none touched by this pass). Nothing has been committed, pushed or deployed.

**Corrected 2026-09-10** against `docs/reviews/exercise-catalog-expansion-implementation-review.md` (verdict VERIFIED — READY FOR CATALOG EXPANSION DEPLOYMENT), findings F-2 and F-3 only: §5's migration counts and §6.2's "mutation tests" label. Neither correction changes any measured result, file manifest, or verdict — both are wording fixes to already-correct underlying evidence. F-1 (a leftover local server) and F-4 (non-blocking test-quality note) are addressed elsewhere — see `docs/reviews/exercise-catalog-expansion-predeployment-check.md`. The independent review itself is not modified by this correction.

```
 M CLAUDE.md
 D HANDOFF.md
 M docs/input/product-ideas.md
?? .claude/skills/
?? HANDOFF(depracted).md
?? docs/reviews/repository-agent-workflow-evaluation.md
?? docs/reviews/repository-agent-workflow-review.md
?? docs/reviews/warmup-routines-evidence-research.md
?? gpt-handoff.md
?? gpt-memory.md
```

Verified untouched at the end of this pass (`git status --short`, re-checked after cleanup) — identical to the above, plus the four authoring/review/verification reports this implementation answers, which this pass also leaves byte-unmodified.

---

## 1. File manifest

**20 files modified, 1 file created.** Every file below is one the specification named; none is outside its scope boundary.

| File | Change |
| --- | --- |
| `src/db/seed/exerciseCatalog.ts` | Appended the exact 24 `SeedCatalogExercise` literals from §10, verbatim, as one contiguous block after the existing 103 entries (positions 104–127) |
| `src/domain/exercises/muscleGroups.ts` | O-5: `"tibialis"` appended to `LEAF_MUSCLE_GROUP_SLUGS`; `tibialis: "Tibialis (Shin)"` added to `MUSCLE_GROUP_DISPLAY_NAMES`; header comment updated to "18 leaves + 1 rollup" |
| `src/db/seed/volumePresets.ts` | O-5: `RP_GENERAL_DESCRIPTION`'s landmark-less list gains "Tibialis (Shin)". No `RP_ROWS` entry added |
| `src/ui/exercises/ContributionEditor.tsx` | D-CE1-1(iii): generalised the rollup-only self-only-option mechanism to any slug outside `LEAF_MUSCLE_GROUPS`; the "Unclassified Back" note stays keyed to `isRollupMuscleGroupSlug` specifically |
| `src/ui/exercises/muscleGroupDisplay.ts` | D-CE1-1(iii): `contributionMuscleLabel` falls back to the raw slug (`?? muscleGroupId`) instead of returning `undefined` for a slug outside the compiled record |
| `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` | Appended Amendment 1 (the §12.4 draft, verbatim) after the existing Consequences section. **No existing line edited** — the 2026-08-23 decision stays legible as taken, per the amendment's own stated intent |
| `docs/architecture/domain-model.md` | §2: "17 leaves + 1 rollup" → 18; leaf list gains `tibialis` |
| `docs/architecture/volume-model.md` | Landmark-less list gains `tibialis`; "17 leaves" → 18 in the MVP-scope Out line |
| `docs/architecture/data-model.md` | §2.3: "18 rows = 17 leaves" → "19 rows = 18 leaves"; §2.17's landmark-less list gains `tibialis` |
| `docs/architecture/implementation-plan.md` | Four historical-phase sentences (Pre-Phase 6 and Phase 6) **annotated, not rewritten** — each gains a parenthetical "(superseded by ADR-010 Amendment 1 — 18 leaves; `muscle_groups` becomes 19 rows)", following the file's own `:95` precedent |
| `docs/architecture/evidence-to-design.md` | Row 19 gains one clause recording Amendment 1 under the same convention/tier. No new evidence row |
| `tests/unit/muscleGroups.test.ts` | `EXPECTED_LEAVES` gains `tibialis`; counts 17→18, 18→19 everywhere they appear; new `tibialis` display-name assertion added to the `:69` group; the `:52` fourteen-pre-existing-leaves title is left verbatim (R-3) |
| `tests/unit/exerciseCatalog.test.ts` | "is exactly 103 entries" → 127; Release-3 placement test restated as the §11.5 contiguity assertion; `adductors` assertion made order-insensitive over 5 slugs; exemption set 13→22; new `CATALOG_EXPANSION_1_ENTRIES` describe block (contiguity, per-entry `it.each`, `loadBasis`/`laterality`/`mechanics`/`volumeCounting` counts, tibialis contribution check) |
| `tests/unit/volumePresetsSeed.test.ts` | `NO_RP_ROW_LEAVES` gains `tibialis` |
| `tests/unit/exerciseSchema.test.ts` | NC-F: two new tests — create rejects an unrecognised slug (`"obliques"`), update rejects one too; one new test confirming `createExerciseSchema` accepts `tibialis` |
| `tests/unit/muscleGroupDisplay.test.ts` **(new)** | NC-E: `contributionMuscleLabel` unit tests — a known leaf, the new `tibialis` leaf, the `back` rollup ("Unclassified Back"), and an unrecognised slug (raw slug, no prefix) |
| `tests/integration/seed.integration.test.ts` | Muscle-group count 18→19, with position/displayName assertions for `tibialis` and `back`; new stored-shape table for the nine Catalog Expansion 1 entries with explicit fields; new `barbell-rack-pull` `loadBasis: 'unspecified'` witness; new `bodyweight-tibialis-raise` D-CE1-1(ii) contribution-shape test; three new Catalog-Expansion-1 preservation witnesses (edit-survives, hard-delete-not-resurrected, deterministic-id pin) on `bodyweight-tibialis-raise` |
| `tests/integration/volumePresetsSeed.integration.test.ts` | `NO_RP_ROW_LEAVES` gains `tibialis`; leaf-count assertion 17→18 |
| `tests/integration/reconcileContributions.integration.test.ts` | `NOT_PRE_V2_SLUGS` gains all 24 new slugs via a new `CATALOG_EXPANSION_1_SLUGS` list, declared once per the file's own convention |
| `tests/integration/exercises.integration.test.ts` | New test: create + update round trip on the `tibialis` leaf end-to-end through the real service, confirming no `calves` credit |
| `tests/e2e/muscleTaxonomyV2.spec.ts` | Option list/leaves array/cap comments updated 17→18/16→17/18→19 (L-7); `:66`'s `not.toContain("Back")` and the two legacy-rollup specs (NC-D) left verbatim; two new tests (NC-A/B/C/E) for the unknown-slug fallback |

**Not touched, as required:** any migration or `drizzle/` file, any schema/sync/DTO/server-validation/progression/e1RM/volume/metrics/warm-up file, any deployment-workflow file, any new reconcile step, any existing seeded catalog entry, any equipment value, and any UI file beyond the two named above.

---

## 2. Source implementation, verified against the spec

### 2.1 The 24-entry catalog block

`src/db/seed/exerciseCatalog.ts` — the §10 block was copied verbatim (including every rationale comment) and appended after the existing 1,222-line file's closing `];`, immediately after the Release-3 athletic block. Positions 104–127, matching §6's manifest exactly. Confirmed by the new `CATALOG_EXPANSION_1_ENTRIES` contiguity test (§4.2 below) and by the fresh-database DB verification (§6).

### 2.2 O-5 — the `tibialis` leaf

- `LEAF_MUSCLE_GROUP_SLUGS`: `tibialis` appended last → position 18; `back` (rollup) moves to 19 automatically, since `MUSCLE_GROUPS` derives `position` from array index.
- `MUSCLE_GROUP_DISPLAY_NAMES.tibialis = "Tibialis (Shin)"` — type-enforced by `Record<MuscleGroupSlug, string>`, so this could not have been omitted without a `pnpm typecheck` failure.
- `ROLLUP_MEMBERS.back` unchanged (`["lats", "upper_back"]`) — `tibialis` joins no rollup.
- `RP_GENERAL_DESCRIPTION` updated; **no `RP_ROWS` entry added** for `tibialis` — confirmed by the DB check that `volume_landmarks` has no `tibialis` row (§6.1) and by `tests/unit/volumePresetsSeed.test.ts`'s `NO_RP_ROW_LEAVES`.
- `bodyweight-tibialis-raise`'s only contribution is `tibialis` primary, weight 1.0 — **no `calves` row in either role**, confirmed at the catalog-literal level (unit test), the database level (integration test and live-Postgres check), and the live browser (exploratory verification, §7).

### 2.3 D-CE1-1(iii) — the unknown-slug forward hardening

`ContributionEditor.tsx`'s option-list logic was generalised from "special-case `isRollupMuscleGroupSlug`" to "special-case any value present and not in `LEAF_MUSCLE_GROUPS`":

```ts
const isKnownRollup = isRollupMuscleGroupSlug(row.muscleGroupId);
const currentSelfOnly: MuscleGroupDefinition | undefined =
  row.muscleGroupId !== "" && !isLeafMuscleGroupSlug(row.muscleGroupId)
    ? (MUSCLE_GROUPS.find((group) => group.slug === row.muscleGroupId) ?? {
        slug: row.muscleGroupId,
        displayName: row.muscleGroupId,
        position: -1,
        kind: "muscle",
      })
    : undefined;
```

The amber "Unclassified Back" note stays conditioned on `isKnownRollup` specifically (not the broader `currentSelfOnly`), so a genuinely unrecognised slug never gets mistaken for a rollup. `muscleGroupDisplay.ts`'s `contributionMuscleLabel` now returns `MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId] ?? muscleGroupId`. Total diff: 14 lines across the two files (spec estimated "about ten").

### 2.4 ADR-010 amendment and companion documents

The amendment was **appended**, not merged into the existing body — the file's `git diff` shows zero changed lines before the append point, only 31 new lines after it. This matches the spec's explicit design intent ("written as an appended amendment... so the accepted 2026-08-23 decision stays legible as it was taken").

`implementation-plan.md`'s four historical-phase sentences were **annotated with a parenthetical, not rewritten**, following the file's own `:95` precedent (`git diff` confirms the original sentences are intact, each with one clause appended). `evidence-to-design.md` row 19 gained one clause; no new evidence row was added, matching the spec's explicit instruction that a new row would "claim support this leaf does not have and does not need."

---

## 3. Test changes — §11.6 / §12.3, verified

Every change in the manifest table above was cross-checked against the exact line-level instructions in the spec's §11.6 and §12.3 tables (which were themselves independently verified against `HEAD` three times across the review chain). One gap was caught and fixed during this pass: `tests/unit/volumePresetsSeed.test.ts`'s own `NO_RP_ROW_LEAVES` list (distinct from the *integration* test file of the same name) was missed on the first pass and corrected before the final verification run below.

### 3.1 Negative controls (§12.8) — placement and results

| Id | Claim | Where implemented | Result |
| --- | --- | --- | --- |
| NC-A | Unknown slug renders as itself, never blank | Unit: `muscleGroupDisplay.test.ts`. E2E: `muscleTaxonomyV2.spec.ts` (picker value + option text) | PASS |
| NC-B | Round-trip preservation, asserted on the payload | E2E: `muscleTaxonomyV2.spec.ts`, intercepting the outgoing PATCH request body | PASS — see §3.2 for the placement rationale |
| NC-C | Not offered to a new row | E2E: `muscleTaxonomyV2.spec.ts` | PASS |
| NC-D | Existing rollup specs pass unchanged | The two pre-existing `back`-rollup e2e tests in `muscleTaxonomyV2.spec.ts`, run byte-for-byte as they were before this change | PASS (both) |
| NC-E | "Unclassified " reserved for rollups only | Unit: `muscleGroupDisplay.test.ts`. E2E: confirmed absent for the unknown-slug fixture | PASS |
| NC-F | Server validation unchanged | Unit: `exerciseSchema.test.ts` (create/update reject an unrecognised slug). Integration: pre-existing `exercises.integration.test.ts` rollup-carry-through tests, unchanged and re-run green; new tibialis create/update test added | PASS |

### 3.2 One deliberate deviation from the spec's suggested test level, disclosed

The spec categorised NC-A/B/E as unit-level. NC-A and NC-E are implemented at unit level as specified (`tests/unit/muscleGroupDisplay.test.ts`). **NC-B is implemented at e2e level instead of unit level**, for a concrete reason discovered during implementation: the payload-building logic (`buildContributionsPayload`) lives inside `ExerciseForm.tsx`, is not exported, and `ExerciseForm.tsx` is outside this release's two-file UI scope. There is no way to unit-test it without either exporting it (a scope violation) or reproducing it (which would test a duplicate, not the real code).

The e2e test instead intercepts the actual outgoing `PATCH` request via `page.waitForRequest` and asserts on `request.postDataJSON()` — this is *more* direct evidence for NC-B's literal claim ("asserted on the payload, not the DOM") than a unit test of internal state would have been, and it exercises the real `ExerciseForm.tsx` code path end to end. One consequence worth recording: the fixture slug used (`"obliques"`) is deliberately **not** in this bundle's compiled vocabulary at all (simulating "not yet added"), so the real server's own Zod schema correctly rejects the PATCH with a 400 — this is itself a NC-F proof, not a defect. The test does not depend on the save succeeding; it asserts only on the constructed payload.

---

## 4. Static and automated verification

All commands below were run against the final state of the working tree (after cleanup — no scratch files present).

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | Clean, no output beyond the command echo |
| Lint | `pnpm lint` | Clean, no output beyond the command echo |
| Format | `pnpm format:check` | "All matched files use Prettier code style!" — the pre-existing `sync/service.ts` CRLF issue noted in prior sessions did not reappear (that file is untouched by this pass) |
| Unit suite | `pnpm test:unit` | **83 files passed, 1183 tests passed**, 0 failed |
| Integration suite | `pnpm test:integration` | **28 files passed / 6 skipped (34 total), 465 tests passed / 17 skipped (482 total)**, 0 failed. The 6 skipped files are pre-existing concurrency specs gated behind a flag unrelated to this change |
| Production build | `pnpm build` | Exit code 0. All routes compiled; `/exercises`, `/exercises/new`, `/exercises/[id]`, `/volume` all present in the route table |

### 4.1 Schema-generation no-op (§12.5's load-bearing claim)

Run against a disposable Postgres 16 container (`gym-app-ce1-verify`, port 55432, migrated to the current 14-file `drizzle/` state):

```
$ DATABASE_URL=postgres://gymapp:gymapp@localhost:55432/gymapp pnpm db:generate
...
24 tables
...
No schema changes, nothing to migrate 😴
```

`git status --short drizzle/` was empty before and after; `drizzle/*.sql` file count stayed at 14. The §12.5 claim is confirmed mechanically, not merely asserted — no migration was generated, investigated, or discarded.

---

## 5. Database verification — disposable real PostgreSQL, explicit connection overrides

**No production or persistent-development database was contacted at any point.** Three disposable Postgres 16 Docker containers were created for this pass, each on its own non-default port with an explicit `DATABASE_URL` override, and all three were removed at the end (§8). The standing `gym-app-db-1` compose container was never started or touched — it was already stopped (`Exited (0) 18 hours ago`, confirmed both before and after this pass) and unrelated to any command run here.

### 5.1 Fresh-user scenario (`gym-app-ce1-verify`, port 55432)

Sequence executed with the real `db:migrate` and `db:seed` CLI commands (not the PGlite-backed integration harness):

1. `db:migrate` — a fresh database applies **all 14** pre-existing migrations (unchanged in count; confirmed via `select count(*) from drizzle.__drizzle_migrations`, per the independent implementation review's F-2, since `drizzle-kit migrate` itself prints a spinner rather than a count).
2. `db:seed` (round 1, zero users) — `taxonomy-v2 reconciliation: users=0`.
3. A user inserted directly (mirroring `setupAccount`'s own insert).
4. **`muscle_groups` queried before the catalog seed**: exactly **19 rows**, `tibialis` at position 18 (`kind='muscle'`, `displayName='Tibialis (Shin)'`), `back` at position 19 (`kind='rollup'`), all 17 pre-existing leaves at their original positions 1–17.
5. `db:seed` (round 2, catches up the new user) — `taxonomy-v2 reconciliation: users=1 mapped=14 updated=0 noop=14`.
6. Full assertion script run against the live database (30 checks, all **PASS**): exercise count = **127**; `Tibialis Raise` has exactly one contribution (`tibialis`, primary, weight 1.0, no `calves`); per-slug measurement shape for `Assisted Dip` (`loadBasis=assistance`), `Dumbbell Farmer's Hold` (`load_duration`/`per_hand`), `Forward Sled Drag` and `Hand-Over-Hand Sled Pull` (`load_distance`/`total`), `Medicine Ball Rotational Scoop Throw` (`load_reps`/`total`); `Barbell Rack Pull` stores `loadBasis='unspecified'` (proving the omitted-loadBasis default resolves correctly, not silently to `NULL`); `Dead Hang`/`Wall Sit`/`Lateral Bound`/`Copenhagen Adduction Plank` store `loadBasis=NULL` (no load field); no `volume_landmarks` row for `tibialis`; `RP_GENERAL_DESCRIPTION` mentions "Tibialis".
7. `db:seed` (round 3) — exercise count and muscle-group count unchanged (127 / 19): **repeat-seed idempotence confirmed**.
8. **Preservation, against the real CLI pipeline** (not PGlite): renamed `Tibialis Raise` → reseeded → edit survived. Hard-deleted it → reseeded → not resurrected, 126 exercises remain. Its id matched `seededExerciseId`'s derivation both before and after a further reseed: **deterministic-id stability confirmed**.

### 5.2 Existing-user scenario (`gym-app-ce1-existing`, port 55433)

A detached git worktree was created at `56ec000` (this repository's own commit, pre-Catalog-Expansion-1) in `C:\tmp\gym-app-worktrees\pre-ce1`, with its own `pnpm install`, so the "before" state could be produced by the actual old code rather than simulated by hand-editing the working tree (which would have risked corrupting the concurrently-running static checks).

1. **Old code**, port 55433: `db:migrate`, `db:seed` (creates the 18-leaf vocabulary, no users), a user inserted, `db:seed` again — seeds the **103-entry pre-expansion catalog** for that user.
2. Four mutations applied directly, mirroring the established preservation-test pattern: renamed `Barbell Back Squat`, edited its `glutes` contribution weight to 0.75, removed `Barbell Deadlift`'s `traps` contribution, hard-deleted `Plank`. Snapshot taken: **18 muscle groups, 102 exercises (103 − 1), 259 contributions, 52 landmarks**.
3. **New code** (this repository, unmodified working tree), same port 55433: `db:migrate` — an already-migrated database applies **zero new** migrations, `db:seed`.
4. Snapshot taken again: **19 muscle groups, 126 exercises, 330 contributions, 52 landmarks.**
5. A field-by-field diff script compared the two snapshots. **517 assertions, 0 failures**:
   - All 17 pre-existing leaves byte-identical (`displayName`/`position`/`kind`); `back` moved from position 18 → 19, unchanged otherwise; `tibialis` inserted at position 18 with the correct `displayName`.
   - All **102** pre-existing exercises byte-identical across every stored column (name, equipment, mechanics, laterality, measurementProfile, loadBasis, volumeCounting, loadStepKg, isSeeded) — the renamed squat kept its new name, the deleted plank stayed deleted.
   - All **259** pre-existing contributions byte-identical (role, weight) — the edited 0.75 weight and the removed `traps` row both survived exactly.
   - **Exactly 24 new exercise rows** inserted, and their names match the approved manifest exactly (set equality, both directions).
   - Contribution count grew by **exactly 71** — the sum of the 24 new entries' own contribution counts, computed independently from the catalog literal (5+5+4+3+3+3+3+3+4+3+1+1+3+2+1+2+2+4+2+1+4+5+4+3 = 71) and confirmed against the database.
   - `volume_landmarks` count unchanged at **52** (no new row for `tibialis`), and every landmark value byte-identical.
6. `db:seed` run a second time against the upgraded database: exercise count and muscle-group count unchanged (126 / 19) — **existing-user idempotence confirmed**.

This is the accounting §16.4 asked for: *value* equality on every pre-existing row, not statement counts (L-4) — `seedMuscleGroups` and `seedVolumePresets` legitimately re-upsert every row on every run, which is why the diff compares field values rather than relying on "0 rows touched."

---

## 6. Browser verification

### 6.1 The required `muscleTaxonomyV2` e2e spec

Run against a third disposable Postgres (`gym-app-ce1-e2e`, port 55434) and a real `next start` server pointed at it via `DATABASE_URL` override (the same command Playwright's own config would run: `pnpm build && pnpm start`, with `reuseExistingServer: true` allowing this manually-started instance to be reused).

```
5 passed (5.2s)
```

All five tests, including the two pre-existing legacy-rollup tests (NC-D, unmodified) and the two new unknown-slug tests (NC-A/B/C/E) — this is the automated regression suite, distinguished below from the exploratory live-browser pass.

### 6.2 Exploratory live-browser verification (not part of the permanent suite)

Two scenarios were driven through the real running app against the seeded e2e account (127 exercises, active program/block via the existing `tests/e2e/seed.ts` fixture script). These are **live browser walkthroughs that write real data through the UI and network layer** — exploratory verification, not the testing technique "mutation testing" (which deliberately breaks the implementation to confirm a test would catch it; none was performed here) — and not the automated regression assertions above. They were written as a temporary spec file, run, and then deleted; nothing from this section is checked into the repository. Genuine mutation testing of this release's negative controls was performed independently by `docs/reviews/exercise-catalog-expansion-implementation-review.md` §5.1, which is not this report's work and is not restated here.

**Dumbbell Farmer's Hold (`load_duration`, RR-8's "first live exercise" risk):**
- Prescribed onto a temporary template with a `durationRounds` scheme, exactly as an athlete would.
- The workout card rendered **weight + time** inputs, with **no reps input** — the `load_duration` field matrix, exercised for the first time by a real seeded catalog entry.
- Logged a set (24 kg / 40 s) online — rendered and persisted correctly.
- Logged a second set (24 kg / 35 s) **while the browser context was offline** (`context.setOffline(true)`) — the set appeared locally immediately, confirming it queued rather than blocking or erroring.
- Returned online; the outbox drained to `{pending: 0, dead: 0}` with **zero dead letters** — the offline-then-sync round trip succeeded for `load_duration`'s first real catalog use.
- History showed both sets, correctly formatted, and nothing else.

**Tibialis Raise:**
- The exercise's own edit page: the contribution picker showed **"Tibialis (Shin)" as the selected option** — not "Select muscle…" — the direct visual proof that this client is out of Window B, per §16.8's required device-acceptance check.
- The exercise library's search result row rendered "Tibialis (Shin)" as the contribution label — never blank.
- Logged an ordinary set (0 kg × 20 reps) through an ad-hoc-added workout slot.
- The Volume screen showed a **"Tibialis (Shin)" row with "No reference range"** (no invented band, matching the five other landmark-less leaves) and no `Calves` credit anywhere on that row.

Two implementation bugs in the *test script itself* (not the product) were found and fixed during this pass: a missing `dialog` handler before "Complete workout" (Playwright auto-dismisses unhandled confirm dialogs, which silently cancelled the completion and made the test hang, not the app), and a stray `ensureNoActiveSession()` call issued from the wrong page. Both are recorded here for transparency since they cost real debugging time; neither reflects a defect in the shipped code.

---

## 7. Boundary and honesty checks

- **No migration, no schema file, no `drizzle/` change** — confirmed in §4.1, both by `git status` and by the mechanical `db:generate` no-op.
- **No sync/DTO change** — `src/domain/sync/schema.ts` and `src/sync/**` were not touched; grepped and confirmed unchanged.
- **No server-validation broadening** — confirmed by NC-F (§3.1): an unrecognised slug is still a 400 on both create and update, and a known rollup is still accepted only as carry-through (pre-existing integration test, re-run green, unmodified).
- **No progression/e1RM/aggregation-arithmetic change** — no file under `src/domain/strength/`, `src/domain/progression/`, or `src/domain/volume/aggregate.ts` was touched.
- **No new UI change beyond the two named files** — `git status --short` confirms this; `ExerciseForm.tsx`, `VolumeScreen.tsx`, `MuscleRow.tsx`, `ExerciseLibrary.tsx` are all unmodified.
- **Regression vs. exploratory distinction** — §3.1/§6.1 are the automated regression suite (existing + new assertions, run unmodified against the shipped code); §6.2 is exploratory live-browser evidence, clearly separated and not claimed as permanent coverage or as mutation testing in the testing-technique sense.
- **Nothing overstated**: the 517-assertion existing-user diff and the 30-assertion fresh-user check are both closed-form (every check either passed or would have printed `FAIL:` and set a non-zero exit code — neither script's output was filtered or cherry-picked). The full unit and integration suite counts above are the complete, final runs against the cleaned-up working tree, not partial or pre-fix runs.

---

## 8. Cleanup

- **Docker**: all three disposable containers (`gym-app-ce1-verify`, `gym-app-ce1-existing`, `gym-app-ce1-e2e`) removed (`docker rm -f`). `docker ps -a` afterward shows only the pre-existing, already-stopped `gym-app-db-1` compose container — untouched throughout.
- **Git worktree**: `C:\tmp\gym-app-worktrees\pre-ce1` removed via `git worktree remove --force`; `git worktree list` shows only the main checkout afterward; the temporary directory was deleted.
- **Local server process**: the manually-started `pnpm start` instance was stopped.
- **Scratch files**: the local `.scratch/` directory (verification and diff scripts, never git-tracked) and the temporary `tests/e2e/_tmp-verification.spec.ts` file were both deleted. `test-results/` (Playwright's own output directory) was removed.
- **Working tree**: `git status --short` at the end of this pass shows exactly the 20 modified + 1 new file in §1, plus the same pre-existing untouched files listed in the header — nothing else.

---

## 9. Explicitly pending — not performed in this pass

Per the task's own instruction, these remain outstanding and are **not** claimed as done:

- **Production exercise-name collision check for all 24 names** (§16.6), by the method of `athletic-measurement-profiles-release-3-predeployment-check.md`. Not run — this implementation never contacted production.
- **D-CE1-1 deployment controls** (§16.7): updating every client used with the account and confirming "Tibialis (Shin)" is selectable **before** the entry is opened; the post-deployment read-only verification that `bodyweight-tibialis-raise` holds exactly one `tibialis` primary and no `calves` row, run against production. Neither has occurred — there has been no deployment.
- **Device acceptance on the iPhone** (§16.8) — not performed. The exploratory browser verification in §6.2 covers the same functional ground (load_duration first use, Tibialis picker/label/volume) but is not a substitute for on-device acceptance, and RR-12 is explicit that no forward hardening in this commit protects an already-installed bundle.
- **Commit, push, and deploy** — none has occurred. The working tree holds the implementation, unmodified from what is described above.

New hardening in `ContributionEditor.tsx`/`muscleGroupDisplay.ts` does not protect already-installed old bundles (§12.6, §12.8, RR-12) — this remains true after implementation exactly as the specification described it.

---

READY FOR INDEPENDENT CATALOG EXPANSION REVIEW
