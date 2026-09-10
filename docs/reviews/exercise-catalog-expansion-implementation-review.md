# Exercise catalog expansion — independent implementation review (Catalog Expansion 1)

Date: 2026-09-10
Reviewer: independent; author of `exercise-catalog-expansion-review.md` and both revision verifications. Did not author the implementation or the implementation report.
Under review: the working-tree implementation of `docs/reviews/exercise-catalog-expansion-evaluation.md` (APPROVED per `…-revision-verification-2.md`), reported in `docs/reviews/exercise-catalog-expansion-implementation.md`.
Repository state: branch `main`, `HEAD = 56ec000`, implementation uncommitted. Verified restored byte-for-byte at the end of this pass (§10).
Scope: implementation fidelity and evidence only. O-1…O-5 and D-CE1-1(a) are accepted and are not reopened.

**Verdict: VERIFIED — READY FOR CATALOG EXPANSION DEPLOYMENT.** The implementation is faithful to the approved specification — the 24 literals are byte-identical to §10 including every comment, the 103 existing entries are provably untouched, and the vocabulary, ADR amendment and documentation edits match §12 exactly. Every gate reproduces at the reported numbers. I independently reproduced the database work on my own disposable Postgres instances, closed the one evidence gap the report left open (item 6, weekly-volume aggregate equality), verified server-route rejection through real HTTP rather than schema units, and mutation-tested NC-A…NC-F to confirm they are load-bearing. Four findings are recorded below; all are report-accuracy or test-quality issues, none is a defect in shipped behaviour, and none blocks deployment. **This verdict does not discharge the operational gates in §9.**

---

## 1. Findings, severity-ranked

| Id | Severity | Finding |
| --- | --- | --- |
| **F-1** | LOW | The report's cleanup claim "the manually-started `pnpm start` instance was stopped" is false — a Next server from that pass is still listening on port 3000 |
| **F-2** | LOW | "5 migrations applied" is wrong in both places it appears; a fresh database applies **14**, and an already-migrated one applies **0** |
| **F-3** | LOW | §6.2 labels exploratory browser work "mutation tests"; no defect was introduced and nothing was demonstrated to fail. §7 contradicts §6.2 on this |
| **F-4** | LOW | Three of the new `CATALOG_EXPANSION_1_ENTRIES` count-assertions filter the test's own fixture rather than `EXERCISE_CATALOG`, so they cannot fail from a catalog defect. Coverage is not lost (the per-entry `it.each` catches everything), but two of the three deviate from the Release-3 pattern they were told to mirror |

No MEDIUM or HIGH findings. Details in §8.

---

## 2. Item 1 — the 24 entries, metadata, order, deterministic identity

**Byte-identical to the approved specification.** The appended block was extracted and compared to §10's code fence with trailing whitespace normalised:

```
spec lines: 370   impl lines: 370
diff  ->  BYTE-IDENTICAL including all comments
```

Field-level re-parse of all 24 literals (slug, name, equipment, mechanics, laterality, measurementProfile, loadBasis, volumeCounting, strengthEstimate, full contribution list, and order) against the spec: **identical, 24/24**.

**The 103 existing entries are provably untouched.** `git diff --numstat` reports `371 0 src/db/seed/exerciseCatalog.ts` — 371 insertions, **zero deletions** — applied at `@@ -1221,0 +1222,371 @@`, i.e. inside the array immediately before its closing `];`. The first 103 slugs diff clean against `HEAD`, in order. Total is 127; positions 104–127 are the manifest block, beginning `barbell-rack-pull` and ending `other-med-ball-rotational-scoop-throw`.

**Deterministic identity**, verified against a real seeded row rather than a unit fixture:

```
db      = 79b688ab-2056-5be3-b75f-a736c8f40d79
derived = 79b688ab-2056-5be3-b75f-a736c8f40d79   (seededExerciseId(userId, "bodyweight-tibialis-raise"))
DETERMINISTIC ID MATCHES
```

## 3. Item 2 — vocabulary, positions, rollup, landmark, preset, ADR and documentation

- `LEAF_MUSCLE_GROUP_SLUGS` gains `"tibialis"` **appended last**; `MUSCLE_GROUP_DISPLAY_NAMES.tibialis = "Tibialis (Shin)"`; header comment updated with an amendment pointer. `ROLLUP_MEMBERS` does not appear in the diff — **membership unchanged**.
- On a real fresh database, before the catalog seed: **19 rows**, `tibialis` at **position 18** (`kind='muscle'`, `Tibialis (Shin)`), `back` at **19** (`kind='rollup'`), `lower_back` still at 17 — all 17 pre-existing leaves keep positions 1–17.
- `volumePresets.ts` diff is **one line**: the landmark-less sentence gains "Tibialis (Shin)". **No `RP_ROWS` entry**, confirmed in the diff and in the database (`volume_landmarks` rows for `tibialis` = 0).
- **ADR-010 is a pure append**: `31 0` — thirty-one insertions, zero deletions. Normalised against the approved §12.4 draft: **matches verbatim**, all 17 content lines.
- Companion documents match §12.3 exactly: domain-model (`17 → 18` + leaf list), volume-model (landmark-less list + Out line), data-model (`18 rows = 17 leaves` → `19 rows = 18 leaves`, landmark-less list), evidence-to-design (row 19 gains a clause, **no new row**), and implementation-plan — where the four historical sentences are **annotated, not rewritten**: the original "17 leaves"/"18 rows" text survives with a parenthetical appended, following the file's own `:95` precedent, exactly as the spec required.

## 4. Item 3 — unknown-slug rendering and self-only options, through real UI behaviour

Run against a real `next start` server and a disposable Postgres. The permanent spec passes:

```
5 passed  (muscleTaxonomyV2.spec.ts)
```

All four behavioural requirements hold, and each was proven to be *caused* by the hardening via mutation (§5):

- **Preserves the outgoing value** — the picker reports `toHaveValue("obliques")` and the intercepted `PATCH` body is `[{muscleGroupId:"obliques",role:"primary",weight:1}]`.
- **Excludes unknowns from new rows** — a freshly added row's option list contains neither `obliques` nor `Back`.
- **Retains existing rollup labels and amber guidance** — both pre-existing legacy-`back` specs pass byte-unchanged, including their `not.toContain("undefined")` assertions; the amber note stays keyed to `isKnownRollup`, so an unrecognised slug never renders as a pseudo-rollup.
- **Keeps validation strict** — see §5's route probes.

## 5. Item 4 — NC-A…NC-F are meaningful and load-bearing

### 5.1 Mutation testing (isolated scratch copy for unit work; restored builds for e2e)

Every control was verified by deliberately breaking the thing it guards and observing the specific failure.

| Mutation | Result |
| --- | --- |
| Remove `?? muscleGroupId` from `contributionMuscleLabel` | **1 failed** — the NC-A/NC-E unit test, precisely. Restored → 4 passed |
| Broaden both contribution schemas to `z.string()` | **4 failed** — both new NC-F tests plus two pre-existing rejection tests. Restored → 53 passed |
| Add a `calves` secondary to Tibialis Raise | **2 failed** — the per-entry test and the dedicated "no calves row (D-CE1-1)" test |
| Drop `loadBasis: "total"` from C-17 (RR-9's named risk) | **1 failed** — the per-entry test |
| Drop `laterality: "unilateral"` from C-6 | **1 failed** — the per-entry test (see F-4) |
| Swap two slugs' order inside the block | **3 failed** — the contiguity assertion and both affected per-entry tests |
| Remove `tibialis` from `LEAF_MUSCLE_GROUP_SLUGS` | **5 failed** across `muscleGroups.test.ts` and `volumePresetsSeed.test.ts` |
| **e2e MU1** — revert `ContributionEditor` to its pre-hardening rollup-only form, rebuild, restart | **exactly 1 failed** — the NC-A/NC-B/NC-E test; the other four, including both rollup specs, still pass |
| **e2e MU2** — over-generalise: amber note on any self-only value, unknown slug leaked into every row | **exactly 2 failed** — NC-E (`toBeHidden` on the note) and NC-C (unknown offered to a new row) |

After restoration the file checksum matches the pre-mutation original (`b456c672…`) and all 5 e2e tests pass again.

### 5.2 NC-B's move to browser payload assertions — assessed and endorsed

The report discloses moving NC-B from unit to e2e. The reasoning checks out: `buildContributionsPayload` is a non-exported function inside `ExerciseForm.tsx`, which is outside the two-file UI scope, so a unit test would have required either an export (a scope violation) or a reimplementation (which would test a copy). The e2e form intercepts the real `PATCH` via `page.waitForRequest` and asserts `request.postDataJSON()` — this is **stronger** evidence for NC-B's literal claim ("asserted on the payload, not the DOM") than the specified unit test, because it exercises the real form code end to end and proves the payload is built from React state rather than from the select's DOM value. The disclosure is accurate and the deviation is an improvement.

### 5.3 Create/update rejection through actual server routes — independently verified

The implementation covers NC-F only at the Zod-schema unit level plus a *happy-path* service test; the new `exercises.integration.test.ts` case asserts that `tibialis` works, not that anything is rejected, and it calls the service, not the route. I therefore probed the **real HTTP routes** on a running server against a disposable database:

| Probe | Result |
| --- | --- |
| `POST /api/exercises` with `contributions:[obliques]` | **400** `invalid_input` / `invalid_enum_value` |
| `POST /api/exercises` with `contributions:[back]` (rollup) | **400** — leaf-only creation preserved |
| `POST /api/exercises` with `contributions:[tibialis]` | **201** — the new leaf works end to end |
| `PATCH /api/exercises/{id}` introducing `obliques` | **400** |
| `PATCH /api/exercises/{id}` introducing `back` (not previously held) | **422** `rollup_not_carried` — carry-through rule intact |
| `PATCH /api/exercises/{id}` with `tibialis` | **200** |

Server validation is unchanged and unbroadened at the route boundary, which is the level NC-F's claim actually needs.

## 6. Item 5 — disposable real PostgreSQL

Three disposable Postgres 16 containers (`ce1-rev-a/b/c`, ports **55532/55533/55534**), each addressed by an explicit `DATABASE_URL` override on every command. **No production or persistent-development database was contacted.** The compose container `gym-app-db-1` was never started and remains `Exited (0)`, untouched. All three of my containers were removed (§10).

### 6.1 Fresh-user scenario — 1030 assertions, 0 failures

`db:migrate` → `db:seed` → user insert → `db:seed`, then a closed-form assertion script over the live database covering **all 127 entries**, not a sample:

- vocabulary: 19 rows, 18 `muscle` / 1 `rollup`, `tibialis` at 18, `back` at 19;
- per entry: stored `measurement_profile`, `load_basis`, `volume_counting`, `laterality`, `equipment`, `mechanics`, `is_seeded`, and the **complete contribution set with weights** (1.00 / 0.50), each compared against the value the catalog literal resolves to;
- `assistance` for Assisted Dip; `per_hand`/`load_duration` for Farmer's Hold; `total` for both sleds and the scoop throw; `unspecified` for the fifteen ordinary `load_reps` entries; **`NULL`** for Dead Hang, Wall Sit, Lateral Bound and Copenhagen Plank;
- **`bodyweight-tibialis-raise`: exactly one contribution, `tibialis`, primary, weight 1.0, and no `calves` row in either role** (D-CE1-1(ii)'s shape);
- no `volume_landmarks` row for `tibialis`; RP description contains "Tibialis (Shin)"; ledger = 127 rows.

`pnpm db:generate` against that database: **"No schema changes, nothing to migrate 😴"**, `git status --short drizzle/` empty, `drizzle/*.sql` still 14. §12.5's load-bearing claim confirmed mechanically.

### 6.2 Existing-user upgrade with actual old code — 498 assertions, 0 failures

A detached worktree at `56ec000` (real pre-expansion code, its own `drizzle-kit`/`tsx` runs) seeded container B: **18 groups, 103 exercises, 262 contributions, 52 landmarks**. Real workout history was then created — 24 completed sessions across three calendar weeks, 72 work sets and 24 warm-ups — followed by four mutations mirroring the established preservation pattern (rename, contribution weight → 0.75, contribution removal, hard delete of an exercise and its history).

Upgrading with the new code (`db:migrate` no-op, `db:seed`) and diffing field by field:

- all 17 pre-existing leaves byte-identical; `back` moves 18 → 19 and is otherwise unchanged; `tibialis` inserted at 18;
- **every pre-existing exercise row byte-identical** across all 14 stored columns — the rename survived, the deleted exercise stayed deleted;
- **every pre-existing contribution byte-identical** — the 0.75 weight and the removed row both survived;
- exactly **24** new exercises; contributions grew by exactly **71**;
- `volume_landmarks` byte-identical at 52, no `tibialis` row; preset description gained "Tibialis (Shin)"; ledger 103 → 127.

**Repeat-seed value equality** was proven by full-snapshot diff rather than counts, on both scenarios:

```
fresh DB, reseed:    IDENTICAL — every row value unchanged
upgraded DB, reseed: IDENTICAL — repeat seed on an upgraded DB changes no value
```

**Preservation and reconcile no-ops.** On a new slug via the real CLI: rename + weight edit survived a reseed (127 rows retained); hard delete was **not** resurrected (126, id absent). `reconcileContributions` reports `updated=0 noop=14` on every run. `reconcileStrengthEstimates` and `reconcileMeasurementProfiles` are no-ops by two independent proofs — neither `STRENGTH_ESTIMATE_OFF_SLUGS` nor `MEASUREMENT_PROFILE_RECONCILE_SLUGS` contains any new slug, and the full-snapshot repeat-seed diff (which includes the `strength_estimate` and `measurement_profile` columns) shows zero changes. The report asserts these no-ops in §16.4's plan but does not evidence them; the substance holds.

## 7. Item 6 — historical weekly-volume equality, reproduced at the aggregate level

**This is the one piece of required evidence the implementation report does not provide.** Its §5.2 compares source rows only — exercises, contributions, landmarks — and then reasons that unchanged inputs imply unchanged output. That is the inference the brief explicitly declines to accept, so I produced the aggregate directly.

Using the app's own `getWeeklyVolumeReport` (the same path `/volume` uses) with a **fixed `now`** so the calendar windows are identical, computed with **old code on the pre-upgrade database** and again with **new code on the upgraded database**:

```
BEFORE (old code): weeks=5  nonZeroLeafCells=39
AFTER  (new code): weeks=5  nonZeroLeafCells=39

diff -> the ONLY difference is a "tibialis": {"effective": 0, "raw": 0}
        key added to each of the 5 weeks
```

Asserted formally: for every week, every pre-existing leaf's `{effective, raw}` and the entire `rollups` object are identical; the week windows and `isDeload` flags are identical; exactly one key is added and it is `tibialis` at zero. A third computation after a further reseed of the upgraded database is identical again.

Every muscle's weekly volume series is unchanged by this release, demonstrated at the aggregate level rather than inferred.

## 8. Item 7 — browser lifecycle

Driven through the real UI against a disposable database and verified in the database afterwards.

**Dumbbell Farmer's Hold — `load_duration`, RR-8's "first live exercise" risk.** Prescribed onto a template with a `durationRounds` scheme, scheduled, and started:

- the workout card renders **weight + "Time in seconds"**, with **`Reps in reserve` count 0 and `Reps` count 0** — the `load_duration` field matrix exercised for the first time by a seeded catalog entry;
- a set logged online renders the line produced by the shared `formatSetLine` (derived, not hand-typed);
- a second set logged with the browser context **offline** appears immediately and leaves `pending > 0`;
- returning online, the outbox drains to **`pending: 0, dead: 0`**;
- the workout completes and **History** shows both rounds.

Confirmed in the database — two completed sessions, each with two rows: `weight_kg=24.00 / duration_s=40.00` and `24.00 / 35.00`, `reps` NULL, `rir` NULL, `is_warmup=false`, `measurement_profile='load_duration'`.

**Tibialis Raise.** The exercise page's picker reports `toHaveValue("tibialis")` with the selected option reading **"Tibialis (Shin)"** — not "Select muscle…" — and no `calves` value appears in any select on the form. The library row renders "Tibialis (Shin)", contains no `undefined` and no "Calves". After logging a real set (0 kg × 20, persisted and verified: `is_warmup=false`, session completed), the Volume screen renders:

```
Tibialis (Shin)
5
5 direct
No reference range
Edit reference range
```

— **actual non-zero volume with no invented band** — while Calves reads:

```
Calves
0
0 direct
Coaching heuristic · MV 6 · MEV 8 · MAV 12–16 · MRV 20+
```

— **zero, no spurious calf credit**, and still carrying its own RP band, which confirms the landmark-less rendering is specific to the new leaf rather than a regression in the band logic.

## 9. Item 8 — gates re-run and reconciled

Every check run by me against the final working tree.

| Check | Reported | Reproduced | Match |
| --- | --- | --- | --- |
| Unit | 1183 passed | **83 files, 1183 passed, 0 failed** | ✅ |
| Integration | 465 passed / 17 skipped | **28 passed / 6 skipped files; 465 passed / 17 skipped tests, 0 failed** | ✅ |
| `muscleTaxonomyV2` e2e | 5 passed | **5 passed** | ✅ |
| Typecheck | clean | clean | ✅ |
| Lint | clean | clean | ✅ |
| Format | clean | "All matched files use Prettier code style!" | ✅ |
| Build | exit 0 | exit 0; `/exercises`, `/exercises/[id]`, `/volume`, `/api/exercises*` all in the route table | ✅ |
| Schema generation | no migration | **"No schema changes, nothing to migrate 😴"**; `drizzle/` clean; 14 files | ✅ |

Unit, typecheck, lint and format were re-run a final time after all mutation work and restoration — still 1183 passed and clean.

## 10. Report accuracy audit

**F-1 (LOW) — the cleanup claim about the local server is false.** §8 states "the manually-started `pnpm start` instance was stopped." A Next server has been listening on **port 3000 since 2026-09-09 22:30** (PID 39392) — before this review began and after the implementation pass. It blocked my own e2e work until I moved to port 3100, and it is still running. I did not start it and deliberately did not kill it: it is not my resource and its database is unknown to me, so terminating it could have touched data I am not authorised to access. **Recommendation:** stop it before deploying, and confirm which database it is pointed at.

**F-2 (LOW) — "5 migrations applied" is wrong in both places.** §5.1 step 1 says "db:migrate — 5 migrations applied (the pre-existing 14, unchanged in count)"; §5.2 step 3 says "db:migrate (no-op — 5 migrations, none new)". `drizzle-kit migrate` prints no count at all — it prints a spinner, and on my fresh database it rendered exactly five spinner frames before "migrations applied successfully!". The database disagrees with the report:

```
select count(*) from drizzle.__drizzle_migrations;  ->  14
```

A fresh database applies **all 14**; an already-migrated one applies **0** (on container B's upgrade the spinner rendered a single frame). The number appears to be a miscount of spinner frames. The *conclusion* the report draws — that no migration was added and the count stayed at 14 — is correct and independently confirmed, so this is a reporting error, not a defect.

**F-3 (LOW) — §6.2's "mutation tests" label is not accurate, and §7 contradicts it.** §6.2 says its exploratory browser work comprises "**mutation tests** exercising the actual UI and network layer". No production defect was deliberately introduced in that section and nothing was demonstrated to fail; the word is being used to mean "writes data", not the testing term. §7 then describes the same section correctly as "exploratory live-browser evidence, clearly separated and not claimed as permanent coverage" — so the report contradicts itself, and §6.2's phrasing overstates the evidence class. The underlying work is real and I reproduced its substance in §8; only the label is wrong. Genuine mutation testing for this change is recorded in §5.1 of this review.

**F-4 (LOW) — three new count-assertions test the fixture, not the catalog.** In `tests/unit/exerciseCatalog.test.ts`, the `CATALOG_EXPANSION_1_ENTRIES` block's "loadBasis on exactly five" (`:882`), "unilateral on exactly six" (`:895`) and "isolation on exactly nine" (`:909`) all filter `CATALOG_EXPANSION_1_ENTRIES` — the test file's own expected constant — rather than `EXERCISE_CATALOG`. They are tautologies and cannot fail from a defect in the shipped catalog; my mutations confirmed it (dropping `laterality: "unilateral"` from C-6 in the real catalog failed only the per-entry test). Two points of context that keep this LOW:

- **No coverage is lost.** The per-entry `it.each` compares every field of every one of the 24 entries against `EXERCISE_CATALOG`, including `loadBasis`, `laterality`, `mechanics`, `volumeCounting`, `strengthEstimate: undefined` and the exact contribution array — and the block's total, contiguity and index-103 assertions pin membership. Every mutation I attempted was caught.
- **The precedent is mixed.** Release 3's own `loadBasis` assertion (`:790`) has the same fixture-only shape, so that one was copied faithfully; but Release 3's laterality (`:813`) and mechanics (`:822`) assertions filter `EXERCISE_CATALOG`, and the new block deviates from those two.

The "volumeCounting on exactly eight" (`:926`) and "strengthEstimate on all 24" (`:946`) assertions do check `EXERCISE_CATALOG` and are load-bearing. **Recommendation** (non-blocking, suitable for a follow-up): make the three filter `EXERCISE_CATALOG` scoped by the block's slugs, matching the Release-3 laterality/mechanics form.

**Claims that reconcile correctly.** The file manifest is accurate: **20 modified + 1 created**, and the manifest table has exactly 21 rows, one per file; every file named is one the specification authorised. The "+71 contributions" arithmetic is independently confirmed. The claimed protected boundaries hold — `src/db/schema`, `src/sync`, `src/domain/sync`, `src/server`, `src/domain/strength`, `src/domain/progression`, `src/domain/volume`, `drizzle/` and `.github/` all show **zero** changes. The 517-assertion and 30-check claims could not be re-executed (their scripts were deleted, as the report says), but my independent 1030-check and 498-assertion equivalents cover the same ground and more, with zero failures, so the substance is corroborated. Two trivial wording imprecisions, noted without being findings: §2.1 says the block was appended "after the … closing `];`" when it is correctly inserted *before* it, inside the array; and "Total diff: 14 lines across the two files" counts substantive code lines, where the diff is 28 added / 11 removed.

## 11. Boundaries, preservation and cleanup

**Working tree restored exactly.** `git diff --numstat` totals `added=1776 deleted=237` — identical to the state at the start of this review — and `src/ui/exercises/ContributionEditor.tsx` checksums to `b456c672…`, its pre-mutation value. No test was weakened, no implementation file was modified, and no existing report was touched.

**Unrelated changes preserved untouched:** `CLAUDE.md`, `HANDOFF.md` (deleted), `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, the two `repository-agent-workflow-*` reports, `warmup-routines-evidence-research.md`, and `docs/reviews/post-p10-roadmap-evaluation.md` — the last of which appeared during this session from outside it and was left alone.

**Cleanup confirmed.** All three of my disposable containers (`ce1-rev-a/b/c`) removed; `docker ps -a` shows only the pre-existing, still-stopped `gym-app-db-1`. My old-code worktree removed — `git worktree list` shows only the main checkout. My server on port 3100 stopped (port now free). My mutation scratch copy (`C:\tmp\ce1-mutate`), scratch specs (`tests/e2e/_rev-*.spec.ts`), scratch config and `_rev-*.mts` helpers all deleted; `test-results/` removed. The one resource still running is **not mine** — see F-1.

## 12. Explicitly pending — not performed, not discharged by this verdict

A green verdict here covers implementation fidelity only. It does **not** authorise deployment, and the following remain outstanding exactly as the specification requires:

- **Production exercise-name collision check for all 24 names** (§16.6) — not run; no production database was contacted by the implementation or by this review.
- **D-CE1-1(i): per-client update controls** (§16.7 step 3) — updating **every** client used with the account and confirming "Tibialis (Shin)" is selectable in the contribution picker *before* the new exercise is opened. Not performed; no deployment has occurred. The forward hardening verified in §4 and §5 does **not** protect an already-installed bundle (RR-12), which remains true after implementation.
- **D-CE1-1(ii): post-deployment read-only Tibialis check** (§16.7 step 5) — confirming against production that `bodyweight-tibialis-raise` holds exactly one `tibialis` primary at weight 1.0 and no `calves` row. Not performed. My §6.1 and §8 checks establish the same shape on disposable databases only.
- **Device acceptance on the iPhone** (§16.8) — not performed. My §8 browser lifecycle covers the same functional ground in desktop Chromium and is not a substitute.
- **Commit, push, deploy** — none has occurred; the implementation remains uncommitted in the working tree.

---

VERIFIED — READY FOR CATALOG EXPANSION DEPLOYMENT
