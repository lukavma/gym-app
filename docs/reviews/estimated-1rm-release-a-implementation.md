# Estimated 1RM — Release A (Tracker) Implementation Report

Date: 2026-09-06
Role: implementation of **Release A only** of the estimated-1RM feature, against the binding specification. No specification, review, or verification report was edited. Nothing was committed, pushed, tagged, or deployed. Production was never contacted.

Repository state at start: `main` @ `c52b016` (`docs: record warm-up set device acceptance`), plus a pre-existing uncommitted working tree of documentation changes. V-0 — the F-1 warm-up-set remediation being verified and committed — was already discharged before this pass (`d9b9760` + `c52b016` on `main`).

## Binding authority consumed

| Document | How it was used |
| --- | --- |
| `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` | Read in full before any code was written. Every `V-n`, `I-n`, `K-n`, `A-n`, the §9.6 refusal list, the §14 boundaries, the §15.4 enum and the §19 lists are implemented or deferred exactly as written. |
| `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md` | Read in full. The OD-06 amendment table drives the formula, the `f(1) = 1` convention, the source/target ceilings, the required band and the versioned `algorithm` id. |
| `docs/architecture/evidence-to-design.md` row 20 | Read in full. Governs what the copy may and may not claim, and the provisional status of EVIDENCE-032…037. |
| `docs/reviews/estimated-1rm-owner-decision-integration.md` and `…-verification-2.md` | Read in full. Confirm O-1…O-20 accepted as recommended, and that the `[E*]`/provisional status of the six registry items changes labels, not rules. |

Earlier evaluation, review, research and first-verification files were consulted only where the revision points at them by name (for example ADR-010's reconciliation mechanism, §22's fixtures, §25's correction log). No settled decision was reopened.

---

## 1. Verdict

# `READY FOR INDEPENDENT REVIEW`

Release A is implemented in full and verified end to end against a fresh, disposable PostgreSQL 16 database and a production build. Release B is not implemented, and the report states below exactly where its absence is visible.

---

## 2. §18 prototype checks, executed before implementation

Both applicable checks ran against the **local Docker PostgreSQL 16** database only (`postgres://gymapp:gymapp@localhost:5432/gymapp`), read-only, from scripts held in the session scratchpad outside the repository. Production was never contacted; the `DATABASE_URL` host was asserted to be `localhost` inside each script before it would connect.

**§18 step 4(a) — current Today-bundle latency, measured before anything is added to it.** Release A adds nothing to the bundle, so this is the "before" datum for Release B's batched observation query rather than a gate on this release.

> `buildTodayBundle` over 20 runs (local Docker pg16, 106 exercises / 649 sessions / 841 set logs): min 10.4 ms · p50 11.0 ms · p95 15.5 ms · max 15.5 ms.

**§18 step 4(b) — the revised algorithm run over the real local `set_logs`, inspecting every session where `IMPLAUSIBLE_SETS_EXCLUDED`, `TOP_SET_GOVERNS` or `SUB_MODAL_SETS_EXCLUDED` fires.** A standalone prototype of §6–§8 was written first and run over all 283 completed sessions on eligible equipment, producing 280 observations (3 sessions had no eligible set).

| Observation flag | Sessions |
| --- | --- |
| `RIR_MISSING_LOWER_BOUND` | 227 |
| `SINGLE_SET_GROUP` | 214 |
| `SUB_MODAL_SETS_EXCLUDED` | 78 |
| `DELOAD_SESSION` | 13 |
| `EXTENDED_REP_RANGE` | 2 |
| `IMPLAUSIBLE_SETS_EXCLUDED` | **0** |
| `TOP_SET_GOVERNS` | **0** |

All 78 `SUB_MODAL_SETS_EXCLUDED` firings were inspected. Every one is the same shape and every one is correct under V-6/V-7: an ascending session in which each load appears once (`80×8, 82.5×8, 85×6`), so the tie breaks to the heaviest group and the lighter groups are sub-modal. This is the case §7.3 describes: a lighter group is discarded **by load** even when it implies more — `82.5×8` implies 104.50 while the governing `85×6` implies 102.00. Behaving as specified, and visible on the trend as excluded provenance.

Two consequences worth recording for the reviewer:

1. **`IMPLAUSIBLE_SETS_EXCLUDED` and `TOP_SET_GOVERNS` are structurally unreachable in this dataset**, not merely absent. With every load appearing once, the modal group is already the heaviest, so no supra-modal group can exist and the governing group is always the modal one. Both paths are therefore covered by fixtures only (A-4), which is why those fixtures carry explicit negative controls.
2. The dominance of `RIR_MISSING_LOWER_BOUND` (227/280) and `SINGLE_SET_GROUP` (214/280) means confidence on this data would be `medium` almost everywhere. That is the honest reading of §11 on sessions logged mostly without RIR; it is a property of the data, not of the implementation.

§18 step 4(c) is explicitly "after Release A" and Release-B-scoped, and was not run.

---

## 3. What was implemented

### 3.1 Schema, migration and the opt-out (O-2, §14.4)

| Artefact | Content |
| --- | --- |
| `drizzle/0011_happy_celestials.sql` | Generated by `pnpm db:generate`. `ALTER TABLE "exercises" ADD COLUMN "strength_estimate" text DEFAULT 'auto' NOT NULL` plus `CONSTRAINT "ck_exercises_strength_estimate" CHECK (… in ('auto','off'))`. **DDL only** — see JC-1. |
| `src/db/schema/exercises.ts` | The column and its CHECK, generated from the domain const array by the existing `checkInList` helper, exactly as `equipment` / `mechanics` / `laterality` are. |
| `src/domain/strength/estimateMode.ts` | `STRENGTH_ESTIMATE_MODES = ["auto","off"]`, the single source read by the DB CHECK, the Zod enum and the pure pipeline. A zero-import leaf, because §14.5 forbids `src/domain/strength/**` from importing `src/domain/exercises/**`. |
| `src/domain/exercises/schema.ts` | `strengthEstimateSchema`; `strengthEstimate` added to `updateExerciseSchema` (which is `.strict()`, so the toggle's PATCH would otherwise be a blanket 400). Deliberately **not** added to `createExerciseSchema` — §14.4 names the update schema only and O-4 places the toggle in the edit form. |
| `src/db/seed/exerciseCatalog.ts` | `strengthEstimate: "off"` on `machine-assisted-pull-up` and `dumbbell-farmers-carry`, so future seeds insert the right value. |
| `src/db/seed/reconcileStrengthEstimates.ts` | The one-shot reconcile for rows seeded **before** the column existed, keyed by `seededExerciseId(userId, slug)`. See JC-1. |
| `src/server/exercises/service.ts` | `strengthEstimate` on `ExerciseRecord`, in `toRecord`, and in `updateExercise`'s patch. |

### 3.2 The pure pipeline — `src/domain/strength/` (12 files)

`constants.ts` (the whole §16 K-table, each row tagged with the revision's own classification), `reasonCodes.ts` (the §15.4 enum, exactly 48 members, grouped by emitting level), `primitives.ts` (`round2`, `repMultiplier`, `setE1rm`, `lowerMedian`, `spreadPct`, `floorToStepKg`, `ceilToStepKg`, `roundToNearestStepKg`, `modeTiesLow`, calendar-day helpers), `eligibility.ts` (V-3, V-4), `observation.ts` (V-6…V-9, §7.6), `estimate.ts` (V-10…V-12, §8.4, the §11 caps), `confidence.ts` (`min(caps)`), `whatIf.ts` (§15.1's calculator under §9.4/§9.5), `report.ts` (the whole pipeline in one call), `types.ts`, `query.ts` (the endpoint's parameter contract), `estimateMode.ts`.

Rules implemented exactly as bound, each with the fixture that pins it:

- **Warm-up** — `set_logs.is_warmup` is the primary work-set classifier and is excluded first; a marked warm-up is counted and carries no code (§15.4). The modal-load rule is defence in depth only.
- **Deload** — an observation is computed and shown badged, and excluded from pool, current and best; `DELOAD_SESSION` / `DELOAD_SESSIONS_EXCLUDED` are distinct carriers.
- **RIR** — 0–2 full standing, 3–4 degraded (`RIR_MODERATE_RANGE`), ≥ 5 excluded as a domain rule that departs from row 5, missing RIR eligible as a lower bound *on the estimate*.
- **RTF** — source ceiling 12, 11–12 degraded, `RTF = reps + (rir ?? 0)`.
- **Plausibility** — supra-modal groups admitted at most `1.20 × modal e1RM`, sub-modal groups excluded **by load** regardless of what they imply.
- **Top set** — the governing group is the maximum admitted group e1RM, flagged `TOP_SET_GOVERNS` when it is not the modal group.
- **Timezone / calendar window** — `performedOn` is the session's `startedAt` resolved with `userLocalDateString` in the **account** timezone; the window is `[asOf − 89, asOf]` in local calendar days; the pure module never sees an instant or a timezone.
- **Archived exercises** — served (O-15); `archivedAt` is not filtered.
- **Rounding** — three different roundings for three different claims: nearest-to-grid for a displayed estimate, outward for the band, floor for a translated load.
- **Evidence copy** — every phrasing lives in one module and is checked against §15.2's prohibitions.

### 3.3 Server, endpoint and page

- `src/server/strength/service.ts` — ownership-scoped exercise lookup, the account timezone, **one** explicitly projected query over `session_exercises → workout_sessions → set_logs` bounded by user, exercise and `status = 'completed'`, and the instant→local-date conversion. Nothing else.
- `src/app/api/exercises/[id]/strength/route.ts` — `GET` only. 401 unauthenticated, 400 on an unparsable `asOf` or malformed what-if input, 404 for a missing or foreign exercise, archived served, future `asOf` clamped to server now and echoed as the effective value.
- `src/app/(app)/exercises/[id]/strength/page.tsx` + `src/ui/strength/` (5 files) — current (grid value + band + confidence + first reason), best (grid value + date + "unconfirmed"), the full remaining reason list, the what-if calculator, the trend list (date, governing `load × reps @ RIR`, ≈ e1RM, flags, deload rows badged and greyed, excluded groups shown as excluded), an inline SVG sparkline, and the footer carrying `e1rm-epley-rir v1` and "Estimates only — not tested maxes."
- Links to the page from the exercise library row, the exercise edit form and the workout card, per §15.1.

### 3.4 Boundary test

`tests/unit/strengthBoundary.test.ts` (24 tests) walks the real transitive import graph with the existing AST walker. It asserts: the pure module reaches nothing outside itself; its one permitted allowance (type-only `domain/schemes`) is unused today and must be type-only if ever used; progression does not reach strength and `src/server/strength/**` reaches no progression module; the sync transport is unreachable; volume and strength are unrelated in both directions; the completion path (`/api/sync`, `/api/active-session`, `/api/today-bundle`, the sync and today services) cannot reach the feature at all; no column anywhere stores an e1RM, a suggestion or a confidence; and the seed reconcile touches only the vocabulary module. Every claim carries an anti-vacuity witness, and five synthetic-edge controls prove the checks fire for an injected forbidden edge.

Two shared-vocabulary carve-outs are recorded, both **edge-specific** (every recorded parent must be approved, never just the first the BFS found):

- `domain/volume/schema.ts`, reached from the strength service only through the `@/db/schema` barrel's `volume_presets` CHECK — the same "shared registry, not a read path" shape `progressionBoundary.test.ts` already carves out.
- `domain/strength/estimateMode.ts`, reached from volume only through `domain/exercises/schema.ts`'s Zod enum for the new column. A two-line const array with no imports, asserted to be a leaf.

---

## 4. Exact verification

Every command below was run against the working tree as it now stands. The **fresh disposable database** is `gymapp_e1rm_verify` on the local Docker PostgreSQL 16 (`gym-app-db-1`), dropped and recreated immediately before the run. The pre-existing development database `gymapp` was not migrated, seeded or written to at any point. Production was never contacted.

| # | Check | Command | Result |
| --- | --- | --- | --- |
| 1 | Schema drift | `drizzle-kit generate --schema=./src/db/schema/index.ts --dialect=postgresql --out=<copy of drizzle/>` | **`No schema changes, nothing to migrate`**, 0 new migration files. Run against a *copy* of `drizzle/` so the repository folder could not be written to; `git status drizzle/` unchanged by the check. |
| 2 | Migration | `pnpm db:migrate` on the fresh database | `migrations applied successfully`; `strength_estimate` present with `DEFAULT 'auto' NOT NULL` and `ck_exercises_strength_estimate CHECK (… = ANY (ARRAY['auto','off']))`. |
| 3 | Seed | `pnpm db:seed` ×2 (straddling account creation, per this repository's e2e recipe) | `Seed complete.` 93 exercises seeded; **91 `auto`, 2 `off`** — `Assisted Pull-Up` (machine) and `Dumbbell Farmer's Carry` (dumbbell). |
| 4 | Unit | `pnpm test:unit` | **756 passed, 53 files, 0 failed.** |
| 5 | Integration | `pnpm test:integration` | **322 passed, 15 skipped, 0 failed** (the 15 are the four pre-existing concurrency files gated on dedicated `*_CONCURRENCY_DATABASE_URL` vars). |
| 6 | E2E | `pnpm test:e2e` against the fresh database and a production build | **98 passed, 0 failed** (2.0 min). |
| 7 | Typecheck | `pnpm typecheck` | clean. |
| 8 | Service-worker typecheck | `pnpm typecheck:sw` | clean. |
| 9 | Lint | `pnpm lint` | clean (this is where the ESLint boundary rules run). |
| 10 | Format | `pnpm format:check` | **One pre-existing failure, not from this change** — see §4.1. Every file this change touches passes. |
| 11 | Build | `pnpm build` | `Compiled successfully`. `/exercises/[id]/strength` (5.13 kB) and `/api/exercises/[id]/strength` both present in the route manifest. |

### 4.1 The one non-green check, stated plainly

`pnpm format:check` reports `src/server/sync/service.ts`. **This change does not touch that file** and the failure is pre-existing in this working copy:

- `git status --porcelain src/server/sync/service.ts` → empty; `git diff` → empty.
- `git config core.autocrlf` → `true`; `git ls-files --eol` → `i/lf w/crlf`.
- The committed blob contains **0** CRLF pairs (49,788 bytes); the working copy contains **1,163** (50,951 bytes).

So the file as committed is Prettier-clean, and the check fails only because this checkout materialised it with CRLF. Fixing it would mean rewriting an unrelated file, which the task forbids. Recorded rather than silently repaired. Every other file in the repository, including all 30 this change adds or edits, passes `format:check`.

### 4.2 Mutation check on the new constant guard

The `PLAUSIBILITY_FACTOR` value was temporarily changed from `1 + 2 × noise` to `1 + 5 × noise`, the suites re-run, and the file **restored from bytes saved before the mutation** (SHA-256 `4C71153695…5BCC2F` before and after — identical; no Git command was used). Under the mutation, 3 tests fail: two in `strengthConstants.test.ts` and the behavioural boundary fixture in `strengthObservation.test.ts`. Before those tests existed the same mutation passed the entire suite — see §6, finding R-0.

---

## 5. Independent fixtures and negative controls

Beyond the document's worked examples, the suite carries fixtures computed independently from the formula, and negative controls that fail when a rule is bypassed. The controls that matter:

| Rule | Control that fails when it is bypassed |
| --- | --- |
| `is_warmup` is the primary classifier | A ramp **at the working weight** (`W:100×5 @RIR4 ×2`, then `100×5 @RIR1,1,0`). Marked → 120.00 with no flags; unmarked → 130.00 with `RIR_MODERATE_RANGE`. The modal-load rule cannot catch this case, because the ramp shares the work sets' load. |
| `GROUP_SET_POSITIONS = 3` | `4 × 82.5×6 @ RIR 2,2,1,0` → first-three lower median 104.50; all-sets lower median 101.75. Asserted `not.toBe(101.75)`. |
| Ties break to the **heaviest** | `100×8 + 130×8 @ RIR 2` → 173.33. Under ties-to-earliest the 100 kg group would be modal, 173.33 would breach the 1.20 band, and the answer would be 133.33. (The three-set pyramid does **not** discriminate — both rules give 160.00. That vacuity was found in review and replaced; see R-3.) |
| Sub-modal exclusion is **by load** | `100×12 @RIR0` (implies 140.00) beside `3 × 110×5 @RIR2` (135.67) → 135.67, asserted `not.toBe(140.00)`. |
| The 1.20 band's **size** | A pair bracketing the ceiling: modal 123.33, supra 147.33 admitted (governs), supra 153.00 excluded. A 1.30 band would admit the second. |
| The band is compared **unrounded** | `3 × 110.01×5` + `132.02×5` → ceiling 162.816, supra 162.82 excluded. Rounding the ceiling first would admit it and move the session 20 % (see R-1). |
| `TOP_SET_GOVERNS` | `140×3 @RIR1` + `3 × 110×8` → 158.67, asserted `not.toBe(143.00)` (the evaluation's answer). |
| `RTF_MAX = 12` | `95×12 @RIR1` and `@RIR2` excluded, `@RIR0` admitted with `EXTENDED_REP_RANGE`. |
| RIR ≥ 5 excluded | `60×6 @RIR5` excluded, `@RIR4` admitted degraded — chosen so the ceiling does not confound the RIR rule. |
| 90-**calendar**-day window | `asOf − 89` in, `asOf − 90` out; and the same date at 00:01 and 23:59 gives the same answer. |
| **Account** timezone, not UTC | A session starting 22:30 UTC on the 3rd is `performedOn` 2026-09-**04** under Europe/Ljubljana and 2026-09-**03** under a UTC account. Added after review (R-4). |
| `asOf` bound | A future-dated observation moves neither current, best, stale count, pool nor trend. |
| Deload exclusion | A 130 kg deload beside a 100 kg work session → current and best both 123.33, asserted `not.toBe` the deload's value, while the deload row is still on the trend. |
| Lower median, not mean/max | `[136, 180]` → 136; `[130, 132, 13]` → 130 (the documented downward fragility, asserted rather than hidden). |
| Floor, not nearest | raw 24 on a 5 kg step → 20, asserted `not.toBe(25)`; band `[20, 30]`, asserted the band is not re-centred on 20. |
| Every rendered value carries its band | `formatEstimate` asserted to contain `≈`, `est.` and a band for five different value/step pairs, and asserted `not.toBe("≈ 140 kg")`. |
| The switch can only disable | `bodyweight` + `'auto'` → `EXERCISE_CATEGORY_UNSUPPORTED`. |
| The reconcile keys on the **id** | The seeded assisted pull-up is drifted to `'auto'` **and renamed**, then reconciled → `'off'`, name untouched. A name-keyed reconcile passes every other assertion in the file and fails only here. |
| The reconcile respects `is_seeded` | A user-authored exercise named exactly `Assisted Pull-Up` is left on `'auto'`. |
| The migration carries no DML | The `.sql` file is read and asserted to contain no `UPDATE`/`INSERT`/`DELETE`. |
| Boundary checks are not vacuous | Five synthetic forbidden edges injected; each must be reported. Plus a real-edge positive control and a "collector is not vacuous" assertion on the reason-code reachability harness. |

`tests/unit/strengthConstants.test.ts` additionally pins all 26 numeric constants of §16 value-by-value, asserts each threshold is the stated multiple of `NOISE_SD_PCT`, and asserts the four constants §16 **removed** are absent.

**A-29 negative control.** `tests/unit/progressionMatrix.test.ts`, `workingTargets.test.ts`, `carryForward.test.ts` and the three `warmupSetClassification` suites pass **unmodified** — `git status` shows no change to any of them.

---

## 6. Findings from the adversarial review of this implementation, and their disposition

An eight-dimension adversarial review was run against the binding document after implementation, with every finding independently verified. Ten findings were raised; six survived verification. All six were fixed, and one further defect was caught by the suites themselves.

| Id | Finding | Disposition |
| --- | --- | --- |
| **R-0** | `PLAUSIBILITY_FACTOR` was momentarily present on disk as `1 + 5 × noise` (1.50). The entire suite still passed: the 1100 kg typo is outside either band and the 140 kg top set is inside either, so no fixture discriminated. | **Fixed and closed permanently.** The constant is `1 + 2 × noise`. `strengthConstants.test.ts` now pins all 26 §16 values, and a fixture pair brackets the 1.20 ceiling. Mutation-verified (§4.2). |
| **R-1** | The plausibility ceiling was computed as `round2(modal × 1.20)`. V-7 defines no rounding of the ceiling; the extra step raises it by up to 0.005 kg, and an admitted supra-modal group then *governs*, so that half-cent can move a session's value by 20 %. | **Fixed.** The product is used unrounded, with the reviewer's exact reproduction added as a fixture. §22's printed ceilings are the exact product shown to two decimals, not a rounded comparison input. |
| **R-2** | The one-shot reconcile keyed on `is_seeded` + the seeded **name**, not the deterministic ids §14.4 names — and ADR-010 had already rejected name matching for this exact problem. | **Fixed** — see JC-1. Reconcile moved to `src/db/seed/reconcileStrengthEstimates.ts`, keyed by `seededExerciseId(userId, slug)`; the migration is now DDL-only. |
| **R-3** | The integration test named for the reconcile never executed the reconcile: `createTestDb` migrates an empty schema, so the migration's `UPDATE` matched zero rows in every run while the comment claimed otherwise. | **Fixed.** Four tests now call `reconcileStrengthEstimates` directly, including through a rename and against a same-named user-authored exercise. |
| **R-4** | A-20's "no table other than `set_logs` changes" sampled `exercises` and `workout_sessions` but not `session_exercises` — the one table the deletion ops address by id. | **Fixed.** All three tables are snapshotted before and after. |
| **R-5** | The negative control for the ties-to-heaviest rule was vacuous: the pyramid fixture yields 160.00 under both tie rules, so `not.toBe(133.33)` could never fire. | **Fixed.** Replaced with a two-group fixture where the two rules genuinely disagree (173.33 vs 133.33), and the misleading comment removed. |
| **R-6** | No test pinned the **account-timezone** half of V-10; hard-coding "UTC" left every suite green. Refuted by the verifier as a deviation (the implementation is correct), confirmed as a coverage gap. | **Fixed anyway.** A 22:30 UTC session is asserted to date to the next local day under Europe/Ljubljana and to the same day under UTC. |

Four findings were refuted on verification and are recorded here because a reviewer will reach for them:

- **The `/exercises/[id]/strength` page is not `NetworkOnly`.** §14.3's final bullet says the page and the endpoint both are. The endpoint is (it falls through `sw.ts`'s generic same-origin `/api/` `NetworkOnly` entry — no service-worker change was needed or made). The *page* is served by the generic RSC/HTML `NetworkFirst` entries like every other app page. Making a Next.js page `NetworkOnly` would break the app-shell strategy the whole PWA rests on, and it is functionally moot: the cached shell's fetch to the `NetworkOnly` endpoint still fails offline, so the page cannot show a stale estimate. Recorded as a stated, deliberate deviation from a literal reading of that bullet.
- **`ESTIMATE_SPREAD_WIDE` is suppressed above 30 %.** §15.4 gives the two spread codes overlapping conditions ("> 20 %", "> 30 %"). They are emitted as disjoint levels, matching the document's other paired rows (`SINGLE_/TWO_SESSION_EVIDENCE`, `EVIDENCE_AGING/OLD`), which are genuinely exclusive. Confidence is identical either way. Recorded as JC-4.
- **Freshness copy.** §15.4's preamble delegates wording to `copy.ts`. The page now also states the actual age of the most recent counted session ("6 weeks ago"), which §15.3 gives as its own example and which was otherwise a carried-but-unrendered DTO field.
- **Nothing from Release B leaked.** `suggestStartingLoad` does not exist; `TodayBundleExerciseEntry` gains no field on either side; `src/sync/activeSession.ts`, `src/app/sw.ts`, `src/domain/sync/schema.ts`, `src/server/sync/service.ts` and every file under `src/domain/progression/` are untouched (`git status` clean for all of them); no new outbox op; no batched observation query.

---

## 7. Judgment calls

**JC-1 — the one-shot reconcile lives in the seed, not in the migration.** §14.4 asks for it "in the same migration … via their deterministic `slugToUuid` ids". Those two halves cannot both be met: the id is SHA-1 of `exercise:<user_id>:<slug>`, and core PostgreSQL has md5 and sha224/256/384/512 but no sha1, so an id-keyed predicate in SQL would need `pgcrypto`, which production's Azure Flexible Server does not allowlist.

I first chose to keep the location and substitute the key (`is_seeded` + the seeded name). Review showed that was the wrong half to give up: **ADR-010 hit this identical problem and settled it for this repository**, verbatim — *"A SQL migration cannot safely select renamed seeded exercises: slugs are not stored, names are mutable, and reproducing the id hash in SQL would need pgcrypto. Both name matching and pgcrypto are rejected."* — and its accepted mechanism is a `runSeed` step deriving the id with the existing `seededExerciseId(userId, slug)` helper.

The implementation now follows that precedent. Consequences, stated:
- The *identity* requirement of §14.4 is met exactly: a **renamed** seeded row is still reconciled, which a name match would have missed.
- The *location* moves from `drizzle/` to `src/db/seed/`, which also restores this repository's other standing convention — no migration in `drizzle/` contains DML, asserted by a test.
- Idempotence is state-predicated in the house idiom: the predicate `strength_estimate = 'auto'` is consumed by the update, so every later run touches zero rows. The one case where it fires twice is an athlete deliberately setting one of these two exercises back to `'auto'` — the state §6.1 says must not exist for them.
- `pnpm db:migrate` is always followed by `pnpm db:seed` in both CI workflows and the deploy pipeline, so the reconcile runs wherever the migration does.

**JC-2 — the what-if calculator does not apply §9.5 steps 2–4.** §15.1 asks for "load from the current estimate with the same rules and codes". It applies §9.4's target-RTF bounds, the finite guard, the load-step floor and the required band. It does **not** apply the pooled cross-check (step 2), the direct-tier cap (step 3) or the global 1.10 cap (step 4): step 2 is an identity here because the what-if's basis *is* `currentE1RM`, and steps 3–4 are properties of a *suggestion*, which I-8 and §9.6 scope to `suggestStartingLoad` — a Release B function with a basis, a tier and a firing condition the calculator has none of. The athlete asks "what load is N reps at RIR r?"; the honest answer is the estimate divided by the multiplier, shown with its band and its label.

**JC-3 — the trend list is window-scoped.** §15.1 says "trend list of observations" without a bound. The list renders the evidence window's observations (deload rows included and badged) and states the count of older ones, using `staleObservationCount`, which §8.3 defines for exactly that purpose. `best` is shown separately with its date regardless of age, so an all-time high outside the window is never hidden. Rendering all observations unbounded would put 252 rows on a phone for one exercise in the local dataset.

**JC-4 — the two spread codes and the two freshness codes are emitted as disjoint levels.** §15.4 states `ESTIMATE_SPREAD_WIDE` at "> 20 %" and `ESTIMATE_SPREAD_VERY_WIDE` at "> 30 %", which overlap literally. They are emitted as two levels of one signal, matching `EVIDENCE_AGING`/`EVIDENCE_OLD` (given explicitly disjoint day ranges) and `SINGLE_`/`TWO_SESSION_EVIDENCE`. Confidence is unaffected — both floor to the same value.

**JC-5 — A-19's reachability half is asserted as "reached or explicitly deferred".** Nineteen of the 48 codes belong to `suggestStartingLoad`. Rather than weaken the criterion to "the codes we happen to emit", `RELEASE_B_ONLY_REASON_CODES` declares those nineteen and the test asserts the unreachable set is **exactly** that list. A Release-A code that loses its emitter fails; so does a Release-B code emitted early. A-19's completeness half (enum ↔ copy map ↔ §15.4 table) is asserted in full, in both directions.

**JC-6 — the strength links do not repeat the exercise name in their accessible name.** Several existing e2e specs locate a library row with `getByRole("link", { name })` where `name` is the exercise, and Playwright matches accessible names by substring — a per-row label like "Strength estimate for Back Squat" made four existing specs strict-mode violations. The link reads "Strength estimate" and takes its purpose from its row (WCAG 2.4.4 "in context"). Related: the edit form's new `<select>` is placed **after** `ContributionEditor` because `muscleTaxonomyV2.spec.ts` addresses the contribution pickers positionally (`.nth(3)`, `.nth(5)`), which a select inserted above them silently shifts. Both were caught by running the full e2e suite, and both were fixed in the new code rather than by editing the existing specs.

**JC-7 — `EXTENDED_REP_RANGE` and `EQUIPMENT_TRANSLATION_NOISIER` are phrased without the word "precise".** §15.4's draft column reads "less precise", while §15.2 bans that vocabulary. §15.4's own preamble says the column "fixes the meaning, not the final wording", so both read "less certain".

---

## 8. Device checks not executed

§18 step 7's device acceptance on the iPhone PWA was **not** performed — it needs the physical device. Automated coverage stands in for it only partially: the Chromium E2E suite runs at 390×844 and asserts no horizontal overflow at that width (which caught a real flexbox overflow in the what-if row during this pass), but nothing here exercises real iOS Safari, real touch targets, or a real installed PWA.

The Release-A-relevant items from §18 step 7 that still need a device:

1. `/exercises/[id]/strength` on the physical iPhone: legibility of the band and reason lines, and the sparkline at real pixel density.
2. The what-if calculator's numeric keyboard on iOS (the inputs use `type="text" inputMode="numeric"`, the repository's established comma-decimal-safe pattern, but it has not been typed on).
3. The edit-form toggle on a real touch target, and the estimate disappearing after switching an exercise off.
4. An exercise switched off, and a top-set/back-off session, viewed on the device.

The remaining items in §18 step 7 (5×5 → 3×12 and back, a `repRange` block under rep-progression, an old cached bundle, a deload week as they affect the *card*) are Release B, since Release A adds no workout-card behaviour beyond a link.

---

## 9. Final scope

**Implemented (Release A):** the `exercises.strength_estimate` column with its migration and reconcile; the complete pure `src/domain/strength/` pipeline (constants, the 48-code enum, primitives, eligibility, grouping, observations, current/best/trend, confidence, provenance); the what-if calculator; the user-scoped `GET /api/exercises/[id]/strength`; the read-only `/exercises/[id]/strength` page with the sparkline and the `loadStepKg` grid; the edit-form opt-out; links from the library row, edit form and workout card; the formatter; and the dedicated import-boundary test.

**Deliberately not implemented (Release B):** `suggestStartingLoad`; the `strengthEstimate` / `startingSuggestion` bundle fields; the **Use** action; the device-local freeze at `startSession`; any sync, outbox or `PrescriptionSnapshot` change; any recommendation interaction or progression trigger; the batched per-bundle observation query; and V-22's `resolveCarryForwardCandidate` refactor of `carryForward.ts`, which exists to serve the Release B suppression gate. `src/domain/progression/**` is byte-identical to `c52b016`.

**Also not implemented:** the PI-005 athletic measurement-profile backlog and the Phase 9 dashboard.

Release A is read-only apart from the exercise opt-out. Estimates are computed on read; there is no aggregate table, no cache and no strength-derived write path — asserted by the boundary test's grep over `src/` and `drizzle/`.

## 10. Working-tree impact

Added: `src/domain/strength/` (12 files), `src/server/strength/service.ts`, `src/app/api/exercises/[id]/strength/route.ts`, `src/app/(app)/exercises/[id]/strength/page.tsx`, `src/ui/strength/` (5 files), `src/db/seed/reconcileStrengthEstimates.ts`, `drizzle/0011_happy_celestials.sql`, `drizzle/meta/0011_snapshot.json`, ten `tests/unit/strength*.test.ts`, `tests/integration/strength.integration.test.ts`, `tests/e2e/strengthPage.spec.ts`, and this report.

Modified: `drizzle/meta/_journal.json`, `src/db/schema/exercises.ts`, `src/db/seed/exerciseCatalog.ts`, `src/db/seed/exercises.ts`, `src/db/seed/index.ts`, `src/domain/exercises/schema.ts`, `src/server/exercises/service.ts`, `src/ui/exercises/ExerciseForm.tsx`, `src/ui/exercises/ExerciseLibrary.tsx`, `src/ui/exercises/types.ts`, `src/ui/workout/ExerciseCard.tsx`.

Every pre-existing uncommitted change is preserved exactly as found — `CLAUDE.md`, the deleted `HANDOFF.md`, `docs/architecture/*`, `docs/evidence/*`, `docs/input/product-ideas.md`, `docs/research-notes/README.md`, the eleven untracked reports of this lineage, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`. A diff of `git status --porcelain` against the snapshot taken at the start of this pass is purely additive: no baseline entry disappeared. No review or verification report was edited. Nothing was committed, pushed, tagged or deployed.

Scratch artefacts (the §18 prototypes, the arithmetic checker, the saved bytes used to restore the mutation test, and the drift-check copy of `drizzle/`) live in the session scratchpad and `C:\tmp`, outside the repository.

The disposable verification database `gymapp_e1rm_verify` was left in place on the local Docker instance so its state can be inspected; it can be dropped at will. The development database `gymapp` was read for the §18 prototype and otherwise untouched.

---

# `READY FOR INDEPENDENT REVIEW`
