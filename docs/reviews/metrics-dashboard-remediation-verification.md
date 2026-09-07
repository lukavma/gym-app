# Metrics Dashboard v1 / Phase 9a — Targeted Remediation Verification

Date: 2026-09-06
Role: independent verification of `docs/reviews/metrics-dashboard-remediation.md` against the actual working tree and the binding specification `docs/reviews/metrics-dashboard-architecture-evaluation.md`. Scope: every finding of `docs/reviews/metrics-dashboard-review.md` (H-1, M-1 … M-6, L-1 … L-13), plus regression of the owner decisions, protected boundaries and unrelated behaviour.
Method: read-only with respect to the implementation. No source, test, migration or existing report was modified; no commit, push, deploy, production contact or device acceptance was performed. Reported results were re-derived, not accepted: every fix was re-measured with my own fixtures, and each regression test was checked for discrimination rather than mere presence.
Baseline: the tree as the remediation left it, on `main` @ `1282795`. Both prior reports are byte-intact (`metrics-dashboard-architecture-evaluation.md` 864 lines, `metrics-dashboard-implementation.md` 213 lines, `metrics-dashboard-review.md` 364 lines ending `READY FOR REMEDIATION`).

---

## 1. Verdict

# `REMEDIATION INCOMPLETE`

**Every product finding is genuinely fixed, and I verified each one independently.** H-1's overflow is gone across 320–430 px and the fix is provably load-bearing; M-1's current-week deload badge now renders with the shared amber markup; M-2's editor query is time-bounded *and* the `state` it computes is finally rendered; M-3/M-4/M-5/M-6's coverage gaps are closed with assertions that discriminate; L-1 … L-13 are addressed. No owner decision, protected boundary, statement-count contract, or unrelated behaviour regressed.

One item blocks the verdict, and it is the remediation's own new test:

- **RV-1 (MEDIUM, test defect)** — the **L-4 regression test is racy and fails roughly half of all full-suite runs**. I reproduced it four times across five whole-file/whole-suite executions on a clean disposable PostgreSQL 16 with a production build: **111 passed / 1 failed, twice in a row** on the complete suite. The remediation report states **112/112** and characterises the failure as "a single non-reproducible flake … an environment-timing flake". Both statements are wrong, and I identified the exact mechanism (§4): the test clears a session cookie that this app's own rolling session re-issues, so its assertion holds only when it wins a race. A regression test that passes by winning a race does not protect the behaviour it names, and the feature's stated acceptance gate ("full Playwright suite green") does not currently hold.

The product behaviour L-4 describes is correct and deterministic — I proved it 8/8 with a settle window and 10/10 in isolation, with a real `401` observed every time. So the residual work is narrow: make the L-4 test's premise deterministic, and correct the report's test-count and flake claims. Nothing else is outstanding, and nothing about the running application is unsafe for device acceptance once that gate is honest.

---

## 2. What I ran

| Check | Environment | Result |
|---|---|---|
| `pnpm typecheck`, `pnpm typecheck:sw` | as-is | clean |
| `pnpm lint` | as-is | clean (0 problems) |
| `pnpm format:check` | as-is | fails only on `src/server/sync/service.ts`, `git diff 1282795` byte-unchanged — the known pre-existing CRLF condition |
| `pnpm test:unit` | as-is | **61 files / 842 tests passed** (matches the report) |
| `pnpm test:integration` | as-is (PGlite) | **25 files / 359 passed, 16 skipped** (matches the report) |
| Concurrency (opt-in) | fresh `gymapp_rv_conc`, migrated from scratch | **1/1 passed** |
| `pnpm build` | production | succeeds |
| `pnpm exec playwright test` (full suite) — run 1 | clean disposable `gymapp_rv_e2e` (created, migrated, seeded, account via `smoke.spec.ts`, re-seeded, `tests/e2e/seed.ts`), production server | **111 passed / 1 failed** (L-4) |
| `pnpm exec playwright test` (full suite) — run 2 | same | **111 passed / 1 failed** (L-4) |
| `metrics.spec.ts` alone ×3 | same | 1 failure (L-4), 2 clean |
| `metrics.spec.ts --repeat-each=3` (38 tests) | same | 1 failure (L-4) |
| L-4 alone `--repeat-each=10` | same | 10/10 pass |
| A-25 at §20 step 2's shape | fresh `gymapp_rv_perf`, corrected generator | 780 sessions / 6,240 session_exercises / **31,200 set_logs**, **p95 = 53.48 ms** (min 37.20, p50 40.67, max 54.30) |
| Independent server/domain fixtures | fresh `gymapp_rv_metrics` (migrated from scratch) | §3 |
| Independent DOM verification + H-1 load-bearing proof | production build, disposable DB | §3 |

Temporary scratch scripts and specs were deleted and all four disposable databases dropped (§8).

---

## 3. Finding-by-finding verification

### H-1 — editor horizontal overflow · **CLOSED, fix proven load-bearing**

`src/ui/metrics/SelectionEditor.tsx` now carries `min-w-0` on the candidate `<label>` (`:220`), `w-full` on the `<select>` (`:225`), `shrink-0` on the `Add` button (`:239`), and, on each selected row, `min-w-0 flex-1` on the name wrapper with an inner `min-w-0 flex-1 truncate`, plus `shrink-0` on the archived badge and the button group (`:161-171`).

My own measurement, production build, `document.documentElement.scrollWidth − viewport`, with a 68-character candidate name present in the list (the review's reproduction had +30 / +50 / +68 / +122 px here):

| Case | 320 | 360 | 375 | 390 | 430 |
|---|---|---|---|---|---|
| First visit (empty selection, long name among candidates) | **0** | 0 | 0 | 0 | 0 |
| Long-named exercise **selected** | **0** | 0 | 0 | 0 | 0 |
| `/metrics` itself | 0 | — | — | 0 | — |

**Load-bearing proof without touching any file:** injecting a stylesheet at runtime that neutralises exactly the declarations the fix added (`min-width:auto`, `select{width:auto}`, `flex-shrink:1`, `overflow:visible`) restores the defect — `scrollWidth` at a 320 px viewport goes from **320 → 350**. The shipped `H-1 / M-6` test asserts `scrollWidth ≤ viewport.width` at 320×568 after every add, so it measures precisely the quantity that moves when the fix is removed.

### M-1 — current-week Volume deload badge · **CLOSED**

`VolumeCard.tsx:59` now reads `thisWeek?.isDeload`, `:65` reads `lastWeek?.isDeload`, both rendering the new shared `DeloadBadge` (`src/ui/metrics/DeloadBadge.tsx`), which `TrainingCard.tsx:35` also adopted.

Independently reproduced with an in-progress deload session dated today: `GET /api/metrics` returns `volume.weeks[0].isDeload = true`, and the rendered card shows

```
This week (so far) Deload      ← span.bg-amber-900/60  ×1
Last week Deload
```

with the Training card carrying the same `bg-amber-900/60` markup. Both halves of §4 M-5 / §8 now hold at the DOM, including the amber styling the previous implementation dropped.

### M-2 — unbounded editor query for a discarded value · **CLOSED (root cause, not symptom)**

`queryAllTimeFactRows` became `queryWindowedFactRows` with `gte/lt` on `started_at` over `[instant(D−89), instant(D+1))` — the same window as the dashboard's step 9 — and `SelectionEditor.tsx` now renders the refusal copy per row via `editorStateNote()`.

Captured from a live `getSelection` on my own fixture: the fact statement carries **both** `started_at` bounds, `"workout_sessions"."user_id"`, and the contractual `ORDER BY exercise_id, started_at, position, set_number`; the metadata statement selects `load_step_kg`. The editor's per-row `state` now equals the dashboard's for the same account and instant, and the editor DOM renders `Not available for this equipment type` and `Strength estimate turned off for this exercise` (and correctly renders no line for `no_current_estimate`, which is not a caveat the editor owns).

The endpoint still issues four statements, not §11.5's sketched "two" — unavoidable, because §11.5 simultaneously requires the `state` field and budgets no query for it. No acceptance criterion pins this count; taking the spec's DTO contract over its statement sketch is the correct reading, and the query is now bounded, which was the actual defect.

### M-3 — A-12's boundedness clause · **CLOSED, assertion discriminates**

The new test inspects the captured SQL text of every `workout_sessions` / `set_logs` / `bodyweight_entries` / `recovery_entries` statement and, separately, step 9 for `user_id`, both instant bounds and the exact `ORDER BY`.

I re-applied the shipped predicate to synthetic inputs: it **rejects** `select "id" from "workout_sessions" where "workout_sessions"."user_id" = $1` and an unbounded `set_logs ⋈ session_exercises` scan, while **accepting** all eleven real statements. Step 9's fingerprint (`"session_exercises"."exercise_id" in (`) does not collide with the volume query's JOIN equality, as the test's own comment claims.

### M-4 — timezone and week-start coverage · **CLOSED, assertion discriminates**

Two new integration tests drive the real service. Independently re-derived:

- `weekStartsOn = 0` → `2026-09-06, 08-30, 08-23, 08-16, 08-09, 08-02, 07-26, 07-19`; the Monday-start control on the same instant yields `2026-08-31`, so the assertion is discriminating rather than incidentally true.
- `Pacific/Kiritimati` at `2026-09-06T21:30Z` → `asOfLocalDate = 2026-09-07`, the session lands in the week starting `2026-09-07` with 1 session / 1 work set; holding `D` at `2026-09-06` makes the same session future for **both** Training (`0`) and Strength (`no_current_estimate`).

### M-5 — non-estimate row states in the DOM · **CLOSED**

The mis-titled test was rewritten as `A-18 / L-6` (now asserting the state it actually exercises), and a new `M-5` test selects three exercises while eligible and then degrades two. Independently confirmed on the rendered page: `No current estimate`, `Not available for this equipment type`, and `Strength estimate turned off for this exercise` all present, in stored order (`no_current_estimate, not_available, turned_off` from the service).

### M-6 — A-33's unasserted editor clauses · **CLOSED**

Folded into the `H-1 / M-6` test at **both** 320×568 and 390×844: the limit message replacing the `<select>` at five rows, `Up` disabled on the first row and `Down` on the last, every `ol button` and `Save` clearing 44 px, and the `role="status"` announcement text after a move. I had verified all five behaviourally in the review; they are now asserted, at the viewport whose absence let H-1 through.

### L-1 … L-13

| # | Verdict | Independent evidence |
|---|---|---|
| L-1 | **CLOSED** | `Sparkline.tsx:37` gates only the `<svg>`. With exactly one entry: `svg[aria-hidden='true']` count **0**, text line present. |
| L-2 | **CLOSED** | `formatSignedKg` now signs (`+0.6 kg` / `-0.6 kg` / `0 kg`, unit-tested) and is used at `BodyweightCard.tsx:57`. A real 30-day gain renders `+2 kg change of 7-day averages, 30 days apart (3 of 7 vs 3 of 7 days)`; the summary line ends `highest 83 kg` — the unit the review found missing. |
| L-3 | **SUBSTANTIALLY CLOSED** (residual, §5.2) | Every literal the review named moved into `copy.ts` (`editorSaveGenericError`, `deloadBadge`, `volumeColumnHeading`, `volumeBackRow`, `volumeUnclassifiedBack`, `recoveryColumnDay`, the summary fragments) and is therefore inside `allCopyStrings()`'s scan. Interpolated count/unit fragments remain inline. |
| L-4 | **product CLOSED / test defective** | `MetricsScreen.tsx:40-49` keeps the data and shows `refetchErrorBanner` when `hasDataRef` is set. Verified 8/8 with a settle window and 10/10 in isolation, `401` observed every time. The **test** is racy — §4. |
| L-5 | **CLOSED** | The vacuous `satisfies` on `any` is replaced by a cast plus real `typeof` / `Array.isArray` assertions on every top-level field and nested array — checks that can fail, unlike the original. |
| L-6 | **CLOSED for the clause raised** (residual, §5.4) | The rendered row is asserted to contain `≈`, `(likely`, `est.` and the exact `≈ 122.5 kg (likely 110–137.5) est.`; seven required sentences are asserted on `body.innerText()`. |
| L-7 | **CLOSED** | New test asserts one `svg[aria-hidden='true']`, the `/90 days · \d+ entries/` line, `th[scope=col] ≥ 8`, `th[scope=row] ≥ 1`. |
| L-8 | **CLOSED** | `@/domain/strength/estimateMode` removed from the allowlist (confirmed unused). New describe block asserts no metrics file mentions `recommendations`, with a positive control on `server/progression/service.ts` proving the scan can fire. |
| L-9 | **CLOSED** | New integration test builds the duplicate-position fixture. Re-derived independently: metrics row and `getExerciseStrengthReport` agree at `158.67` / `low`. |
| L-10 | **CLOSED** | `EXERCISES_PER_SESSION = 8`. My own run: 31,200 `set_logs`, **p95 = 53.48 ms** — same order as the review's 44.97 ms and the remediation's 43.56 ms, well under the 100 ms local budget. |
| L-11 | **CLOSED** | The Phase 9a sentence is its own paragraph; the pre-existing Phase 6 staleness is deliberately untouched (evaluation F-2). |
| L-12 | **CLOSED** | A comment above the delete-then-insert records that `created_at` is re-defaulted and why it is unobservable. Documentation-only, as scoped. |
| L-13 | **CLOSED** | `SelectionMetadataRow` carries `loadStepKg`; the metadata query selects `load_step_kg`; the dashboard row reports the exercise's own `2.5`. No behavioural negative control is possible — as the review itself established, the value is unobservable through `state` — and the report says so rather than inventing one. |

---

## 4. RV-1 — the L-4 regression test is racy (blocking)

**Observed.** Across five whole-file or whole-suite executions on a clean disposable database and a production build, the L-4 test failed four times:

| Execution | Result |
|---|---|
| Full Playwright suite, run 1 | 111 passed, **1 failed** (L-4) |
| Full Playwright suite, run 2 | 111 passed, **1 failed** (L-4) |
| `metrics.spec.ts` ×3 sequential runs | **1 failed** (L-4), 2 clean |
| `metrics.spec.ts --repeat-each=3` (38 tests) | **1 failed** (L-4) |
| L-4 alone, `--repeat-each=10` | 10 passed |

**Failure signature.** The captured aria snapshot at the moment of failure shows the dashboard fully rendered with the *normal* status line — `Updated 11:07 PM · numbers for Sep 6, 2026` — and no banner. That is the correct rendering for a refetch that **succeeded**, not for one that 401'd.

**Mechanism, pinned.** I re-ran the shipped steps twelve times in a tight loop, logging the context's cookies immediately before the click and the observed `/api/metrics` status:

```
#0  banner=false  apiStatuses=[200]  cookiesBeforeClick=gym_app_session   ← the clear did not stick
#1..#11 banner=true apiStatuses=[401] cookiesBeforeClick=<none>
```

`src/server/auth/edgeSession.ts` documents a **"rolling 30-day expiry … refreshed on activity (ADR-004)"**, so every authenticated response re-issues `Set-Cookie: gym_app_session`; `SyncStatusBanner` runs a `setInterval` that keeps such requests flowing on any app page. When one of them lands between `context.clearCookies({ name: "gym_app_session" })` and the Refresh click, the session is restored, the refetch returns 200, and the banner correctly does not appear. The test's premise — that clearing the cookie once guarantees the next request is unauthenticated — does not hold in this app.

**Why this blocks.** The product is right: with a genuine non-ok response the banner renders and the dashboard is retained, every time. But the regression test only asserts when it wins a race, so it does not reliably protect L-4, and the feature's own stated gate — a green full Playwright suite — fails more often than it passes on this machine. The remediation report's `112/112` and "not reproducible" are contradicted by four reproductions.

**Shape of the fix** (not applied): assert the cookie is actually absent immediately before the click (poll `context.cookies()` until `gym_app_session` is gone, or clear it and re-check after the app's next idle), or drive the 401 by a means the app cannot undo. Also correct §4's test-count row and the L-4 flake note in the remediation report.

---

## 5. Secondary observations (non-blocking)

**5.1 — "1 entries".** With exactly one bodyweight entry the summary line reads `90 days · 1 entries · first 82 kg · latest 82 kg · lowest 82 kg · highest 82 kg`. Moving the word into `bodyweightSummaryEntriesWord` (L-3) lost the plural agreement; `pluralize` already exists in the same module and is used by `TrainingCard`. The shipped L-1 test asserts the regex `/90 days · 1 entr/`, which passes either way. Cosmetic, and only reachable in the single-entry state L-1 introduced.

**5.2 — L-3 residual.** `" kg"`, `"of 7 days"`, `"of 7 days logged"`, `"of 7 vs"` and the mean-sleep `" h ("` fragment are still interpolated inline in `BodyweightCard.tsx:32,46,50,59-60` and `RecoveryCard.tsx:69`, so §15's "every user-facing string lives in `copy.ts`" is still not literally true; `formatCoverageCount`, written for exactly this, remains dead code. No banned substring can hide in these fragments, so the practical guarantee is intact.

**5.3 — the M-1 test does not assert what its name claims.** Its title says "with the shared amber badge markup", but the assertion is `getByText("Deload")` visibility inside the This-week `<th>` — it would also pass on the old appended plain text. The amber markup is real (I verified `span.bg-amber-900/60` in that cell), but it is verified by my inspection, not by the suite.

**5.4 — L-6's sentence coverage is 7, not 14.** The remediation report says the rewritten test asserts "all 14 required §15 sentences"; it asserts seven. The Training caption, the three Volume captions, the Recovery caption, the header's timezone/week-start line and `(so far)` are still asserted only as `copy.ts` constants, never on the rendered page. The specific A-20 clause the review raised — the estimate string's composition — *is* now asserted on the page.

**5.5 — the L-4 judgment call's stated reason is wrong.** It claims "this app's service worker applies a `NetworkFirst` strategy to every non-excluded `/api/*` GET". `src/app/sw.ts`'s HIGH-5 entry makes every same-origin `/api/*` GET other than `/api/auth/*` and `/api/today-bundle` **`NetworkOnly`**, exactly as evaluation §2.2 states. The conclusion drawn (that `page.route` cannot intercept a service-worker-issued fetch) is still correct; the reason given for it is not.

**5.6 — two tests delete the account's entire bodyweight history.** `L-1` and `L-7` each run `delete(bodyweightEntries).where(userId)` and restore nothing. Harmless in file order today (`bodyweightRecovery.spec.ts` sorts before `metrics.spec.ts`) and on a disposable database, but it makes the suite order-dependent and would destroy real rows if ever pointed at the dev database.

**5.7 — new-row state placeholder.** `SelectionEditor`'s `add()` stamps `state: "estimate"` on a freshly added row. Candidates are eligible by construction and `editorStateNote` renders nothing for either `estimate` or `no_current_estimate`, so nothing incorrect can be shown before Save; the real state arrives on the next load. Correct as written, worth knowing.

---

## 6. No regression

- **Protected boundaries.** `git diff --stat 1282795` over `src/{ui,server,domain}/strength`, `src/{server,domain}/volume`, `src/server/history`, `src/{domain,server}/sync`, `src/sync`, `src/app/sw.ts`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `src/server/today`, `src/{domain,server}/progression` and `src/ui/OfflineShell.tsx` is **empty**. `drizzle/` still differs only by the two new `0012` files plus the 7-line journal append; migrations `0000`–`0011` untouched.
- **Minimal diffs preserved.** `tests/e2e/phase7Remediation.spec.ts` +1 line, `tests/integration/testDb.ts` +33 (additive export), `src/app/(app)/layout.tsx` +3, `src/db/schema/index.ts` +1 — unchanged from the reviewed state. `src/db/schema/dashboardEstimateSelections.ts` (51 lines), both API routes and both pages are byte-identical.
- **Negative-control mutations were restored.** `EstimatesCard.tsx` (M-5's mutation target) and `src/server/metrics/service.ts` (M-3's and M-4's) are line-for-line identical to the versions in the review; the Save button retains `min-h-11 … py-3` after M-6's mutation.
- **Statement-count contract intact.** My own capture: **11** statements for a five-exercise selection, **10** with the selection cleared — A-12's pinned numbers, unchanged by M-2's edit to the *selection* service.
- **Owner decisions intact.** O-2 (8 weeks), O-3 (≤ 5, stored order, never re-sorted), O-7 (archived retained and badged), O-8 (per-row states, no global count — the editor's new refusal lines are §11.5's stated purpose for the field, not a new surface), O-10 (card order), N-3 (no percentage, arrow or trend — the `+` on the 30-day change is §4 M-8's own "difference, signed", and the banned glyph set is untouched), I-7 (recovery still combines nothing), I-9/I-13 (selection presentation-only).
- **Boundary and copy suites.** `metricsBoundary.test.ts` and `metricsCopy.test.ts` pass with the new `DeloadBadge.tsx` file and the eleven new copy keys; the copy scanner reaches every one of them through `Object.values(METRICS_PAGE_COPY)`.
- **Every pre-existing spec passes unmodified** in both full-suite runs (111 of 112, the single failure being the new L-4 test).

---

## 7. Acceptance-criterion status after remediation

Unchanged from the review except where remediation moved them: **A-1** PARTIAL → **MET** (M-4), **A-12** PARTIAL → **MET** (M-3), **A-16** PARTIAL → **MET** (L-5), **A-17** PARTIAL → **MET** (M-5, L-7), **A-18/A-20** → **MET** for the estimate-string clause (L-6; see §5.4 for the residual sentence coverage), **A-21** PARTIAL → **MET** (L-8), **A-33** PARTIAL → **MET** (M-6), **A-6(c)** NOT MET → **MET** (L-9), **A-25** MET with the caveat now removed (L-10). **A-22** still MET — but only at 111/112 while RV-1 stands. **A-24** (device acceptance) correctly not run.

---

## 8. Working tree, resources and cleanup

- `git status --porcelain` is byte-identical to the state the remediation left, plus this file. Every unrelated pre-existing change (`CLAUDE.md`, the `HANDOFF.md` deletion, `HANDOFF(depracted).md`, `.claude/skills/`, `docs/input/product-ideas.md`, the other `docs/reviews/*`, `gpt-handoff.md`, `gpt-memory.md`) is untouched, as are all seven earlier metrics documents.
- Temporary artifacts removed: one scratch `tsx` script at the repository root and two temporary Playwright specs under `tests/e2e/`, plus `test-results/` and `playwright-report/`. `pnpm lint` is clean and `pnpm format:check` shows only the pre-existing `src/server/sync/service.ts` warning, confirming nothing of mine remains.
- Disposable databases `gymapp_rv_metrics`, `gymapp_rv_conc`, `gymapp_rv_e2e` and `gymapp_rv_perf` were dropped. `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` returns exactly the six databases present before this verification (`gymapp` plus five unrelated ones from earlier sessions, neither created nor touched here).
- All database work ran against the local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`). The production server started for the e2e runs was pointed at a disposable database and has been stopped. No production contact, no commit, push, deploy, or device acceptance.

---

## 9. What remains

1. **RV-1** — make the L-4 test deterministic against the rolling session cookie, then re-run the full suite and record the real number.
2. Correct the remediation report's §4 test count (`112/112`) and its L-4 flake characterisation.
3. Optional, cosmetic: the "1 entries" plural (§5.1); the residual inline fragments and dead `formatCoverageCount` (§5.2); assert the amber markup the M-1 test's name promises (§5.3); the "14 sentences" claim (§5.4); the service-worker mis-diagnosis in the L-4 judgment call (§5.5); the two bodyweight-wiping tests (§5.6).

Items 1–2 are the only ones that stand between this feature and device acceptance.

---

# `REMEDIATION INCOMPLETE`
