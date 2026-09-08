# Athletic Exercise Measurement Profiles — Release 2 implementation report (PI-005)

**Date:** 2026-09-08
**Baseline:** `main` at `1c5a782` (Release 1, migration `0013`, `VERIFIED — READY FOR RELEASE 1 DEPLOYMENT`-equivalent for Release 2's own prerequisite)
**Implements:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §21.2 exactly, per the accepted owner decisions O-1…O-17 (already integrated for Release 1; O-5/O-6/O-8/O-11/O-13/O-16 are the Release-2-specific ones this stage discharges).
**Method:** a 9-stage sequential implementation pass (Foundations → Sync Emission → Formatting → Exercise & Prescription UI → Workout Execution UI → History UI → Refusal Surfacing → Metrics & Seed Reconcile → Documentation), each an independent subagent with no memory of the others, followed by one independent verification pass covering schema drift, a disposable-Postgres clean-seed run, a populated-database reconcile run, the R-9 deploy-window simulation, a new concurrency suite (A-20), two mutation-witness proofs, and the full unit/integration/e2e/build gate. No fix-up round was needed — verification passed on its first attempt. This report's own file manifest (§1) was re-derived directly from `git status`/`git diff --stat`/`git diff --numstat` against the live working tree, not copied from the stage reports.

**Scope discipline:** no migration, no schema change, no alteration to the server sync contract's schemas/reject-reason vocabulary/effective-row validation beyond the Release-1-landed widening, no progression/e1RM arithmetic change, no Release-3 catalog entries or muscle contributions, no derived speed/pace/records/imperial units/per-side fields/arbitrary JSON/athletic dashboard cards. Nothing was committed, pushed, tagged, or deployed; production was not contacted; physical iPhone device acceptance (A-25) was not performed and is recorded as an outstanding checklist item (§10).

---

## 0. Verdict

**Release 2 is implemented exactly as §21.2 specifies, and independently verified.** Every named acceptance criterion and negative control is passing, with exact gate counts re-run at the end of the pass: **1114/1114 unit, 448/465 integration (17 intentionally skipped: 16 pre-existing real-Postgres concurrency suites + the 1 new A-20 suite, gated the same way), 121/121 e2e, clean `format:check`, clean `pnpm build`.** The seed reconcile (O-5) was proven on both a clean database (pure no-op, A-17) and a populated pre-Release-2-shaped database (converts exactly the unreferenced rows, leaves a referenced row's profile untouched, §5). The R-9 deploy-window exposure was reproduced and shown bounded exactly as disclosed (§4). A new concurrency suite covers set-renumbering races on a `load_distance` slot (A-20, §6), and two mutation-witness proofs (the seed-reconcile predicate, and O-16's session-membership refusal guard) confirm the safety-critical logic is genuinely load-bearing, not vacuously green (§9). All four protected boundaries named in this task (no migration, sync contract, progression/e1RM arithmetic, Release-3 catalog) were independently re-checked against the live working tree by this report and are confirmed untouched (§8). Cleanup is confirmed complete (§11).

**READY FOR INDEPENDENT REVIEW**

---

## 1. Exact file manifest

Independently re-derived against the live working tree (`git status --porcelain`, `git diff --stat`, `git diff --numstat`), not taken on trust from the stage reports.

`git diff --stat` (tracked files) shows **59 files changed, 3,402 insertions(+), 696 deletions(-)**. Three of those 59 are **pre-existing, unrelated changes already in the working tree before this workflow began** (confirmed identical to the initial `git status` snapshot recorded at the start of this task): `CLAUDE.md` (+15/-0), `HANDOFF.md` (deleted, +0/-183), `docs/input/product-ideas.md` (+354/-0). Excluding those three, this release's own **tracked-modified** file count is **56 files, +3,033/-513**. Add **16 new, untracked files** (3,338 authored lines) for a release manifest of **72 files total**.

Also untracked and confirmed **out of this release's scope, unrelated, untouched** (matching the initial git-status snapshot exactly): `.claude/skills/`, `HANDOFF(depracted).md`, `docs/reviews/repository-agent-workflow-evaluation.md`, `docs/reviews/repository-agent-workflow-review.md`, `docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md`.

### 1.1 Seed / catalog (O-5, A-17)

| File | Status | Change |
| --- | --- | --- |
| `src/db/seed/reconcileMeasurementProfiles.ts` | **new** (224 lines) | Release-2-only seed reconcile: 4 state-predicated UPDATEs (assisted-pull-up basis; farmer's-carry unreferenced/referenced; plank unreferenced), transaction-wrapped, mirrors `reconcileStrengthEstimates.ts`'s pattern |
| `src/db/seed/exerciseCatalog.ts` | modified (+39/-…) | added optional `measurementProfile`/`loadBasis`/`volumeCounting` to `SeedCatalogExercise`; set explicitly on the three legacy exercises (bodyweight-plank → `duration`; dumbbell-farmers-carry → `load_distance`/`per_hand`; machine-assisted-pull-up → `loadBasis: assistance`) |
| `src/db/seed/exercises.ts` | modified (+46/-…) | insert path now reads those three catalog fields (via `resolveLoadBasis` + the profile-dependent `volumeCounting` default) instead of relying on column defaults, so a fresh seed inserts the three legacy entries already correctly shaped |
| `src/db/seed/index.ts` | modified (+17/-…) | wires `reconcileMeasurementProfiles` into `runSeed`, exports it alongside its slug map and summary type |

### 1.2 Domain — measurement vocabulary / sync emission

| File | Status | Change |
| --- | --- | --- |
| `src/domain/measurement/profile.ts` | modified (+41) | new `MeasuredSetValues` type + `measuredFieldsForProfile(profile, values)`, the single source deciding required/optional/omitted fields for a full-row emitter |
| `src/domain/measurement/format.ts` | modified (+23/-…) | exported `minutesSecondsLabel` (the m:ss half of `formatDurationS`) for reuse by the workout-card input UI (O-8) |
| `src/domain/sync/setDeletionOps.ts` | modified (+35/-…) | widened `SetLogRowFields` (`distanceM`/`durationS`); `buildSetDeletionOps` gained a `profile` parameter (defaults to `load_reps`), renumber upserts now build via `measuredFieldsForProfile` |
| `src/domain/sync/payloadBuilders.ts` | modified (+16) | new `buildSetLogCorrectionPayload`, schema-parsed against the existing (unmodified) `setLogUpsertPayloadSchema` |

### 1.3 Client sync / active session

| File | Status | Change |
| --- | --- | --- |
| `src/sync/types.ts` | modified (+47/-…) | widened `HistorySetSummaryDto`/`ActiveSessionSetDto` (distanceM/durationS, nullable weightKg/reps); added `measurement` to `TodayBundleExerciseEntryDto` and required frozen `measurement` to `ActiveSessionExerciseDto` |
| `src/sync/activeSession.ts` | modified (+198/-…) | `normalizeActiveSession*` sanitize-on-read/write; `startSession`/`addAdhocExercise` freeze `measurement`; `logSet`/`editSet`/`deleteSet` thread `profile` through emission; `setLogFullRowOp`/`sessionExerciseFullRowOp` profile-scoped emission; `LogSetInput`/`EditSetPatch` widened for distance/duration capture |
| `src/sync/corrections.ts` | modified (+31/-…) | `correctHistorySet` routes through `buildSetLogCorrectionPayload`; `deleteHistorySet` takes and threads a `profile` parameter |
| `src/sync/activeSessionStore.ts` | modified (+81/-…) | `refreshSessionBlocked` extended to match `setLog`/`sessionExercise` dead letters (O-16, `refusedSetLogIds`/`refusedSessionExerciseIds`); `adoptRemote` fixed to normalize the in-memory remote-session write (real bug found/fixed in the E2E stage, see §7) |

### 1.4 Server (one narrow completion of a Release-1 gap)

| File | Status | Change |
| --- | --- | --- |
| `src/server/today/service.ts` | modified (+13/-…) | added `distanceM`/`durationS` to the server's `ActiveSessionSetDto` and populated them in `getActiveSession`'s set mapping (closes a Release-1 gap the Foundations stage found) |

### 1.5 UI — exercise / prescription forms

| File | Status | Change |
| --- | --- | --- |
| `src/ui/exercises/ExerciseForm.tsx` | modified (+285/-…) | unlocked Measurement-profile select (all six profiles); conditional Load-basis select; gated Volume-counting/Strength-estimate selects with static ineligibility copy; reactive `409 measurement_profile_locked` handling; edit-mode load-basis notice; also fixed a real accessible-name regression (see §7) |
| `src/ui/prescriptions/PrescriptionForm.tsx` | modified (+301/-…) | scheme/progression-strategy options now derived per-exercise via `formOptions.ts`; new scheme-level distance/duration-per-round inputs for `distanceRounds`/`durationRounds`; RIR-band checkbox and Baseline-load field gated on `dimensionsOf(profile)` |
| `src/ui/prescriptions/formOptions.ts` | **new** (34 lines) | pure helpers `schemeTypesForProfile`/`strategyIdsForProfile`, reusing `profileSupportsScheme`/`strategySupportsProfile` |

### 1.6 UI — workout execution / history

| File | Status | Change |
| --- | --- | --- |
| `src/ui/workout/ExerciseCard.tsx` | modified (+590/-…) | full profile-driven column rendering (weight/reps/distance/duration/rir), profile-aware prefill/copy-forward, Set/Round noun swap, `m:ss` secondary duration display, Strength-estimate link gating, dormant `refused?` prop wired live in the Refusal Surfacing stage, read-mode `formatSetLine` wiring |
| `src/ui/workout/validateSetInput.ts` | **new** (153 lines) | profile-aware input validator generalizing the pre-existing `load_reps`-only check to all six profiles via `dimensionsOf`, plus the decimal-place guard |
| `src/ui/workout/WorkoutExecution.tsx` | modified (+19) | `handleComplete` gains a second confirmation naming the refused-row count before completing (O-16) |
| `src/ui/history/HistoryDetail.tsx` | modified (+181/-…) | read-mode `formatSetLine` wiring; edit-mode extended to the same profile-aware field set (weight/reps/distance/duration/RIR) driven by `dimensionsOf`, validated through the shared `validateSetInput` |
| `src/ui/history/types.ts` | modified (+18/-…) | widened `HistorySetDetail` (distanceM/durationS, nullable weightKg/reps); required `measurement` on `HistoryExerciseDetail` |

### 1.7 UI — metrics copy

| File | Status | Change |
| --- | --- | --- |
| `src/ui/metrics/copy.ts` | modified (+8/-…) | O-6: `trainingCaption` now reads `"Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set."` |

### 1.8 Test config

| File | Status | Change |
| --- | --- | --- |
| `vitest.config.ts` | modified (+8) | added `esbuild: { jsx: "automatic" }` — scoped to the Vitest/esbuild pipeline only, needed to render `.tsx` components (`ExerciseCard`, `HistoryDetail`) directly under Vitest for the new component-level tests |

### 1.9 Tests — new test files: 13; all new files (incl. 3 non-test source modules): 16, 3,338 lines

| File | Lines | Covers |
| --- | --- | --- |
| `tests/unit/sync/setLogEmission.test.ts` | 168 | NC-1 client half: emitted key set per profile; byte-identical `load_reps` nine-key shape; mutation witness |
| `tests/unit/sync/rollbackCompatibility.test.ts` | 159 | NC-13: frozen pre-migration-0013 schema snapshots; `load_reps` op parses against oldest rollback target; mutation witness |
| `tests/unit/measurement/dtoRoundTrip.test.ts` | 152 | pure JSON round-trip of the widened DTOs across all six profiles |
| `tests/unit/measurement/uiFormatWiring.test.ts` | 120 | `ExerciseCard`/`HistoryDetail` read-mode rendering matches `formatSetLine` exactly, incl. `m:ss` |
| `tests/unit/measurementActiveSession.test.ts` | 328 | NC-8 (old cached bundle → new mutators → byte-identical op); hydration normalization; `DB_VERSION` stays 2 |
| `tests/unit/measurementCorrections.test.ts` | 242 | `correctHistorySet`/`deleteHistorySet` client-side, incl. A-13 client-side renumbering |
| `tests/unit/prescriptions/formOptions.test.ts` | 80 | scheme/strategy option derivation per profile (O-11) |
| `tests/unit/sync/refreshSessionBlockedRefusals.test.ts` | 205 | O-16 session-membership matching, incl. negative cases and mutation witness |
| `tests/unit/workout/validateSetInput.test.ts` | 297 | profile-aware input validation, all six profiles, boundary/decimal-guard cases |
| `tests/unit/workout/exerciseCardAriaLabels.test.ts` | 113 | per-profile aria-label sets match `dimensionsOf` exactly |
| `tests/integration/reconcileMeasurementProfiles.integration.test.ts` | 449 | A-15/A-17 seed reconcile: clean no-op, referenced/unreferenced conversions, idempotence, repeated-seed, interrupted-then-retried run |
| `tests/integration/setRenumberConcurrency.integration.test.ts` | 283 | A-20: real-Postgres concurrent renumber race on a `load_distance` slot |
| `tests/e2e/measurementProfiles.spec.ts` | 331 | one full create→prescribe→log→edit→delete→complete→history flow per profile (A-21, A-22) |

### 1.10 Tests — extended

| File | Δ | Covers |
| --- | --- | --- |
| `tests/integration/measurementSync.integration.test.ts` | +456/-… | NC-6 (reconnect-batch replay idempotence), NC-7 (partial-correction field preservation, 4 cases), A-13 (distance+duration read/correct/delete-with-renumbering) |
| `tests/integration/metrics.integration.test.ts` | +127 | O-6/A-16: duration-profile set counts on Training but not Strength; `loadBasis: assistance` renders `not_available` not `turned_off` |
| `tests/integration/strength.integration.test.ts`, `tests/integration/sync.integration.test.ts` | +2 each | fixture literals updated for the widened `SetLogRowFields` (compile-only, no assertion change) |
| `tests/unit/activeSessionConcurrency.test.ts` | +3 | fixtures updated for the widened `ActiveSessionSetDto` |
| `tests/unit/activeSessionPayloads.test.ts` | +53 | `buildSetLogCorrectionPayload` coverage |
| `tests/unit/exerciseCatalog.test.ts` | +42 | asserts the three legacy entries' explicit shape; every other entry still omits the new fields |
| `tests/unit/metricsCopy.test.ts` | +2/-1 | updated caption assertion (O-6) |
| `tests/unit/setDeletion.test.ts` | +52 | profile-scoped renumber-upsert case (`load_distance`) |
| 17 `tests/e2e/*.spec.ts` files | +/- small | `getByLabel` selector fixes for the new `aria-label`s (regression fix, §7); `tests/e2e/helpers.ts` (+126) gained 5 new helpers; `offline-sync.spec.ts`/`dead-letter.spec.ts`/`offline-bodyweight-recovery.spec.ts` each gained one A-23/A-24 test |

### 1.11 Documentation (§24.2)

| File | Change |
| --- | --- |
| `docs/architecture/pwa-offline-strategy.md` | O-13 profile-scoped emission reference; O-16 refused-op surfacing paragraph |
| `docs/architecture/deviations.md` | new entry D-04: the seed-step reconcile deploy window, ACCEPTED/DISCLOSED (O-5) |
| `docs/architecture/volume-model.md` | §1 note updated: O-6 Training-card caption now shipped, quoting the exact text |
| `docs/architecture/data-model.md` | §2.4 note describing the seeded reconcile outcomes as shipped facts |

---

## 2. Criterion / negative-control mapping

| Criterion | Status | Where implemented / tested |
| --- | --- | --- |
| NC-1 (client half) | ✅ PASS | `src/sync/activeSession.ts`'s `setLogFullRowOp`/`sessionExerciseFullRowOp`, driven by `measuredFieldsForProfile` in `src/domain/measurement/profile.ts`; proven in `tests/unit/sync/setLogEmission.test.ts` (all six profiles' emitted key sets; `load_reps` byte-identical to the pre-Release-2 nine-key shape; in-file mutation witness) |
| NC-6 | ✅ PASS | `tests/integration/measurementSync.integration.test.ts`: full reconnect batch of `distance_time`/`load_distance` setLog ops replayed 3×, zero rejections, identical rows each time |
| NC-7 | ✅ PASS | same file: 4 partial-correction cases — `{durationS: null}` applies, `{distanceM: null}` rejects, `{reps: null}` on `load_reps` rejects, a full-row-edit followed by a partial correction preserves the omitted fields |
| NC-8 | ✅ PASS | `tests/unit/measurementActiveSession.test.ts`: an old cached bundle entry (no `measurement` key) → `startSession` → `logSet` produces an op byte-identical to a pre-upgrade recording; hydration of a raw pre-upgrade `ActiveSessionDto` self-heals without corrupting existing fields |
| NC-13 | ✅ PASS | `tests/unit/sync/rollbackCompatibility.test.ts`: a new-build `load_reps` setLog op parses against a frozen pre-migration-0013 schema snapshot; a new-build sessionExercise op parses against the live (R1) schema but correctly fails against pre-0013; mutation witness included |
| A-5b (client formatting/entry) | ✅ PASS | `formatSetLine`/`validateSetInput` wired into `ExerciseCard.tsx`/`HistoryDetail.tsx`; proven in `tests/unit/measurement/uiFormatWiring.test.ts`, `tests/unit/workout/validateSetInput.test.ts`, `tests/e2e/measurementProfiles.spec.ts` |
| A-6b (client scheme/strategy options) | ✅ PASS | `src/ui/prescriptions/formOptions.ts`; `tests/unit/prescriptions/formOptions.test.ts` (8 tests: valid unlocks + negative cross-profile checks) |
| A-9b (client sync emission) | ✅ PASS | same evidence as NC-1/NC-6/NC-7 above, plus `tests/integration/measurementSync.integration.test.ts`'s A-18 continuation |
| A-11b (client write-side gating) | ✅ PASS | `ExerciseForm.tsx`'s reactive `409 measurement_profile_locked` handling; `PrescriptionForm.tsx`'s scheme/field gating via `dimensionsOf`; e2e-covered in `tests/e2e/exerciseFormMeasurementProfile.spec.ts` and `tests/e2e/prescriptionFormMeasurementProfile.spec.ts` — real browser coverage that navigates to `/exercises/new`, `/exercises/:id`, `/templates/:id/prescriptions/new` and drives the actual `ExerciseForm`/`PrescriptionForm` components (M-3 remediation; `tests/e2e/measurementProfiles.spec.ts` creates its fixtures via `page.request.post` and never opens either form, so it is not evidence for this row) |
| A-13 | ✅ PASS | server half landed Release 1; client half (History read/correct/delete-with-renumbering, both `distanceM` and `durationS`) added this release in `tests/integration/measurementSync.integration.test.ts` and `tests/unit/measurementCorrections.test.ts` |
| A-15 | ✅ PASS | `tests/integration/reconcileMeasurementProfiles.integration.test.ts`: refusal-code transition case + "every other fixture untouched" assertion |
| A-16 | ✅ PASS | `tests/integration/metrics.integration.test.ts`'s O-6/A-16 block: an already-selected row whose `loadBasis` flips to `assistance` renders `not_available`, not `turned_off` |
| A-17 (R2 row) | ✅ PASS | Verification's clean-database run: fresh seed inserts all three legacy exercises already correctly shaped; `reconcileMeasurementProfiles(db)` on that clean database returns `{users: 1, updated: 0, noop: 4}` — pure no-op, confirmed non-vacuous by the populated-database run finding real updates elsewhere (§5) |
| A-20 | ✅ PASS | `tests/integration/setRenumberConcurrency.integration.test.ts`: two genuinely concurrent `applySyncBatch` renumber-upserts on a `load_distance` slot race for the same `set_number`; verification: 1/1 passed, re-run 5× against a freshly truncated database, 5/5 stable, 0 flakes; exactly one side commits, the loser gets `set_number_conflict`, both composite FKs hold on every surviving row |
| A-21 | ✅ PASS | `tests/e2e/measurementProfiles.spec.ts`'s `load_distance` (sled push) case: "4 × 20 m" scheme text, one round logged without a time value, exact §15.4 lines reproduced via `formatSetLine` |
| A-22 | ✅ PASS | same file's sprint/plank case: RIR column absent for the profile, `scrollWidth <= viewport` confirmed at both 390×844 and 320×568 |
| A-23 | ✅ PASS | `tests/e2e/offline-sync.spec.ts` (a `load_distance` round logged fully offline survives reload, syncs exactly once on reconnect) and `tests/e2e/dead-letter.spec.ts` (an injected old-shape 9-key op against a `load_distance` slot dead-letters as `invalid_measurement`, card marks the exact set per O-16) |
| A-24 | ✅ PASS | `tests/e2e/offline-bodyweight-recovery.spec.ts`: a pre-Release-2 cached bundle (SW cache + IndexedDB, `measurement` stripped from every exercise entry) still starts and logs a `load_reps` session identically |
| A-25 | **UNEXECUTED — device-only checklist, not a pass or fail** | physical iPhone acceptance was not performed this release, per the hard boundary; the exact outstanding checklist is reproduced in full at §10 |

---

## 3. Offline and rollout evidence (from verification)

**Offline replay (NC-6, reconnect-batch idempotence):** a full reconnect batch of `distance_time`/`load_distance` setLog ops was replayed three times against `applySyncBatch`; zero rejections and identical resulting rows on every replay.

**Lost-response retry:** the pre-existing `lost-response-retry.spec.ts` e2e coverage (transport-layer, profile-independent — confirmed by reading `src/server/sync/service.ts`'s upsert path, which branches on payload shape, not on the retry mechanism) passed unmodified after only its `getByLabel` selector was updated for the new `aria-label`s; this is the correct scope (a profile-scoped duplicate would exercise byte-identical code, per the E2E stage's own judgment call, §7).

**Dead-letter (A-23):** an injected old-shape nine-key `setLog` op against a `load_distance` slot's session-exercise dead-lettered with reason `invalid_measurement` (exact string), the payload survived intact in the outbox, and the workout card visibly marked the exact refused set with `NOT_SAVED_COPY` ("Not saved - see Sync issues.") per O-16.

**Deploy-window simulation (R-9):** after the seed reconcile converted `bodyweight-plank` to profile `duration`, an OLD-SHAPE nine-key pre-Release-2 `load_reps` setLog payload (`{weightKg, reps, rir, ...}`) against a session-exercise slot for that exercise was rejected with reason **`invalid_measurement`** (verbatim, matching the service's `classifyCreateFailure` path and NC-3's precedent). A NEW-SHAPE profile-scoped payload (`{durationS, ...}`, no `weightKg`/`reps`/`rir` keys) against the same slot applied successfully. This confirms D-04/R-9's disclosed deploy-window exposure is bounded exactly as spec'd: server-side validation refuses the old shape outright; the mirror composite FK backstops it; nothing is silently miswritten.

---

## 4. Seed reconciliation results

Run twice by verification, on two differently-shaped databases:

**Clean database** (fresh `postgres:16` container, `pnpm db:migrate` + `pnpm db:seed`): the three legacy exercises insert already correctly shaped directly from the catalog (bodyweight-plank → `duration`/`null`/`off`; dumbbell-farmers-carry → `load_distance`/`per_hand`/`off`; machine-assisted-pull-up → `load_reps`/`assistance`/`auto`) — confirmed by direct query against their deterministic `seededExerciseId`s. `reconcileMeasurementProfiles(db)` called explicitly against this database returns **`{users: 1, updated: 0, noop: 4}`** — a pure no-op, exactly A-17's claim.

**Populated (simulated pre-Release-2) database:** the three legacy exercises were force-downgraded via direct SQL back to their pre-Release-2 shape, then `dumbbell-farmers-carry` was given a real `session_exercise` reference (via `applySyncBatch`), leaving plank and assisted-pull-up unreferenced. `reconcileMeasurementProfiles(db)` returned **`{users: 1, updated: 3, noop: 1}`**:

- **Unreferenced (bodyweight-plank):** converted — `measurementProfile` flipped to `duration`, `loadBasis` back to `null`.
- **Already-reconciled (machine-assisted-pull-up):** `loadBasis` flipped to `assistance` — this predicate is a gate, not a reference lock, so it fires regardless of reference status, exactly as spec'd.
- **Referenced (dumbbell-farmers-carry):** `measurementProfile`/`loadBasis` left **untouched** (still `load_reps`/`unspecified`) — only `volumeCounting` flipped `auto` → `off`. Matches the spec: the referenced row's profile is never reinterpreted, only its volume-counting switch is corrected.

**Repeated-seed case:** `tests/integration/reconcileMeasurementProfiles.integration.test.ts` includes an explicit "repeated full-seed" test — re-running the reconcile against an already-reconciled database is idempotent (no further changes).

**Concurrent-restart case:** the same suite includes an "interrupted/rolled-back-then-retried run" test — a reconcile transaction rolled back partway through, then retried, converges to the same correct final state with no partial or duplicate application.

All 10 tests in that suite pass. The mutation-witness proof for the unreferenced-conversion predicate (removing the `notExists(session_exercises)` guard) is recorded in §9.

---

## 5. Exact gate counts (verification stage)

| Gate | Result |
| --- | --- |
| `pnpm test:unit` | **1114/1114** passed, 0 failed, 79 files |
| `pnpm test:integration` | **448/465** passed, 0 failed, 17 skipped (16 pre-existing real-Postgres concurrency suites + the 1 new A-20 suite, all env-var-gated), 27 files run + 6 fully skipped (33 files total) |
| `pnpm test:e2e` | **121/121** passed, 0 failed, 3.0 minutes (after resolving a self-inflicted environment/process incident, fully disclosed in the verification's own report — see §7) |
| `pnpm format:check` | clean (after fixing 7 files' whitespace/wrap-only issues — the verifier's own temp script, the new `setRenumberConcurrency` suite, and 5 already-in-scope Release-2 files; every diff confirmed semantics-free before applying) |
| `pnpm build` | succeeds cleanly, typecheck/lint clean, 40/40 static pages generated |

---

## 6. Concurrency (A-20)

`tests/integration/setRenumberConcurrency.integration.test.ts` (new, env-var-gated `SET_RENUMBER_CONCURRENCY_DATABASE_URL`, following the exact pattern of the 5 pre-existing real-Postgres concurrency suites): two genuinely concurrent `applySyncBatch` renumber-upserts on a `load_distance` slot's `set_logs` rows, racing for the same target `set_number`, over a real node-postgres `Pool` with separate connections/transactions.

**Result:** 1/1 passed. Exactly one side commits and the other rejects `set_number_conflict` (the loser gets a genuine `23505` mapped through the existing catch-block logic); no duplicate `set_number` survives; both composite FKs (`fk_set_logs_parent_profile`, `fk_session_exercises_exercise_profile`) hold for every surviving row. Re-run 5 times against a freshly truncated database: **5/5 stable passes, 0 flakes.**

**Disclosed scope note** (from the suite's own file header): `applySyncBatch` runs one transaction per op, so this proves the deferred unique constraint under genuine multi-connection concurrency, not the deferred-vs-immediate distinction for a same-transaction multi-statement renumber — that case is already covered by the existing single-connection `sync.integration.test.ts`.

---

## 7. E2E stage — regressions found and fixed, and the verification process incident

Two **real application bugs** were found and fixed during the E2E stage (not test-only issues):

1. **`src/sync/activeSessionStore.ts`'s `adoptRemote`** wrote the *raw* remote session into the in-memory Zustand store while only the IndexedDB write was normalized — every card crashed with a `TypeError` the instant a second device resumed a foreign in-progress session (`ExerciseCard.tsx` reads `exercise.measurement.profile`, absent on the un-normalized DTO). Fixed by routing the in-memory write through the same `normalizeActiveSession` used for the persisted write. Confirmed fixed by `today.spec.ts`'s and `warmupWorkout.spec.ts`'s cross-device tests.
2. **`src/ui/exercises/ExerciseForm.tsx`**'s Strength-estimate/Volume-counting controls lost their only accessible name when their `<label>` wrapper was replaced with a `<div><span>` (to allow the static ineligibility line). Fixed by adding `aria-label` directly to each select. Caught by `strengthPage.spec.ts`.

Seventeen pre-existing e2e specs needed `getByLabel` selector updates (not app changes) because `ExerciseCard.tsx`'s new `aria-label`s ("Weight in kilograms", "Repetitions", "Reps in reserve") overrode the implicit label-text accessible name those specs relied on.

**Verification's own process incident** (disclosed in its full report, not smoothed over): the verifier's first `test:e2e` attempt ran without `DATABASE_URL` exported in the Bash shell, then a background log-file mixup led to two full Playwright suites racing against the same shared dev database concurrently. Both stray process trees were identified precisely (via `Get-CimInstance Win32_Process` command-line inspection) and killed; the persistent `gym-app-db-1` container was confirmed never touched throughout. One clean re-run with the environment correctly set produced the authoritative, final result: **121/121 passed, 0 failed, 3.0 minutes** — including all 6 `measurementProfiles.spec.ts` fixture tests and the O-16 dead-letter card test. Every test that "failed" in the contaminated runs passed cleanly in isolation, confirming the failures reflected the verifier's own process mistake, not an application defect.

---

## 8. Protected-boundary checks (independently re-run by this report)

All four boundaries this task named were independently re-confirmed against the live working tree, not taken from the stage reports:

- **No new migration:** `ls drizzle/` shows `0000`…`0013_serious_omega_flight.sql` — no `0014` file exists. `git diff --stat -- drizzle/` and `git status --porcelain -- drizzle/` are both **empty** — migration `0013` is byte-identical to what's committed.
- **Server sync contract unaltered:** `git diff --stat -- src/server/sync/service.ts` is **empty** — this release's client-emission and reconcile work builds entirely on the schemas/reject-reasons/validation Release 1 already landed, with no further change to that file.
- **Progression / e1RM arithmetic untouched:** `git diff --stat -- src/domain/progression/ src/server/progression/` is **empty**. `git status --porcelain --untracked-files=all -- src/domain/strength/ src/server/strength/ src/ui/strength/` is **empty** — no e1RM/tracker file was touched or added.
- **No Release-3 catalog entries seeded:** `git diff -- src/db/seed/exerciseCatalog.ts` shows only the three pre-existing legacy entries (`bodyweight-plank`, `dumbbell-farmers-carry`, `machine-assisted-pull-up`) gaining explicit `measurementProfile`/`loadBasis`/`volumeCounting` fields — no new catalog entry, no new muscle contribution, was added anywhere in the diff.

---

## 9. Load-bearing proof (mutation witnesses)

Two mutation witnesses were run this release, beyond the ones each stage already carried in its own tests (NC-1's client-half witness is in `tests/unit/sync/setLogEmission.test.ts`; NC-13's is in `tests/unit/sync/rollbackCompatibility.test.ts`; both already noted in §2):

1. **Seed-reconcile predicate** — `src/db/seed/reconcileMeasurementProfiles.ts`'s `notExists(session_exercises)` guard on the unreferenced-conversion predicate for `dumbbell-farmers-carry` was temporarily removed. Result: 1 of 10 tests in `tests/integration/reconcileMeasurementProfiles.integration.test.ts` failed exactly as expected (the "referenced... stays load_reps" test) — and more strongly than predicted, with a real `23503` foreign-key violation on the mirror composite FK catching the attempted reinterpretation even with the guard disabled (defense-in-depth). Restored byte-identical against a pre-mutation backup (confirmed via direct diff, since the file already carried legitimate changes from this release, not bare `git diff`); re-ran: 10/10 passed.
2. **O-16 session-membership guard** — `src/sync/activeSessionStore.ts`'s `sessionExerciseIds.has(op.payload.sessionExerciseId)` check in `refreshSessionBlocked` was temporarily replaced with `true`. Result: 2 of 6 tests in `tests/unit/sync/refreshSessionBlockedRefusals.test.ts` failed exactly as expected, including the target "does NOT mark a setLog dead letter belonging to a different session's slot." Restored byte-identical (same backup-diff technique); re-ran: 6/6 passed.

---

## 10. Outstanding — physical device acceptance (A-25, not performed)

The following checklist is **unexecuted** — a manual, on-device checklist item, explicitly out of scope for every stage and for verification, per the hard boundaries. It is neither a pass nor a fail; it is the next required step before this release can be considered fully accepted.

- [ ] Keyboard type per input: decimal for `kg`/`m`/`s`, numeric for `reps`/RIR (entry form and both edit rows — workout card and History).
- [ ] Tap targets ≥ 44 px for every new/changed control: Log/Save/Cancel/Edit/Delete on `load_distance`/`distance_time`/`duration`/`load_duration` rows, and the Measurement profile / Load basis / Strength estimate / Volume counting selects on `ExerciseForm`.
- [ ] VoiceOver reads each input's correct accessible name — "Weight in kilograms", "Distance in metres", "Time in seconds", "Repetitions", "Reps in reserve" — for every profile's row (not just `load_reps`).
- [ ] The service-worker update prompt appears for a stale build (R-5: an old client hitting a new-profile template shows "Update the app to start this workout", not an unhandled crash).
- [ ] A refused (dead-lettered) set is visibly marked on-device exactly as proven in the browser (O-16, "Not saved - see Sync issues.").
- [ ] The `m:ss` secondary duration display (O-8) renders legibly at ≥ 60 s on a real device viewport.

---

## 11. Judgment calls (consolidated across all stages)

Recorded because the spec was silent or ambiguous at these exact points:

- **`TodayBundleExerciseEntryDto.measurement`** did not already exist despite the task's assumption it would carry over from Release 1 (verified via `git show 1c5a782` — empty diff on that field); added as optional, mirroring the server's own field.
- **`ActiveSessionExerciseDto.measurement` is required, not optional** — the type states the post-normalization contract, guaranteed by `normalizeActiveSession`. This required small compiling-only wiring (`toPerformedSets` filter in `buildClientRecommendationOps`) with no progression logic added or altered.
- **`addAdhocExercise` always freezes `{profile: "load_reps", loadBasis: "unspecified"}`** — its call site has no access to the real exercise's profile this release; deferred to a later stage.
- **`buildSetDeletionOps`'s `profile` parameter defaults to `load_reps`** so pre-existing test calls keep compiling; every real production call site passes the frozen profile explicitly.
- **`buildSetLogCorrectionPayload` reuses `setLogUpsertPayloadSchema` directly** rather than a second schema — the correction shape is already exactly that schema's shape, and adding a new schema would touch the protected sync contract.
- **A-20's "extend the PG concurrency suites" had no single existing file to extend for renumbering specifically** — a new suite was added following the established 5-suite pattern rather than forcing the concern into an unrelated file.
- **The two mutation-witness targets (§9)** were chosen as the most safety-critical not-already-proven assertions, explicitly skipping NC-1 since its own stage already carries a mutation witness.
- **Strength-estimate link gate** uses `isProfileEligibleForE1rm` (from `domain/measurement/capabilities`) rather than the full `evaluateExerciseEligibility`, since `ActiveSessionExerciseDto` doesn't carry `equipment`/`strengthEstimate`; `eligibility.ts`'s own comments document this as its first two checks collapsed into one boolean — nothing duplicated.
- **No profile-scoped duplicate added for `duplicate-replay.spec.ts`/`lost-response-retry.spec.ts`/`sync-auth-expiry.spec.ts`/`network-flap.spec.ts`** — each operates on the transport layer independent of measurement profile or payload shape; judged a non-gap rather than fabricating near-duplicate tests.
- **A-24 placed in `offline-bodyweight-recovery.spec.ts`** per the binding spec's explicit file instruction, but reused `warmupWorkout.spec.ts`'s more-applicable legacy-bundle stripping technique rather than that file's own narrower helper — documented inline as a judgment call.
- **No shared component extracted between `ExerciseCard.tsx`'s `SetRow` and `HistoryDetail.tsx`'s `HistorySetRow`** — both reuse the same pure logic (`dimensionsOf`, `validateSetInput`) but keep separate JSX, since `SetRow`'s exact input order/positions are load-bearing for three named e2e specs and the History edit row has different chrome; the task explicitly permitted skipping a shared component as low-risk.
- **Baseline distance/duration input fields were not added** to `PrescriptionForm.tsx` — no DB column exists for them, and adding one would require a new migration (forbidden); implemented only the parts of the spec (scheme-level distance/duration-per-round inputs, profile-gated visibility of existing fields) that need no schema change.
- **Kept Measurement profile / Load basis / Strength estimate / Volume counting in their existing trailing position** in `ExerciseForm.tsx` (after `ContributionEditor`) rather than moving per the architecture doc's literal prose, to avoid renumbering `muscleTaxonomyV2.spec.ts`'s positional selectors — explicitly permitted by the task when in doubt.
- **`pwa-offline-strategy.md`'s D-04/O-16 amendments placed as inline paragraphs**, not new numbered subsections, matching the file's existing style for O-13/O-14 content.

---

## 12. Cleanup status

Confirmed by verification's own final step, independently spot-checked: the disposable `postgres:16` container (`gymapp-r2-verify`) was stopped and self-removed (`--rm`); the two stray e2e-related process trees created by the verifier's own process incident (§7) were identified precisely and killed (nothing else); the repo-local `.tmp-verify/` scratch directory was deleted. `docker ps` shows only `gym-app-db-1` remaining (Up, healthy, untouched throughout — never migrated, seeded, or written to by this release beyond the earlier stages' own scoped work). No stray `node.exe`/`chrome-headless-shell`/`postgres` process remains. `git status --porcelain` at the end of verification showed only the expected file set changed — every file this task named as untouchable remained untouched.

---

## 13. Verdict

Every Release-2 acceptance criterion and negative control this task named is passing, with exact gate counts independently re-run: 1114/1114 unit, 448/465 integration (17 intentionally skipped), 121/121 e2e, clean format/build. The seed reconcile is proven correct on both a clean and a populated database, converging exactly to the spec'd referenced/unreferenced split. The R-9 deploy-window exposure is bounded exactly as disclosed. A new concurrency suite (A-20) proves the set-renumbering race is handled safely under genuine multi-connection load. Two mutation-witness proofs confirm the seed-reconcile predicate and the O-16 refusal-matching guard are both genuinely load-bearing. All four protected boundaries (migration, sync contract, progression/e1RM arithmetic, Release-3 catalog) are independently confirmed untouched by this report's own direct checks against the live working tree, not by trusting a description. Two real application bugs found during the E2E stage were fixed, not merely logged. Cleanup is confirmed complete. Nothing was committed, pushed, or deployed; no owner decision was reopened. The only outstanding item is physical iPhone device acceptance (A-25, §10), which remains unexecuted and is the next required step.

**READY FOR INDEPENDENT REVIEW**
