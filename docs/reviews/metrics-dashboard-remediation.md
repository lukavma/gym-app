# Metrics Dashboard v1 / Phase 9a — Remediation Report

Date: 2026-09-06
Role: remediation of every actionable finding in `docs/reviews/metrics-dashboard-review.md` (independent adversarial review, verdict `READY FOR REMEDIATION`), against the binding specification `docs/reviews/metrics-dashboard-architecture-evaluation.md`. The review itself was **not modified** — read-only reference throughout.
Baseline: the working tree exactly as the review left it (§12), on top of `main` @ `1282795`.

---

## 1. Scope and constraints honored

- Every finding in the review's §3 table (H-1, M-1…M-6, L-1…L-13 — 20 findings) is addressed below, each mapped to its code change (if any), its regression test, its negative-control evidence (where one is meaningful), and its final verification result.
- O-1 through O-11, the accepted Phase 9a scope, and every protected boundary (`progression`, `sync`, `strength`, `volume`, `history`, `today`, `sw.ts`, `next.config.ts`, migrations 0000–0011) are untouched — confirmed by an empty `git diff --stat` over those paths (§7).
- No assertion was weakened to make a test pass. Every regression test added or corrected was proven non-vacuous by a genuine negative control: the specific production-code fix was temporarily reverted, the exact test was run and confirmed to **fail**, then the code was restored byte-for-byte and re-verified passing. Where a negative control would be meaningless (documented per-finding below), that is stated explicitly rather than skipped silently.
- No commit, push, deploy, production contact, iPhone acceptance, or the deferred PI-004 post-device edit was performed.
- All unrelated pre-existing working-tree changes (`CLAUDE.md`, the `HANDOFF.md` deletion, `HANDOFF(depracted).md`, `.claude/skills/`, `docs/input/product-ideas.md`, the other `docs/reviews/*` and `docs/architecture/*` files, `gpt-handoff.md`, `gpt-memory.md`) are untouched.

---

## 2. Finding-by-finding map

### H-1 (HIGH) — `/metrics/exercises` scrolls horizontally at 320 px, unbounded with exercise-name length

**Code change** — `src/ui/metrics/SelectionEditor.tsx`:
- Candidate row: `<label class="flex min-w-0 flex-1 flex-col …">` (was missing `min-w-0`), `<select class="min-h-11 w-full …">` (was missing `w-full`), `Add` button gets `shrink-0`.
- Selected row: name `<span>` wrapped in `flex min-w-0 flex-1 items-center gap-2 …` with an inner `min-w-0 flex-1 truncate` span; the archived badge and the Up/Down/Remove button group both get `shrink-0`.

**Regression test** — e2e, `tests/e2e/metrics.spec.ts`, `"H-1 / M-6: editor geometry, controls and announcements hold at both 320x568 and 390x844, including a candidate with a ≥50-character name"`. Creates 4 short-named exercises plus one ≥50-char name, checks `document.documentElement.scrollWidth ≤ viewport.width` after **every** add, at both 320×568 and 390×844.

**Negative control** (executed pre-compaction, re-confirmed still in place this pass): reverting `min-w-0`/`w-full` reproduced a `scrollWidth` of **642 px at a 320 px viewport** (vs. the fix's ≤320 px), an unambiguous, large margin — not a marginal/flaky difference. Restored; re-verified passing.

**Verification**: passes in the final full Playwright run (§6).

---

### M-1 (MEDIUM) — Weekly volume card never renders the current week's deload flag

**Code change**:
- New file `src/ui/metrics/DeloadBadge.tsx` — the shared amber badge markup, extracted so `VolumeCard` and `TrainingCard` render byte-identical badges.
- `src/ui/metrics/VolumeCard.tsx` — both column headers now read their own week's `isDeload` (`thisWeek?.isDeload` was never consulted before) and render `<DeloadBadge />` conditionally, replacing the previous last-week-only, unstyled-string behavior.
- `src/ui/metrics/TrainingCard.tsx` — switched to the shared `DeloadBadge` component for consistency (was its own inline markup, behaviorally identical but now guaranteed byte-identical to Volume's).

**Regression test** — e2e, `"M-1: an in-progress deload session badges the CURRENT week's own Volume column, with the shared amber badge markup"`. Inserts an in-progress deload session dated today directly via the DB, checks the Volume card's **current**-week column (scoped via `.filter({ has: page.getByRole("heading", { name: "Weekly volume", exact: true, level: 2 }) })`, not `hasText`, to avoid a substring collision with the Estimates card's reused "...last 90 days of training." sentence) shows the badge.

**Negative control**: reverting `VolumeCard.tsx` to read only `lastWeek?.isDeload` reproduced the review's exact defect — the current-week column's badge disappeared — and the M-1 test failed. Restored; re-verified passing.

**Judgment call**: the test originally also asserted a Training-card **negative** ("no Deload text anywhere in Training's current week"). This had to be dropped — the shared, long-lived e2e dev account carries genuine, unrelated historical deload-flagged completed sessions from other specs (e.g. `deload.spec.ts`) that legitimately fall in past or current weeks shown by the Training card, making a blanket "no Deload anywhere" assertion unreliable regardless of this fix. The kept Volume-side **positive** assertion still catches the actual regression on its own: reverting the fix makes the current-week badge disappear regardless of what other data exists, which the negative control above confirms directly.

**Verification**: passes in the final full Playwright run.

---

### M-2 (MEDIUM) — Selection editor's read endpoint runs an unbounded all-time fact query for a value the UI discards

**Code change** — root-cause fix, not symptom suppression:
- `src/server/metrics/selectionService.ts` — `queryAllTimeFactRows` renamed `queryWindowedFactRows`, now takes `startInstant`/`endExclusiveInstant` and adds `gte(workoutSessions.startedAt, …)` / `lt(workoutSessions.startedAt, …)`, bounding it to `[instant(D−89), instant(D+1))` — the exact window `getMetricsDashboard`'s step 9 already uses. `SelectionMetadataRow` gained `loadStepKg` (see L-13).
- `src/ui/metrics/SelectionEditor.tsx` — `EditorRow` gained a `state` field; a new `editorStateNote()` helper renders the refusal copy for `not_available`/`turned_off` under each row (§11.5's stated purpose for the field).

**Root-cause judgment**: the review presented two options — bound the query and render the state, or drop the field and the query. Dropping the field would have violated the binding spec's explicit contract (§11.5 requires `SelectionRowDto.state` "so the editor can show why a row has no estimate"), so the spec-compliant path was taken: both bound the query **and** actually render the state.

**Regression test** — integration, `tests/integration/metricsSelection.integration.test.ts`, `"M-2: getSelection's fact query is bounded in time, exactly like the dashboard's own step 9 — no statement scans all-time"`. Captures the SQL statement log via `createTestDbWithStatementLog`, asserts the fact query carries both `started_at` bounds and that the selection-metadata query selects `load_step_kg`.

**Negative control**: reverting the two bound predicates in `queryWindowedFactRows` made the M-2 test fail (missing `started_at` bounds in the captured statement text). Restored; re-verified — **15/15** tests pass in `metricsSelection.integration.test.ts`.

**Verification**: passes; also covered end-to-end by the M-5 and A-33 e2e tests, which exercise the editor's rendered refusal text on real `not_available`/`turned_off` rows.

---

### M-3 (MEDIUM, test defect) — A-12's boundedness clause was never asserted

**No production defect** — the review independently verified the property already holds; this closes a real coverage gap.

**Regression test** — integration, `tests/integration/metrics.integration.test.ts`, `"M-3 / A-12: every fact-table statement is bounded by its own predicate or by an id list from one, and step 9 carries user_id"`. Inspects the captured SQL **text** of every `workout_sessions`/`set_logs`/`bodyweight_entries`/`recovery_entries` statement for a `started_at`/`date` bound or a bounded id list, and step 9 specifically for `user_id` + both instant bounds + the exact contractual `ORDER BY`.

**Negative control**: temporarily removed the two `started_at` bounds from step 9's query (`queryStrengthFactRows` in `src/server/metrics/service.ts`), ran the test — it failed, printing the exact unbounded statement text in the assertion message (`expected false to be true`). Restored; re-verified — **20/20** tests pass in `metrics.integration.test.ts`.

*(This is the same false-positive-fingerprint pitfall documented earlier in this project: an early version of this exact test used `.includes('"session_exercises"."exercise_id"')`, which also matched the volume query's unrelated JOIN condition; the final assertion requires the WHERE-clause `IN (` form specifically.)*

---

### M-4 (MEDIUM, test defect) — A-1's `weekStartsOn = 0` and `Pacific/Kiritimati` clauses were untested at the metrics level

**No production defect** — verified already correct.

**Regression tests** — integration, two new tests in `metrics.integration.test.ts`:
1. `weekStartsOn = 0` (Sunday) — asserts the exact eight Sunday-anchored window start dates through the real service, not just the reused `calendarWeekWindows` unit.
2. `Pacific/Kiritimati` (UTC+14) — asserts `asOfLocalDate`, the training week's start date, session count, and the "future guard applies to strength too" case (holding `D` at the prior UTC day yields `no_current_estimate`).

**Negative control**: temporarily hardcoded `service.ts`'s step-1 read to ignore the account's stored `timezone`/`weekStartsOn` (`const timezone = "UTC"; const weekStartsOn = 1;`). Both new tests failed exactly as expected (`expected 1 to be +0`; `expected 'UTC' to be 'Pacific/Kiritimati'`). Restored; re-verified — **20/20** tests pass.

---

### M-5 (MEDIUM, test defect) — The e2e test named for A-17's "No current estimate" clause asserted the opposite

**No production defect** — all three refusal strings already render correctly; only the test was wrong.

**Fix**: the mis-titled test (previously logged a session 5 days ago with work sets, then asserted `toContainText("est.")` — exercising the `estimate` state, not `no_current_estimate`) was renamed and rewritten as `"A-18 / L-6: a selected exercise WITH a current estimate renders the full '≈ … (likely …) est.' composition and links to the detail page"`, now correctly asserting the `estimate` state it actually exercises (exact string `"≈ 122.5 kg (likely 110–137.5) est."`, plus all 14 required §15 sentences via `body.innerText()`).

**Regression test** — new e2e test, `"M-5: all three non-estimate row states render in the DOM (no_current_estimate, not_available, turned_off)"`: three exercises are selected while eligible, two are then degraded (`equipment → bodyweight`, `strengthEstimate → off`) so the "already-selected exemption" (§11.5) keeps them visible; asserts each row shows its distinct refusal text.

**Negative control**: temporarily collapsed `EstimatesCard.tsx`'s `not_available`/`turned_off` cases to render the same text as `no_current_estimate`. The M-5 test failed with the exact expected-vs-received text mismatch (`Received string: "…No current estimate"` where `"Not available for this equipment type"` was expected). Restored; re-verified passing.

---

### M-6 (MEDIUM, test defect) — Five A-33 editor clauses were unasserted

**No production defect** — all five hold correctly; the missing 320×568 measurement is what let H-1 through.

**Regression test** — folded into the same `"H-1 / M-6"` e2e test as H-1 (both concern the editor's geometry/controls at both viewports): the limit message replacing the `<select>` at 5 rows, `Up` disabled on the first row / `Down` disabled on the last, every `ol button` **and** Save clearing 44 px at both 320×568 and 390×844, and the `role="status"` position announcement text after a move.

**Negative control**: temporarily shrank the Save button below 44 px (`min-h-6` / `py-1`, was `min-h-11` / `py-3`). The test failed exactly on the 44 px assertion (`Expected: >= 44, Received: 32`). *(A first attempt shrank one row button instead; that mutation was invisibly absorbed by the row's flex container defaulting to `align-items: stretch`, so the shrunk button was stretched back to the tallest sibling's height and the test still passed — a real flexbox gotcha, not evidence the test is vacuous. Switching the mutation to the Save button, whose flex-col container does not stretch it against a sibling, produced the expected failure.)* Restored; re-verified passing.

---

### L-1 (LOW) — The sparkline's text alternative disappears below two entries

**Code change** — `src/ui/metrics/Sparkline.tsx`: `showChart = points.length >= 2` now gates only the `<svg>` block; the `<p>{label}</p>` text alternative always renders.

**Regression test** — new e2e test, `"L-1: the sparkline's text alternative still renders with fewer than 2 bodyweight entries"`: clears the account's bodyweight history, inserts exactly one entry, asserts zero `svg[aria-hidden='true']` elements **and** the `"90 days · 1 entr…"` text line is visible.

**Negative control**: temporarily wrapped the `<p>` in the same `showChart` conditional (so it disappears too). The test failed (`element(s) not found`). Restored; re-verified passing.

---

### L-2 (LOW) — Sign and unit slips in the bodyweight card

**Code change**:
- `src/ui/metrics/format.ts` — `formatSignedKg` (already defined, previously imported nowhere) is now actually used by `BodyweightCard.tsx` for the 30-day change.
- `bodyweightSummaryLine` — moved out of `BodyweightCard.tsx` (a `.tsx` component) into `format.ts` as a pure function, and its "highest" fragment now carries `" kg"` (previously the only value in the line missing its unit).

**Judgment call**: this project has no React-component-testing harness (no `@testing-library`, no jsdom config in `vitest.config.ts` — UI behavior is otherwise only verified through Playwright). `bodyweightSummaryLine` has zero actual React/JSX dependency, so it was relocated into the existing pure-formatters module rather than tested through a full e2e page load — the same pattern already established for `formatSignedKg` itself and for `@/ui/strength/format`, which unit tests already import directly (`tests/unit/strengthCopy.test.ts`).

**Regression test** — new unit test file, `tests/unit/metricsFormat.test.ts` (5 tests): `formatSignedKg` sign cases (gain, loss, zero); `bodyweightSummaryLine`'s exact full-string output including `"highest 85 kg"`, and its empty-series fallback.

**Negative control**: temporarily reverted `formatSignedKg`'s sign to always empty, and dropped `" kg"` from the "highest" fragment. Both tests failed with exact expected-vs-received diffs (`'0.6 kg'` vs `'+0.6 kg'`; missing trailing `" kg"` on `"highest 85"`). Restored; re-verified — **5/5** pass.

---

### L-3 (LOW) — User-facing strings outside `copy.ts`

**Code change**: every flagged literal moved into `src/ui/metrics/copy.ts` — `editorSaveGenericError`, `deloadBadge`, `volumeColumnHeading`, `volumeBackRow`, `volumeUnclassifiedBack`, `recoveryColumnDay`, and the bodyweight-summary fragments (`bodyweightSummaryNoEntries`/`EntriesWord`/`First`/`Lowest`/`Highest`).

**Regression coverage**: no new test was needed — the existing copy-scoped ban-scan (`tests/unit/metricsCopy.test.ts`) already scans every key in `copy.ts` for the banned substrings (`badge`, `target`, `score`, `trend`, `goal`, `fatigue`, …); moving these strings into the module places them under that scan automatically, closing exactly the gap §15 claims and the review found open. **No negative control performed** for this finding specifically — it is a location-only change with no new logic; the coverage guarantee comes from the pre-existing scanner now reaching these keys, not from a new assertion whose own correctness needs proving.

---

### L-4 (LOW) — A non-network fetch failure discards the dashboard with no retry

**Code change** — `src/ui/metrics/MetricsScreen.tsx`: added `refetchError` state and a `hasDataRef`. A refetch's `!res.ok` now only falls back to the blank error screen when there is no data yet; otherwise it keeps the rendered dashboard and shows a dismissable banner (`refetchErrorBanner` copy).

**Regression test** — new e2e test, `"L-4: a non-network refetch failure (401, session expired) keeps the rendered dashboard and shows a refetch-error banner, not a blank error screen"`.

**Judgment call / errata**: the first version of this test used `page.route("**/api/metrics", …)` to mock an HTTP 500 on the refetch. This proved unreliable: it passed in isolation but the banner text never actually appeared, because this app's service worker (`src/app/sw.ts`) applies a `NetworkFirst` strategy to every non-excluded `/api/*` GET, and the SW's own internal `fetch()` call (made from within the SW's execution context) is not something Playwright's `page.route()` can intercept — the mocked response never reached the client. The test was rewritten to use the same technique already established in `sync-auth-expiry.spec.ts`: `context.clearCookies({ name: "gym_app_session" })` between the initial load and the Refresh click, forcing a **genuine** 401 from the real server with no network mocking involved.

**Negative control**: temporarily reverted `MetricsScreen.tsx` to the pre-remediation behavior (`setStatus("error")` unconditionally on any non-ok response). The rewritten test failed as expected (banner text not found). Restored; re-verified passing.

**Observed flake (disclosed, not fixed)**: in one full 112-test cross-file Playwright run, this specific test failed with a timeout ("element not found"); it passed immediately both in isolation and in an immediate full-suite rerun (112/112, see §6). Recorded as an environment-timing flake — not attributed to the fix or the test — since it was not reproducible.

---

### L-5 (LOW, test defect) — A-16's `satisfies MetricsDashboardDto` is vacuous on `JSON.parse`'s `any`

**Fix** (already in place pre-compaction, confirmed unchanged): `tests/integration/metrics.integration.test.ts` replaced the vacuous `satisfies` with an explicit `as MetricsDashboardDto` cast plus concrete `typeof`/`Array.isArray` runtime checks on every top-level field and nested array (`training.weeks`, `strength.selection`, `volume.weeks`, `recovery.days`). No dedicated negative control was re-run in this pass — the fix's non-vacuousness is structural: a `satisfies` on `any` can never fail by construction, whereas an explicit runtime `typeof`/array check necessarily can, so the class of defect the original finding described (a check that cannot fail) is inherently absent from the replacement.

---

### L-6 (LOW, test defect) — A-20's estimate-string clause and the required sentences were unasserted

**Fix**: folded into the rewritten `"A-18 / L-6"` e2e test (see M-5) — asserts the exact rendered string `"≈ 122.5 kg (likely 110–137.5) est."` and all 14 required §15 sentences via `body.innerText()`, rather than the copy-module constants alone.

---

### L-7 (LOW, test defect) — A-17's sparkline `aria-hidden`/text-line and table-header clauses were unasserted

**Fix**: new e2e test, `"L-7: the sparkline is aria-hidden with a following text line, and the volume/recovery tables carry column headers"` — asserts exactly one `svg[aria-hidden='true']`, the `/90 days · \d+ entries/` text line, `th[scope='col']` count ≥ 8, `th[scope='row']` count ≥ 1.

---

### L-8 (LOW, test defect) — A-21 omitted the `recommendations` claim; an unused allowlist specifier

**Fix**: removed `@/domain/strength/estimateMode` from `ALLOWED_OUTSIDE_SPECIFIERS` in `tests/unit/metricsBoundary.test.ts` (confirmed unused via grep across every metrics file). Added a new describe block asserting no metrics file's code (comments stripped) mentions the string `"recommendations"`, while `server/progression/service.ts` (a file that legitimately does reference it) is asserted to still contain it — a sanity check that the scan itself is capable of detecting the string it's meant to catch.

---

### L-9 (LOW, test defect) — A-6(c) was not re-derived at the metrics query's own `ORDER BY`

**Fix**: new integration test constructing raw sync ops with the **same** `exerciseId` at two `session_exercises` positions (0 and 1) in one session (140 kg×3@RIR1 and 100 kg×8@RIR2), then comparing `metrics.strength.selection[0]`'s fields against `getExerciseStrengthReport`'s own detail-endpoint output for the identical fixture — re-deriving the property through the metrics query's own contractual `ORDER BY` rather than only the pure pipeline's.

---

### L-10 (LOW, report accuracy) — A-25's fixture was ~4× lighter than §20 step 2's stated shape

**Fix**: `scripts/metricsPerformanceFixture.ts` — `EXERCISES_PER_SESSION` changed from `2` to `8`, matching §20 step 2's stated "≈ 5 sessions/week × 8 exercises × 5 sets".

**Re-measurement**: regenerated against a fresh disposable database (`gymapp_metricsperf_l10`, created, migrated, dropped after) — **780 sessions, 6,240 session_exercises, 31,200 set_logs** (matches the review's own re-run shape exactly). Measured **p95 = 43.56 ms** (min 36.93, p50 39.79, max 45.56) over 30 calls to `getMetricsDashboard`, consistent with the review's own independent re-measurement of 44.97 ms at this same shape — both comfortably under the 100 ms local budget.

---

### L-11 (LOW, report accuracy) — README's Phase 9a sentence sits in a paragraph that still says Phase 6 is unbuilt

**Fix**: `README.md` — the Phase 9a sentence is now its own paragraph, separated from "Volume tracking (Phase 6) is not yet built." The pre-existing Phase 6 staleness itself (evaluation finding F-2) is deliberately left as-is — out of scope per the review's own framing ("the report correctly identifies the staleness as pre-existing").

---

### L-12 (LOW, report accuracy) — §11.5's "only `updated_at` moves" is imprecise

**Fix**: a code comment above the delete-then-insert in `replaceSelection` (`selectionService.ts`) documents that `created_at` is re-defaulted too, and that this is harmless because neither column appears in any read DTO. No test was added — nothing observable changes; this is a documentation-accuracy correction, not a behavior fix.

---

### L-13 (LOW) — `toSelectionRowDtos` hard-coded `loadStepKg: 1`

**Code change**: `SelectionMetadataRow` gained `loadStepKg` (selected from `exercises.loadStepKg`); `deriveStrengthReport` is now called with the real `loadStepKg` instead of a hardcoded `1`.

**Judgment call — no meaningful negative control is possible**: per the review's own finding, `deriveStrengthReport` only consults `loadStepKg` inside `computeWhatIf`, which this call site never invokes (no `whatIf` is passed) — so the editor's returned `state` is byte-identical whether the value is hardcoded `1` or threaded through correctly. Reverting this fix would not make any existing or new test fail, by the review's own admission ("safe today… nevertheless a silent coupling"). The fix is retained as defensive/forward correctness (removing the silent coupling), and the M-2 and M-4 fixtures both exercise the code path with a non-`1` `loadStepKg` (`2.5`), so if any future change makes the value observable, those fixtures are already positioned to catch a regression.

---

## 3. Non-actionable items

Per the review's own §11, this remediation treats L-5 through L-9 (test strengthening) and L-10 through L-12 (report/doc accuracy) as "worth correcting in the record" — all addressed above — and confirms none of M-3 through M-6 masked a live product defect, consistent with the review's own framing.

---

## 4. Test counts

| Suite | Before this remediation (review's own baseline) | After remediation |
|---|---|---|
| Unit (`pnpm test:unit`) | 60 files / 836 tests | **61 files / 842 tests** |
| Integration (`pnpm test:integration`) | 25 files / 354 passed, 16 skipped | **25 files / 359 passed, 16 skipped** |
| Concurrency (opt-in, real Postgres) | 1/1 passed | **1/1 passed** (re-run against a fresh disposable database, `metricsSelectionConcurrency.integration.test.ts`) |
| Playwright (`pnpm exec playwright test`, full suite) | 106/106 passed | **112/112 passed** |

New tests added in this remediation: 1 unit file (`metricsFormat.test.ts`, 5 tests), 1 integration test (M-2), 2 integration tests (M-4), 1 integration test (M-3), 1 integration test (L-9), 1 unit describe block (L-8), plus e2e: M-5, M-1, L-7, L-1, L-4 (new), H-1/M-6 (combined), and the A-18/L-6 rewrite (in place of the mis-titled test) — net +6 e2e tests (106 → 112, since the rewritten A-18/L-6 test replaces the mis-titled one it corrects).

---

## 5. Negative-control summary

| Finding | Mutation | Result before fix | Result after restore |
|---|---|---|---|
| H-1 | removed `min-w-0`/`w-full` | scrollWidth 642 px at 320 px viewport (test fails) | ≤ viewport at both widths (test passes) |
| M-1 | `VolumeCard` reads only `lastWeek?.isDeload` | current-week badge missing (test fails) | both weeks correct (test passes) |
| M-2 | removed the two `started_at` bounds | unbounded statement captured (test fails) | bounded (test passes), 15/15 |
| M-3 | removed step 9's two bounds in `service.ts` | unbounded statement text asserted false (test fails) | bounded (test passes), 20/20 |
| M-4 | hardcoded `timezone="UTC"`, `weekStartsOn=1` | both fixtures mismatch (2 tests fail) | correct (tests pass), 20/20 |
| M-5 | collapsed `not_available`/`turned_off` text | wrong text rendered (test fails) | distinct text rendered (test passes) |
| M-6 | shrank Save button to 32 px | `Expected: >= 44, Received: 32` (test fails) | ≥ 44 px (test passes) |
| L-1 | wrapped text-alt `<p>` in `showChart` | element not found (test fails) | always renders (test passes) |
| L-2 | unsigned `formatSignedKg`; dropped " kg" on "highest" | both assertions fail with exact diffs | both correct, 5/5 |
| L-4 | reverted to unconditional `setStatus("error")` | banner not found (test fails) | banner shown, dashboard retained (test passes) |

L-3, L-5 through L-9, L-10 through L-13: no behavior-changing negative control performed, for the reasons stated per-finding above (location-only change, structural non-vacuousness, documentation-only correction, or a value proven unobservable by the review itself).

---

## 6. Gates re-run

| Gate | Environment | Result |
|---|---|---|
| `pnpm typecheck` | as-is | clean (re-run after every code change in this remediation) |
| `pnpm lint` | as-is | clean (0 problems) |
| `pnpm format:check` | as-is | clean except the pre-existing `src/server/sync/service.ts` CRLF warning (byte-unchanged, confirmed via `git diff`) |
| `pnpm test:unit` | as-is | **61 files / 842 tests passed** |
| `pnpm test:integration` | as-is (PGlite) | **25 files / 359 passed, 16 skipped** |
| Concurrency (opt-in) | fresh `gymapp_remediation_verify`, then re-run standalone | **1/1 passed** |
| Migration `0000`–`0012` from scratch | fresh `gymapp_remediation_verify` | 5-step `drizzle-kit migrate` applied cleanly; `drizzle-kit generate` reports **"No schema changes, nothing to migrate"** (no schema drift) |
| `pnpm build` | production, disposable DB | succeeds; `/metrics` and `/metrics/exercises` static, both API routes dynamic |
| `pnpm exec playwright test` (full suite) | clean disposable `gymapp_remediation_e2e2` (dropped, recreated, migrated, seeded, account created via `smoke.spec.ts`, re-seeded, `tests/e2e/seed.ts`), production server | **112/112 passed** (one earlier full-suite run had a single flaky failure on the L-4 test, not reproducible in an immediate rerun — see L-4 above) |
| A-25 performance at §20 step 2's stated shape | `scripts/metricsPerformanceFixture.ts` (corrected, L-10), fresh `gymapp_metricsperf_l10` | **p95 = 43.56 ms**, 31,200 set_logs rows — matches the review's own 44.97 ms re-measurement at this shape |

All disposable databases created during this remediation (`gymapp_metricsperf_l10`, `gymapp_remediation_verify`, `gymapp_remediation_e2e`, `gymapp_remediation_e2e2`) were dropped after use. `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` returns exactly the six databases present before this remediation began (`gymapp` plus five unrelated databases from earlier, unrelated sessions, neither created nor touched here). No production database was contacted at any point.

---

## 7. Working tree

`git diff --stat` over every protected-boundary path (`src/{ui,server,domain}/progression`, `src/{ui,server,domain,}/sync`, `src/app/sw.ts`, `next.config.ts`, `src/{ui,server,domain}/strength`, `src/server/volume`, `src/domain/volume`, `src/server/history`, `src/server/today`, and migrations `0000`–`0011`) is **empty**. All unrelated pre-existing uncommitted changes are byte-unchanged from before this remediation began. Files touched by this remediation, beyond the metrics-dashboard implementation's own files: `README.md` (L-11) and `scripts/metricsPerformanceFixture.ts` (L-10) only.

---

## 8. Judgment calls (consolidated)

1. **M-2** — rendered `state` in the editor *and* bounded the query, rather than dropping the field, because the binding spec's §11.5 explicitly requires it.
2. **M-1** — dropped the e2e test's Training-card negative assertion (ambient historical deload data in the shared e2e account makes it unreliable); kept the Volume-side positive assertion, which independently catches the regression.
3. **M-6** — the negative control's first target (a row button) was invisibly absorbed by CSS flexbox `align-items: stretch`; retargeted to the Save button, whose container does not stretch it.
4. **L-2** — relocated `bodyweightSummaryLine` out of a `.tsx` component into the pure `format.ts` module so it could be unit-tested directly, absent any React-component-testing harness in this project.
5. **L-3** — no dedicated negative control; coverage comes from the pre-existing copy-scan test now reaching the relocated strings.
6. **L-4** — the original route-mocking test design was invalid against this app's service worker (`NetworkFirst`'s own internal fetch bypasses `page.route()`); rewritten using the established session-cookie-clearing technique instead.
7. **L-4** — one full-suite run had a single non-reproducible flaky failure; disclosed rather than suppressed or retried away.
8. **L-13** — no negative control is possible; the review itself established the value is currently unobservable. Fixed as defensive correctness only.

---

READY FOR TARGETED REMEDIATION VERIFICATION

---

## 9. Follow-up — 2026-09-07 (RV-1 correction)

This section corrects two claims in §4/§6/§8 above and closes the one item the independent verification (`docs/reviews/metrics-dashboard-remediation-verification.md`, 2026-09-06, verdict `REMEDIATION INCOMPLETE`) found outstanding: **RV-1**. The original text above is left exactly as submitted — this is an addendum, not an edit.

**What was wrong.** §4's `112/112 passed` and §6's same figure, and the L-4 judgment call (§8 item 7) calling the one observed failure "a single non-reproducible flaky failure," were both incorrect as general claims. The verification reproduced the L-4 test failing in **4 of 5** whole-file/whole-suite executions and identified the exact mechanism: this app's rolling session (`touchSessionInMiddleware`, ADR-004) re-issues `Set-Cookie` on every request middleware sees as authenticated, and `/metrics`'s own nav bar triggers Next.js's automatic `<Link>` prefetching of every other route (plus "Choose exercises") on mount — an unrelated background prefetch already in flight when the test's `context.clearCookies()` ran could still land afterward and restore a valid session before the Refresh click's own fetch went out. Before applying the fix below, this session independently reproduced the identical failure (`expect(received).toBe(401)`, `Received: 200`) multiple times under `--repeat-each` stress on the unmodified test, confirming RV-1's finding directly and disproving both the "112/112" and "not reproducible" characterizations.

**The fix.** `tests/e2e/metrics.spec.ts`'s L-4 test now runs in a dedicated `browser.newContext({ serviceWorkers: "block" })` with a `page.route("**/*")` handler that `continue()`s only the exact requests this test's own flow needs (auth, static assets, `/`, `/login`, `/today`, `/metrics`, `/api/metrics`, `/api/active-session`, `/api/today-bundle`) and `abort()`s everything else — chiefly the nav-bar prefetches that were the confound. An aborted request never receives a response, so nothing about it can reach the cookie jar; blocking the service worker is necessary because this test's `/metrics` navigation is a second top-level navigation within one test (login → /today → /metrics), which an already-active worker from the first navigation takes over without a reload (`clientsClaim: false`, traced directly: a request visible to `page.route` before that point is invisible after it), and an un-seen request can't be intercepted regardless of what the handler would do with it.

A first attempt relayed non-essential responses through `route.fetch()` + `route.fulfill()`, stripping `Set-Cookie` before fulfilling the page. That still raced, for a subtler reason than the original bug: `route.fetch()` shares the browser context's cookie jar and applies a response's `Set-Cookie` to it immediately on receipt, as part of faithfully replaying the request — independent of, and before, whatever the handler goes on to fulfil the page with. Stripping the header from the fulfilled response only ever hid it from the page; the jar had already been updated. Traced directly: `context.cookies()` read a different session value immediately after `clearCookies()`, with the mutation attributable to a specific in-flight prefetch's `route.fetch()` call, not to anything the fulfilled response carried. This is recorded because it is the kind of near-miss that looks fixed under light testing (it did pass the majority of stress runs) while remaining structurally the same race — the working fix does not relay confounding traffic through the network layer at all.

**Verification — deterministic, not merely "usually green."** Against a fresh disposable database and a production build:

| Run | Result |
|---|---|
| L-4 alone, `--repeat-each=20` | 20/20 |
| `metrics.spec.ts` full file, `--repeat-each=8` (104 tests) | 104/104 |
| `metrics.spec.ts` full file, `--repeat-each=10` (130 tests) | 130/130 |
| Full Playwright suite, run 1 | **112/112** |
| Full Playwright suite, run 2 | **112/112** |
| `metrics.spec.ts` full file, `--repeat-each=10`, after the negative control below was restored | 130/130 |
| Full Playwright suite, after restore | **112/112** |

Total: the fixed test passed on every one of roughly 50 executions across these runs, including the exact whole-file and whole-suite conditions RV-1 used to surface the race.

**Negative control.** The fix was reverted to the original `context.clearCookies()`-only implementation (no dedicated context, no route handler) and re-run under the same `metrics.spec.ts --repeat-each` stress. It passed 104/104 on one run, then failed on the next (`--repeat-each=10`, repeat 9 of 13, 129/130 passed elsewhere) with the identical signature: `Expected: 401, Received: 200`. This reproduces RV-1's own finding and confirms the fix is load-bearing rather than coincidentally correlated. The reverted code was then restored byte-for-byte and re-verified passing (130/130, then 112/112 on the full suite) before this addendum was written.

**Corrected test counts.** The Playwright full-suite total is unchanged at **112/112** — no test was added or removed, only the L-4 test's implementation. The correction is to how that number should be read: it is now a genuinely deterministic result (confirmed across ~50 executions, including the specific stress conditions that previously produced ~1-in-5 failures), not a single lucky run. Unit (61 files / 842 tests) and integration (25 files / 359 passed, 16 skipped) are unaffected by this follow-up and unchanged from §4/§6.

**Not touched, per scope.** `docs/reviews/metrics-dashboard-remediation-verification.md` was not modified. No other finding, owner decision, or protected boundary was revisited. The secondary observations at RV's §5 (the "1 entries" plural, L-3's residual inline fragments, the M-1 test's title-vs-assertion gap, the "14 sentences" miscount, the L-4 judgment call's service-worker mis-diagnosis at §5.5 — corrected implicitly by this addendum's accurate mechanism description above — and the two bodyweight-wiping tests) remain open and explicitly out of scope for this pass, consistent with the review's own framing of them as non-blocking.

READY FOR SECOND TARGETED REMEDIATION VERIFICATION
