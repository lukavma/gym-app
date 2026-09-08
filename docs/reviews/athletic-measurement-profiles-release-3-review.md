# Athletic measurement profiles — Release 3 catalog: independent implementation review

Date: 2026-09-08
Subject: `docs/reviews/athletic-measurement-profiles-release-3-implementation.md` and the working-tree changes it describes.
Reviewed against: `athletic-measurement-profiles-release-3-catalog-authoring.md` (revised, approved), its independent review (`…-catalog-review.md`, REVISION REQUIRED) and revision verification (`…-catalog-revision-verification.md`, APPROVED); binding architecture evaluation §16, §21.3, §24.3, A-14, A-17; ADR-010; owner decisions O-4(i)/(ii), O-10(i)/(ii), O-12, D-R3-1 (a).
Standing: the authored-list gate is closed. This review examines **implementation fidelity and behaviour only** — no accepted muscle assignment, metadata shape or owner choice was reopened.

Repository: `HEAD = 4865a02`, branch `main`. Nothing was implemented, fixed, committed, pushed or deployed by this review. No production or persistent development database was contacted. The implementer's report and all prior reports are unmodified.

---

## 0. Verdict

**VERIFIED — READY FOR RELEASE 3 DEPLOYMENT**, with one MEDIUM report defect that must be corrected in the deployment instructions before the pending production gate is executed, and four LOW/INFO notes.

Every substantive claim about the code, the seeded data and the running app reproduced independently. The ten approved entries are implemented byte-for-byte as authored, appended after an untouched 93; all six required checks pass at the numbers reported; fresh-seed, existing-93 upgrade, deterministic ids, exact stored contributions and weights, repeat-seed idempotence and athletic edit/deletion preservation all verified on a disposable real PostgreSQL database with **all** rows compared, not a sample; the real `pnpm db:seed` pipeline is idempotent end-to-end; and `reconcileMeasurementProfiles` is a **true no-op** on correctly seeded fresh data — the A-17 requirement the report did not actually demonstrate.

**This verdict does not discharge the production exercise-name collision gate and does not authorize commit, push or deployment.** That gate remains open and its checklist is currently wrong (M-1).

---

## 1. Findings, severity-ranked

### M-1 (MEDIUM) — The pending production name-collision checklist is wrong: it duplicates one name and omits another

`…-release-3-implementation.md` §8, first bullet, lists the names to check against the production account verbatim as:

> "Sled Push", "Backward Sled Drag", "Farmer's Carry", **"Dumbbell Suitcase Carry"**, "Sprint", "Shuttle Run", "Medicine Ball Slam", "Broad Jump", "Box Jump" or **"Dumbbell Suitcase Carry"**

Ten quoted strings, but only **nine distinct names**: `Dumbbell Suitcase Carry` appears at positions 4 and 10, and **`Side Plank` is missing entirely**. The authoring document's own list (§8.5, last item) is correct and does contain "Side Plank"; the error was introduced in the implementation report.

Why this matters, concretely: this bullet *is* the mitigation for the only production-facing risk the release carries. The seed insert is arbiter-less `onConflictDoNothing` (`src/db/seed/exercises.ts:140-144`), so if the owner's live account already holds an active exercise named "Side Plank", that seed row is silently skipped **and `bodyweight-side-plank` is still recorded as applied in the ledger** — permanently, for that user, with no later deploy able to correct it. Anyone executing the pre-deployment check from the report's list would never look at "Side Plank" and would report the gate as cleared while one of the ten remained unchecked.

Nothing in the code, tests or seeded data is affected — the catalog itself carries all ten distinct names correctly, and `tests/unit/exerciseCatalog.test.ts:20` (unique names, case-insensitive) passes. **Fix the list in the report (or work from authoring §8.5 instead) before running the gate.** All ten names to check are:

`Sled Push`, `Backward Sled Drag`, `Farmer's Carry`, `Dumbbell Suitcase Carry`, `Sprint`, `Shuttle Run`, `Medicine Ball Slam`, `Broad Jump`, `Box Jump`, `Side Plank`.

### L-1 (LOW) — §4's A-17 evidence proves the wrong reconcile; the requirement itself holds

Authoring §8.4 requires that "`reconcileMeasurementProfiles` remains a no-op on the fresh database". The report's §4.1 offers `reconcileContributions(db) → {"updated":0,…}` and labels it "**a true no-op, as A-17 requires**", and §4.3 cites the pipeline's `taxonomy-v2 reconciliation … updated=0` line — but both of those are `reconcileContributions` (the ADR-010 taxonomy reconcile). `reconcileMeasurementProfiles` prints nothing to the deploy log, so **neither piece of evidence speaks to it**, and the report never exercises it directly. The A-17 requirement was therefore asserted, not shown.

I verified it directly (§3.3 below): on a freshly seeded database it returns `{"users":1,"updated":0,"noop":5}` — every one of its five predicates matched nothing — and after two full `pnpm db:seed` runs across three users (including the upgraded legacy user) `{"users":3,"updated":0,"noop":15}`. The requirement holds; only the report's evidence for it was misattributed. No code change needed.

### L-2 (LOW) — Two of the four per-file diff line counts in §1 are wrong

`git diff --numstat` against `HEAD`:

| File | Report claims | Actual |
| --- | --- | --- |
| `src/db/seed/exerciseCatalog.ts` | +189 / −0 | +189 / −0 ✔ |
| `tests/integration/seed.integration.test.ts` | +102 / −0 | +102 / −0 ✔ |
| `tests/unit/exerciseCatalog.test.ts` | +276 / −10 | **+271 / −5** |
| `tests/integration/reconcileContributions.integration.test.ts` | +39 / −14 | **+30 / −9** |

Both wrong figures are the `--stat` *total* changed-line count placed in the `+` column with an inflated `−`. Cosmetic; the substance of both diffs is correct and was reviewed line by line.

### L-3 (LOW) — One new unit assertion tests its own fixture rather than the catalog

`tests/unit/exerciseCatalog.test.ts`, "states loadBasis explicitly on exactly the five entries whose profile has a load field (R-6)", filters `RELEASE_3_ENTRIES` — the local expectation constant — not `EXERCISE_CATALOG`. It would pass unchanged if the catalog's `loadBasis` values were wrong. The R-6 five/five split *is* genuinely covered, by the per-entry `it.each` immediately above it (`expect(entry?.loadBasis).toBe(expected.loadBasis)` against the real catalog) and by the new `seed.integration.test.ts` stored-shape test, so this is redundancy rather than a gap. Contrast the neighbouring laterality and mechanics tests, which correctly filter `EXERCISE_CATALOG`. Worth tightening if the file is touched again.

### L-4 (LOW) — Stale comment in the reconcile fixture

`tests/integration/reconcileContributions.integration.test.ts`'s new constant block says the R3 slugs are excluded "at **both** sites that build a 'full-92' pre-v2 slug set". Three sites were changed (the report's §1 correctly says three, and names the extra one at pre-edit `:574-576`). The code is right; the comment undercounts.

### INFO-1 — Pre-existing doc-comment drift in `reconcileMeasurementProfiles` (not introduced here)

`src/db/seed/reconcileMeasurementProfiles.ts:80-89` documents `noop` as "Predicate checks (**6** per user)". The function contains five `noop += 1` branches, and returns 5 per user. Release-2 code, untouched by this release, no behavioural impact, and no test asserts the count. Noted only because it briefly reads as a discrepancy when verifying the A-17 no-op.

### INFO-2 — The ten new rows reach the existing strength surface and degrade correctly

Each of the 103 library rows renders a `/exercises/[id]/strength` link, so the athletic entries now appear on that existing screen. Verified in the browser for `Box Jump`, `Sled Push` and `Side Plank`: each renders "**Not available for this exercise's measurement type**" with no console or page error — the `MEASUREMENT_PROFILE_UNSUPPORTED` refusal authoring §6 predicts, confirmed at the UI rather than only in the domain. Same behaviour the Release-2 plank and farmer's carry already have. No action.

---

## 2. Code fidelity — independently verified

### 2.1 Exactly the ten approved entries, appended after an untouched 93

- `git diff src/db/seed/exerciseCatalog.ts` is **a single hunk, `@@ -1030,4 +1030,193 @@`, with zero deletion lines**. Byte-comparing the pre-change file against the working tree, **lines 1–1032 are identical**; the only pre-existing line to change is old line 1033 (`];`), which moved to the new end of the array. No existing entry was moved, reordered, renamed or edited.
- I extracted the appended block and diffed it, comment-stripped, against the approved §5 literal block of the authoring document: **identical**. I also re-diffed the authoring document's §5 block against the copy I extracted during the revision-verification pass — unchanged, so the approved values are the ones that shipped.
- Order: `EXERCISE_CATALOG.slice(-10)` is `other-sled-push, other-sled-drag, other-farmers-carry, dumbbell-suitcase-carry, bodyweight-sprint, bodyweight-shuttle-run, other-med-ball-slam, bodyweight-broad-jump, bodyweight-box-jump, bodyweight-side-plank` — the approved order exactly. No R3 slug appears among the first 93.
- Length: 103. `other-sled-drag` carries the owner-accepted name **`Backward Sled Drag`** (D-R3-1 (a)).
- `volumeCounting: "off"` explicit on all ten; `strengthEstimate` and `loadStepKg` absent on all ten; no contribution `weight` anywhere.
- **loadBasis five/five**: explicit on `other-sled-push`/`other-sled-drag`/`other-med-ball-slam` (`total`) and `other-farmers-carry`/`dumbbell-suitcase-carry` (`per_hand`); omitted on the five load-less entries. This is the exact defect M-1 of the catalog review warned would seed `'unspecified'` on the med-ball slam — it did not happen, in the literal or in the database (§3.1).

The block's header comment records the §16 authoring rule, the approval chain and the append-last constraint — discharging §24.3 through the catalog-comment option that section explicitly permits.

### 2.2 Tests preserve meaningful assertions

| Requirement | Verified |
| --- | --- |
| Exact adductor set | `expect(adductorSlugs).toEqual(["machine-hip-adduction", "bodyweight-shuttle-run"])` — correct membership **and** correct catalog order (`machine-hip-adduction` is entry #78 of 93, the athletic block is appended last). The unrelated assertions at the pre-edit `:132-134` — `name === "Hip Adduction Machine"` and the single-row `adductors:primary` contribution — are retained verbatim, not weakened. Test renamed to match what it now proves. |
| Legacy metadata defaults | The "every other catalog entry still omits the three new fields" test is widened by *exempting* the ten athletic slugs only; it still asserts `measurementProfile`/`loadBasis`/`volumeCounting` are `undefined` on all remaining ~90 entries. The exempted ten are then asserted positively and in full by the new `describe` block. |
| Original-40 order | `ORIGINAL_40_SLUGS = EXERCISE_CATALOG.slice(0, 40)` is unchanged, and the append-only diff leaves that window untouched; its dependent assertions (`updated === 7`, `noop === 7`) pass. |
| All three pre-v2 fixtures | All three "full catalog minus `machine-hip-adduction`" sites now filter through one shared `NOT_PRE_V2_SLUGS` constant. The report correctly discloses that it found and fixed a **third** site the authoring document had not identified — an improvement on the specification, not a deviation. |

New coverage is additive: no existing test was deleted or relaxed anywhere in the diff.

### 2.3 Protected boundaries — confirmed

`git status` shows exactly **four** non-documentation files changed: `src/db/seed/exerciseCatalog.ts` and three test files.

- **No migration / schema**: `git status drizzle/` is empty; `drizzle/` holds 14 migrations, latest `0013_serious_omega_flight.sql`. `src/db/schema/**` untouched.
- **No src change outside the seed catalog**: `git status src/` lists only `src/db/seed/exerciseCatalog.ts`.
- **No sync / DTO / IndexedDB / service-worker change.**
- **No UI change**: nothing under `src/ui/` or `src/app/`; the ten entries render through the unmodified `ExerciseLibrary` / `ExerciseForm` (§4).
- **No consumer arithmetic change**: nothing under `src/domain/progression`, `src/domain/strength`, `src/domain/volume`, `src/domain/metrics`, `src/server`.
- **No reconcile-mechanism change**: `src/db/seed/reconcile*.ts` are byte-unchanged; only reconcile *test fixtures* moved, which is fixture honesty (L-2 of the catalog review), not mechanism.
- **No Release-4 work**: nothing from evaluation §21.4.
- **Pre-existing working-tree changes preserved**: the same `CLAUDE.md` / `HANDOFF.md` / `docs/input/product-ideas.md` / `.claude/skills/` / `HANDOFF(depracted).md` / `gpt-*.md` / three unrelated `docs/reviews/*` entries were present before and after this review, untouched by it and by the implementation.

One documentation file was edited by the implementation: the authoring document's §8.4 residual R-1 (`six` → `five` load-less entries). I confirmed the scope of that edit — the file is still 672 lines, no occurrence of the stale count remains, §5's ten literals are byte-identical to the approved version, and the verdict line is unchanged. The independent review and revision-verification reports are untouched.

---

## 3. Behaviour — independently reproduced on disposable real PostgreSQL

All database work ran against **`gymapp_r3_review`** and **`gymapp_r3_review_ui`**, created for this review and dropped afterwards. Every command carried an **explicit `DATABASE_URL` override**; the repository has no dotenv loader, so `db:seed`/`drizzle-kit` cannot silently fall back to `.env.local`. Both verification scripts additionally refused to run unless `DATABASE_URL` ended in the disposable database name. **The persistent `gymapp` database was never connected to.**

### 3.1 Fresh seed → exact stored shape (all 103 rows, not a sample)

`gymapp_r3_review` migrated to `0013`, then a real user + `seedExerciseCatalogForUser` (the function `pnpm db:seed` calls):

- 103 exercise rows, 103 ledger rows.
- For each of the ten, the stored row was compared against values **transcribed independently from the approved authoring §4.11 table**, not read back from the catalog under review — `name`, `equipment`, `mechanics`, `laterality`, `measurement_profile`, `load_basis`, `volume_counting`, `strength_estimate`, `load_step_kg`, `is_seeded`, and the full contribution multiset with weights. All ten matched. Sample of the captured output:

  ```
  other-med-ball-slam      profile=load_reps     basis=total    vol=off se=auto step=2.5 lat=bilateral
                           contrib=[abs:primary:1, front_delts:secondary:0.5, lats:primary:1, triceps:secondary:0.5]
  dumbbell-suitcase-carry  profile=load_distance basis=per_hand vol=off se=auto step=2   lat=unilateral
                           contrib=[abs:primary:1, forearms:primary:1, lower_back:secondary:0.5, traps:secondary:0.5]
  bodyweight-side-plank    profile=duration      basis=null     vol=off se=auto step=2.5 lat=unilateral
                           contrib=[abs:primary:1, glutes:secondary:0.5, lower_back:secondary:0.5]
  ```

- **Exactly five stored `load_basis` values and exactly five `NULL`** — the five/five split lands in the database, including `other-med-ball-slam = 'total'`.
- Default weights are the seeder's, not authored: every `primary` row stored `1`, every `secondary` row `0.5`.
- `load_step_kg` follows equipment (`2` for the dumbbell entry, `2.5` for the rest); `strength_estimate` is the `'auto'` default on all ten, confirming the omission per §16.
- **All 93 legacy rows** were independently recomputed from their catalog entries through `resolveLoadBasis` and the seeder's default rules and compared against the database: **0 mismatches**.

### 3.2 Existing user holding the 93 legacy slugs → exactly ten additions, nothing else touched

A second user was pre-seeded with the 93 pre-Release-3 slugs (confirmed `=== 93`) plus matching ledger rows, then upgraded with `seedExerciseCatalogForUser`:

- 93 → **103** rows (+10 exactly); ledger 93 → 103.
- **Full before/after snapshot comparison of all 93 pre-existing rows** — every column (`name`, `equipment`, `mechanics`, `laterality`, `load_step_kg`, `strength_estimate`, `measurement_profile`, `load_basis`, `volume_counting`, `is_seeded`, `archived_at`) **and every one of their contribution rows including weights**: **zero differences**. This is the "compare all existing rows, not one sampled exercise" check; the report only snapshotted `barbell-back-squat`.
- The ten added ids are exactly the ten R3 slugs' deterministic ids.
- Deterministic ids: `seededExerciseId(user, slug)` is stable across derivations and differs per user.

### 3.3 Reconciles on correctly seeded data — including the one the report did not exercise

| Reconcile | Fresh single user | After two full `pnpm db:seed` runs, three users |
| --- | --- | --- |
| `reconcileContributions` | `{users:1, mapped:14, updated:0, noop:14, conflicts:0, customDirectBack:0, seededDirectBackUnmapped:0}` | `users=3 mapped=14 updated=0 noop=42 conflicts=0` |
| `reconcileStrengthEstimates` | `{users:1, updated:0, noop:2}` | `{users:3, updated:0, noop:6}` |
| **`reconcileMeasurementProfiles`** | **`{users:1, updated:0, noop:5}`** — all five predicates matched nothing | **`{users:3, updated:0, noop:15}`** |

The A-17 requirement is met: on a database seeded from the Release-3 catalog, the measurement-profile reconcile has nothing to do. I additionally confirmed *why* — the three Release-2 reconcile targets already carry their correct shapes straight from the catalog on a fresh seed: `bodyweight-plank` `duration`/`null`/`off`, `dumbbell-farmers-carry` `load_distance`/`per_hand`/`off`, `machine-assisted-pull-up` `load_reps`/`assistance`/`auto`.

### 3.4 Repeat-seed idempotence and athletic edit/deletion preservation

- Re-running `seedExerciseCatalogForUser` on the fresh user produced **zero differences across all 103 rows and every contribution row** (full snapshot diff, not a row count).
- The real `pnpm db:seed` entry point ran **twice** end-to-end on the populated database: both `Seed complete.`, `updated=0` both times.
- Preservation (Phase 1 H1) exercised on **athletic** entries specifically, then re-checked after two further full pipeline runs:
  - user edit to `bodyweight-sprint` (renamed "My Sprint", `volume_counting` flipped to `auto`) — **survived**;
  - a contribution removed from `other-med-ball-slam` (`triceps`) — **not resurrected**;
  - an edited contribution weight on `other-sled-drag` (`abs` → `0.25`) — **not reverted**;
  - hard-deleted `bodyweight-side-plank` — **not resurrected**; the user stayed at 102 rows.

---

## 4. Browser coverage — API assertions vs. visible UI evidence

Run against a third disposable database (`gymapp_r3_review_ui`), migrated and seeded through the documented clean-E2E sequence: `db:seed` with zero users (catalog step a no-op) → account created through the real `/setup` form in Chromium → second `db:seed`. Binding to the disposable database was proved positively, not assumed: a direct `psql` query against `gymapp_r3_review_ui` afterwards showed `users=1, exercises=103, non_load_reps=11, volume_counting='off'=12` (the ten R3 entries plus the two Release-2 legacy entries in each of the last two counts).

**The report's §5 library-list step is an API assertion**, not UI evidence — it states it "called the same `GET /api/exercises` the page itself calls" and counted 103. That is a reasonable check but it does not show the page rendering. I replaced it with DOM-level evidence:

- **Visible UI**: the `/exercises` page renders **103 distinct exercise-detail rows** in the DOM (counted as unique `/exercises/<uuid>` hrefs; a naive anchor count returns 207 because each row also renders a `/strength` link, plus one `/exercises/new`). Each of the ten approved names was typed into the real search box and its row confirmed **visible**.
- **Visible UI — `load_distance`** (`Sled Push`): the rendered edit form shows Equipment "Other", Mechanics "Compound", Laterality "Bilateral", Load step 2.5, the five approved muscles with roles and weights (Quads Primary 1, Glutes Primary 1, Hamstrings Secondary 0.5, Calves Secondary 0.5, Abs Secondary 0.5), Measurement profile "**Load + Distance**", and the conditionally-rendered **"Load basis" control present, reading "Total load"**. Strength estimate and Volume counting both render "Not available for this measurement profile." Screenshot captured and inspected.
- **Visible UI — `duration`** (`Side Plank`): Measurement profile "duration"; the **"Load basis" control is absent from the DOM entirely** (`count = 0`) and the string "Load basis" does not appear in the page text — R-6's presence rule, visible.
- **Visible UI — `reps` + counting off** (`Box Jump`, the A-14/A-17 named witness): Measurement profile "**Reps only**", muscles Quads Primary 1 / Glutes Primary 1 / Calves Secondary 0.5, Strength estimate "Not available for this measurement profile.", and the **"Volume counting" select rendering "Off for this exercise"** — the seeded `volume_counting = 'off'` visible in the real form. No Load basis control. Screenshot captured and inspected.
- **Regression on an untouched legacy entry**: `Barbell Back Squat` still reads `load_reps` with Volume counting `auto`.
- **Existing consumer surface**: `/exercises/[id]/strength` for `Box Jump`, `Sled Push` and `Side Plank` renders "Not available for this exercise's measurement type" (INFO-2).
- **Zero `console.error` events and zero uncaught page errors** across the whole run.

---

## 5. Gate results

| Gate | Command | Result | Report claim |
| --- | --- | --- | --- |
| Typecheck | `pnpm typecheck` | clean, exit 0 | matches |
| Lint | `pnpm lint` | clean, exit 0 | matches |
| Format | `pnpm format:check` | "All matched files use Prettier code style!" | matches |
| Unit | `pnpm test:unit` | **82 files / 1145 passed**, 0 failed | matches exactly |
| Integration | `pnpm test:integration` | **28 files passed / 6 skipped; 458 passed / 17 skipped** (475 total) | matches exactly |
| Touched suites | `vitest run … seed + reconcileContributions` | **2 files / 40 passed** | matches (21 + 19) |
| Production build | `pnpm build` | exit 0, full route manifest generated | matches (I captured the route table rather than the header line, so I confirm exit 0 and a complete manifest rather than the specific "40/40 static pages" wording) |

The 17 integration skips are the repo's pre-existing real-PostgreSQL concurrency specs (`*Concurrency.integration.test.ts`, six files) gated on a separate `*_CONCURRENCY_DATABASE_URL`; they are unrelated to this change and skip identically without it.

---

## 6. Cleanup and boundary confirmation

- **Databases**: `gymapp_r3_review` and `gymapp_r3_review_ui` were both `DROP DATABASE`-d. Post-cleanup enumeration shows only `gymapp` (persistent, never connected to) and the five pre-existing disposable siblings from unrelated earlier sessions (`gymapp_e1rm_remediation`, `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`, `gymapp_wuconc`), left untouched. The implementer's own disposable databases (`gymapp_r3_verify`, `gymapp_r3_browser`) were already absent, corroborating their §4.4 cleanup claim.
- **Temporary files**: four driver scripts, one Playwright storage-state file and four screenshots were written to the repo root for the duration of the run and deleted. `git status` after cleanup is byte-identical to `git status` before this review began, plus this document.
- **Server**: the production server started on port 3123 was stopped and its listener confirmed gone.
- **Untouched**: the implementer's report, the authoring document, both prior review documents, all source and test files, and every pre-existing working-tree change.

---

## 7. Pending before deployment — explicitly not discharged by this review

1. **Production exercise-name collision check — OPEN.** Must be run against the live account before the catalog reaches it, for **all ten** names listed under M-1 above (not the report's nine-distinct list). A collision silently and permanently skips that one seed row while still recording the slug as applied. Remediation if one collides: change the **catalog name**, never the slug.
2. **Commit, push, deployment** — not performed and not authorized by this verdict.
3. **Device acceptance** — not performed; requires a deployed build.
4. **M-1's list correction** in the implementation report — a documentation fix the implementer should make; this review deliberately did not edit their report.

L-1 through L-4 and INFO-1/2 are non-blocking and need no code change before deployment.

---

VERIFIED — READY FOR RELEASE 3 DEPLOYMENT
