# Athletic Exercise Measurement Profiles — Release 1 remediation (PI-005)

**Date:** 2026-09-07
**Remediates:** every finding in §10 of `docs/reviews/athletic-measurement-profiles-release-1-review.md` (M-1, L-1…L-12)
**Binding specification, unchanged:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §21.1; O-1…O-17 remain accepted exactly as recorded. No owner decision was reopened, reinterpreted, or expanded by this pass.
**Scope discipline:** the independent review (`athletic-measurement-profiles-release-1-review.md`) was not modified. No Release 2/3 work was implemented. No test was weakened, skipped, or deleted to make a gate pass. Only the files this report names were touched.
**Method:** ten findings are pure record corrections (a stale number, a mis-stated invariant id, a spec sentence the shipped code disagrees with) — fixed in place, in the document that was wrong, using each document's own existing correction-log convention where one exists. Two findings are real, narrow product bugs — fixed in code, each with a new regression test and a negative control proving the fix is load-bearing (not merely present), and each independently re-verified by reverting the fix, confirming the new test fails, then restoring the fix and confirming it passes again. Per the review's own §10 preamble, none of this required re-deriving any of the review's own evidence (the schema, the composite FKs, the cascade behaviour, the sync layer's real-service-path proofs, the hard boundaries, the 981/428/112 baseline) — that evidence stood unchallenged and is not repeated here.

---

## 0. Verdict

All thirteen findings are closed. The one MEDIUM (M-1) was a report-accuracy error, not a product defect, and is corrected by rewriting the implementation report's performance section against the corrected baseline the review identified — this release shows **no performance regression**, not the ~100% regression the report previously claimed. Ten LOW findings are textual corrections across five documents, each fixed at its exact site. Two LOW findings were real, narrow, currently-unreachable product bugs (an over-broad error mapping; two latent `throw`s on an already-unreachable path) — both fixed with the surrounding codebase's own established idioms, both covered by a new regression test, both covered by a negative control proving the guard the review's audit technique itself established as this project's standard. Full regression is green: `pnpm typecheck`/`typecheck:sw`/`lint`/`format:check` clean, **986/986** unit tests (up from 981, +5 from L-4), **431/431** integration tests / 16 skipped (up from 428, +3 across L-3's two tests and L-4's one), a clean production build. The 112/112 Playwright suite was not re-run — the two code changes touch no client, UI, or e2e-observable surface (confirmed by an empty `git diff --stat` against every such path), and re-running it would not exercise either fix.

**READY FOR TARGETED REMEDIATION VERIFICATION**

---

## 1. Documentation corrections (ten findings, no code touched)

Every row below was fixed in the exact document and section the review named, using that document's own established convention for recording a correction (a numbered correction-log entry where the document already has one — `athletic-measurement-profiles-architecture-evaluation.md`'s §25–27 and `estimated-1rm-load-translation-architecture-revision.md`'s §25.1–25.4 both already do this; a plain in-place fix elsewhere).

### 1.1 M-1 — the implementation report's performance finding was a phantom regression

**File:** `docs/reviews/athletic-measurement-profiles-release-1-implementation.md` §8 (performance) and §17 (verdict).

**What was wrong.** §8 compared this release's `p95 = 42.03 ms` against `metrics-dashboard-implementation.md`'s `p95 = 20.93 ms`, concluded "every percentile moved by roughly the same ~20 ms / ~100–110%", and attributed the gap to "a cold, freshly-provisioned disposable container" versus "the long-warm persistent `gym-app-db-1`". §11 then told a future editor to propagate that number into `§21.6`/`§24.1`.

**What was actually true.** The 20.93 ms baseline was already superseded within this repository's own review lineage before this report was written: `metrics-dashboard-review.md` found the fixture generator that produced it used `EXERCISES_PER_SESSION = 2` (~7,800 set rows over three years), roughly 4× lighter than the shape the spec itself calls for and the shape this release's own 31,200-row measurement actually used. Re-measuring the **same pre-`0013` release** at the corrected 31,200-row shape gives `p95 = 44.97 ms` (`metrics-dashboard-review.md`), `43.56 ms` (`metrics-dashboard-remediation.md`), and `53.48 ms` (`metrics-dashboard-remediation-verification.md`) — this release's `42.03 ms` sits inside that range. There was never a regression to explain, because the number the report compared against was never measuring the same fixture shape.

**Fix.** §8 rewritten in place: states the corrected baseline range (43.56–53.48 ms), the corrected verdict (flat to slightly faster, comfortably inside the 100 ms budget), removes the cold-container attribution (which the review also disproved directly — its own warm-container re-runs moved p50 by only ~3 ms, and an `EXPLAIN ANALYZE` A/B of the one new join showed a nil cost, 0.478 ms vs 0.538 ms), and withdraws the "use this report's numbers" instruction. §17's verdict updated to match. The bundle-size finding (50–68 bytes vs. the spec's "roughly 40") is **unchanged** — the review reconfirmed it independently and it was never in dispute.

### 1.2 L-1 — the amended A-19 stated the opposite of what ships

**File:** `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` §21.2 (A-19), plus a new §25.5 correction-log entry.

The amended A-19 read: *"…unreachable by any fixture in Release 1 … the reachability test's Release-1 run excludes them by name, reachability is required from Release 2."* `tests/unit/strengthReasonCodes.test.ts` does the opposite — it adds a dedicated fixture for each of the two new codes and asserts both are Release-A-reachable, not `RELEASE_B_ONLY_REASON_CODES` members. **Fix:** A-19 rewritten to state the codes are fixture-reachable in Release 1 and unobservable *in product data* only until Release 2 (no athlete-creatable exercise can be non-`load_reps` or `assistance`-basis until the selector unlocks). A new §25.5 entry records the correction using the same table format as §25.1–25.4.

### 1.3 L-2 — copy phrasing mismatch

**File:** same document, §15.4's `MEASUREMENT_PROFILE_UNSUPPORTED` row.

The table read "Not available for this exercise's **tracking** type"; the shipped `src/ui/strength/copy.ts` reads "…**measurement** type" (the column's actual name). **Fix:** table row aligned to the shipped copy, recorded in the same §25.5 entry as L-1.

### 1.4 L-5 — wrong invariant id in a heading

**File:** `docs/architecture/progression-engine.md`, the new SQL→domain boundary paragraph's heading.

Read "**SQL → domain boundary rule (I-14, athletic measurement profiles)**" while the paragraph's own body correctly cites "§18.1 I-13". **Fix:** heading changed to cite I-13, matching the body.

### 1.5 L-6 — `load_basis` falsely described as locked

**File:** `docs/architecture/data-model.md` §2.4.

The sentence read "`measurement_profile` **and `load_basis`** are locked once the exercise is referenced… — `load_basis` alone stays editable with history after that", which states the opposite of the truth in its own opening clause (`load_basis` is **never** locked, proven in the review's §3.6: a `per_hand` edit on a referenced exercise applies). **Fix:** rewritten so only `measurement_profile` is described as locked, with `load_basis`/`volume_counting`/`strength_estimate` stated plainly as ordinary editable metadata at any time.

### 1.6 L-7 — stale test counts and confusing file arithmetic

**File:** `docs/reviews/athletic-measurement-profiles-release-1-implementation.md` §1, §7.2, §7.3.

§7.2 said "44 tests"; §7.3 said "all 45 tests"; the shipped file (at review time) had 46. §1's "15 new, untracked files … **and** one new migration pair. Total: 79" reads as double-counting the migration pair on top of the 15, even though the arithmetic (64+15=79) was actually right. **Fix:** §1 reworded to state plainly that the migration pair is two of the 15, not additional to them, and that the 2,347-line figure excludes the separately generated 3,143-line snapshot file. §7.2/§7.3 reworded to identify each number as a point-in-time snapshot (44 as shipped by Stage 8, 45 after Stage 9's A-13 addition, 46 after this document's own §7.4 fix) rather than a single, ambiguous "current" count — and §12's gate table now states the true final count directly (see §2 below, since this remediation's own L-3/L-4 fixes changed it again, to 986/431).

### 1.7 L-8 — an A-13 test block wasn't credited as deliberate coverage

**File:** same document, §9 (acceptance criteria table).

`tests/integration/measurementSync.integration.test.ts` contains an A-13 block (history read/correct/delete on a `load_distance` slot); A-13 is a Release-2-scoped criterion (§20/§21.2), but the block tests server behaviour Release 1 genuinely ships, through the already-landed acceptance layer — coverage, not Release-2 product work. **Fix:** added a note directly under the A-1…A-19 table crediting this as deliberate extra thoroughness, not scope creep and not an oversight.

### 1.8 L-9, L-10, L-11 — three inaccuracies in the binding specification itself

**File:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §21.6, §13.5 (NC-3, NC-9), plus a new §28 correction-log entry (matching the existing §25/§26/§27 convention exactly — same table shape, same "no owner decision changed" framing).

- **L-9** — §21.6's "No new queries" was not literally true: `queryWorkSetContributionRows` gains one `INNER JOIN exercises`. Fixed to state the join exists and that its measured cost is nil (the review's own `EXPLAIN` numbers, 0.478 ms vs 0.538 ms).
- **L-10** — NC-3's DB-layer clause assumed a service-bypassed op would fail the composite FK "because the row carries the default profile." It does not: the implementation writes the derived parent profile explicitly on every insert, so a bypassed *pre-check* still carries the correct profile and instead fails the shape CHECK (`23514`), not the FK. Fixed to state this precisely — the implementation's actual behaviour is safer than the original text assumed, and its own tests already reach the FK the only way that remains available (bypassing the derivation too, via a raw insert).
- **L-11** — NC-9 was tagged R1 in full, but its `buildClientRecommendationOps` clause needs a client-DTO widening (`measurement.profile` on the aggregate) that O-7 explicitly excludes from Release 1. Fixed to carry the same "R1 (server), R2 (client)" split NC-1's row already uses, crediting the implementation's correct, disclosed deferral rather than describing it as a gap.

None of these three changes any acceptance criterion, test, or code — they correct descriptive text about what the (unchanged, independently-verified) implementation actually does. §28 states this explicitly, matching the "no owner decision changed" framing every prior correction log in this document already uses.

### 1.9 L-12 — two disclosed seams not yet named in the production-state documentation

**File:** `docs/architecture/pwa-offline-strategy.md` §5.

The review's own §5.9 credited the implementation report for disclosing two currently-unreachable Release-2 seams (the client's `ActiveSessionSetDto` staying narrower than the server's; `applySessionExerciseUpsert`'s update path not re-deriving `load_basis` on a same-profile `exerciseId` swap) but noted neither was yet recorded in the architecture documentation itself, where a Release-2 implementer would actually look. **Fix:** both added to §5 as a new paragraph, explicit that neither is reachable in Release 1 and both are Release-2's job to close.

### 1.10 Verification of the documentation pass

`pnpm format:check` clean after every edit above (`prettier --check .` → *"All matched files use Prettier code style!"*), re-run twice more during this remediation as further edits landed. `git status --porcelain` before and after this whole documentation pass shows the same set of pre-existing unrelated files (`CLAUDE.md`, the deleted `HANDOFF.md`, `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, and the untracked `docs/reviews/*.md` files that are inputs to or siblings of this work, including the review itself) completely untouched, plus exactly the documents named above. The independent review document was never opened for writing at any point in this remediation.

---

## 2. Code hardenings (two findings, both with a regression test and a negative control)

Both fixes are narrow, both bugs were already-classified LOW because neither is reachable through any path an athlete or the deploy pipeline can take today — the review said so explicitly, and this remediation did not change that classification, only closed the gaps.

### 2.1 L-3 — `updateExercise`'s `23503` mapping was scoped to any FK, not the profile-lock FK

**File:** `src/server/exercises/service.ts`.

**The bug.** The catch block's backstop mapping read `if (isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)) throw new MeasurementProfileLockedError();` — matching on SQLSTATE `23503` alone. The same transaction also inserts into `exercise_muscle_contributions`, whose `muscle_group_id` carries its own `ON DELETE RESTRICT` FK to `muscle_groups`. On a database whose muscle taxonomy is incomplete, a contributions-only PATCH that never mentions `measurementProfile` could raise `23503` on that unrelated constraint and be confidently mis-reported as `409 measurement_profile_locked`. Reachability is narrow (a fully-seeded database, which the deploy pipeline always produces, holds every slug `updateContributionsListSchema` accepts) but the review reproduced it directly against a deliberately incomplete taxonomy.

**The fix.** Added a new helper, `isPostgresConstraintViolation(err, code, constraintName)` — the same recursive `.cause`-unwrapping shape as the existing `isPostgresErrorCode` helper (duplicated per-file throughout this codebase by established convention), additionally checking the pg driver's `.constraint` field. The mapping now reads `isPostgresConstraintViolation(err, FOREIGN_KEY_VIOLATION, "fk_session_exercises_exercise_profile")` — the mirror FK specifically. Any other `23503` in this function (the contributions FK included) now falls through to the function's existing generic `throw err`, matching this function's own pre-existing behaviour for any FK it has no specific mapping for.

**Regression test** (`tests/integration/exercises.integration.test.ts`, new describe block): deletes a `muscle_groups` row an exercise's *prospective* contribution references (without disturbing its *existing* contributions, so the delete itself doesn't trip the same FK), then PATCHes only `contributions` — never `measurementProfile` — and asserts the thrown error is **not** `MeasurementProfileLockedError`, confirming (via the pg driver's own `.code`/`.constraint` fields) it really is the contributions FK (`23503` on `exercise_muscle_contributions_muscle_group_id_muscle_groups_id_` — Postgres's `NAMEDATALEN` truncation of the drizzle-generated 65-byte identifier, confirmed empirically, not guessed) and specifically not the mirror FK.

**Negative control**, proving the narrower scoping didn't stop matching the real case: reproduces the original passing scenario (an exercise referenced by a `session_exercises` row, with the app-level lock check bypassed via a direct DB update) and confirms the mirror FK's `23503` still carries exactly `fk_session_exercises_exercise_profile` and the mapping still applies.

**Load-bearing proof, independently re-verified by the orchestrator** (not merely trusted from the fixing agent's own report, whose final summary was truncated/uninformative): the fix was manually reverted to the original `isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)` form, the regression test was re-run and **failed** exactly as expected (`expected MeasurementProfileLockedError to not be an instance of MeasurementProfileLockedError`), the fix was restored to its exact original content, and the full test file was re-run and passed **36/36**.

### 2.2 L-4 — two latent `throw`s on an already-unreachable path could poison a sync transaction

**Files:** `src/domain/progression/loadProgression.ts` (`targetRepsPerSet`), `src/domain/progression/repProgression.ts` (`schemeMinReps`).

**The bug.** Both private helpers ended with `throw new Error(...)` for the two new `distanceRounds`/`durationRounds` scheme variants. Correctly unreachable today — `evaluateSession` skips non-`load_reps` slots, and `supportsScheme` routes any scheme/strategy mismatch to the existing `unsupportedSchemeDraft` fail-closed path before either strategy function is ever called — but `evaluateSession` runs inside `applySyncBatch`'s completion transaction, whose catch block maps only specific PostgreSQL SQLSTATEs. A plain JS `Error` from this deep would propagate uncaught and fail the **entire** sync batch — exactly the H-17 "poison batch" class this whole release's sync-layer work exists to prevent, and the one class of failure every *other* unreachable branch on this same path (the `manual` skip, an unparseable config, `evaluateSession`'s own profile skip, `unsupportedSchemeDraft` itself) deliberately avoids.

**The fix.** Both functions rewritten as exhaustive `switch` statements over all four `SetScheme` variants, returning `number | null` (`null` for the two scheme types with no reps dimension — the same "no such dimension" idiom `workingTargets.ts`'s `schemeDefaultReps` already uses) instead of throwing; TypeScript's own exhaustiveness checking replaces the runtime `throw` entirely, so there is no longer a code path that reaches an unhandled case. `evaluateLoadProgression`/`evaluateRepProgression` each check for `null` as early as practical and return the exact same fail-closed shape `evaluateSession.ts`'s own `unsupportedSchemeDraft` already uses (`action: "none"`, `reasonCodes: ["UNSUPPORTED_SCHEME"]` — an existing, real member of `ReasonCode`, not a new one — `confidence: "low"`). In `repProgression.ts`, the guard was hoisted ahead of `currentTarget`'s derivation (which previously called `schemeMinReps` a *second* time, at `resetRepsOnRollover`, a second latent path to the same throw) so it fires independently of whatever `prefill.reps` holds and the validated value is reused rather than re-derived. No exported signature changed; `evaluateSession.ts`, `registry.ts`, and `src/domain/measurement/**` were not touched.

**Tests added:**
- 5 unit tests (`tests/unit/progressionMatrix.test.ts`, new "L-4 remediation" describe block) call `evaluateLoadProgression`/`evaluateRepProgression` directly with `distanceRounds`/`durationRounds` schemes — bypassing the upstream gate entirely, simulating exactly "the `supportsScheme` gate regressed" — and assert a normal, non-throwing `action:none`/`UNSUPPORTED_SCHEME` return, including one case with a stale non-null `prefill.reps` proving the guard fires regardless.
- 1 integration test (`tests/integration/progression.integration.test.ts`, new "L-4 remediation" describe block): `supportsScheme` wrapped as a pass-through `vi.mock` spy (the same technique this codebase already established for `setLogPreCheck` elsewhere in this release) forced to report a false match for one call, driving a hand-built `distanceRounds` + `load-progression` snapshot through the **real** `applySyncBatch` completion transaction. Asserts the batch converges (`rejected: []`, every op applied) with a persisted `action:none`/`UNSUPPORTED_SCHEME` recommendation — the direct proof the task asked for: malformed/incompatible data reaching this path cannot poison the sync transaction.

**Load-bearing proof:** both files reverted to their original `throw` form; all 5 unit tests failed exactly as expected (`'Error: load-progression does not support distanceRounds schemes' was thrown`), and the integration test failed with the uncaught error's stack visibly propagating `targetRepsPerSet → isCompleted → evaluateLoadProgression → evaluateStrategy → evaluateSession → evaluateCompletedSession → sync/service.ts → the PGlite transaction` — concretely reproducing the poison-batch claim, not just asserting it. Both files restored to their exact fixed content; all tests pass again.

### 2.3 Independent re-verification of both hardenings (orchestrator, not the fixing agents' own self-reports)

- `git diff` read in full for all four changed source files (`src/server/exercises/service.ts`, `src/domain/progression/{loadProgression,repProgression}.ts`) — confirmed each diff matches exactly what is described above, nothing more.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` re-run after both fixes: clean.
- `tests/integration/exercises.integration.test.ts` re-run standalone: **36/36**. `tests/integration/progression.integration.test.ts` re-run standalone: **17/17**. `tests/unit/progressionMatrix.test.ts` re-run standalone: **31/31**.
- Full suite re-run twice from a clean state: `pnpm test:unit` **986/986** (69 files); `pnpm test:integration` **431/431** passed, 16 skipped (26 files + 5 skipped), both runs identical — the L-4 fixing agent's own report flagged one transient, order-dependent failure it observed on a single prior run of an unrelated muscle-taxonomy test and judged it pre-existing; this could not be reproduced on either of the orchestrator's own two full clean runs, so it is recorded here for completeness but not treated as caused by this remediation.
- `pnpm build` (production): succeeds, 40/40 pages, unchanged shape.
- `pnpm typecheck:sw`: clean.
- `git diff --stat` against every hard Release-1 boundary path (`src/sync`, `src/domain/sync/setDeletionOps.ts`, `src/domain/sync/payloadBuilders.ts`, `src/ui/workout`, `src/ui/history`, `src/db/seed`, `src/app/sw.ts`) re-checked: still empty — neither hardening touches any of them.

---

## 3. Final gate counts (this remediation, independently re-run by the orchestrator)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm test:unit` | **986/986** (69 files) — up from 981 (+5, all L-4) |
| `pnpm test:integration` | **431/431** passed, 16 skipped (26 files + 5 skipped) — up from 428 (+3: two L-3 tests, one L-4 test) |
| `pnpm build` (production) | succeeds, 40/40 pages |
| `pnpm test:e2e` | not re-run — neither fix touches any client/UI/e2e-observable path (confirmed by diff); the pre-existing 112/112 result stands |

---

## 4. Cleanup and scope confirmation

No disposable database, container, or scratch script was needed for this remediation — both code fixes and all new tests run against PGlite (`tests/integration/testDb.ts`), and the documentation corrections are plain text edits. `docker ps -a` was not consulted because nothing was started. `git status --porcelain` was checked before this remediation began, after the documentation pass, and after each code hardening: at every checkpoint, the only files that changed beyond the ones this report names are the files the *implementation* itself already changed (confirmed identical set throughout) and the pre-existing unrelated files named in §1.10, which remain completely untouched. No `git add`, `git commit`, or `git push` was run at any point. The independent review document (`athletic-measurement-profiles-release-1-review.md`) was read but never written to.

**No Release 2 or Release 3 work was implemented.** Nothing in this remediation adds client sync-key emission, client/IndexedDB DTO widening, athletic logging or history UI, an unlocked selector, a new prescription-editor option, a seed reconcile, or any Release-2 refusal surfacing — every change is either a text correction to an existing document or a narrower, more precise version of logic Release 1 already shipped.

---

## 5. Finding-by-finding map

| Id | Kind | Fixed in | Test / control | Result |
| --- | --- | --- | --- | --- |
| M-1 | report accuracy | `release-1-implementation.md` §8, §17 | — (no code) | corrected: no regression, was a stale baseline |
| L-1 | documentation accuracy | `estimated-1rm-…-revision.md` A-19, §25.5 | — | corrected to match the shipped, already-passing test |
| L-2 | documentation accuracy | same document, §15.4 | — | aligned to shipped copy |
| L-3 | product (code) | `src/server/exercises/service.ts` | new regression test + negative control, both independently re-verified as load-bearing | fixed |
| L-4 | product (code) | `loadProgression.ts`, `repProgression.ts` | 5 unit tests + 1 integration test, all independently re-verified as load-bearing | fixed |
| L-5 | documentation accuracy | `progression-engine.md` | — | heading id corrected (I-14 → I-13) |
| L-6 | documentation accuracy | `data-model.md` §2.4 | — | `load_basis` lock claim removed |
| L-7 | report accuracy | `release-1-implementation.md` §1, §7.2, §7.3, §12 | — | counts and phrasing corrected, final counts stated |
| L-8 | scope / report accuracy | `release-1-implementation.md` §9 | — | A-13 credited as deliberate extra coverage |
| L-9 | specification accuracy | `architecture-evaluation.md` §21.6, §28 | — | "no new queries" corrected |
| L-10 | specification accuracy | same document, §13.5 NC-3, §28 | — | DB-layer expectation corrected |
| L-11 | specification accuracy | same document, §13.5 NC-9, §28 | — | R1/R2 split annotated |
| L-12 | product (disclosed, documentation) | `pwa-offline-strategy.md` §5 | — | both seams now named for Release 2 |

**READY FOR TARGETED REMEDIATION VERIFICATION**
