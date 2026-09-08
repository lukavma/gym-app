# Athletic Exercise Measurement Profiles — Release 2 remediation (PI-005)

**Date:** 2026-09-08
**Remediates:** every finding in `docs/reviews/athletic-measurement-profiles-release-2-review.md` §1 (H-1, H-2, M-1, M-2, M-3, M-4, L-1…L-8), plus two new owner clarifications the review raised for the owner at L-5/L-6.
**Binding specification, unchanged:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` and `docs/reviews/athletic-measurement-profiles-owner-decision-integration.md`; O-1…O-17 remain accepted exactly as recorded. No owner decision was reopened, reinterpreted, or expanded by this pass — L-5/L-6 were themselves owner decisions the review posed for the first time, now resolved and recorded in the architecture evaluation document's own §29 correction log.
**Scope discipline:** the independent review (`athletic-measurement-profiles-release-2-review.md`) was not modified. No Release 3 work was implemented or seeded. No test was weakened, skipped, or deleted to make a gate pass. Only the files this report and its constituent stages name were touched.
**Method:** ten remediation stages ran (H-1, H-2, M-1, M-2, L-8, M-3, M-4, L-1/L-4, L-2/L-3, L-5/L-6), each an independent subagent reading only the current working tree, followed by a full verification pass and one fix-up round the verification pass required. This report was written by a final documentation stage that re-derived the file manifest itself (`git status`, `git diff --stat`) rather than trusting the stage reports alone, and that re-read the independent review directly rather than working from paraphrase.

---

## 0. Verdict

All thirteen findings, plus both new owner clarifications, are closed. Two HIGH product defects (H-1, H-2) are fixed with code changes, each covered by a unit test, an integration test, and a real-browser e2e regression, each independently proven load-bearing by a negative control that was reverted and re-confirmed restored. Two MEDIUM product defects (M-1, M-2) are fixed narrowly, each with its own negative control. Two MEDIUM record defects (M-3, M-4) are closed: M-3 by adding the two missing e2e coverage files the report had falsely claimed existed, M-4 by correcting a now-false architecture-doc paragraph and explicitly re-targeting the seam that stays open. Of the eight LOW findings, six are plain record/documentation corrections (L-1, L-2, L-3, L-4, and the two owner decisions L-5/L-6, which required both a specification and a code change), one required a code hardening with its own negative control (L-8), and one required no change at all (L-7, disclosure confirmed accurate as written).

Verification found the working tree green on every functional gate but not yet on `format:check` (53 files — 51 pure CRLF-normalization plus 2 genuine printWidth violations, both pre-existing formatting debt on this Windows checkout, not new remediation defects); a fix-up round resolved both in a scoped `prettier --write` over exactly that file list and re-verified. The final, all-green state is:

- **Unit:** 1129/1129 passed, 82 files — up from the review's own 1114/1114, 79 files (+15 tests, +3 files).
- **Integration:** 455 passed / 17 skipped / 472 total, 28 files run + 6 skipped — up from the review's 448/465, 17 skipped, 27+6 files (+7 tests, +1 file).
- **E2E:** 129/129 passed — up from the review's 121/121 (+8 tests).
- **`format:check`:** clean (after the fix-up round).
- **`pnpm build`:** succeeds, 40 routes, typecheck and lint clean.
- **A-20 concurrency** (real PostgreSQL): 1/1, then 5/5 consecutive clean re-runs, zero flakes — matching the review's own rigor exactly.
- **Every protected boundary held** (no `0014` migration, sync-contract file untouched, progression/strength untouched, catalog slug count unchanged at 93, no speed/pace).
- **The independent review document was never modified.**

iPhone / physical-device acceptance (A-25) remains outstanding and was explicitly out of scope for this remediation pass, exactly as it was for the review itself.

**READY FOR TARGETED REMEDIATION VERIFICATION**

---

## 1. Product defects (four findings, each with a discriminating negative control)

### 1.1 H-1 — cross-device / post-eviction resume lost the frozen measurement profile

**Root cause.** `src/server/today/service.ts`'s `ActiveSessionExerciseDto` never carried a `measurement` field, and `getActiveSession` never populated one even though `session_exercises.measurementProfile`/`.loadBasis` were already selected for other purposes. `normalizeActiveSession` then defaulted every adopted slot to `load_reps`/`unspecified` — correct for a genuinely old, pre-upgrade cached aggregate, indistinguishable from a live server response about a `duration` session.

**Fix.** `ActiveSessionExerciseDto` gained `measurement: { profile: MeasurementProfile; loadBasis: LoadBasis | null }` (typed non-optional, since this DTO is always freshly built server-side, unlike a cacheable bundle), populated in `getActiveSession`'s exercise mapping straight from `e.measurementProfile`/`e.loadBasis`. `ActiveSessionSetDto` also gained `distanceM`/`durationS: number | null`, closing the parallel set-level gap. `src/sync/activeSession.ts` and `src/sync/activeSessionStore.ts` had their stale "server does not populate this yet" comments corrected; `normalizeActiveSession`'s default-fill itself is unchanged, now correctly framed as tolerance for genuinely old cached data rather than a live-gap workaround.

**Regression tests.** `tests/unit/measurementActiveSession.test.ts` — the existing "server-hydrated session normalizes on adopt" test was retargeted to be explicitly an old/pre-upgrade fixture, and a new test proves a live server response carrying `measurement: {profile: "duration", loadBasis: null}` is adopted and preserved exactly, not defaulted. `tests/integration/today.integration.test.ts` — a new PGlite-backed regression drives the real `applySyncBatch` path and asserts `getActiveSession`'s own DTO carries the correct `measurement`. `tests/e2e/measurementProfiles.spec.ts` — a new two-browser-context regression ("H-1 regression — cross-device resume preserves a non-load_reps frozen profile") has device A log a 60 s `duration` round, then has device B (new browser context, same account) resume and confirms the "Time in seconds" input renders (never weight/reps), the previous-round line is exact, "null" appears nowhere, and a further round logged from device B drains with no `invalid_measurement` dead letter. This test passed in the full e2e run (test #28/129).

**Negative control.** The interface field and its population in `src/server/today/service.ts` were commented out; the integration test was re-run and failed with `expected undefined to deeply equal {loadBasis: null, profile: "duration"}` — the exact defect. The fix was restored and diffed against a pre-negative-control snapshot of the file's own diff, confirmed **byte-for-byte identical**; the integration test was re-run and passed again (14/14).

**Result observed:** fixed, confirmed load-bearing.

### 1.2 H-2 — ad-hoc adding any new profile was rejected outright

**Root cause.** `src/sync/activeSession.ts`'s `addAdhocExercise` unconditionally froze `{profile: "load_reps", loadBasis: "unspecified"}`, even though the picked exercise's real profile was already available at the UI call site (`AddAdhocExercise.tsx` holds a full `ExerciseDto`). The server's `measurement_profile_mismatch` rule then rejected every non-`load_reps` ad-hoc add.

**Fix (three files, no contract change).** `AddAdhocExercise.tsx`'s `handleAdd` now forwards `exercise.measurementProfile`/`exercise.loadBasis` into `addAdhocExercise`. `activeSessionStore.ts`'s `addAdhocExercise` gained an optional third `measurement` parameter, threaded through. `activeSession.ts`'s `addAdhocExercise` now accepts and uses that parameter (`measurement ?? {profile: DEFAULT..., loadBasis: DEFAULT...}`), replacing the unconditional hardcode.

**Regression tests.** `tests/unit/measurementActiveSession.test.ts` — a new "H-2" describe block with 5 parameterized tests, one per new profile (`reps`, `load_distance`, `distance_time`, `duration`, `load_duration`), proving the supplied measurement lands on both the returned aggregate and the emitted `sessionExercise` op. `tests/integration/adhocExerciseMeasurement.integration.test.ts` (new) — 5 tests (one per profile, driven by a loop) exercising the real client mutators end-to-end into a real PGlite Postgres via `applySyncBatch`, asserting `result.rejected` is `[]` for every profile (5/5 passed, zero `measurement_profile_mismatch` rejections). `tests/e2e/measurementProfiles.spec.ts` — a new "H-2 regression" test ad-hoc-adds a `duration`-profile exercise mid-workout, logs a round, and confirms the outbox drains with zero dead letters (test #29/129, passed).

**Negative control.** `activeSession.ts`'s `addAdhocExercise` was temporarily reverted to ignore its `measurement` parameter and always freeze `load_reps`/`unspecified`. Unit: all 5 new H-2 tests failed (aggregate/op carried the wrong profile). Integration: all 5 new tests failed with the exact rejection `{opId, entity: "sessionExercise", reason: "measurement_profile_mismatch"}`. E2E: rebuilt and re-ran — failed because the card rendered `load_reps` weight/reps inputs instead of `duration`'s "Time in seconds". The fix was restored and `activeSession.ts` was diffed against its pre-negative-control version, confirmed **byte-identical**, twice (once after the unit/integration control, once after the e2e control). Everything was re-run post-restore and passed.

**Result observed:** fixed, confirmed load-bearing.

### 1.3 M-1 — the `load_distance` edit row overflowed 320 px

**Root cause.** `load_distance`'s edit row is the only one carrying three `w-16` inputs (weight, distance, duration) plus the `m:ss` sibling label plus Save/Cancel — measured `scrollWidth = 329` at a 320 px viewport, over the review's own budget and the case A-22's shipped check did not measure.

**Fix.** `ExerciseCard.tsx`'s `SetRow` and `HistoryDetail.tsx`'s `HistorySetRow` edit branches now use `gap-1` instead of `gap-2` for the `load_distance` profile specifically (every other profile keeps `gap-2`, byte-identical layout elsewhere), and move the `m:ss` sibling label for `load_distance` onto its own line below the inputs (every other profile keeps it inline, unchanged).

**Regression test.** `tests/e2e/measurementProfiles.spec.ts` extends the A-22 width assertion (`document.documentElement.scrollWidth <= 320`) to the `load_distance` **edit** row in both `ExerciseCard` (during workout) and `HistoryDetail` (via Edit→Cancel after completion).

**Negative control.** The fix was temporarily reverted (`gap-2` restored, `m:ss` span put back inline) in both files while keeping the extended assertion. Rebuilt and re-ran: the test **failed** with `Received: 329` against `Expected: <= 320` — the exact overflow value the review reported, confirming the check genuinely detects the regression. The fix was restored via the identical reverse edits; a line-ending-normalized diff confirmed the restored files are byte-for-byte identical to the intended final state, and `git diff --stat` showed the same line counts as before the negative control. Rebuilt and re-ran: the test **passed** again.

**Result observed:** fixed, confirmed load-bearing.

### 1.4 M-2 — O-16's refusal marker and completion confirmation could lag a rejection by up to 5 s

**Root cause.** `refreshSessionBlocked` (the sole writer of `refusedSetLogIds`/`refusedSessionExerciseIds`) ran only from `adoptRemote` and `SyncStatusBanner`'s 5-second poll. `flushOutbox` — where a rejection actually becomes a dead letter — refreshed only the sync-status store's dead-letter list, so the card marker and `handleComplete`'s refused count could both be stale for up to 5 seconds after a rejection was already durably recorded.

**Fix.** `src/sync/flush.ts` now calls `void useActiveSessionStore.getState().refreshSessionBlocked()` immediately beside the existing `refreshDeadLetters()` call whenever `result.rejected.length > 0`. `src/ui/workout/WorkoutExecution.tsx`'s `handleComplete` now `await`s a new `getRefusedCountAfterRefresh()` (extracted to `src/ui/workout/refusedSetCount.ts` specifically to make the race testable without a DOM), which itself awaits a real `refreshSessionBlocked()` before reading the counts off the store via `getState()`, never a stale hook-bound render snapshot.

**Regression tests.** `tests/unit/sync/flushSyncsActiveSessionRefusals.test.ts` runs the real `flushOutbox()` (not mocked) against fake-indexeddb plus a mocked `/api/sync` rejection and asserts the active-session store's refused sets update without the test ever calling `refreshSessionBlocked()` itself. `tests/unit/workout/handleCompleteRefusedCount.test.ts` exercises `getRefusedCountAfterRefresh()` against a store deliberately left stale (a dead letter already in IndexedDB, the store's cached sets still empty — the exact race) and proves the fresh refresh catches it.

**Negative control (both fixes).** (1) The `refreshSessionBlocked()` call was removed from `flush.ts`; both rejection tests in `flushSyncsActiveSessionRefusals.test.ts` **failed** (`expected false to be true`). Restored; re-ran — all pass; `git diff src/sync/flush.ts` shows exactly the intended 12-line addition. (2) `getRefusedCountAfterRefresh` was made to skip its `await refreshSessionBlocked()` call; both `handleCompleteRefusedCount.test.ts` tests **failed** (`1` expected vs `0` received, and vice versa). Restored — the file is new/untracked so there is nothing to diff against, but the restored content is confirmed byte-identical to what was written before the revert.

**Result observed:** fixed, confirmed load-bearing.

---

## 2. Owner-decision findings (L-5, L-6 — both required a specification change and a code change, with a negative control)

The review raised these for the owner rather than as implementation errors: §14.3's original four reconcile predicates were exactly correct as written, but left two asymmetries visible only once run against a populated database. Both are now resolved by explicit owner decision, recorded in `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md`'s new §29 correction log:

> **L-5** — Owner decision: "a session-referenced seeded Plank that must retain its legacy `load_reps` profile gets `volume_counting = 'off'`."
> **L-6** — Owner decision: "an unreferenced Farmer's Carry converted to `load_distance`/`per_hand` also gets `volume_counting = 'off'`, matching a fresh seed."

**Code change.** `src/db/seed/reconcileMeasurementProfiles.ts` gained a sixth predicate: a new **referenced-plank** branch (`bodyweight-plank`), mirroring the existing referenced-carry branch's exact shape — `is_seeded AND measurement_profile = 'load_reps' AND volume_counting = 'auto' AND EXISTS session_exercises` — setting only `volumeCounting: "off"`, mutually exclusive with the unreferenced-plank branch via the same EXISTS/NOT EXISTS construction the carry pair already uses. The existing **unreferenced-carry** conversion branch was extended to also set `volumeCounting: "off"` (previously it only set `measurementProfile`/`loadBasis`, leaving `volume_counting` at its pre-Release-2 `'auto'`). `src/db/seed/exerciseCatalog.ts`'s fresh-seed entries for both `bodyweight-plank` and `dumbbell-farmers-carry` already carried `volumeCounting: "off"` and needed no change — the fix makes the reconcile converge to what a fresh seed already produces.

**Specification change.** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §14.3's table split into unreferenced/referenced rows for both exercises with inline L-5/L-6 notes; §18.1 (I-11) gained a parenthetical confirming these are `volume_counting`-only, history-consistent changes needing no invariant amendment; the new §29 records both owner decisions, citing the review's §5.5 findings verbatim (quoted above). `docs/architecture/data-model.md` §2.4 gained a new paragraph stating the same reconcile outcomes, including the L-5/L-6 dates, for a reader who starts there instead of the architecture evaluation.

**Regression test.** `tests/integration/reconcileMeasurementProfiles.integration.test.ts` grew from 10 to **11 tests**: a new "bodyweight-plank — referenced (by a session)" describe block for L-5, and the existing "unreferenced conversions" test extended to assert `carry?.volumeCounting === "off"` for L-6. Idempotency and double-run/rolled-back-retry tests already cover both new branches.

**Negative control.** The plank-referenced UPDATE branch body was temporarily replaced with a no-op (`{ noop += 1; }`), leaving everything else untouched. The full suite was re-run: the **L-5 test failed exactly as expected** (`AssertionError: expected 'auto' to be 'off'` at the `volumeCounting` assertion), while all other 10 tests still passed. The original branch code was restored verbatim; an `md5sum` of the file before and after the negative control matched exactly (`2e5322c9b7295bd7bbd9e724f0afcc0b`) — zero net diff. The suite was re-run: **11/11 passed** again.

**Independent re-verification on real PostgreSQL** (final verification stage, not PGlite): see §6 below for the full six-state matrix, which reproduces both L-5 and L-6's fixed outcomes on a disposable real-Postgres database and confirms both land exactly as the amended §14.3 table now specifies.

**Result observed:** both owner decisions implemented and fixed; confirmed load-bearing on both PGlite and real PostgreSQL.

---

## 3. Record and documentation findings (six findings, no product code changed)

### 3.1 M-3 — the two Release-2 forms had no coverage, and the report claimed otherwise

**Fix.** Two new real-browser Playwright spec files were added: `tests/e2e/exerciseFormMeasurementProfile.spec.ts` (4 tests) drives `/exercises/new` and `/exercises/:id` — confirms the Measurement-profile select's exact option set and order, Load-basis gating on create, the reactive `409 measurement_profile_locked` revert-and-disable-and-copy behavior on a prescription-referenced exercise, and the static "Not available for this measurement profile." lines (no `<select>`) for a `duration` exercise's Strength estimate and Volume counting. `tests/e2e/prescriptionFormMeasurementProfile.spec.ts` (2 tests) drives `/templates/:id/prescriptions/new` — confirms the exact scheme/strategy option sets and field visibility for a `distance_time` exercise and a `reps` exercise. `docs/reviews/athletic-measurement-profiles-release-2-implementation.md`'s A-11b row (§2) was corrected from the false "e2e-covered in `tests/e2e/measurementProfiles.spec.ts`" claim to name the two new spec files and state plainly that `measurementProfiles.spec.ts` builds its fixtures via `page.request.post` and never opens either form.

**Verification.** 6/6 new tests pass (run twice for stability); `tests/e2e/muscleTaxonomyV2.spec.ts` (3/3) still passes unchanged, confirming its positional-`<select>` contract is untouched by the new specs' label-based locators; `tests/e2e/measurementProfiles.spec.ts` (8/8 at that stage) still passes.

**Result observed:** corrected — real coverage now exists and the report's claim now matches it.

### 3.2 M-4 — a production architecture doc stated something false

**Fix.** `docs/architecture/pwa-offline-strategy.md` §5's "Two disclosed Release-1 seams" block was corrected in place. Seam 1 is now marked **discharged**: it states the client's `src/sync/types.ts` mirror now carries the identical widened set-shape (`weightKg`/`reps: number | null`, plus `distanceM`/`durationS`), and that the remaining gap the seam implied — the missing exercise-level `measurement` field — was closed by this remediation's H-1 fix, cited by name against `athletic-measurement-profiles-release-2-review.md` §5.1. Seam 2 is explicitly re-targeted, not silently dropped: the doc now states it is **still open, deliberately deferred**, because fixing `applySessionExerciseUpsert` requires touching `src/server/sync/service.ts`, which this remediation's own hard boundaries hold as protected — and names it as a candidate for the next release permitted to touch that file.

**Verification.** Documentation-only stage; no source or test file touched. Confirmed via `git status`/read-back that only the target doc file changed, and that the review document itself remained untouched.

**Result observed:** corrected; the false statement is gone and the genuinely-open seam is now honestly recorded as open rather than silently left contradicting the shipped code.

### 3.3 L-1 — a false `400 load_basis_not_supported` handling claim

**Fix.** `docs/reviews/athletic-measurement-profiles-release-2-implementation.md`'s A-11b row (§2) had the false claim removed. Verified by grep of `ExerciseForm.tsx`'s `handleSubmit`: the response-handling only branches on `409 measurement_profile_locked`, generic `409`, `422`, and generic `400` — no branch checks `body?.error === "load_basis_not_supported"`. Since the branch is genuinely unreachable from this form today (`loadBasis` is always derived correctly before submit, so the server can never return this code to it), the claim was removed rather than speculatively implementing dead-code handling — the same conservative judgment call the review itself allowed for.

**Result observed:** corrected; no code change needed, none made.

### 3.4 L-2 — the A-23 test didn't assert the `deadReason` it claimed to prove

**Fix.** `tests/e2e/dead-letter.spec.ts`'s `readInjectedOutboxRecord` helper now also reads `deadReason`, and the A-23 test gained `expect(deadRecord?.deadReason).toBe("invalid_measurement")` immediately after the existing payload-survival assertion. The literal string was confirmed against the server's actual effective-row validation path (grepped in `src/server/sync/service.ts` and `src/sync/corrections.ts`) before being hardcoded into the assertion, rather than assumed.

**Verification.** `pnpm test:unit` unaffected (this is an e2e file); `npx playwright test tests/e2e/dead-letter.spec.ts` — both tests passed (2/2), confirming the new assertion holds against the real server rejection, not merely in theory.

**Result observed:** corrected.

### 3.5 L-3 — a mislabeled "mutation witness" and an unasserted key-order claim

**Fix.** `tests/unit/sync/setLogEmission.test.ts`'s final test — which asserts that a deliberately wrong expectation throws, proving discrimination without mutating any production code — was relabeled from "mutation witness" to "negative control," clarifying it is not the same technique as the two genuine mutation witnesses the report separately credits. The "load_reps stays byte-identical" test gained a genuine key-*order* assertion (`expect(Object.keys(op.payload)).toEqual([...])`, keys in their real emission order), in addition to its existing key-set assertions. The real current emission order was confirmed empirically (a throwaway zod script mirroring `setLogUpsertPayloadSchema`, deleted after use) rather than guessed — it is schema-declaration order (`id, sessionExerciseId, setNumber, isWarmup, weightKg, reps, rir, loggedAt, notes`), not source-object insertion order, since the payload is run through `.parse()`.

**Verification.** `pnpm test:unit` — 82 files / 1129 tests passed at that stage, including this file's 9 tests.

**Result observed:** corrected.

### 3.6 L-4 — a miscounted section heading

**Fix.** `docs/reviews/athletic-measurement-profiles-release-2-implementation.md`'s §1.9 heading, which read "Tests — new (16 files, 3,338 lines)" over a table of 13 test files, was reworded to distinguish the 13 new *test* files from the 16 total new files (13 tests + 3 non-test source modules) — the 3,338-line total across all sixteen was already correct and is unchanged.

**Result observed:** corrected; no code change needed, none made.

### 3.7 L-7 — no code change required, disclosure confirmed accurate

The review recorded L-7 (the Measurement-profile select ships last in the form, after `ContributionEditor`, rather than "directly under Equipment" as §15.1's prose describes, in order to protect `muscleTaxonomyV2.spec.ts`'s positional `<select>` indices) purely so a future reader would not mistake a disclosed, accepted deviation for an oversight. The M-3 stage checked the implementation report's §11 directly and confirmed it **already** discloses this exactly as the review's §6.7 describes it. No correction was needed and none was made.

**Result observed:** no code change required, disclosure confirmed accurate.

### 3.8 L-8 — `correctHistorySet`/`deleteHistorySet` could throw into a `void`

**Root cause.** Both functions now schema-parse their payload and can therefore throw; both call sites in `HistoryDetail.tsx` applied an optimistic local update and then `void`-called the async op, so a throw would leave the screen showing a change no outbox op carries, with an unhandled rejection. Unreachable today (`validateSetInput` mirrors every wire bound exactly) but load-bearing in a way it wasn't before this release's schema-parsing was introduced.

**Fix.** A new module, `src/ui/history/correctionSubmit.ts`, extracts the "apply optimistic → await → revert-and-report" shape into two injectable-callback functions: `submitHistorySetCorrection` and `submitHistorySetDeletion`. Each calls `applyOptimistic()` synchronously, awaits the real `correctHistorySet`/`deleteHistorySet`, and on rejection calls `revertOptimistic()` then `onError()` with a fixed message (`CORRECTION_FAILED_MESSAGE` / `DELETION_FAILED_MESSAGE`, both pointing the athlete at Sync Issues). `HistoryDetail.tsx`'s `onSave` and `onDelete` now go through these wrappers instead of a bare `void correctHistorySet(...)` / `void deleteHistorySet(...)`; a new `restoreLocalSets` helper (the inverse of `removeLocalSet`) and a per-`setId` `syncError` state map were added so the reverted state and the error message both render correctly under the read-mode row.

**Regression test.** `tests/unit/history/correctionSubmit.test.ts` — 4 tests: success cases for both wrappers (no revert, no error), and two regression cases that force a rejection with a deliberately invalid patch/row (`rir: 99`) bypassing the UI-level guard, asserting `revertOptimistic` and `onError` each fire exactly once and the outbox stays empty.

**Negative control.** Both wrappers' `try { await X(...) } catch { revert; onError; }` were temporarily replaced with a bare `await X(...)` (no catch), after backing up the file. Re-ran `correctionSubmit.test.ts`: both regression tests **failed** — the correction case failed with an unhandled `ZodError` propagating out of `submitHistorySetCorrection` (no revert, no error surfaced), the deletion case failed identically via `buildSetDeletionOps`. The file was restored from the backup and diffed against it: **zero-byte difference**. Re-ran the test file: **4/4 passed** again; the full unit suite: 1129/1129 passed at that stage.

**Result observed:** fixed, confirmed load-bearing.

---

## 4. The format:check fix-up round (found by verification, not one of the 13 findings)

The first verification pass found `pnpm format:check` failing on 53 files: 51 were pure CRLF-normalization drift (consistent with `core.autocrlf=true` on this Windows checkout, not a defect any remediation stage introduced) and 2 (`tests/e2e/dead-letter.spec.ts`, `tests/e2e/exerciseFormMeasurementProfile.spec.ts`) had genuine printWidth violations independent of line endings. A dedicated fix-up round ran `prettier --write` scoped to exactly that 53-file list (never a repo-wide `--write`, to avoid touching any other already-modified or untracked file), normalizing all 51 to LF with no content change beyond line endings, and wrapping the two genuine violations (an over-100-char ternary in `dead-letter.spec.ts`; a method chain in `exerciseFormMeasurementProfile.spec.ts`) to fit. `pnpm format:check` went from 53 failing files to **clean**; `pnpm typecheck` stayed clean; `pnpm test:unit` (1129/1129) and `pnpm test:integration` (455/17 skipped) were unaffected in count or name before vs. after; `git diff --name-only` after the fix matched exactly the file set already modified before the fix-up round started, confirming no scope creep; every protected boundary re-checked empty; the forbidden-terms grep re-run clean; the review document confirmed not opened for writing.

---

## 5. Full finding-by-finding map

| Id | Kind | Fixed in | Test / control | Result |
| --- | --- | --- | --- | --- |
| H-1 | product (code) | `src/server/today/service.ts`, `src/sync/activeSession.ts`, `src/sync/activeSessionStore.ts` | unit + integration + e2e regression, independently re-verified as load-bearing | fixed |
| H-2 | product (code) | `src/ui/workout/AddAdhocExercise.tsx`, `src/sync/activeSessionStore.ts`, `src/sync/activeSession.ts` | unit (5) + integration (5) + e2e regression, independently re-verified as load-bearing | fixed |
| M-1 | product (code) | `src/ui/workout/ExerciseCard.tsx`, `src/ui/history/HistoryDetail.tsx` | extended A-22 e2e width assertion, independently re-verified as load-bearing | fixed |
| M-2 | product (code) | `src/sync/flush.ts`, `src/ui/workout/WorkoutExecution.tsx`, new `src/ui/workout/refusedSetCount.ts` | 2 new unit tests against real store + real IndexedDB, independently re-verified as load-bearing (both fixes) | fixed |
| M-3 | test coverage / report accuracy | 2 new e2e spec files; `release-2-implementation.md` §2 A-11b row | 6 new e2e tests, real forms, real routes | fixed |
| M-4 | documentation accuracy | `docs/architecture/pwa-offline-strategy.md` §5 | — (doc only) | corrected: seam 1 discharged, seam 2 re-targeted as open |
| L-1 | report accuracy | `release-2-implementation.md` §2 | — (no code; branch confirmed unreachable) | corrected |
| L-2 | test quality | `tests/e2e/dead-letter.spec.ts` | new `deadReason` assertion, passed against real server rejection | fixed |
| L-3 | test quality | `tests/unit/sync/setLogEmission.test.ts` | relabeled + new key-order assertion, empirically verified order | fixed |
| L-4 | report accuracy | `release-2-implementation.md` §1.9 | — (no code) | corrected |
| L-5 | product / specification (owner decision) | `src/db/seed/reconcileMeasurementProfiles.ts`; `architecture-evaluation.md` §14.3/§18.1/§29; `data-model.md` §2.4 | new integration test + negative control, independently re-verified as load-bearing on PGlite and real PostgreSQL | fixed |
| L-6 | product / specification (owner decision) | same files as L-5 | extended integration test assertion + negative control (shared L-5 control), independently re-verified as load-bearing on PGlite and real PostgreSQL | fixed |
| L-7 | specification deviation | — | — | no code change required, disclosure confirmed accurate |
| L-8 | product hardening | new `src/ui/history/correctionSubmit.ts`; `src/ui/history/HistoryDetail.tsx` | 4 new unit tests, independently re-verified as load-bearing | fixed |

---

## 6. Seed-reconcile matrix — original four states unchanged, plus the two new L-5/L-6 outcomes

Re-verified independently by the final verification stage on a disposable real PostgreSQL 16 database (container `gymapp-r2-verify`, database `reconcilecheck`, freshly migrated — separate from the PGlite integration suite's own 11 passing tests), driving the actual `runSeed` / `reconcileMeasurementProfiles` / `applySyncBatch` code paths directly. Shape is `profile/loadBasis/volumeCounting`.

| State | Plank | Farmer's Carry | Assisted Pull-up | Summary | Rerun |
| --- | --- | --- | --- | --- | --- |
| Clean DB (fresh seed) | `duration/null/off` | `load_distance/per_hand/off` | `load_reps/assistance/auto` | `{updated: 0, noop: 5}` — up from the review's `noop: 4`, +1 for L-5's new referenced-plank predicate | no-op |
| Unreferenced *(unchanged predicate, one field newly corrected)* | `duration/null/auto` | **`load_distance/per_hand/off`** — **L-6 fix**: was `/auto` before this remediation, now byte-identical to a fresh seed | `load_reps/assistance/auto` | `{updated: 3, noop: 2}` | `{updated: 0}` |
| Carry referenced by a **session** *(unchanged)* | `duration/null/auto` | `load_reps/unspecified/off` — profile untouched, counting corrected | `load_reps/assistance/auto` | updated | `{updated: 0}` |
| Carry referenced by a **prescription only** *(unchanged)* | `duration/null/auto` | `load_reps/unspecified/auto` — entirely untouched | `load_reps/assistance/auto` | before === after, untouched | `{updated: 0}` |
| **Plank referenced by a session — new L-5 state** | **`load_reps/unspecified/off`** — profile untouched, counting corrected; previously stuck `load_reps/unspecified/auto` forever | `load_distance/per_hand/auto` | `load_reps/assistance/auto` | updated | `{updated: 0}` |
| Already reconciled *(unchanged)* | unchanged | unchanged | unchanged | `{updated: 0, noop: 5}` | `{updated: 0}` |

Every outcome matches the review's original four-predicate matrix exactly, plus both L-5/L-6 fixes landing exactly as the amended §14.3 table now specifies. A repeated full `db:seed` on a clean database produced byte-identical rows before and after a second `runSeed` call, with a stable row count of 93 catalog entries and no duplicate insert.

**One non-blocking residual, explicitly not a finding.** The verification stage separately flagged, for the owner's awareness only, that an *unreferenced* Plank's `volume_counting` stays `'auto'` after conversion (inherited from its pre-Release-2 state) while a fresh seed of the same entry is `'off'` — the identical asymmetry L-6 raised for the carry, but never posed as its own owner decision for the plank's unreferenced case, and not one of the two clarifications this remediation was scoped to resolve. It is structurally inert exactly as L-6's own reasoning already establishes: `isProfileEligibleForVolume(profile)` returns `false` for `'duration'` regardless of the switch, so nothing observable differs. It was correctly left unaddressed by this remediation and is recorded here only so it isn't mistaken for an oversight.

---

## 7. Concurrency (A-20) re-confirmation

`setRenumberConcurrency.integration.test.ts` was re-run against a disposable real PostgreSQL 16 database (container `gymapp-r2-verify`, database `renumconc`, fully migrated, distinct from the persistent dev DB on port 5432), env-gated via `SET_RENUMBER_CONCURRENCY_DATABASE_URL`: **1/1 passed, then 5/5 consecutive clean re-runs, zero flakes.** Exactly one side of each race commits, the loser gets `set_number_conflict`, and both composite FKs (`fk_set_logs_parent_profile`, `fk_session_exercises_exercise_profile`) hold on every surviving row — matching the review's own A-20 rigor exactly.

---

## 8. Protected-boundary re-confirmation

Verification held all five checks the review itself performed, exactly as reported:

> All five checks held. (1) `git diff --stat -- src/server/sync/service.ts` is empty. (2) `git diff --stat` across `src/domain/progression/`, `src/server/progression/`, `src/domain/strength/`, `src/server/strength/`, `src/ui/strength/`, `src/domain/sync/schema.ts` is empty. (3) `git status --porcelain --untracked-files=all` across `src/domain/strength/`, `src/server/strength/`, `src/ui/strength/`, `src/server/sync/` is empty. (4) `exerciseCatalog.ts`'s slug count is unchanged (94 raw `"slug:"` occurrences = 1 interface-field declaration + 93 real catalog entries, confirmed identically via git diff, direct grep, and `EXERCISE_CATALOG.length` on real Postgres); the diff adds zero new `slug:` or `muscleGroupId:` lines, only `measurementProfile`/`loadBasis`/`volumeCounting` fields on the three pre-existing legacy entries. (5) `grep -rniE "speed|pace|m/s|km/h"` across `src/domain/measurement/`, `src/ui/workout/`, `src/ui/history/` returns zero matches.

No `0014` migration exists — `drizzle/` still holds exactly 14 `.sql` files (`0000`…`0013`), `git diff --stat -- drizzle/` is empty. No Release-3 catalog entries were seeded and no muscle contribution was invented.

---

## 9. Independent review document — untouched confirmation

Quoted from the final verification stage:

> `docs/reviews/athletic-measurement-profiles-release-2-review.md` is untracked ("??" in git status), git diff against it is empty, and its mtime (09:41:57) predates every remediation file edit (earliest checked at 13:18+) and this stage's own work. reviewDocUntouched = true — confirmed not modified.

This report's own author independently re-ran `git status --porcelain=v1 --untracked-files=all` before writing this document and confirmed the review file still appears only as an untracked, unmodified file (96 total status lines in the working tree, matching the count every remediation stage reported throughout).

---

## 10. Exact gate counts, compared against the review's own pre-remediation baseline

| Gate | Review's baseline | This remediation's final result | Change |
| --- | --- | --- | --- |
| `pnpm test:unit` | 1114/1114 passed, 79 files | **1129/1129 passed, 0 failed, 82 files** | +15 tests, +3 files |
| `pnpm test:integration` | 448 passed / 17 skipped (465 total), 27 files run + 6 skipped | **455 passed / 17 skipped / 472 total, 28 files run + 6 skipped (34)** | +7 tests, +1 file |
| `pnpm test:e2e` | 121/121 passed | **129/129 passed, 0 failed** | +8 tests |
| `pnpm format:check` | clean | clean (after the §4 fix-up round; 53 files failed on the first verification pass, all resolved) | net unchanged, transiently regressed then fixed |
| `pnpm build` | succeeds, 40 routes | **succeeds, exit code 0, 40 routes emitted, typecheck and lint clean** | unchanged |
| Migration count | 14 files, no `0014` | **14 files, no `0014`** | unchanged |

All three test-count categories are strictly higher than the review's pre-remediation baseline, consistent with the regression tests each finding's fix required; none went down; nothing failed in the final pass (`remainingFailures: []`).

---

## 11. Outstanding — device acceptance

**A-25 (physical iPhone acceptance) was not performed and remains explicitly out of scope for this remediation**, exactly as it was for the independent review itself: keyboard type per input, ≥44 px tap targets, VoiceOver announcement of each accessible name, the stale-service-worker update prompt, and on-device rendering of the `m:ss` label all remain unexecuted on real hardware. Every fix in this remediation is verified by unit, integration, and real-browser (Playwright/Chromium) e2e evidence against real PostgreSQL, not by a physical device. The next concrete step for this release is the iPhone acceptance pass, now unblocked by both H-1 and H-2 being fixed (the review itself noted these should be fixed before the checklist is run, since otherwise two of its items could not be exercised at all).

---

## 12. Cleanup status

Quoted from the final verification stage:

> Disposable Postgres container `gymapp-r2-verify` (`postgres:16`, port 55433, holding databases `reconcilecheck`/`renumconc`/`e2echeck`) stopped and removed. `docker ps -a` shows only `gym-app-db-1` (the persistent dev DB), Up and healthy, never connected to, migrated, or seeded by any command in this verification pass — every migrate/seed/test invocation used an explicit `DATABASE_URL` override pointed at the disposable container. All node/chrome/chrome-headless-shell processes this verification started were force-stopped; a final process check returned empty. My own scratch files … were deleted. … Final `git status --porcelain --untracked-files=all` is byte-identical to the session's starting snapshot — same 96 lines, same M/?? classifications, nothing added, removed, or further modified by this verification stage.

No commit, push, or deployment was made by any stage of this remediation or by this report. No disposable database or container is currently running.

---

**READY FOR TARGETED REMEDIATION VERIFICATION**
