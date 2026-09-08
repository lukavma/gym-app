# Athletic measurement profiles — Release 3 catalog: implementation report

Date: 2026-09-08
Implements: the O-10(ii) gate discharged by `docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md` (revised), independently reviewed (`docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md`, verdict REVISION REQUIRED, all findings addressed in the revision) and verified (`docs/reviews/athletic-measurement-profiles-release-3-catalog-revision-verification.md`, verdict **APPROVED — READY FOR RELEASE 3 IMPLEMENTATION**).
Binding upstream: `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §16, §21.3, §24.3, A-17; owner decisions O-10(i), O-10(ii); ADR-010.
Repository state before this work: branch `main`, `HEAD = 4865a02` ("feat: add athletic measurement profiles release 2"), working tree carrying the same pre-existing uncommitted changes the authoring/review/verification documents record (`CLAUDE.md`, deleted `HANDOFF.md`, `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, and the three `docs/reviews/repository-agent-workflow-*` / `warmup-routines-evidence-research.md` files) — **all preserved untouched by this pass**; see §7.

D-R3-1 was owner-accepted as option (a) before this implementation began: `other-sled-drag` is the **backward** drag, named "Backward Sled Drag". This report implements the exact ten entries authored in §5 of the authoring document, with no reinterpretation of any entry's metadata or muscle assignments.

**Nothing in this pass is committed, pushed or deployed.** All source, test and documentation changes described below are in the working tree only.

### Correction note (2026-09-08, post-independent-review)

This report was corrected against `docs/reviews/athletic-measurement-profiles-release-3-review.md` (independent implementation review, verdict **VERIFIED — READY FOR RELEASE 3 DEPLOYMENT**, recorded in full at §9 below). Three findings were addressed, **documentation-only — no code, test, authoring or independent-review file was touched**:

- **M-1 (MEDIUM):** §8's production name-collision checklist quoted "Dumbbell Suitcase Carry" twice and omitted "Side Plank" — nine distinct names where ten were required. Corrected to the exact ten, cross-checked against the actual `EXERCISE_CATALOG` Release-3 entries (§2 below).
- **L-1 (LOW):** §4.1 and §4.3 below previously labelled `reconcileContributions`'s no-op result as satisfying authoring §8.4's A-17 requirement. That requirement is about `reconcileMeasurementProfiles`, a different function this report never exercised directly. Corrected to attribute the direct `reconcileMeasurementProfiles` verification to the independent review's §3.3, not to this report's own evidence.
- **L-2 (LOW):** §1's diff counts for the two test files were `--stat`-style totals miscoded into the `+`/`−` columns. Re-derived from `git diff --numstat` and corrected.

L-3 and L-4 (a self-referential unit assertion and a stale "both sites" comment, both in test code) and INFO-1/INFO-2 are non-blocking per the review and are **not** addressed here — this correction is documentation-only, and code/comment changes are outside this pass's scope.

---

## 1. What changed — exact file manifest

| File | Change | Diff |
| --- | --- | --- |
| `src/db/seed/exerciseCatalog.ts` | Appended the ten approved entries after the existing 93, as one trailing `// Athletic (Release 3)` block; added the block's header comment (authoring rule + approval citation, §24.3) | +189 / −0 |
| `tests/unit/exerciseCatalog.test.ts` | Adductor-exclusivity assertion updated to the exact two-slug set (M-2); catalog-count assertion updated 93→103; "untouched fields" assertion widened to exempt the ten athletic slugs; new `RELEASE_3_ATHLETIC_SLUGS` / `RELEASE_3_ENTRIES` fixtures and a new `describe("Release 3 athletic catalog (O-10(i)/(ii))")` block (placement, per-entry metadata/contributions, loadBasis five/five split, laterality, mechanics, volumeCounting, strengthEstimate) | +271 / −5 |
| `tests/integration/seed.integration.test.ts` | New: exact stored-metadata/contributions/default-weights test for all ten (fresh seed, PGlite); deterministic-id pin for `bodyweight-box-jump`; hard-delete preservation witness for `bodyweight-box-jump` (§8.7) | +102 / −0 |
| `tests/integration/reconcileContributions.integration.test.ts` | New shared `RELEASE_3_ATHLETIC_SLUGS` / `NOT_PRE_V2_SLUGS` constants; all **three** sites that build a "full catalog minus `machine-hip-adduction`" pre-v2 fixture (two named by the authoring doc at the pre-edit `:161-163` / `:496-498`, plus one additional site at the pre-edit `:574-576` in the "counters exactly match database state" cross-check test, found during implementation and fixed for the same fixture-honesty reason, L-2) now also exclude the ten Release-3 slugs | +30 / −9 |
| `docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md` | Narrow, explicitly authorized correction only: §8.4's residual R-1 typo "six load-less entries" → "five load-less entries" | 1 word |

Diff counts above are `git diff --numstat` against `HEAD` (re-derived and corrected during the L-1/L-2 review pass — see the correction note above; the original figures for the two test files were `--stat`-style totals miscoded into the `+`/`−` columns).

The independent review and revision-verification reports are **untouched**, per instruction.

No migration file was added or edited (`drizzle/` is unchanged — confirmed by `git status`, latest migration remains `0013`). No schema, sync, DTO, IndexedDB, UI component, progression, e1RM, volume-arithmetic, metrics or reconcile-script change.

---

## 2. Catalog change

The ten entries were appended verbatim from authoring §5 (which the revision-verification pass confirmed differs from the reviewed version by exactly one non-data comment), in this exact order, as the last ten elements of `EXERCISE_CATALOG`:

1. `other-sled-push` — Sled Push
2. `other-sled-drag` — Backward Sled Drag (D-R3-1 (a))
3. `other-farmers-carry` — Farmer's Carry
4. `dumbbell-suitcase-carry` — Dumbbell Suitcase Carry
5. `bodyweight-sprint` — Sprint
6. `bodyweight-shuttle-run` — Shuttle Run
7. `other-med-ball-slam` — Medicine Ball Slam
8. `bodyweight-broad-jump` — Broad Jump
9. `bodyweight-box-jump` — Box Jump (A-14/A-17 named witness)
10. `bodyweight-side-plank` — Side Plank

All ten carry explicit `measurementProfile` and `volumeCounting: "off"`. `loadBasis` is explicit on exactly the five load-bearing entries (`other-sled-push`/`other-sled-drag`/`other-med-ball-slam`: `"total"`; `other-farmers-carry`/`dumbbell-suitcase-carry`: `"per_hand"`) and omitted on the five load-less entries (`bodyweight-sprint`, `bodyweight-shuttle-run`, `bodyweight-broad-jump`, `bodyweight-box-jump`, `bodyweight-side-plank`). `strengthEstimate` and `loadStepKg` are omitted on all ten, so existing contribution/seeder defaults apply (`DEFAULT_CONTRIBUTION_WEIGHT`, `DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT`, `DEFAULT_STRENGTH_ESTIMATE_MODE`). No existing entry was moved, reordered or edited.

The block's header comment records the R3 authoring rule (explicit `measurementProfile`/`loadBasis` iff load-bearing/`volumeCounting`, `strengthEstimate` omitted because the structural gate refuses all ten), cites the authoring/review/verification chain, and restates the append-last placement constraint with its exact reason (`reconcileContributions.integration.test.ts`'s `ORIGINAL_40_SLUGS` positional window) — discharging §24.3's documentation requirement via the catalog's own header comment, the option that section names as an alternative to `domain-model.md` §3.

---

## 3. Repository-required checks

All run from a clean working tree with only the changes in §1, in this repo (`C:\DEV\gym-app`), PowerShell, no destructive flags:

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | Clean, no errors |
| Lint | `pnpm lint` | Clean, no errors |
| Format | `pnpm format:check` | "All matched files use Prettier code style!" |
| Unit tests | `pnpm test:unit` | **82 files / 1145 tests passed**, 0 failed (includes the 34 tests in the rewritten `tests/unit/exerciseCatalog.test.ts`) |
| Integration tests | `pnpm test:integration` | **28 files / 458 tests passed, 17 skipped** (the 17 are the repo's existing real-Postgres-only concurrency specs, gated on `*_CONCURRENCY_DATABASE_URL`, unrelated to this change and skipped identically before this work) |
| Production build | `pnpm build` | `next build` — compiled successfully, 40/40 static pages generated, no type/lint errors surfaced by the build step |

`seed.integration.test.ts` and `reconcileContributions.integration.test.ts` specifically: **40/40 tests passed** (21 + 19), confirmed in an isolated re-run.

---

## 4. Disposable PostgreSQL verification

Per CLAUDE.md, all of this ran against the local Docker PostgreSQL instance (`gym-app-db-1`, already running, `localhost:5432`), using **disposable databases created and dropped for this task only** — the persistent `gymapp` development database was never connected to or modified.

### 4.1 Fresh seed → exact stored shape (new evidence)

Database `gymapp_r3_verify`, migrated to `0013` (`pnpm db:migrate`), then a real user row + `seedExerciseCatalogForUser` (the same function `pnpm db:seed` calls):

- `EXERCISE_CATALOG.length === 103`; last ten slugs equal the approved order exactly.
- Fresh user: **103 exercise rows** inserted. Each of the ten athletic entries' stored `measurement_profile` / `load_basis` / `volume_counting` and every contribution row (`muscleGroupId`, `role`, `weight`) matched the approved values exactly — captured output:

  ```
  other-sled-push          profile=load_distance  basis=total      volCounting=off contributions=[quads:primary:1, glutes:primary:1, hamstrings:secondary:0.5, calves:secondary:0.5, abs:secondary:0.5]
  other-sled-drag          profile=load_distance  basis=total      volCounting=off contributions=[quads:primary:1, glutes:secondary:0.5, calves:secondary:0.5, abs:secondary:0.5, forearms:secondary:0.5]
  other-farmers-carry      profile=load_distance  basis=per_hand   volCounting=off contributions=[forearms:primary:1, traps:secondary:0.5, abs:secondary:0.5]
  dumbbell-suitcase-carry  profile=load_distance  basis=per_hand   volCounting=off contributions=[abs:primary:1, forearms:primary:1, traps:secondary:0.5, lower_back:secondary:0.5]
  bodyweight-sprint        profile=distance_time  basis=null       volCounting=off contributions=[hamstrings:primary:1, glutes:primary:1, quads:secondary:0.5, calves:secondary:0.5, abs:secondary:0.5]
  bodyweight-shuttle-run   profile=distance_time  basis=null       volCounting=off contributions=[quads:primary:1, glutes:primary:1, hamstrings:secondary:0.5, calves:secondary:0.5, adductors:secondary:0.5]
  other-med-ball-slam      profile=load_reps      basis=total      volCounting=off contributions=[abs:primary:1, lats:primary:1, front_delts:secondary:0.5, triceps:secondary:0.5]
  bodyweight-broad-jump    profile=reps           basis=null       volCounting=off contributions=[glutes:primary:1, quads:primary:1, hamstrings:secondary:0.5, calves:secondary:0.5]
  bodyweight-box-jump      profile=reps           basis=null       volCounting=off contributions=[quads:primary:1, glutes:primary:1, calves:secondary:0.5]
  bodyweight-side-plank    profile=duration       basis=null       volCounting=off contributions=[abs:primary:1, lower_back:secondary:0.5, glutes:secondary:0.5]
  ```

  Exactly five `basis=null` (the five load-less entries) and five with a stated basis — confirming M-1/R-1's five/five split lands correctly in the database, not just the literal.
- `reconcileContributions(db)` immediately after the fresh seed: `{"users":1,"mapped":14,"updated":0,"noop":14,"conflicts":0,"customDirectBack":0,"seededDirectBackUnmapped":0}` — a true no-op **for the ADR-010 taxonomy reconcile**.

  **Correction (L-1, independent review):** this is `reconcileContributions`, not `reconcileMeasurementProfiles` — the function authoring §8.4 actually names ("`reconcileMeasurementProfiles` remains a no-op on the fresh database", A-17). This report did not exercise `reconcileMeasurementProfiles` directly and the line above does not speak to it. The independent review's §3.3 ran `reconcileMeasurementProfiles` directly, on both a fresh single user and after two full `pnpm db:seed` runs across three users, and reports it as a true no-op in both cases — see that document for the exact figures; A-17 is discharged by that evidence, not by this section.
- Repeat `seedExerciseCatalogForUser` on the same user: still 103 rows, no duplicates.

### 4.2 Existing user with all 93 legacy slugs → exactly ten additions (new evidence)

Same database, second user, manually seeded with the 93 pre-Release-3 slugs (`EXERCISE_CATALOG` minus the ten athletic slugs — confirmed `=== 93`) via the same row-shaping logic `seedExerciseCatalogForUser` uses (`resolveLoadBasis`, `DEFAULT_CONTRIBUTION_WEIGHT`, `DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT`), plus matching ledger rows:

- Before: **93 exercise rows**, 93 ledger rows.
- Snapshotted `barbell-back-squat`'s row and contribution rows before calling `seedExerciseCatalogForUser`.
- After: **103 exercise rows** — exactly **+10**. All ten new rows matched their approved `measurement_profile`/`load_basis`/`volume_counting`. Ledger grew to **103** rows.
- `barbell-back-squat`'s row and contributions were **byte-identical** before/after (`JSON.stringify` equality on both) — no existing row was touched, re-inserted, or given fresh contributions.
- Repeat seed on this user: still 103 rows (idempotent).

### 4.3 The real deploy entry point

`pnpm db:seed` (the literal script `package.json` and the deploy pipeline invoke) was run twice against the same disposable database after the above (now holding both users): both runs completed with `Seed complete.` and no errors, which is evidence the whole pipeline (`seedMuscleGroups` → `seedVolumePresets` → `reconcileContributions` → `seedExerciseCatalogForAllUsers` → `reconcileStrengthEstimates` → `reconcileMeasurementProfiles`) runs clean twice with the Release-3 catalog in place — no exception, no partial state.

**Correction (L-1, independent review):** the `taxonomy-v2 reconciliation … updated=0` line this run printed is `reconcileContributions`'s own log output (same function as §4.1), not `reconcileMeasurementProfiles` — that function prints nothing, and this run's two clean completions show it didn't error, not specifically that it was a no-op. The independent review's §3.3 measured `reconcileMeasurementProfiles` directly (`{updated:0, noop:5}` on a fresh user, `{updated:0, noop:15}` after two further pipeline runs across three users) — see that document for the authoritative A-17 evidence.

### 4.4 Cleanup

- Verification script (`r3-verify.mts`) was written to the repo root only for the duration of the run and deleted immediately after (`git status` confirms it left no trace).
- Database `gymapp_r3_verify` was dropped (`DROP DATABASE`) after the run. Confirmed absent from `\l` afterward.
- The persistent `gymapp` database and its existing disposable siblings from unrelated prior sessions (`gymapp_e1rm_remediation`, `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`, `gymapp_wuconc`) were left untouched — out of this task's scope.

---

## 5. Browser coverage

No new UI component was added — the ten entries render entirely through the existing exercise-library and exercise-edit-form components (`ExerciseLibrary.tsx`, `ExerciseForm.tsx`). Coverage was therefore end-to-end through the real app on a **third disposable database** (`gymapp_r3_browser`), not a unit-level UI test, to see the actual seeded rows through the actual browser-rendered form.

**Setup** (following this repo's own documented clean-E2E recipe, `docs/reviews` memory / `tests/e2e`): `CREATE DATABASE gymapp_r3_browser` → `pnpm db:migrate` → `pnpm build && pnpm start` (production server, since `pnpm dev` disables the service worker and this app's `getDb()` binds `DATABASE_URL` lazily at first request) → health-check poll on `/api/health` → first `pnpm db:seed` pass (0 users, catalog step correctly a no-op) → Playwright-driven account creation through the real `/setup` form (`next/headers`-based session creation cannot run from a plain script) → second `pnpm db:seed` pass (now seeds the catalog for the created account).

**Pages and actions exercised** (Playwright, Chromium, against `http://localhost:3000`):

1. `/login` → `/setup` → account creation → redirected to `/today`, "Today" heading present.
2. `/exercises` (library list): called the same `GET /api/exercises` the page itself calls — **103 exercises returned**, all ten Release-3 names present (`Sled Push`, `Backward Sled Drag`, `Farmer's Carry`, `Dumbbell Suitcase Carry`, `Sprint`, `Shuttle Run`, `Medicine Ball Slam`, `Broad Jump`, `Box Jump`, `Side Plank` — zero missing).
3. Library search box → "Sled Push" → row visible → clicked into `/exercises/[id]`: form loaded with `name="Sled Push" equipment="other" mechanics="compound" measurementProfile="load_distance" loadBasis="total"` — matches the approved entry exactly, and the conditionally-rendered "Load basis" field correctly appears (load-bearing profile).
4. Back to library → search "Side Plank" → row visible → detail page: `name="Side Plank" equipment="bodyweight" mechanics="isolation" laterality="unilateral" measurementProfile="duration"`, and the "Load basis" field is correctly **absent** (`count = 0`) — `duration` has no load field, exactly as R-6 requires.
5. Back to library → search "Box Jump" (the A-14/A-17 named witness) → row visible → detail page: `measurementProfile="reps"`, and the edit-only "Volume counting" select reads `"off"` — the seeded row's `volume_counting = 'off'` is visibly reflected in the real edit form, not just the database.

**Console/page/network errors**: zero `console.error` events and zero uncaught page errors across the entire run. The only captured entries were `requestfailed` / `net::ERR_ABORTED` on Next.js's own React-Server-Component link-prefetch requests (`?_rsc=...`), which are cancelled by design whenever the browser navigates away before a hover/viewport prefetch completes — a routine artifact of Next's client-side prefetching, not an application error, and not something this change introduced (the same pattern occurs on any Next.js app navigation).

**Cleanup**: the two temporary driver scripts were written to the repo root and deleted immediately after use (confirmed absent via `git status`); the background server process was stopped (confirmed `/api/health` unreachable afterward); `gymapp_r3_browser` was dropped and confirmed absent.

---

## 6. Protected-boundary checks

Confirmed by inspection of the diff (§1) and by the checks in §3–4:

- **No migration**: `drizzle/` directory unchanged; latest migration remains `0013`; `git status` shows no new/modified file under `drizzle/`.
- **No schema change**: `src/db/schema/**` untouched.
- **No sync/DTO/IndexedDB change**: nothing under `src/sync/`, `src/domain/sync/`, service-worker or IndexedDB version files touched.
- **No UI behavior change**: no file under `src/ui/` or `src/app/` touched; the ten entries render through the unmodified `ExerciseLibrary`/`ExerciseForm` components (§5).
- **No progression/e1RM/volume/metrics change**: nothing under `src/domain/progression/`, `src/domain/strength/`, `src/domain/volume/`, `src/domain/metrics/` touched.
- **No new reconcile script**: `src/db/seed/reconcile*.ts` files are unchanged; only their **test fixtures** were updated (§1) to keep an existing fixture ("every catalog slug except `machine-hip-adduction`") honest now that ten more slugs exist that never existed pre-v2 — the reconcile mechanism itself was not touched, and A-17's "Reconcile: none new" for Release 3 holds.
- **No Release 4 work**: nothing from evaluation §21.4 (distance/time progression, dashboard cards, etc.) was implemented.
- **Existing entries and their order preserved**: the ten were appended only; `ORIGINAL_40_SLUGS` (`EXERCISE_CATALOG.slice(0, 40)`) and its dependent pre-v2 scenario assertions (`updated === 7`, `noop === 7`) pass unchanged (§3, integration suite).
- **Unrelated working-tree changes preserved**: `git status` before and after this task lists the identical set of pre-existing modified/untracked files outside this task's scope (§0), none of which this task touched.

---

## 7. Inherited vs. newly executed coverage

To be explicit about what is new evidence from this pass versus what this pass relies on without re-deriving:

**Newly executed by this implementation:**
- All catalog and test edits in §1.
- The full `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test:unit` / `pnpm test:integration` / `pnpm build` runs in §3, on the changed tree.
- The three disposable-PostgreSQL scenarios in §4 (fresh seed, existing-93-user upgrade, real `db:seed` entry point twice).
- The full browser walkthrough in §5.

**Inherited (relied upon, not re-verified from scratch):**
- The mechanical/structural soundness of the ten entries themselves (leaf-only contributions, ≥1 primary, no duplicate muscle, type conformance, ADR-010 conformance) — established by the authoring document's own mechanical checks and independently confirmed twice (review, revision-verification). This implementation did not re-derive those; it re-asserts the exact same values as automated tests (§1) and confirms they land unchanged in the database (§4).
- The seeder mechanism itself (`seedExerciseCatalogForUser`'s ledger-skip, arbiter-less insert, transaction atomicity) — unchanged code, already covered by the pre-existing `seed.integration.test.ts` suite (Phase 1 H1 guarantees), which this pass extends with one athletic-specific witness (`bodyweight-box-jump`) rather than re-proving the mechanism for all ten (per authoring §8.7's own reasoning: the ledger skip is slug-agnostic).
- The structural-gate refusal analysis in authoring §6 (why omitting `strengthEstimate` is safe for all ten) — not re-derived here; no code under `src/domain/strength/` was touched.

---

## 8. Pending — explicitly not performed here

- **Production exercise-name collision check (authoring §8.5, last item; CR-2) — OPEN.** Before this catalog reaches the production account, someone must verify the owner has not already hand-created an active exercise with any of these **ten distinct** names — cross-checked directly against the actual `EXERCISE_CATALOG` Release-3 entries (§2 above), not retyped from memory:

  `Sled Push`, `Backward Sled Drag`, `Farmer's Carry`, `Dumbbell Suitcase Carry`, `Sprint`, `Shuttle Run`, `Medicine Ball Slam`, `Broad Jump`, `Box Jump`, `Side Plank`.

  **Correction (M-1, independent review):** the list previously here quoted "Dumbbell Suitcase Carry" twice and omitted "Side Plank" — nine distinct names, not ten. The list above is the corrected, verified set. A collision would silently and permanently skip that one seed row (arbiter-less `onConflictDoNothing`, unchanged mechanism) while still recording the slug as applied in the ledger, so no later deploy could correct it — remediation if one collides is to change the catalog **name**, never the slug. **This gate is recorded here as pending and remains explicitly OPEN. It was deliberately not performed** (no production access in this task, and no entry was speculatively renamed against it) and was not discharged by the independent review either (§9 below).
- **Commit, push, deployment.** Not performed — explicitly out of scope for this task.
- **iPhone / device acceptance (A-25-style).** Not performed — requires a deployed build.
- **`docs/architecture/domain-model.md` §3.** Not touched — §24.3 names the catalog's own header comment as the alternative discharge path, used here (§2).

---

## 9. Independent review verdict and conditions

`docs/reviews/athletic-measurement-profiles-release-3-review.md` (2026-09-08) independently re-derived this implementation's claims against a fresh working-tree byte comparison, three of its own disposable PostgreSQL databases, and a fresh browser walkthrough with DOM-level and screenshot evidence — not by re-reading this report. Its verdict:

> **VERIFIED — READY FOR RELEASE 3 DEPLOYMENT**, with one MEDIUM report defect that must be corrected in the deployment instructions before the pending production gate is executed, and four LOW/INFO notes.

Conditions and scope that verdict carries, recorded here verbatim in substance so this report and its status stay consistent with the review:

1. **The verdict does not discharge the production exercise-name collision gate and does not authorize commit, push or deployment.** That gate remains open (§8 above) and must be run — with the corrected ten-name list — before the catalog reaches the production account.
2. **M-1 (MEDIUM)** — this report's §8 name list was wrong (nine distinct names, "Side Plank" missing). **Corrected above** in this pass; that correction is the fix the review asked for.
3. **L-1 (LOW)** — this report's A-17 evidence (§4.1, §4.3) was `reconcileContributions`, not the `reconcileMeasurementProfiles` the requirement actually names. **Corrected above**; the review's own §3.3 is the authoritative direct verification of `reconcileMeasurementProfiles` and is cited there rather than restated as this report's evidence.
4. **L-2 (LOW)** — two of §1's four diff-line counts were wrong (`--stat` totals miscoded into `+`/`−`). **Corrected above** against `git diff --numstat`.
5. **L-3, L-4 (LOW) and INFO-1, INFO-2** — a self-testing unit assertion, a stale "both sites" comment, pre-existing unrelated doc-comment drift in `reconcileMeasurementProfiles.ts`, and confirmation that the ten entries degrade correctly on the existing `/exercises/[id]/strength` surface. All four are **non-blocking** per the review and need no code change before deployment; none is addressed by this documentation-only correction pass.
6. Independently confirmed and not disputed: the append-only catalog diff (existing 93 byte-identical, appended block identical to approved §5), all six required checks at the reported numbers, full-snapshot (not sampled) comparison of all 93 legacy rows on the existing-user upgrade, athletic-entry edit/deletion preservation, and zero console/page errors in the browser.

The review's own databases (`gymapp_r3_review`, `gymapp_r3_review_ui`) and temporary files were independently created and removed; it did not touch this report, the authoring document, the prior review or verification documents, or any source/test file — only this report is amended, in this pass, in response to its findings.

---

## 10. Verdict

The ten O-10(i)/(ii)-approved entries are implemented exactly as authored, appended after the existing 93 in approved order with no existing entry moved or reinterpreted. All repository-required checks pass (typecheck, lint, format, 1145 unit tests, 458 integration tests, production build). Fresh-seed, existing-user-upgrade and repeat-seed behavior is verified against disposable, non-persistent PostgreSQL databases with exact stored-value evidence, and the same shape is confirmed rendering correctly through the existing browser UI with no console or page errors. All protected boundaries (schema, sync, UI, progression, e1RM, volume, metrics, reconcile mechanism, Release 4 scope) are unchanged. This report's M-1/L-1/L-2 defects are corrected as of this pass (see the correction note near the top, and §9).

**The production exercise-name collision check (§8) remains explicitly OPEN** — not performed by this implementation and not discharged by the independent review's verdict, which conditions deployment readiness on it being run with the corrected ten-name list first. No commit, push or deployment has occurred or is authorized by this document. All disposable database resources and temporary scripts created for this task (and, independently, for the review) were removed; the persistent development database and unrelated working-tree changes were never touched.

VERIFIED — READY FOR RELEASE 3 DEPLOYMENT, subject to the open production exercise-name collision gate (§8)
