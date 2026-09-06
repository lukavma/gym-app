# Estimated 1RM — Release A (Tracker): Remediation of F-1…F-7

Date: 2026-09-06
Role: remediation of every finding in `docs/reviews/estimated-1rm-release-a-review.md` (below **the review**), against the binding specification `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` (below **the revision**) and `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md`. No specification, review, or verification report was edited. Nothing was committed, pushed, tagged, or deployed. Production was never contacted.

Repository state: `main` @ `c52b016` plus the uncommitted Release A change set and the pre-existing, unrelated documentation changes — all preserved exactly as found.

**Owner decision applied (F-2):** the binding §9.5 step-4 global cap and its `CAPPED_AT_RECENT_MAX_LOAD` code are now applied to the what-if calculator. That decision was treated as covering step 4 and nothing else; no other Release B behaviour was implemented.

---

## 1. Verdict

# `READY FOR TARGETED REMEDIATION VERIFICATION`

All seven findings are remediated. Each fix is pinned by the reviewer's own boundary fixture plus a negative control, and each was mutation-tested: reverting any one of the eight code or copy changes fails the suites (§4). The full verification re-ran on a fresh disposable PostgreSQL 16 database and a production build: 770 unit, 324 integration, 99 E2E, typecheck, service-worker typecheck, lint, build, schema drift — all green.

---

## 2. Findings → remediation

| F | Severity | Remediation | Where |
| --- | --- | --- | --- |
| **F-1** | Low | Both thresholds now compare the exact value. The unconfirmed threshold is the unrounded product; `spreadPct` returns the unrounded ratio and only the DTO field is rounded. | `estimate.ts`, `primitives.ts` |
| **F-2** | Low (owner decision) | §9.5 step 4's `1.10 ×` global cap applied to the calculator, emitting `CAPPED_AT_RECENT_MAX_LOAD`; the code left `RELEASE_B_ONLY_REASON_CODES`. | `whatIf.ts`, `report.ts`, `reasonCodes.ts` |
| **F-3** | Low | `NO_RECENT_EVIDENCE` now reads "No **counted** sessions in the last 90 days". | `copy.ts` |
| **F-4** | Low | The band note now reads "The range is a ±10 % **convention**, not a measured error." | `copy.ts` |
| **F-5** | Low | A malformed exercise id is guarded before the query and answers 404, never 500. | `query.ts`, `server/strength/service.ts` |
| **F-6** | Low (device) | Every control on the calculator and all three entry links are ≥ 44 px. | `StrengthScreen.tsx`, `ExerciseLibrary.tsx`, `ExerciseCard.tsx`, `ExerciseForm.tsx` |
| **F-7** | Low (cosmetic) | The estimate's remaining reasons render inside the Current card, not after Best. | `StrengthScreen.tsx` |

### F-1 — exact, unrounded threshold comparisons

The review found two comparisons that rounded before testing, the same class as the plausibility ceiling the implementation had already fixed once (R-1). Both are now exact.

**The unconfirmed threshold.** §8.3 writes the test as `e1rmKg ≥ best × (1 − BEST_UNCONFIRMED_PCT / 100)` and defines no rounding. `round2` lowered the threshold by up to half a cent:

```
best 139.36 → threshold 139.36 × 0.9 = 125.424
round2(125.424) = 125.42 — exactly the other observation's value
```

so a `best` the rule leaves **unconfirmed** was reported **confirmed**, with `BEST_UNCONFIRMED` dropped entirely. Now compared unrounded.

**The spread.** §11 defines spread as `(max − min) / lowerMedian` and the caps as firing at `> SPREAD_MEDIUM_PCT` / `> SPREAD_LOW_PCT`. `spreadPct` returned a value already rounded to two decimals, and `deriveEstimate` compared that:

```
pool [133.33, 133.33, 160.00] → 26.67 / 133.33 = 20.0030 %   round2 → 20.00 → no code, confidence high
pool [173.33, 133.33]         → 40.00 / 133.33 = 30.00075 %  round2 → 30.00 → WIDE not VERY_WIDE, medium not low
```

`spreadPct` now returns the exact ratio. `deriveEstimate` keeps two values: `poolSpreadExactPct` drives every comparison, and only the DTO's `poolSpreadPct` is rounded — display precision, not comparison precision. Both classes moved in the **non-conservative** direction before the fix, which is why they were worth fixing even though no number changed.

Regression coverage uses the review's own reproductions: E2's `139.36` / `125.42` pair (plus its mirror at `125.43`, which must still confirm), E3's `[133.33, 133.33, 160.00]`, and fuzz report #8067's `[173.33, 133.33]`. Each asserts the code, the confidence word, the rounded DTO field, and a negative control naming the pre-fix outcome.

### F-2 — the global cap on the what-if calculator (owner decision)

§15.1 specifies the calculator as "reps + RIR → load from the current estimate **with the same rules and codes**", and §9.5 step 4 says the `UPWARD_LOAD_CAP_FACTOR` cap "applies to **every** tier (evaluation O-3 accepted)". The owner decided to apply it. JC-2's earlier reading — that every cap is a property of a *suggestion* — is withdrawn for this step only.

Of §9.5's three caps the calculator now applies exactly one, and the module says why:

- **step 2** (pooled cross-check) is an **identity** — the calculator's basis *is* `currentE1RM`, so `raw` and `pooledTranslated` are the same number and the comparison can never bind.
- **step 3** (direct-evidence cap) is **inapplicable** — it caps at "the heaviest basis group load", and the calculator selects no basis group.
- **step 4** is **applied**, emitting `CAPPED_AT_RECENT_MAX_LOAD`.

The cap basis is the heaviest **admitted** group load among **non-deload** observations in the evidence window, computed in `report.ts` and passed in as a required argument so no call site can omit it silently. Deloads are excluded because they contribute to no basis anywhere (I-6, V-14); excluded groups are skipped because I-13 forbids a sub-modal or implausible group from contributing to anything — a `1100 kg` typo cannot licence a bigger answer.

`rawLoadKg` on the DTO stays the **pre-cap** translation, because §12 names it exactly that ("the pre-cap translated value `rawLoadKg` is strictly decreasing in `targetRTF`") and A-9's plateau fixture prints it that way. The cap reassigns the working value, as §9.5's step sequence does, so the floor and the band both operate on the capped value.

The review's E14 fixture is now a test, and reproduces its numbers:

```
5 × 110×5 @ RIR 3,3,2,2,1 → current 139.33, heaviest admitted load 110, cap 121.00
1 rep @ RIR 2 (RTF 3):  raw 126.66 → capped 121.00 → emitted 120.0, band [107.5, 135]
                        before: emitted 125.0, band [112.5, 140]
```

`CAPPED_AT_RECENT_MAX_LOAD` was removed from `RELEASE_B_ONLY_REASON_CODES` (19 → 18 deferred codes, 29 → 30 Release-A-reachable), and a fixture in the reachability suite emits it. The other two cap codes stay deferred. **Nothing else from Release B was implemented**: no `suggestStartingLoad`, no tier selection, no basis, no consistency gate, no bundle field, no `Use` action, no sync or progression change.

### F-3 — `NO_RECENT_EVIDENCE` copy

The code fires when no **non-deload** observation is in the window, so a window holding only deload sessions rendered "No sessions in the last 90 days" directly above a trend list showing those very sessions. The code is right; the sentence was not. It now reads "No counted sessions in the last 90 days".

### F-4 — the band note

"The range spans one standard deviation of estimation error either side" read as a measurement. K-03 tags the noise magnitude `[E*]` (provisional registry items) and the value 10 `[P]`; §2 forbids anything `[E*]` from reaching copy as evidence, and row 20's not-justified column forbids presenting the band as calibrated to anything beyond one noise unit. It now reads "The range is a ±10 % convention, not a measured error." — the review's own suggested wording.

### F-5 — malformed id

`GET /api/exercises/not-a-uuid/strength` returned 500: PostgreSQL rejects a non-UUID against a `uuid` column with SQLSTATE 22P02, which no route in this repository maps. The service now guards the id before issuing the query and returns `null` → 404, which is §14.4's "404 otherwise" reading and the same shape as `getWarmupRoutine`'s existing `isUuid` guard. The guard lives in `src/domain/strength/query.ts` (duplicated rather than imported from `@/domain/warmup/schema`, because §14.5 confines `src/domain/strength/**` to its own module).

Confirmed over real HTTP against the production build, with a session cookie:

| Request | Before | After |
| --- | --- | --- |
| `not-a-uuid`, `123`, `01a07403-3454-7885-ad2f`, `zzzz…`, `%20` | 500 | **404 `{"error":"not_found"}`** |
| a well-formed but non-existent id | 404 | 404 — indistinguishable |

The inherited `GET /api/exercises/not-a-uuid` (no `/strength`) is a pre-existing repository pattern outside this change's scope and was left alone.

### F-6 — touch targets

At 390 px the calculator's inputs measured 111×26 px and its button 94×24 px, and the three entry links were 20 px `text-xs`. All are now ≥ 44 px:

- the two inputs moved into a two-column grid with `min-h-11 px-3 py-3 text-base` — the grid replaces the flex row so they split the column evenly without `min-width: auto` pushing them past `max-w-sm`;
- the submit button takes its own full-width row at `min-h-11 px-4 py-3 text-base`, copying the shared `Button`'s sizing;
- all three "Strength estimate" links are `inline-flex min-h-11 items-center text-sm`.

Horizontal overflow stays 0 px at 390 px (asserted in the E2E spec, which also now measures each control's height). The remaining half of F-6 — how the targets and the iOS numeric keyboard actually feel — is a device-acceptance item and is listed in §6 as still un-run.

### F-7 — reason placement

`reasonCodes[1..]` rendered between the Best card and the calculator, so a pool flag such as "Based on a single set" appeared directly under "Best … 4. Sept. 2026" and read as a qualification of `best`. The list now renders **inside** the Current card, under a divider, because every one of those codes is a property of the pool. The first reason is still shown beside the value and is not repeated, so each reason is disclosed exactly once. The E2E spec asserts the containment in both directions: the reasons are inside the Current card and absent from the Best card.

---

## 3. Files changed

| File | Change |
| --- | --- |
| `src/domain/strength/primitives.ts` | `spreadPct` returns the exact ratio (F-1). |
| `src/domain/strength/estimate.ts` | Unrounded unconfirmed threshold; `poolSpreadExactPct` for comparisons, rounded `poolSpreadPct` for the DTO (F-1). |
| `src/domain/strength/whatIf.ts` | §9.5 step-4 cap, `CAPPED_AT_RECENT_MAX_LOAD`, pre-cap `rawLoadKg`, required `windowMaxAdmittedLoadKg` argument (F-2). |
| `src/domain/strength/report.ts` | `maxAdmittedLoadKg` derives the cap basis from admitted, non-deload window groups (F-2). |
| `src/domain/strength/reasonCodes.ts` | `CAPPED_AT_RECENT_MAX_LOAD` moved out of `RELEASE_B_ONLY_REASON_CODES` (F-2). |
| `src/domain/strength/query.ts` | `isStrengthExerciseId` (F-5). |
| `src/server/strength/service.ts` | Malformed-id guard before the query (F-5). |
| `src/ui/strength/copy.ts` | `NO_RECENT_EVIDENCE` and `bandNote` wording (F-3, F-4). |
| `src/ui/strength/StrengthScreen.tsx` | Reasons inside the Current card; 44 px calculator controls (F-6, F-7). |
| `src/ui/exercises/ExerciseLibrary.tsx`, `src/ui/exercises/ExerciseForm.tsx`, `src/ui/workout/ExerciseCard.tsx` | 44 px entry links (F-6). |
| `tests/unit/strengthPrimitives.test.ts` | Exact-vs-display spread assertions (F-1). |
| `tests/unit/strengthEstimate.test.ts` | The review's E2 and E3 fixtures plus fuzz #8067 and the confirmed mirror (F-1). |
| `tests/unit/strengthWhatIf.test.ts` | Seven cap tests including E14 (F-2). |
| `tests/unit/strengthReasonCodes.test.ts` | A `CAPPED_AT_RECENT_MAX_LOAD` fixture; deferred set 19 → 18 (F-2). |
| `tests/unit/strengthCopy.test.ts` | Copy assertions with negative controls (F-3, F-4). |
| `tests/integration/strength.integration.test.ts` | Malformed-id table and the cap end to end (F-2, F-5). |
| `tests/e2e/strengthPage.spec.ts` | Touch-target measurements, reason placement, a capped what-if (F-2, F-6, F-7). |
| `docs/reviews/estimated-1rm-release-a-remediation.md` | This report. |

No migration, schema, seed, or reconcile file was touched: `drizzle/0011_happy_celestials.sql`, `drizzle/meta/`, `src/db/schema/exercises.ts` and `src/db/seed/*` are byte-identical to the reviewed state.

---

## 4. Regression coverage and mutation evidence

Each fix is pinned by the reviewer's exact boundary fixture and by a negative control naming the pre-fix outcome. To prove the new tests are load-bearing rather than merely present, each fix was reverted by exact-string replacement (aborting unless the target occurs exactly once), the affected suites were run, and the file was **restored from bytes saved before the mutation** and SHA-256 checked. No Git command was used.

| Mutation | Reverts | Result |
| --- | --- | --- |
| MR-1 | F-1 unconfirmed threshold re-rounded | **CAUGHT** — 1 failed / 25 |
| MR-2 | F-1 `spreadPct` re-rounded | **CAUGHT** — 4 failed / 50 |
| MR-3 | F-2 cap disabled | **CAUGHT** — 8 failed / 33 |
| MR-4 | F-2 cap basis takes every group, not admitted only | **CAUGHT** — 1 failed / 23 |
| MR-5 | F-2 cap basis includes deload observations | **CAUGHT** — 1 failed / 23 |
| MR-6 | F-5 malformed-id guard removed | **CAUGHT** — 1 failed / 23 |
| MR-7 | F-3 unqualified copy restored | **CAUGHT** — 1 failed / 19 |
| MR-8 | F-4 standard-deviation note restored | **CAUGHT** — 1 failed / 19 |

8 applied, 8 caught, 8 restored with identical hashes.

Negative controls added alongside the positive assertions:

- **F-1**: the confirmed mirror at `125.43` (one cent above the exact threshold) must still confirm; `round2(20.003) > 20` is asserted to be `false`, which is precisely the pre-fix comparison.
- **F-2**: the uncapped answers are named and excluded (`not.toBe(125)`, `not.toEqual([112.5, 140])`, `not.toEqual([100, 125])`); a cap basis taken from an excluded `1100 kg` group would give 122.5, asserted absent; a deload session heavier than every work session must not raise the ceiling; an unrounded cap boundary at `121.011` separates 121.01 (passes) from 121.03 (capped).
- **F-5**: a well-formed but non-existent id takes the same path, so the guard cannot be what makes the malformed loop pass; a real id still resolves, so the guard is not rejecting everything.
- **F-3/F-4**: the exact pre-fix sentences are asserted absent.
- **F-7**: the reasons are asserted present in the Current card **and** absent from the Best card.

---

## 5. Verification

Fresh disposable database `gymapp_e1rm_remediation` on the local Docker `gym-app-db-1` (PostgreSQL 16), created for this pass. The development database `gymapp` was not migrated, seeded, or written to; the review's `gymapp_e1rm_review` was already dropped; the earlier `gymapp_e1rm_verify` was not touched. Production was never contacted.

| # | Check | Result |
| --- | --- | --- |
| 1 | Schema drift (`drizzle-kit generate` against a **copy** of `drizzle/`) | `No schema changes, nothing to migrate`; 0 artefacts; repository folder untouched |
| 2 | `pnpm db:migrate` on the fresh database | applied successfully |
| 3 | `pnpm db:seed` ×2 (straddling account creation) | `Seed complete.` |
| 4 | `pnpm test:unit` | **770 passed**, 53 files, 0 failed |
| 5 | `pnpm test:integration` | **324 passed, 15 skipped**, 0 failed |
| 6 | `pnpm test:e2e` (production build, fresh database) | **99 passed**, 0 failed (2.0 min) |
| 7 | `pnpm typecheck` | clean |
| 8 | `pnpm typecheck:sw` | clean |
| 9 | `pnpm lint` | clean |
| 10 | `pnpm format:check` | one pre-existing failure — see below |
| 11 | `pnpm build` | `Compiled successfully` |
| 12 | HTTP probe of F-5 against the running production build | five malformed ids → 404, identical to a well-formed missing id |
| 13 | Mutation campaign (§4) | 8 of 8 caught, all restored with identical SHA-256 |

`pnpm format:check` reports `src/server/sync/service.ts`, which this change does not touch. Re-confirmed unchanged: `git status --porcelain` is empty for it and `git ls-files --eol` reports `i/lf w/crlf` — the committed blob is LF and Prettier-clean, and this checkout materialised it with CRLF under `core.autocrlf=true`. Same pre-existing condition the review recorded in its own §2 row 6.

Counts moved as expected: unit 768 → 770 (two copy tests), integration 322 → 324 (malformed-id table, capped what-if), E2E 98 → 99 (the cap and reason-placement spec). The earlier totals appear in this pass's own runs because the F-1 and F-2 tests were added to existing files.

---

## 6. Not addressed, and why

- **The review's observations O-A…O-H** are recorded as not findings and were left alone. O-C (unknown query parameters ignored rather than rejected) is a deliberate no-change: rejecting them would deviate from how every other route in this repository parses a query string.
- **JC-1's wording alignment** (§14.4 says "in the same migration"; the reconcile follows ADR-010's `runSeed` mechanism) and **O-E** (JC-3/JC-4 as literal deviations) are documentation questions for the owner, not code changes. Nothing about them moved.
- **Device acceptance** remains un-run — no physical device was used. F-6's geometry is now asserted at 390 px in Chromium, but how the targets and the iOS numeric keyboard feel still needs the iPhone, alongside the four items the implementation report already listed (legibility at real pixel density, the calculator's keyboard, the toggle's touch target, and an exercise switched off / a top-set session viewed on the device).
- **Release B** is untouched. `src/domain/progression/**`, `src/sync/`, `src/domain/sync/`, `src/server/sync/`, `src/server/today/` and `src/app/sw.ts` have zero modified files.

---

## 7. Working-tree impact

Modified by this pass: the eleven source and test files in §3, plus this report (new). Everything else is exactly as the review found it — the Release A change set, `drizzle/`, the migration and seed, `CLAUDE.md`, the deleted `HANDOFF.md`, the architecture/evidence/input/research-note documents, the untracked reports of this lineage (including the review itself, unedited), `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`.

The eight mutation-campaign files were restored from saved bytes with SHA-256 verification. Scratch artefacts (the mutation script, arithmetic checkers, the drift-check copy of `drizzle/`) live in the session scratchpad and `C:\tmp`, outside the repository.

The disposable database `gymapp_e1rm_remediation` was left in place for inspection and can be dropped at will. The production server started for the HTTP probes was stopped. No commit, push, tag, or deployment.

---

# `READY FOR TARGETED REMEDIATION VERIFICATION`
