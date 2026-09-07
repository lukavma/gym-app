# Athletic Exercise Measurement Profiles — Release 1 targeted remediation verification (PI-005)

**Date:** 2026-09-08
**Verifier:** independent — the same reviewer who wrote `docs/reviews/athletic-measurement-profiles-release-1-review.md`, verifying the remediation of that review's own findings against the actual working tree
**Verifies:** all thirteen findings in §10 of `athletic-measurement-profiles-release-1-review.md` (M-1, L-1…L-12)
**Remediation account under verification:** `docs/reviews/athletic-measurement-profiles-release-1-remediation.md`
**Tree:** `main` at `05982f6` + the uncommitted Release-1 change set + the remediation. `HEAD` unchanged, nothing staged, nothing committed, pushed or deployed; production never contacted.

**Method.** Every finding was re-derived from the tree, not read out of the remediation account. The two code hardenings were additionally proven on a **disposable PostgreSQL 16.14 container** (`mp-r1-remverify`, port 55434) through the **real service path** — including one case the shipped PGlite suite explicitly states it cannot reach. The review's own two probe scripts were re-run unchanged to confirm previously verified structural behaviour survived. The full gate set was re-run from scratch, including the e2e suite the remediation chose not to re-run. No implementation file, existing report, or unrelated file was modified by this pass; the only file this verification adds to the repository is this document. **The migration, schema, constraint, cascade and boundary evidence already proven in the review was deliberately not re-derived** — the remediation touched none of it, and the review's §10 preamble said so.

---

## 0. Verdict

**All thirteen findings are genuinely closed, and both code hardenings are load-bearing.** Every documentation and report correction lands at the exact site the review named and now agrees with the tree; I checked each against the shipped code or test rather than against the remediation's description of it. The two code fixes are real, minimal, confined to what the account describes, and independently proven — including the mirror-FK backstop, which I drove through a **genuine concurrent-transaction race on real PostgreSQL 16**, closing the one gap the shipped test file itself declares out of scope. Nothing previously verified regressed: the review's 34/34 sync-service and 17/17 lock/prescription probes still pass verbatim, every hard Release-1 boundary path still diffs empty, `REASON_CODES` and the recommendation schemas are untouched (I-6 intact), and the full suite is green at **986 unit / 431 integration / 112 e2e / 40-page production build** with no test weakened, skipped or deleted — including the e2e gate the remediation chose not to re-run, which I ran against the remediated tree on a fresh database and a real production build.

Four residual observations are recorded in §6. Two are small inaccuracies the remediation itself introduced, both LOW, both in non-binding-rule positions, neither changing any conclusion — the more notable is that §8's *corrected* baseline table misattributes three of its four cells to documents that do not contain them (they are the review's own post-`0013` measurements). The corrected verdict is unaffected and is in fact **understated**: against the true pre-`0013` baseline this release is faster on all four percentiles, not merely "flat to slightly faster". None of the four blocks deployment, and each is a one-line edit for whoever next opens those documents.

**VERIFIED — READY FOR RELEASE 1 DEPLOYMENT** (restated at §8).

---

## 1. Finding-by-finding verification

| Id | Kind | Closed? | How I verified it (independently of the account) |
| --- | --- | --- | --- |
| **M-1** | report accuracy | **YES** | §2 |
| **L-1** | documentation accuracy | **YES** | §3.1 |
| **L-2** | documentation accuracy | **YES** | §3.2 |
| **L-3** | product (code) | **YES — proven load-bearing on real PostgreSQL 16** | §4.1 |
| **L-4** | product (code) | **YES — proven load-bearing, 58/58 independent assertions** | §4.2 |
| **L-5** | documentation accuracy | **YES** | §3.3 |
| **L-6** | documentation accuracy | **YES** | §3.3 |
| **L-7** | report accuracy | **YES** | §3.4 |
| **L-8** | scope / report accuracy | **YES** | §3.4 |
| **L-9** | specification accuracy | **YES** | §3.5 |
| **L-10** | specification accuracy | **YES** | §3.5 |
| **L-11** | specification accuracy | **YES** | §3.5 |
| **L-12** | product (disclosed) / documentation | **YES** | §3.6 |

---

## 2. M-1 — the phantom regression is gone, and the corrected conclusion is right

The review asked for four things. All four landed:

1. **Corrected baseline stated.** §8 now opens by naming the superseded 20.93 ms figure, explains *why* it is superseded (`EXERCISES_PER_SESSION = 2`, ≈7,800 set rows, ~4× lighter than the shape this release measured at), and cites the three post-L-10 re-measurements at the corrected 31,200-row shape. I re-checked each citation at source: `metrics-dashboard-review.md:208` → **44.97 ms**; `metrics-dashboard-remediation.md:194` → **43.56 ms**; `metrics-dashboard-remediation-verification.md:40` → **53.48 ms**. All three are quoted accurately.
2. **"No regression" stated.** The verdict now reads "**PASS, and no regression**", with `42.03 ms` placed inside the corrected `43.56–53.48 ms` p95 range.
3. **Cold-container attribution removed.** No trace of it remains; the review's own disproof (warmth moves p50 by ~3 ms) and the `EXPLAIN` A/B (`0.478` vs `0.538 ms`) are cited in its place.
4. **The propagate instruction withdrawn.** A grep for every phrasing of it — "should use this report's numbers", "use the measured figures above", "isn't mistaken for" — returns **no hits**, and §11's "Not yet reflected in these documents" paragraph is gone entirely.

§17's verdict was updated to match, and carries an honest post-publication note recording the review's outcome and this remediation.

**One inaccuracy survives inside the correction** — see §6, V-1. The p95 column, which is the only column the verdict argument rests on, is exactly right; the min/p50/max cells in the baseline row are not from the documents that row cites. The conclusion is unaffected.

---

## 3. The ten record corrections

### 3.1 L-1 — A-19 now describes the shipped test

The amended A-19 in `estimated-1rm-load-translation-architecture-revision.md` §21.2 now states the two codes **are** fixture-reachable in Release 1, that the reachability test carries a dedicated fixture for each, that both are asserted members of `STRENGTH_REASON_CODES` and non-members of `RELEASE_B_ONLY_REASON_CODES`, and that what Release 1 lacks is production *data* that produces them — not test coverage.

Verified against `tests/unit/strengthReasonCodes.test.ts` directly:

- lines 271–284: the two fixtures exist (`measurementProfile: "duration"`; `loadBasis: "assistance"`).
- lines 366–371: `expect(STRENGTH_REASON_CODES).toContain(code)` and `expect(RELEASE_B_ONLY_REASON_CODES).not.toContain(code)` for both codes.
- lines 409–412: the reachability half computes the expected Release-A set as `STRENGTH_REASON_CODES − RELEASE_B_ONLY_REASON_CODES`, so moving either code back to Release-B-only fails the suite — exactly the property A-19 now claims.

The document's new §25.5 correction-log entry uses the same table shape as §25.1–§25.4 and states explicitly that no rule, ordering, enum membership, reason code or owner decision changed. I confirmed that: `src/domain/strength/reasonCodes.ts` and `src/domain/schemas/recommendation.ts` show **no diff at all** in this remediation, and `STRENGTH_REASON_CODES` still declares 50 members (asserted at test line 361–364, passing).

### 3.2 L-2 — the phrasing now matches the shipped copy

§15.4's `MEASUREMENT_PROFILE_UNSUPPORTED` row now reads **"Not available for this exercise's measurement type"**, byte-identical to `src/ui/strength/copy.ts`. Recorded in the same §25.5 entry.

### 3.3 L-5 and L-6 — both sentences now state the truth

- `progression-engine.md:80` heading now reads **"SQL → domain boundary rule (I-13, athletic measurement profiles)"**, agreeing with its own body's `§18.1 I-13` citation.
- `data-model.md:79` was rewritten rather than patched: it now says `measurement_profile` alone is locked (naming which half is the service rule and which the mirror FK), then states plainly that **"`load_basis` is *never* locked — it stays ordinary editable metadata with history at any time, like `equipment`, both before and after the profile locks"**, with `volume_counting` and `strength_estimate` likewise. This matches the behaviour the review proved (§3.6 of the review: a `per_hand` edit on a referenced exercise applies) and which I re-proved today — the review's lock probe still returns 17/17, including "loadBasis edit ALLOWED with history on a load-bearing profile". The permanent-defaults rationale is preserved in the same paragraph.

### 3.4 L-7 and L-8 — counts corrected, A-13 credited

- **§1** now states that the migration pair is *two of the fifteen* new files, not additional to them, and that the 2,347-line figure excludes the separately generated 3,143-line snapshot. The arithmetic (64 + 15 = 79) is unchanged and still correct; I re-confirmed `git diff --stat` against `05982f6` still reports the release's own tracked-modified files plus the two pre-existing unrelated ones.
- **§7.2 / §7.3** now identify each figure as a point-in-time snapshot — 44 as shipped by Stage 8, 45 after Stage 9's A-13 block, 46 after §7.4's own fix — and state the current count as 46. **I ran the file: 46/46 passed.**
- **§12** was updated to the post-remediation counts and flagged as such. **I re-ran both suites: 986/986 unit (69 files) and 431 passed / 16 skipped (26 files + 5 skipped)** — exact matches.
- **§9** gained an L-8 note crediting the A-13 block as deliberate extra coverage of server behaviour Release 1 genuinely ships, explicitly not Release-2 product work and explicitly outside §21.1's named list. That is the correct characterisation; I re-confirmed the block tests only the already-landed acceptance layer and adds no client, UI or seed surface.

### 3.5 L-9, L-10, L-11 — the binding specification now matches the implementation

A new §28 correction log was added, matching the §25/§26/§27 convention and stating up front that **no owner decision, rule, DDL, invariant, acceptance criterion or release boundary changed**. I verified that claim by diffing behaviour, not prose: the review's 34/34 sync probe and 17/17 lock probe both still pass unchanged, and no test's expectations moved.

- **§21.6** now names the `INNER JOIN exercises` explicitly with its measured cost (`0.478` vs `0.538 ms`, an index scan on `uq_exercises_id_profile`).
- **§13.5 NC-3** now states that a bypassed *pre-check* still carries the correctly-derived parent profile and therefore fails the shape CHECK (`23514`), and that reaching the composite FK's `23503` requires bypassing the derivation too (a raw insert letting the column default apply). This is exactly what I observed through the real service path — my re-run sync probe's poison-op assertion returns `invalid_measurement` from a `23514`, not `invalid_reference` from a `23503`.
- **§13.5 NC-9** now carries the "R1 (server `evaluateSession`); R2 (client `buildClientRecommendationOps` …)" split, mirroring NC-1's row, and credits the implementation's disclosed deferral rather than describing it as a gap.

### 3.6 L-12 — both seams are now named where a Release-2 implementer will look

`pwa-offline-strategy.md` §5 gained a numbered paragraph naming both: the client `ActiveSessionSetDto` staying narrower than the server's, and `applySessionExerciseUpsert`'s update path not re-deriving `load_basis` on a same-profile `exerciseId` swap. Both are stated as unreachable in Release 1 and as Release 2's job, with the mirror FK's fail-closed behaviour on a cross-profile swap correctly noted. The text matches the tree: `src/sync/types.ts` is still untouched, and `applySessionExerciseUpsert`'s update path still builds its patch from an explicit field list that excludes both measurement columns (re-proved today by the sync probe's I-3 assertion).

---

## 4. The two code hardenings — independently proven

### 4.1 L-3 — `23503` mapping narrowed to the mirror FK, and it still fires

**What shipped.** A new private helper `isPostgresConstraintViolation(err, code, constraintName)` — the same recursive `.cause`-unwrapping shape as the existing `isPostgresErrorCode`, additionally requiring the pg driver's `.constraint` field to match — plus a named constant `MEASUREMENT_PROFILE_LOCK_FK = "fk_session_exercises_exercise_profile"`. `updateExercise`'s catch block now maps only that constraint's `23503`; every other `23503` falls through to the function's pre-existing generic `throw err`. The change is confined to those three edits.

**My verification, on a disposable PostgreSQL 16.14 through the real service — 11/11:**

| Probe | Result |
| --- | --- |
| A contributions-only PATCH (parsed through the real `updateExerciseSchema`) against an incomplete taxonomy | throws — and is **not** `MeasurementProfileLockedError`. **This is the exact probe that returned `MeasurementProfileLockedError` in the review**, so it is a direct before/after load-bearing proof. |
| Non-vacuity: is it really the contributions FK? | `23503` on `exercise_muscle_contributions_muscle_group_id_muscle_groups_id_` (the NAMEDATALEN-truncated name), and the narrowed matcher correctly does **not** match the mirror FK for it |
| **The mirror-FK backstop still fires through the real catch block** | **YES** — driven by a genuine concurrent race: connection 1 holds an uncommitted `session_exercises` insert; `updateExercise` on connection 2 passes its own pre-check (READ COMMITTED cannot see the uncommitted row), its `UPDATE` then blocks on the referential-integrity check, and on COMMIT raises the mirror FK's `23503` → mapped to `MeasurementProfileLockedError`. The exercise's profile was **not** changed. |
| The raw error shape the matcher depends on | `DrizzleQueryError code=undefined constraint=undefined` → `.cause` `DatabaseError code="23503" constraint="fk_session_exercises_exercise_profile"`. The helper's early-return-on-code-match is therefore safe: the outer wrapper carries no `.code`, so recursion always reaches the level where both fields are present. |
| Discrimination | the matcher does not match a different constraint name for the mirror FK's error, and vice versa |
| The ordinary, non-racing lock path | unchanged — still `MeasurementProfileLockedError` for a referenced exercise |

**This closes a real gap in the shipped coverage.** `tests/integration/exercises.integration.test.ts`'s own "negative control" proves the mirror FK's *constraint name* by a direct `db.update`, and its comment concedes that driving the mapping through `updateExercise`'s catch block "would additionally require a genuine concurrent-transaction race, out of scope for this PGlite suite". That race is exactly what I ran, on production-shaped infrastructure. **The mapping line is now proven live, not merely proven not to over-match.** The shipped regression test and negative control are otherwise well-formed: the regression test asserts non-instance, non-vacuity (`23503`) and the exact constraint, so it cannot pass vacuously. File re-run: **36/36**.

### 4.2 L-4 — the throws are gone and every path fails closed

**What shipped.** `targetRepsPerSet` and `schemeMinReps` became exhaustive `switch`es returning `number | null`; TypeScript exhaustiveness replaces the runtime `throw` entirely. `evaluateLoadProgression` guards on `null` before any use; `isCompleted` carries its own `null → false` branch for the history path; `evaluateRepProgression` hoists the guard ahead of `currentTarget` and reuses the validated value at `resetRepsOnRollover`, removing the second latent call site. Both return the same fail-closed shape `evaluateSession`'s own `unsupportedSchemeDraft` uses (`action: "none"`, `reasonCodes: ["UNSUPPORTED_SCHEME"]`, `confidence: "low"`). I confirmed `UNSUPPORTED_SCHEME` is a **pre-existing** member of `REASON_CODES` (`reasonCodes.ts:23`) and that neither `reasonCodes.ts` nor `recommendation.ts` was modified — **I-6 intact**.

I read both diffs in full against `05982f6`, excluding comments. `loadProgression.ts` and `repProgression.ts` contain exactly the described changes and nothing more. The one incidental refactor (`prescribed` / `derivedBase` extracted in `repProgression.ts` to avoid duplicating them in the guard's return) changes only key *order* within `inputs.derived`, which is order-insensitive through Zod and normalised by `jsonb`.

**My verification — 58/58:**

- **(a) Exhaustive no-throw matrix**, calling both strategies **directly** — which *is* the "the `supportsScheme` gate regressed" simulation, since it bypasses every gate: 2 strategies × 4 scheme types × 5 input shapes (one work set; zero work sets; sets ≥ scheme.sets — the shape that reached the removed throw; a stale non-null `prefill.reps`; a rep-cap-reached rollover). **Nothing threw.** All 20 athletic combinations returned `action:none` / `["UNSUPPORTED_SCHEME"]` / `low`; all 20 `fixed`/`repRange` combinations returned normal drafts with no `UNSUPPORTED_SCHEME` — **no existing result changed**.
- **(b) The history path.** A `distanceRounds` entry in `history[]` under a `fixed` current scheme (reaching `isCompleted` via `entryQualifiesForStreak`, which the top-level guard does *not* cover) does not throw and yields a normal draft. This path is not covered by the shipped tests.
- **(c) Defence in depth.** The real `supportsScheme` still returns `false` for all four athletic pairs and `true` for all four conventional ones — the upstream gate is intact, so the fix is a second line, not a replacement.
- **(d) `evaluateSession`** routes an athletic snapshot to `unsupportedSchemeDraft` without throwing.
- **(e) End to end on real PostgreSQL 16.** A `distanceRounds` snapshot frozen under `load-progression`, driven through the **real `applySyncBatch`** completion path: the batch did not throw, all four ops applied, zero rejections, and a single `action:none` / `["UNSUPPORTED_SCHEME"]` recommendation was persisted. **Malformed/incompatible data cannot poison a sync batch** — proven on production-shaped infrastructure, where the shipped test proves it on PGlite.
- **(f) The shipped test's own reachability claim, checked.** Reconstructing the pre-fix semantics, `sets: 1` with one logged work set **does** reach the removed throw, while `sets: 3` with one logged set does **not** (the `&&` short-circuits before `targetRepsPerSet` is called). The integration test's `sets: 1` choice is therefore genuinely load-bearing, exactly as its comment claims — that comment is accurate, not decorative.

The shipped tests are well-formed: the `vi.mock` on `@/domain/progression/registry` is a pass-through wrap that forces a false match for exactly one call, so every other test in the file keeps real behaviour. Files re-run standalone: `progression.integration.test.ts` **17/17**, `progressionMatrix.test.ts` **31/31**.

I did **not** repeat the remediation's revert-run-restore cycle: modifying implementation files is out of scope for this verification, and the load-bearing character of both fixes is established above by direct before/after comparison against the review's own recorded pre-fix behaviour and by reconstructing the pre-fix semantics in isolation.

---

## 5. Preservation of previously verified behaviour and the Release-1 boundary

| Check | Result |
| --- | --- |
| The review's own sync-service probe, re-run **unchanged** on real PostgreSQL 16 | **34/34** — A-18/NC-14 derivation, NC-2's byte-identical create, profile-scoped creation-required fields, the H-17 `23514 → invalid_measurement` mapping with the pre-check forced open, effective-row validation on update, §13.2's `laterDelete` short-circuit, I-3's slot freeze |
| The review's own lock/prescription probe, re-run **unchanged** | **17/17** — §12.1 create defaults, both halves of the §10.3 lock, the `loadBasis` presence rule, the full §9.2/§9.3 prescription gate |
| Hard Release-1 boundary paths (`src/sync`, `setDeletionOps.ts`, `payloadBuilders.ts`, `src/ui/workout`, `src/ui/history`, `src/ui/metrics`, `src/db/seed`, `src/app/sw.ts`) | `git diff --stat` **still empty** |
| Field-name leakage into any of those paths | grep returns **nothing** |
| `src/db/seed/reconcileMeasurementProfiles.ts`, `src/ui/measurement/` | still **absent** |
| O-6's Training-card caption | still the pre-Release-2 text |
| I-6 (`REASON_CODES`, `recommendation.ts` schemas) | **no diff** |
| Tests weakened, skipped or deleted | **none** — the only `.skipIf` uses are the five pre-existing opt-in concurrency suites; counts moved 981→986 and 428→431, skipped stayed 16 |
| The independent review document | **unmodified** — §10's nine items and the `READY FOR REMEDIATION` verdict line are intact |
| `HEAD`, staging | `05982f6`, **0 staged files** |

---

## 6. Residual observations

None of these blocks deployment. Two were introduced by the remediation; two are pre-existing and outside its mandate. All four are one-line edits.

**V-1 (LOW, report accuracy — introduced by the remediation).** §8's *corrected* baseline row is labelled "Corrected pre-`0013` baseline, same 31,200-row shape (`metrics-dashboard-review.md` / `-remediation.md` / `-remediation-verification.md`)", but three of its four cells are not from those documents — they are the **review's own post-`0013` measurements**:

| Cell | Stated | Actually in the cited documents | Where the stated numbers come from |
| --- | --- | --- | --- |
| min | 32.08–36.93 ms | 36.93 (`-remediation.md`), 37.20 (`-remediation-verification.md`) | `32.08` = the review's §5.1 warm run 3 |
| p50 | 34.77–41.34 ms | 39.79, 40.67 | both endpoints are the review's own runs |
| **p95** | **43.56 / 44.97 / 53.48 ms** | **exactly those three** | ✅ correct |
| max | 37.77–54.54 ms | 45.56, 54.30 | both endpoints are the review's own runs |

The verdict is unaffected — it rests on the p95 column, which is right — and the true figures make it **stronger**: against the real pre-`0013` baseline this release is faster on *all four* percentiles (35.98 vs 36.93–37.20; 38.86 vs 39.79–40.67; 42.03 vs 43.56–53.48; 44.17 vs 45.56–54.30), not merely "flat to slightly faster". The fix is to replace that row's min/p50/max with the two documents' own reported values, or to drop those three columns.

**V-2 (LOW, cosmetic — provenance undetermined).** The binding specification now **terminates** with `**READY FOR TARGETED OWNER-DECISION INTEGRATION VERIFICATION**`, immediately after a §28 correction log dated well after that gate was discharged (`athletic-measurement-profiles-owner-decision-integration-verification.md` returned `VERIFIED — READY FOR RELEASE 1 IMPLEMENTATION`). The same string is the terminal line of `athletic-measurement-profiles-owner-decision-integration.md`, where it belongs. Because the file is untracked I could not establish whether §28 appended the line or was inserted above a pre-existing one; either way the document should not end by claiming to await a discharged gate. No rule, decision or requirement is affected — §0.1 states the accepted-and-binding status at the top, and §28's own body is unambiguous.

**V-3 (LOW, report accuracy — introduced by the remediation).** The account justifies skipping the e2e gate with "neither fix touches any client/UI/e2e-observable path (confirmed by diff)". That is imprecise: **both fixes sit on server paths e2e specs traverse** — `updateExercise` is reached by `muscleTaxonomyV2.spec.ts`, `strengthPage.spec.ts`, `active-schedule-edit.spec.ts` and `warmupRoutines.spec.ts`; the two strategies are reached by `progression.spec.ts`, `deload.spec.ts` and `offline-recommendation.spec.ts`. The defensible claim is the narrower one: neither fix *changes behaviour* on any path e2e exercises. Rather than argue it, I re-ran the full suite against the remediated tree on a fresh disposable PostgreSQL 16 with a real production build: **112/112, 0 failed, 0 skipped**. The remediation's conclusion was right; only its stated reason was wrong, and the gate is now discharged rather than reasoned around.

**V-4 (LOW, pre-existing — outside the remediation's mandate).** §21.6 still reads "the bundle grows by **roughly 40 bytes** per exercise entry" in the very sentence the remediation edited for L-9, while both the implementation report and the review measured **50–68 bytes**. The review's §10 did not ask for this and §8 records it as a knowingly-open correction, so leaving it is in scope — but the figure now sits one clause away from a freshly corrected one.

---

## 7. Gates — all independently re-run

| Gate | Result | Account's claim |
| --- | --- | --- |
| `pnpm typecheck` | clean | matches |
| `pnpm typecheck:sw` | clean | matches |
| `pnpm lint` | clean | matches |
| `pnpm format:check` | clean — *"All matched files use Prettier code style!"* | matches |
| `pnpm test:unit` | **986/986**, 69 files | matches |
| `pnpm test:integration` | **431 passed / 16 skipped**, 26 files + 5 skipped | matches |
| `pnpm build` (production) | succeeds, **40/40** pages | matches |
| `tests/integration/exercises.integration.test.ts` | **36/36** | matches |
| `tests/integration/progression.integration.test.ts` | **17/17** | matches |
| `tests/unit/progressionMatrix.test.ts` | **31/31** | matches |
| `tests/integration/measurementSync.integration.test.ts` | **46/46** | matches §7.2's corrected figure |
| `pnpm test:e2e` (full Playwright, fresh disposable PostgreSQL 16, real production build) | **112/112**, 0 failed, 0 skipped, 2.8 min | not re-run by the remediation — I re-ran it (V-3) |
| L-3 real-PostgreSQL service probe (mine) | **11/11** | — |
| L-4 no-throw / fail-closed / end-to-end probe (mine) | **58/58** | — |
| Review's sync-service probe, re-run | **34/34** | — |
| Review's lock/prescription probe, re-run | **17/17** | — |

---

## 8. Cleanup

- One disposable container (`mp-r1-remverify`, `postgres:16`, port 55434) and its databases (`rv0013`, `rvl4`, `rvsync`, `rvlock`, `rve2e`) were created and removed at the end of this pass; `docker ps -a` shows only the pre-existing persistent `gym-app-db-1`.
- **`gym-app-db-1` was never connected to** by this verification; production was never contacted.
- No Playwright-spawned server survived the run.
- Every probe script, SQL file and fixture lived under the session scratchpad. **No implementation file, existing report or unrelated file was modified.** The only repository change this pass makes is this document.

---

## 9. Verdict

All thirteen findings from §10 of the independent review are closed, verified against the tree rather than against the account. The ten record corrections each land at the named site and now agree with the shipped code or test — I checked A-19 against the assertions that make it true, the `data-model.md` lock sentence against the behaviour I re-proved, and the spec's three corrections against the service paths they describe. The two code hardenings are real, minimal, confined, and load-bearing: the narrowed `23503` mapping no longer swallows an unrelated FK **and still fires for the mirror FK under a genuine concurrent race on real PostgreSQL 16**, and the strategy functions cannot throw for any of the forty scheme/shape/strategy combinations I drove through them — with the end-to-end proof that malformed data reaching the completion path converges instead of poisoning the batch.

Nothing previously verified regressed. The four residual observations are LOW, none is a product defect, none changes a conclusion, and each is a one-line edit for whoever next opens those documents — the same disposition this lineage's own owner-decision-integration verification used for its five residuals.

**VERIFIED — READY FOR RELEASE 1 DEPLOYMENT**
