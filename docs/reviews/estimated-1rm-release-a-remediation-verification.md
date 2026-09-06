# Estimated 1RM — Release A (Tracker): Targeted Verification of the F-1…F-7 Remediation

Date: 2026-09-06
Role: independent, targeted verification of `docs/reviews/estimated-1rm-release-a-remediation.md` (below **the remediation**) against findings F-1…F-7 of `docs/reviews/estimated-1rm-release-a-review.md` (below **the review**). Every claim was re-proved from the files, from a from-the-text reference implementation, and from a fresh database and production build — not from the remediation's account of itself. No finding was remediated; no source, test, migration, seed, specification, or report was edited. Nothing was committed, pushed, tagged, or deployed. Production was never contacted.

Repository state verified: `main` @ `c52b016` plus the uncommitted working tree as found after the remediation. A SHA-256 listing of all 578 tracked and untracked files was taken before any action and re-checked at the end (§8).

---

## 1. Verdict

# `VERIFIED — READY FOR DEVICE ACCEPTANCE`

All seven findings are remediated, and each remediation is pinned by shipped tests that a mutation campaign proves are load-bearing. The two knife-edge thresholds of F-1 now compare exact values (proved at the reported edges and across 230,000 randomised reports). The what-if calculator applies the §9.5 step-4 cap with the right basis and the right code (F-2), the copy and reason placement are corrected (F-3, F-4, F-7), a malformed id answers 404 over real HTTP without regressing any real id (F-5), and every calculator control and entry link is at least 44 px tall in a real browser at three phone widths (F-6). Nothing from Release B and no unrelated architecture change was introduced; the full suites are green on a fresh PostgreSQL 16 database and a production build.

Three **Low** notes are recorded (§5), none of which changes a computed value or blocks device acceptance: two coverage gaps in the shipped cap tests (both behaviours are correct and are proved here), and one ordering quirk of the cap versus the finite guard that no stored data can reach.

---

## 2. Scope of what changed (independently established)

The remediation's footprint was established by diffing the file hashes taken at the end of the review against the current tree, not from the remediation's file list: **19 files changed and 1 added** — `src/domain/strength/{estimate,primitives,query,reasonCodes,report,whatIf}.ts`, `src/server/strength/service.ts`, `src/ui/strength/{copy.ts,StrengthScreen.tsx}`, `src/ui/exercises/{ExerciseForm,ExerciseLibrary}.tsx`, `src/ui/workout/ExerciseCard.tsx`, seven test files (`tests/unit/strength{Copy,Estimate,Primitives,ReasonCodes,WhatIf}.test.ts`, `tests/integration/strength.integration.test.ts`, `tests/e2e/strengthPage.spec.ts`), plus the remediation report. Byte-identical to the reviewed state: `src/db/schema/exercises.ts`, every `src/db/seed/*` file, `drizzle/0011_happy_celestials.sql`, both `drizzle/meta` files, `src/domain/strength/{constants,eligibility,observation,confidence,types,estimateMode}.ts`, the API route, and every unrelated file in the tree. `git status` is empty for `src/sync`, `src/domain/sync`, `src/server/sync`, `src/domain/progression`, `src/server/progression`, `src/server/today`, `src/app/sw.ts`, `package.json` and the lockfile.

---

## 3. Regression baseline after the remediation

| # | Check | Result |
| --- | --- | --- |
| 1 | `pnpm test:unit` | **770 passed** (53 files) |
| 2 | `pnpm test:integration` (PGlite) | **324 passed, 15 skipped** (339; the four `*_CONCURRENCY_DATABASE_URL`-gated files) |
| 3 | `pnpm build` | `Compiled successfully`; `/api/exercises/[id]/strength` and `/exercises/[id]/strength` (5.2 kB) in the manifest |
| 4 | `pnpm test:e2e` on `next start` against the fresh database `gymapp_e1rm_remver` | **99 passed** (1.9 min) — includes the three strength-page tests |
| 5 | `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm lint` | clean |
| 6 | `pnpm format:check` | the same single pre-existing CRLF failure (`src/server/sync/service.ts`, unmodified) as the review recorded |
| 7 | Schema drift (`drizzle-kit generate` against a copy of `drizzle/`) | `No schema changes, nothing to migrate`; repository folder byte-identical |
| 8 | Fresh database: migrate, seed ×2 around account creation | 12 ledger rows; 93 exercises, **91 `auto` / 2 `off`** |

---

## 4. Finding-by-finding verification

### F-1 — exact, unrounded threshold comparisons ✅

**Code.** `estimate.ts:175` compares against `winner.e1rmKg * (1 - BEST_UNCONFIRMED_PCT / 100)` with no rounding; `primitives.ts:62–67` returns the exact ratio; `estimate.ts:147–148` keeps `poolSpreadExactPct` for every comparison and rounds only the DTO field `poolSpreadPct`.

**Knife edges, reproduced independently** (pure module, `asOfLocalDate = 2026-09-06`):

| Fixture | Exact rule | Now |
| --- | --- | --- |
| `139.36 × 1 @ RIR 0` + `125.42 × 1 @ RIR 0` (E2) | 125.42 < 125.424 → unconfirmed | **unconfirmed, `BEST_UNCONFIRMED`** |
| mirror at `125.43` | 125.43 ≥ 125.424 → confirmed | **confirmed, no code** |
| exact equality: best 150.00, other 135.00 | `≥` is inclusive → confirmed | **confirmed** |
| fuzz #490 shape: best 186.67, other 168.00 | 168.00 < 168.003 → unconfirmed | **unconfirmed** |
| pool `[133.33, 133.33, 160.00]` (E3), exact spread 20.003 % | `ESTIMATE_SPREAD_WIDE`, medium | **WIDE, medium, DTO `poolSpreadPct` 20** |
| pool `[173.33, 133.33]` (fuzz #8067), 30.00075 % | `ESTIMATE_SPREAD_VERY_WIDE`, low | **VERY_WIDE, low, DTO 30** |
| exactly 20.000 % / exactly 30.000 % | strict `>` → not wide / WIDE not VERY_WIDE | **as the rule** |

**Population.** The review's from-the-text reference implementation, extended with the step-4 cap (§4 F-2 below) and run in spec-literal mode (no mirrored rounding anywhere) over 230,000 seeded random reports: **zero mismatches in either F-1 class** (the review had 215). The only residual class is confined to the what-if and is explained under F-2.

**Load-bearing.** MV-1 (threshold re-rounded), MV-2 (`spreadPct` re-rounded at the source) and MV-3 (comparisons switched to the rounded DTO field) each fail the shipped suites — 1, 4 and 2 failing tests respectively (§6).

### F-2 — the §9.5 step-4 global cap and its code in the calculator ✅

**Code.** `whatIf.ts:107–132`: `rawLoadKg` is the pre-cap translation; if a basis exists, `cap = basis × UPWARD_LOAD_CAP_FACTOR` is compared **unrounded**, the working value becomes `round2(cap)` and `CAPPED_AT_RECENT_MAX_LOAD` is pushed; the finite guard, the floor and the band then operate on the capped value. `report.ts:31–41` derives the basis as the heaviest **admitted** group load over **non-deload** observations in the **evidence window** (`windowObservations` already excludes anything after `asOf`). `reasonCodes.ts`: `CAPPED_AT_RECENT_MAX_LOAD` left `RELEASE_B_ONLY_REASON_CODES` (18 remain); the copy map is unchanged and complete.

**Reproduced independently** (all PASS):

| Case | Result |
| --- | --- |
| E14: `5 × 110×5 @ RIR 3,3,2,2,1`, what-if 1 rep @ RIR 2 | `rawLoadKg` 126.66 (pre-cap), load **120**, band **[107.5, 135]**, codes `CAPPED_AT_RECENT_MAX_LOAD` + `ROUNDED_DOWN_TO_LOAD_STEP` (was 125 / [112.5, 140]) |
| a heavier session **100 days old** (150 kg) added | still capped at 121 → 120; `staleObservationCount` 1 — the basis is window-bound |
| a heavier **deload** session (150 kg) added | still capped at 121 → 120 |
| an **implausible** 1100 kg group in the session | basis 110, cap binds on 123.34 → 120 |
| sub-modal groups (60, 80) beside `3 × 100×5` | basis 100, cap 110 binds on 112.12 → 110 |
| an **admitted** supra-modal top set (`140×3 @ RIR 1` + `3 × 110×8`) | basis 140, cap 154, raw 144.25 not capped, no code |
| raw exactly equal to the cap (110 vs 110) | not capped, no code (strict `>`) |
| raw 110.01 vs cap 110 | capped to 110 with code |
| basis 110.01 → cap 121.011; raw 121.01 | not capped (unrounded comparison) |
| **discriminator**: basis 110.05 → exact cap 121.055; raw 121.06 | capped with code — a rounded cap (121.06) would have let it through |
| null basis | uncapped 125, no code |
| §12 with the cap, RTF 3…12 | `rawLoadKg` strictly decreasing; emitted load non-increasing (120, 120, 117.5, 115, 112.5, 110, 105, 102.5, 100, 97.5) |

**Population.** With the cap added to the reference exactly as §9.5 step 4 and §9.1 define the basis, 155 of 230,000 reports differed from the implementation — every one in the what-if only, every one the presence or absence of `ROUNDED_DOWN_TO_LOAD_STEP` when the cap bound. Cause: the implementation rounds the capped working value to the domain's 0.01 kg precision (`raw = round2(cap)`), so a cap such as `100 × 1.1 = 110.00000000000001` does not produce a spurious "rounded down" code; the reference had kept the float. With that one representational choice mirrored, **0 mismatches over 200,000 reports** (1,436 of them capped). The choice is sound — `round2` is the schema's own precision and the comparison itself is unrounded — and it is what the shipped test "compares the cap UNROUNDED" implicitly asserts through `loadKg` 121.01 on a 0.01 grid.

**Rendered.** In Chromium at 390, 375 and 320 px, one 60-day-old `3 × 100×5 @ RIR 2` session and a what-if of 3 reps @ RIR 0 render `≈ 110 kg (likely 97.5–122.5) est.` with the line "Capped near your heaviest recent working load"; the uncapped band `100–125` is absent (§4 F-6 for the run).

**Load-bearing.** MV-4 (cap disabled: 8 failures), MV-5 (deload in the basis), MV-6 (excluded groups in the basis), MV-8 (`rawLoadKg` post-cap: 4 failures), MV-9 (band from the pre-cap value), MV-11 (code put back on the deferred list: reachability fails both ways) each fail the shipped suites. **Two cap mutations survive the shipped suites** — MV-7 and MV-10 — and are recorded as coverage notes VR-1 and VR-2 in §5; both behaviours are correct and both mutations are caught by this verification's fixtures.

### F-3 — `NO_RECENT_EVIDENCE` copy ✅

`copy.ts:56` reads "No counted sessions in the last 90 days". A deload-only exercise (one deload session three days old) renders that sentence in the Current card with the deload row beneath it, and the old sentence is absent from the page (browser probe, three widths). MV-13 (old wording restored) fails `strengthCopy.test.ts`.

### F-4 — the band note ✅

`copy.ts:153` reads "The range is a ±10 % convention, not a measured error." The rendered page contains it and contains no "standard deviation"; the banned-vocabulary scan over the page text is clean at three widths. MV-14 (old note restored) fails `strengthCopy.test.ts`.

### F-5 — malformed id → 404 ✅

`query.ts:25–29` guards with `z.string().uuid()` (zod 3.25.76: any hex in the version and variant nibbles, case-insensitive), and `service.ts:127` returns `null` before any query. This matters because the app has two id populations: user-created rows are UUIDv7 and **seeded rows are SHA-1-derived with a version nibble of 5** — a version-restricted guard would have 404'd every catalog exercise. Verified at the function (14 cases) and over real HTTP against the production build with a session cookie:

| Request | Status |
| --- | --- |
| seeded exercise `829c2fa5-c2ee-57ee-…` (version 5), the same id UPPERCASE, a created UUIDv7 id | **200** with a strength report |
| nil UUID, well-formed missing id | 404 |
| `not-a-uuid`, `123`, truncated, `zzzz…`, `{braces}`, 32 hex without hyphens, `%20`, SQL text | 404 `{"error":"not_found"}` — no 500 |

Braces and hyphen-less forms are accepted by PostgreSQL's `uuid` type but answered 404 here; no client produces them, and 404 is the safe side. The rest of the endpoint contract is unchanged (`asOf=abc` and date-only → 400, future `asOf` clamped, `whatIfReps` alone → 400, unauthenticated → 401). MV-12 (guard removed) fails the integration test. The inherited `GET /api/exercises/not-a-uuid` still returns 500 and was, as the remediation says, deliberately left alone.

### F-6 — ≥ 44 px touch targets ✅

Measured with Playwright `boundingBox()` in mobile emulation:

| Control | 390×844 | 375×667 | 320×568 |
| --- | --- | --- | --- |
| Reps / RIR inputs | 162×50 / 162×50 | 155×50 / 155×50 | 127×50 / 127×50 |
| "Show the load" button | 332×48 | 317×48 | 262×48 |
| library-row "Strength estimate" link | 109×44 | 109×44 | 109×44 |
| edit-form "View strength estimate" link | 142×44 | 142×44 | 142×44 |
| workout-card "Strength estimate" link | 109×44 | — | — |

Horizontal overflow is 0 px at all three widths, before and after a what-if round trip. The build-level control (§6) shows the shipped e2e assertion at `strengthPage.spec.ts:180` fails when the button returns to its 24 px sizing.

### F-7 — reason placement ✅

`StrengthScreen.tsx:165–173` renders `reasonCodes[1..]` inside the Current card under a divider. In the browser the two secondary reasons ("Most recent session more than six weeks ago", "Unconfirmed — no second session near it") are inside the Current section, the Best section contains no estimate reason, and the reason list precedes the "Best" label in DOM order (three widths). The build-level control shows the shipped assertion at `strengthPage.spec.ts:220` fails when the list is moved back after Best.

---

## 5. Notes (Low; none blocks)

- **VR-1 — coverage: the window clause of the cap basis is untested by the shipped suites.** MV-7 (basis taken from *all* observations instead of `windowObservations`, i.e. out-of-window and future sessions included) leaves all ten strength unit files green; no shipped fixture has a heavier out-of-window session. The behaviour is correct (this verification's fixture with a 150 kg session 100 days old, and the reference-equivalent fuzz). Suggested test: the fixture above.
- **VR-2 — coverage: "compares the cap UNROUNDED" does not discriminate.** Its own comment admits the 121.01 / 121.03 pair passes under a rounded cap too, and MV-10 (`raw > round2(cap)`) leaves the suite green. A discriminating pair exists on 2-decimal loads — basis 110.05 (exact cap 121.055, rounded 121.06) with raw 121.06 — and is asserted here. The implementation is unrounded; only the test's claim is weaker than its name.
- **VR-3 — the cap runs before the finite guard.** With a cap basis present, a non-finite `currentE1rmKg` (`+Infinity`) is capped into `status: "ok"` (load 120 on the E14 basis) with `rawLoadKg` non-finite on the DTO, where A-18 asks for a refusal; `NaN` still refuses, and without a basis `Infinity` still refuses. The step order follows §9.5 literally (guard is step 5), and no stored data can produce a non-finite e1RM (loads are `numeric(6,2)`, reps ≤ 100). Informational; a one-line guard on the pre-cap value would close it.

The owner decision that F-2's cap applies to the calculator is recorded so far only in the remediation report and the code comments; recording it in the revision (§15.1/§9.5) or ADR-011 is a documentation follow-up, not a code finding.

---

## 6. Mutation controls

Exact-string mutations (aborting unless the target occurs exactly the expected number of times), the ten strength unit files or the strength integration file run, the file restored from saved bytes and SHA-256-checked. "Mine" = this verification's fixture script, run under the same mutation.

| Mutation | Shipped suites | Mine |
| --- | --- | --- |
| MV-1 (F-1) unconfirmed threshold re-rounded | **caught** (1) | — |
| MV-2 (F-1) `spreadPct` re-rounded | **caught** (4) | — |
| MV-3 (F-1) comparisons use the rounded DTO field | **caught** (2) | — |
| MV-4 (F-2) cap disabled | **caught** (8) | 7 fixtures fail |
| MV-5 (F-2) deload observations in the basis | **caught** (1) | 1 fails |
| MV-6 (F-2) excluded groups in the basis | **caught** (1) | 1 fails |
| MV-7 (F-2) basis from all observations, not the window | **survived** (10/10 green) → VR-1 | 1 fails |
| MV-8 (F-2) `rawLoadKg` reported post-cap | **caught** (4) | 5 fail |
| MV-9 (F-2) band from the pre-cap value | **caught** (1) | 1 fails |
| MV-10 (F-2) cap compared rounded | **survived** → VR-2 | 1 fails |
| MV-11 (F-2) code put back on the deferred list | **caught** (2) | — |
| MV-12 (F-5) id guard removed | **caught** (integration, 1) | — |
| MV-13 (F-3) old copy restored | **caught** (1) | — |
| MV-14 (F-4) old band note restored | **caught** (1) | — |
| **Build-level** (F-6 + F-7): `StrengthScreen.tsx` with the reasons moved after Best and the button at its old 24 px sizing → `pnpm build` → server restarted → `strengthPage.spec.ts` | **2 failed / 1 passed** — the height assertion (`:180`) and the placement assertion (`:220`) | — |

All nine mutated source files were restored with identical SHA-256; after the build-level control the source was restored, rebuilt (`Compiled successfully`), the server restarted on the restored build and the strength spec re-run: 3 passed.

---

## 7. No Release B, no unrelated architecture change

- Release-B identifiers (`suggestStartingLoad`, `startingSuggestion`, `resolveCarryForwardCandidate`, `carryForwardRepBasis`) occur nowhere in `src/` outside comments; `TodayBundleExerciseEntry` / `…Dto` unchanged; no **Use** control and no "Starting suggestion" text on the live workout card; `RELEASE_B_ONLY_REASON_CODES` has 18 members and the reachability test fails in both directions if one moves (MV-11).
- The sync schema and service, the client sync module, progression, today, the service worker, the DB schema, migrations, seeds, `package.json` and the lockfile are byte-identical to the reviewed state; the boundary suite (`strengthBoundary.test.ts`, 24 tests) is green; no new import crosses §14.5.
- The calculator's cap is a translation rule applied to a labelled, banded, read-only display — it writes nothing, reaches no prefill, decision, bundle or outbox, and the only new emitter is `computeWhatIf`.

---

## 8. Working-tree impact

Created: `docs/reviews/estimated-1rm-release-a-remediation-verification.md` (this file). **Nothing else in the repository was created, modified, staged, formatted, reverted, or deleted**: the 578-file SHA-256 listing taken before this pass matches the listing taken after all work, line for line. Every mutated file — `estimate.ts`, `primitives.ts`, `whatIf.ts`, `report.ts`, `reasonCodes.ts`, `service.ts`, `copy.ts`, `StrengthScreen.tsx` — was restored from saved bytes with hash verification; `.next/` was rebuilt from the restored source and, with `test-results/`, is a gitignored artefact. All pre-existing and concurrent changes — the Release A change set, the remediation, the review, the other reports of this lineage, `CLAUDE.md`, the deleted `HANDOFF.md`, the architecture/evidence/input/research-note documents, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md` — are exactly as found.

Databases: `gymapp_e1rm_remver` was created on the local Docker PostgreSQL 16 for this pass and **dropped**; the development database `gymapp` was not read, migrated, seeded or written (row counts identical: users 1, exercises 106, sessions 649, set_logs 841, migrations 11); the remediation's `gymapp_e1rm_remediation` and the earlier `gymapp_e1rm_verify` were left as found; production was never contacted. The production server started for the probes was stopped (port 3000 free). Scratch artefacts (reference implementation, fuzz, fixtures, mutation scripts, probes, logs, screenshots) live in the session scratchpad outside the repository. No commit, push, tag, or deployment.

---

# `VERIFIED — READY FOR DEVICE ACCEPTANCE` — all seven findings remediated and pinned; three Low notes (two test-coverage gaps, one unreachable guard-order quirk), none requiring a change before device acceptance
