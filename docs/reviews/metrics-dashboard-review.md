# Metrics Dashboard v1 / Phase 9a — Independent Adversarial Review

Date: 2026-09-06
Role: independent, adversarial review of the Metrics Dashboard v1 implementation against its binding specification. Read-only with respect to the implementation: no source, schema, migration, test, or report file of the change was modified; no commit, push, deployment, or production access was made or attempted.
Binding specification: `docs/reviews/metrics-dashboard-architecture-evaluation.md` (864 lines, owner-decided addendum of 2026-09-06, `VERIFIED — READY FOR IMPLEMENTATION` per `metrics-dashboard-owner-modification-verification-2.md`).
Implementation report under review: `docs/reviews/metrics-dashboard-implementation.md`.
Reviewed state: `main` @ `1282795` plus the uncommitted working tree, exactly as listed in that report's §1 (working-tree state re-confirmed byte-for-byte at the end of this review — §12).

---

## 1. Verdict

# `READY FOR REMEDIATION`

The feature is substantially correct. Every metric I could independently re-derive is right, the query plan is exactly the eleven bounded statements §11.2 specifies, the account-local date and week boundaries hold in a non-default timezone and across a DST transition, the selection's ownership/limit/idempotence/atomicity guarantees hold under real concurrency, migration `0012` is exact, and every file on the must-not-change list is byte-identical to `1282795`. I re-ran the full unit (836), integration (354 + 1 opt-in concurrency) and Playwright (106) suites myself, the last against a clean disposable PostgreSQL 16 and a production build, all green.

It is not ready for device acceptance because of one **HIGH** product defect and six **MEDIUM** items, four of which are acceptance criteria the report marks `✅` that do not test what they claim:

- **H-1** — `/metrics/exercises` **scrolls horizontally at 320 px on the shipped seeded catalogue alone**, and the overflow grows without bound with exercise-name length, reaching the owner's own 390 px device at ~41–51 characters. §12.2's "the page body never scrolls horizontally at 320–430 px" is binding; A-33 requires the editor to be measured at 320×568 and no test measures the editor's `scrollWidth` at any viewport.
- **M-1** — the Weekly volume card **never renders `volume.weeks[0].isDeload`**, so the current week's deload badge — the exact case §8's "two meanings of one badge" disclosure exists for — cannot appear; the previous week's badge is plain text, not the specified amber badge.
- **M-2** — the selection editor's read endpoint runs an **unbounded, all-time strength fact query** on every open in order to compute a `state` field the editor then discards.
- **M-3…M-6** — A-12's boundedness clause, A-1's non-default-timezone and Sunday-week-start clauses, A-17's per-row `No current estimate` clause (its e2e test is named for it but asserts the opposite), and five of A-33's editor clauses are unasserted.

None of M-3…M-6 masks a live defect: I verified each of those properties myself and they hold today. They are credited as behaviour and reported as coverage.

Remediation is small and local: two UI files (`VolumeCard.tsx`, `SelectionEditor.tsx`), one server file (`selectionService.ts`), and test additions. No schema, migration, engine, sync, or boundary change is implied.

---

## 2. What I actually ran

| Check | How | Result |
|---|---|---|
| `pnpm typecheck` / `typecheck:sw` | as-is | clean |
| `pnpm lint` | as-is | clean (0 problems) |
| `pnpm format:check` | as-is | fails only on `src/server/sync/service.ts`, which `git diff 1282795` shows byte-unchanged — the known pre-existing CRLF condition. Report's claim confirmed. |
| `pnpm test:unit` | as-is | **60 files / 836 tests passed** |
| `pnpm test:integration` | as-is | **25 files / 354 passed, 16 skipped** |
| Concurrency (opt-in) | fresh `gymapp_review_conc`, migrated from scratch | **1/1 passed** |
| `pnpm build` | production | succeeds; `/metrics` and `/metrics/exercises` static, both API routes dynamic |
| `pnpm exec playwright test` (full suite) | clean disposable `gymapp_review_e2e` (dropped, recreated, migrated, seeded, account created via `smoke.spec.ts`, re-seeded, `tests/e2e/seed.ts`), production server | **106/106 passed** in 2.0 min |
| Migration `0012` from scratch | fresh `gymapp_review_metrics` | 13/13 migrations; `\d dashboard_estimate_selections` verified column-for-column, PK, unique index, check constraint, both `ON DELETE CASCADE` FKs |
| A-25 performance | `scripts/metricsPerformanceFixture.ts` on fresh `gymapp_review_perf` | **p95 = 19.98 ms** (report: 20.93) |
| A-25 at §20 step 2's stated fixture shape | a copy of the generator with `EXERCISES_PER_SESSION = 8` (31,200 set rows), fresh `gymapp_review_perf2` | **p95 = 44.97 ms** — still PASS, but 2.2× the reported figure (L-10) |
| Independent domain/service fixtures | my own `tsx` scripts against `gymapp_review_metrics`: Sunday week start, `Pacific/Kiritimati`, DST fall-back, warm-up-only sessions, empty sessions, archived-selected exercises, duplicate exercise at two session positions, direct foreign-row insertion, DB five-row ceiling, statement-text capture | see §8 |
| Independent DOM evidence | temporary Playwright specs against the production build: current-week deload rendering, all four row states, estimate-string composition, required sentences, sparkline, table headers, editor geometry/limit/disabled-ends/announcement/44 px, overflow sweeps at 320/360/375/390/430 px | see §5, §6.1, §8 |
| Advisory-lock negative control | my own no-lock copy of `replaceSelection`, 32 concurrent writers over 8 rounds | with lock: **0 rejections**; without: **24 rejections**. The lock is load-bearing. |

All temporary files were deleted and all five disposable databases dropped (§12).

---

## 3. Findings summary

| ID | Severity | Kind | One line |
|---|---|---|---|
| **H-1** | HIGH | Product | `/metrics/exercises` overflows horizontally below 375 px on the shipped catalogue, and at ≥390 px with ordinary long exercise names |
| **M-1** | MEDIUM | Product | Weekly volume card drops `weeks[0].isDeload`; `weeks[1]`'s badge is unstyled text |
| **M-2** | MEDIUM | Product | Editor read path runs an unbounded all-time fact query for a `state` the UI discards |
| **M-3** | MEDIUM | Test | A-12's boundedness clause (and the step-9 `user_id` check) is never asserted |
| **M-4** | MEDIUM | Test | A-1's `weekStartsOn = 0` and `Pacific/Kiritimati` clauses are untested at the metrics level |
| **M-5** | MEDIUM | Test | The e2e test named for A-17's `No current estimate` row asserts the opposite; no non-`estimate` row state is checked in the DOM |
| **M-6** | MEDIUM | Test | Five A-33 editor clauses are unasserted, including the 320×568 measurement that would have caught H-1 |
| **L-1** | LOW | Product | The sparkline's text alternative vanishes below two entries |
| **L-2** | LOW | Product | A positive 30-day change renders unsigned; `formatSignedKg` is dead; the summary's "highest" drops its unit |
| **L-3** | LOW | Product | User-facing strings live outside `copy.ts`, outside the copy-scoped ban scan |
| **L-4** | LOW | Product | A non-network fetch failure discards the rendered dashboard and offers no retry |
| **L-5** | LOW | Test | A-16's `satisfies MetricsDashboardDto` is vacuous on `JSON.parse`'s `any` |
| **L-6** | LOW | Test | A-20's "≈ / (likely / est." clause and the rendering of the required sentences are unasserted |
| **L-7** | LOW | Test | A-17's sparkline `aria-hidden` + text line and the table column headers are unasserted |
| **L-8** | LOW | Test | A-21 omits the `recommendations` claim; the domain allowlist carries an unused specifier I-12 does not name |
| **L-9** | LOW | Test | A-6(c) is not re-derived; the inheritance argument does not cover the metrics query's own `ORDER BY` |
| **L-10** | LOW | Report | A-25's fixture is ~4× lighter than §20 step 2's stated shape; the reported p95 understates by ~2× |
| **L-11** | LOW | Report | README's new sentence sits inside a paragraph that still says Phase 6 is not built |
| **L-12** | LOW | Report | §11.5's "only `updated_at` moves" is imprecise — delete-then-insert moves `created_at` too |
| **L-13** | LOW | Product | `toSelectionRowDtos` hard-codes `loadStepKg: 1`; safe today, silently coupled |

---

## 4. HIGH

### H-1 — `/metrics/exercises` scrolls horizontally at the narrow end of the supported range, and the overflow grows without bound with exercise-name length

**Product defect.** Binding rules broken: §12.2 ("the page body never scrolls horizontally at 320–430 px (content column = … 288 px at 320 px after `main`'s `px-4`)") and A-33 ("(UI) The editor at 390×844 and 320×568").

Measured on the production build in Chromium, `document.documentElement.scrollWidth` minus viewport width, first-visit state (empty selection, native candidate `<select>` shown):

| Candidate list | 320 px | 360 px | 375 px | 390 px | 430 px |
|---|---|---|---|---|---|
| Seeded catalogue only (88 options, longest name `Cable Overhead Triceps Extension`, 32 chars) | **+30** | 0 | 0 | 0 | 0 |
| + one 37-char name | **+50** | — | 0 | 0 | 0 |
| + one 41-char name | **+68** | — | **+13** | 0 | 0 |
| + one 51-char name | **+122** | — | **+67** | **+52** | **+19** |

Removing the added exercise returns the page to `+30 / 0 / 0 / 0` exactly, so the driver is unambiguous: the native `<select>`'s intrinsic width is its **widest `<option>`**, i.e. the longest candidate exercise name.

The same structural cause affects the selected rows. With a selected exercise whose name contains a long unbroken token — precisely the timestamp-suffixed fixture names §13 and §20 step 4 *require* the e2e spec to create — the row overflows at every width tested (320 → +43, 375 → +35, 390 → +20 in my runs).

**Cause.** Neither flex child of the two affected rows can shrink below its content:

- `src/ui/metrics/SelectionEditor.tsx:177-192` — `<div class="flex items-center gap-2">` containing `<label class="flex flex-1 flex-col …">` wrapping the `<select>`. `flex-1` sets `flex-basis: 0%` but leaves the default `min-width: auto`, so the label's minimum is the select's min-content width (the longest option), and the `Add` button is pushed past the viewport.
- `src/ui/metrics/SelectionEditor.tsx:128-139` — the row `<li class="flex items-center justify-between gap-2">`; the name `<span>` likewise has no `min-w-0`, so a long token pushes the three `min-w-11 px-3` buttons off-screen.

`/metrics` itself is clean: I measured 0 overflow at 320/360/390/430 px with five long-named selected exercises including an `Archived` badge, an eight-group volume table, and a populated recovery grid.

**Why this is HIGH and not MEDIUM.** The failure is present on the shipped seeded catalogue with no user action, at a width the binding specification names explicitly; `exercises.name` accepts 200 characters (`src/domain/exercises/schema.ts:145`), so an ordinary user-created name reaches the owner's own 390 px device; and the repository's own precedent treats document-level horizontal overflow at phone widths as blocker-class (phase-7 BLOCKER-1). **Why not BLOCKER:** at 375–430 px with today's catalogue there is no overflow, so the owner's iPhone is unaffected until an exercise is named longer than 40 characters.

**Why it was not caught.** `tests/e2e/metrics.spec.ts` never evaluates `scrollWidth` on `/metrics/exercises` and never renders it at 320×568; A-17's overflow assertion covers `/metrics` only (`tests/e2e/metrics.spec.ts:109-115`). See M-6.

**Suggested remediation** (not applied): add `min-w-0` to the label at `:178` and to the name `<span>` at `:132` (and `w-full` on the `<select>`), then extend A-33 with a `scrollWidth` assertion at 320×568 and 390×844 on a fixture whose candidate list contains a ≥ 50-character name.

---

## 5. MEDIUM

### M-1 — The Weekly volume card never renders the current week's deload flag, and renders the previous week's as unstyled text

**Product defect.** `src/ui/metrics/VolumeCard.tsx:50-56` reads only `lastWeek?.isDeload`; `thisWeek` (`:14`) is used for its numbers (`:19`, `:23`, `:65`, `:75`) but its `isDeload` is never consulted.

Binding text: §4 M-5 — "`weeks[k].isDeload` badges the column header"; §8 — "the week row / column header carries the existing badge (`Deload`, amber) and the row is de-emphasised (`opacity-60`)"; §12.2's wireframe shows `[Deload]` under a week column header.

Verified end to end against the production build: with an in-progress deload session started today, `GET /api/metrics` returns `volume.weeks[0].isDeload = true`, and the rendered card reads

```
Effective sets	This week (so far)	Last week Deload
```

— the badge appears only on the *Last week* column, and only as the bare string `" Deload"` appended inside the `<th>`, not the `rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300` badge the Training card (`TrainingCard.tsx:33`) and the Volume screen (`VolumeScreen.tsx:71-78`) both use.

**Why it matters beyond cosmetics.** §8's whole design is that one word carries two disclosed meanings. The three divergence cases it enumerates are (i) a completed deload session with no work sets, (ii) an **in-progress** deload session, and (iii) a completed deload session **dated after today**. Cases (ii) and (iii) are the ones that badge Volume and not Training — and both can only occur in the **current** week, whose badge the card never draws. The DTO is right (A-2's fixtures pass, and I reproduced all three at the service level), so the disclosure exists in the data and is dropped at the last step.

### M-2 — The selection editor's read endpoint runs an unbounded all-time fact query for a value the UI discards

**Product defect, and a report inaccuracy.** `src/server/metrics/selectionService.ts:81-115` (`queryAllTimeFactRows`) has no `started_at` predicate; `toSelectionRowDtos` (`:175-212`) runs `deriveStrengthReport` per selected exercise purely to fill `SelectionRowDto.state`. `src/ui/metrics/SelectionEditor.tsx:43-49` maps the response to `{ exerciseId, name, archived }` — **`state` is dropped and never rendered anywhere in the editor.**

Measured: `getSelection` issues 4 statements, not §11.5's "Two statements", and the third is

```sql
select … from "session_exercises"
  inner join "workout_sessions" on …
  left join "set_logs" on …
 where ("workout_sessions"."user_id" = $1
    and "workout_sessions"."status" = $2
    and "session_exercises"."exercise_id" in ($3, …))
 order by …
```

with no time bound at all. Both deviations are recorded as judgment calls 1 and 2 in the implementation report, and both rest on the same justification — *"without it the editor could not show why a row has no current estimate, which is the field's stated purpose"*. In the tree, the editor does not show it. The cost is real and grows for the lifetime of the account: the query scans every completed session of up to five exercises, for all time, on every editor open, in a feature whose §11.3 states "No statement is unbounded in time" as its performance boundary.

Either render the state (as §11.5 intends) and bound the query to the 90-day window as `getMetricsDashboard`'s step 9 does, or drop the query and the field. Do not keep the unbounded scan for a discarded value.

### M-3 — A-12's boundedness clause is never asserted

**Test defect.** A-12 requires, verbatim: *"Boundedness clause: every statement that reads `workout_sessions`, `set_logs`, `bodyweight_entries` or `recovery_entries` is bounded either by a `started_at`/`date` predicate in its own text or by an id list produced by such a bounded statement … Step 9's text contains `user_id` (RM-6)."* §11.3 calls this "the load-bearing half against an N+1", and §20's independent-review focus asks that it "actually inspects SQL text".

`tests/integration/metrics.integration.test.ts` asserts only the four exact counts (11/13/10/12, `:406`, `:441`, `:466`/`:474`, `:494`/`:504`) plus the absence of `INSERT|UPDATE|DELETE`. No test inspects any statement's text for a bound, and none checks step 9 for `user_id`.

The report's `✅` for A-12 cites a negative control (an added redundant `users` read). That control proves the **count** is real; it cannot fail on an unbounded statement, which is what the clause exists to catch.

**The property holds today** — I captured all eleven statements and verified each fact-table read is bounded by its own `started_at`/`date` predicate or by step 2's id list, that step 9 carries `user_id`, both time bounds, and exactly `order by "exercise_id" asc, "started_at" asc, "position" asc, "set_number" asc` (§8.3).

### M-4 — A-1's non-default-timezone and Sunday-week-start clauses are untested

**Test defect.** A-1 requires three things: eight windows for `weekStartsOn = 1`; the windows for `weekStartsOn = 0`; and a `Pacific/Kiritimati` fixture where the same instant yields local day `2026-09-07`, the session lands in the week starting `2026-09-07`, and with `D` held at `2026-09-06` it counts in neither `training` nor `strength`.

No metrics test uses a timezone other than the default or a week start other than Monday (`grep` over `tests/` for `Kiritimati`, `weekStartsOn: 0`, `week_starts_on` finds only pre-existing recovery/bundle tests). `tests/unit/metricsTraining.test.ts` passes windows and a guard instant as literals, so the service's own `userLocalDateString` / `localDateToUtcInstant` / `users.week_starts_on` plumbing is never exercised off the default. The report credits A-1 partly to `volumeWeekBuckets.test.ts`, which covers `calendarWeekStart` at `weekStartsOn = 0` but only ever calls `calendarWeekWindows(…, 1, 5)` — never eight windows, never through the metrics service.

**The behaviour is correct** — see §8.1 for my own fixtures covering all three clauses plus a DST fall-back week.

### M-5 — The e2e test named for A-17's `No current estimate` clause asserts the opposite

**Test defect.** `tests/e2e/metrics.spec.ts:134` is titled *"A-17/A-18: a selected exercise with no in-window session shows 'No current estimate' in its stored row …"*. Its body logs a session **5 days ago** with three work sets (`:146-150`) and then asserts `await expect(row).toContainText("est.")` (`:157`) — i.e. it exercises the `estimate` state, not `no_current_estimate`.

Consequently no test renders `No current estimate`, `Not available for this equipment type`, or `Strength estimate turned off for this exercise` in the DOM, although §15's must-appear list names all three. A-17's explicit clause "with a selected exercise that has no in-window sessions its row shows `No current estimate` in its stored position" is unmet.

**All three strings do render** — verified (§8.3).

### M-6 — Five A-33 editor clauses are unasserted

**Test defect.** A-33 requires: *"The editor at 390×844 and 320×568: Up/Down/Remove are ≥ 44 px, correctly disabled at the ends, and re-announce position; adding a sixth is impossible and the limit message is shown; Save writes once, returns to `/metrics`, and the card reflects the new order; Cancel writes nothing; going offline before Save shows `Couldn't save — you're offline.`"*

`tests/e2e/metrics.spec.ts:210` and `:276` cover add / reorder / remove / Save / Cancel / offline-Save at 390×844 only. Not asserted anywhere: the ≥ 44 px control heights on the editor, the disabled state at the ends, the `role="status"` position announcement, the five-item limit message in the UI, and the 320×568 viewport. The report marks A-33 `✅`.

**All of these hold behaviourally** — I measured 15 row controls at exactly 44 px at both 390 and 320, first row's `Up` disabled, last row's `Down` disabled, `role="status"` reading `"RV Editor 1 … is now 1 of 5"`, the `<select>` removed and `Five exercises is the limit.` shown at five rows, Save 48 px and Cancel 44 px. The one clause that does **not** hold is the 320×568 geometry — H-1.

---

## 6. LOW

**L-1 — the sparkline's text alternative disappears below two entries.** `src/ui/metrics/Sparkline.tsx:33` returns `null` before the `<p>` that renders `label`, so the summary line computed in `BodyweightCard.tsx:71,77-88` is never shown when the 90-day window holds 0 or 1 entries. M-9's "fewer than 2 entries → no sparkline" is correct; §13's text alternative was not meant to disappear with it.

**L-2 — sign and unit slips in the bodyweight card.** `BodyweightCard.tsx:57` renders `{thirtyDayChange.kg} kg`, so a loss shows `−0.6 kg` but a gain shows `0.6 kg`; §4 M-8 says "difference, **signed**" and §12.2 shows `−0.6 kg`. `src/ui/metrics/format.ts:39-41` defines `formatSignedKg`, does not sign, and is imported nowhere. `BodyweightCard.tsx:87` prints `lowest 82 kg · highest 85` — the unit is dropped from the last value (rendered line verified).

**L-3 — user-facing strings outside `copy.ts`.** §15 is explicit: *"Every user-facing string of the metrics screen lives in `src/ui/metrics/copy.ts` … so one test can scan it."* Outside it: `"Couldn't save that selection."` (`SelectionEditor.tsx:101`), `Deload` (`TrainingCard.tsx:34`), `"Effective sets"` / `" Deload"` / `"Back"` / `"Unclassified Back"` (`VolumeCard.tsx:48,55,63,86`), `"Day"` (`RecoveryCard.tsx:34`), and the bodyweight/summary fragments (`BodyweightCard.tsx:32,46,59-60,79,86-87`). None currently contains a banned substring — I checked all of them against both lists — but the **copy-scoped** half of the scanner (`badge`, `target`, `score`, `trend`, `goal`, `fatigue`, …) cannot see any of them, so §15's guarantee is weaker than stated.

**L-4 — a non-network failure discards the dashboard with no retry.** `MetricsScreen.tsx:35-38` sets `status = "error"` on `!res.ok`, and `:61-63` returns the error paragraph before the data branch, so a 500 (or an expired session) on a *refetch* replaces a fully rendered screen with one line and no Refresh control. The offline paths correctly keep the data (`:44-46`, `:78-80`).

**L-5 — A-16's `satisfies` is vacuous.** `tests/integration/metrics.integration.test.ts:545-548` writes `JSON.parse(JSON.stringify(metrics)) satisfies MetricsDashboardDto`. `JSON.parse` returns `any`, and `any satisfies T` type-checks unconditionally. The deep-equality half is real; the type half contributes nothing.

**L-6 — A-20's estimate-string clause and the required sentences are unasserted.** `metricsCopy.test.ts` checks the constants in `copy.ts`, never the rendered page; the e2e checks only `toContainText("est.")`. A-20's "every estimate string on the page contains '≈', '(likely', and 'est.'" is untested. **Verified true**: the rendered row reads `≈ 122.5 kg (likely 110–137.5) est. · high confidence · 3 days ago`, and all fourteen required sentences render (§8.3).

**L-7 — A-17's sparkline and table-header clauses are unasserted.** Nothing asserts `aria-hidden="true"` on the SVG, the following text line, or the presence of column headers. **Verified true**: 1 `svg[aria-hidden='true']`, the summary line present, 8 `th[scope=col]` and 15 `th[scope=row]`.

**L-8 — boundary-test gaps.** A-21 requires that metrics "never reaches … the `recommendations` schema symbol"; `metricsBoundary.test.ts:200-207` checks `evaluateSession`, `loadProgression`, `repProgression` only. Separately, the domain allowlist (`:100-107`) includes `@/domain/strength/estimateMode`, which I-12 does not name and which no metrics file imports — a permitted-but-unused widening.

**L-9 — A-6(c) is not re-derived.** Judgment call 6 argues the strength suite already proves the order-sensitivity. It proves the *pure pipeline's*, not that `queryStrengthFactRows`'s own `ORDER BY exercise_id, started_at, position, set_number` is the one the pipeline needs — a silent change to that clause is exactly what A-6(c) exists to catch and nothing would fail. **The behaviour is correct**: on a fixture with the same exercise at two positions in one session (a 140 kg × 3 top group at position 0 and a 100 kg × 8 back-off at position 1) the metrics row and the detail endpoint agree exactly (`158.67`, `low`).

**L-10 — A-25's fixture is lighter than §20 step 2 describes.** The generator uses `EXERCISES_PER_SESSION = 2` (`scripts/metricsPerformanceFixture.ts:36`), producing 7,800 set rows over three years; §20 step 2 asks for "≈ 5 sessions/week × 8 exercises × 5 sets" and `data-model.md` §6 models ≈ 10k set rows **per year**. Re-running an unmodified copy with `EXERCISES_PER_SESSION = 8` (31,200 set rows) gives **p95 = 44.97 ms** rather than the reported 20.93 ms. The verdict is unaffected — both are far under the 100 ms local budget — but the reported figure understates the specified fixture by ~2× and the report presents the fixture as matching the spec.

**L-11 — README.** The appended sentence lands in a paragraph that still reads "Volume tracking (Phase 6) is not yet built", so the file now says Phase 6 is unbuilt and Phase 9a has shipped in consecutive sentences. The report correctly identifies the staleness as pre-existing (evaluation F-2); the edit makes the contradiction adjacent rather than merely present, and §20 step 0 asked for a "route list" rather than a phase-status sentence.

**L-12 — `created_at` moves too.** §11.5 says a replayed identical body differs only in `updated_at`; because `replaceSelection` deletes then inserts (`selectionService.ts:338-347`), `created_at` is re-defaulted as well. Neither column appears in any read DTO, so nothing observable changes; the binding text is simply imprecise and the implementation follows the delete-then-insert design it mandates.

**L-13 — hard-coded `loadStepKg: 1` in the editor's report call.** `selectionService.ts:196`. Safe today: `deriveStrengthReport` reads `loadStepKg` only in `computeWhatIf`, and no `whatIf` is passed, so `state` cannot depend on it. It is nevertheless a silent coupling — if the estimate path ever consumed the step, the editor's state would diverge from the card's without a test noticing.

---

## 7. Non-findings I checked and cleared

- **Judgment call 3** (nulling `confidence` / `latestPoolAgeDays` outside `state: "estimate"`) — consistent with the DTO's declared nullability and rendered nowhere for those states.
- **Judgment call 4** (30-day change from raw means, rounded once) — the prior mean is never displayed, so no visible inconsistency can arise; double-rounding would have been the worse choice.
- **Judgment call 5** (step 3 always issued) — confirmed: drizzle compiles `inArray(col, [])` to a false predicate, the statement runs, and the A-34 fixture's count of 10 on a history-free account is consistent with the documented contract.
- **Judgment call 7** (no metrics-specific cold-offline test) — `/metrics` and `/metrics/exercises` are genuinely absent from `OfflineShell`'s allow-list and `src/ui/OfflineShell.tsx` is byte-unchanged, so the generic route notice applies. Accepted; the untested structural claim is noted under the A-19 audit rather than raised as a finding.
- **Volume card row order** (Back rollup first, then leaves) matches `VolumeScreen.tsx:90,113` — parity, not a divergence.
- **Advisory-lock namespace collision** — implemented exactly as §11.5 prescribes (fixed first key, per-user second key from the UUID's last 32 bits, distinct from `userVolumeLockKeys`'s scheme).
- **Report §9's dev-database claims** — verified: `gymapp` is at 13 migrations (0012), `dashboard_estimate_selections` is empty, and exactly five `E2E Metrics Squat <ts>` fixtures remain, alongside the pre-existing `E2E Strength …` / `E2E Volume Pullover …` accumulation from earlier phases.

---

## 8. Independently verified behaviour (credit)

Everything in this section I re-derived myself, from my own fixtures, not from the shipped tests.

### 8.1 Account-local dates and week boundaries

| Property | Fixture | Result |
|---|---|---|
| Eight windows, Monday start | `D = 2026-09-06`, `weekStartsOn = 1` | `2026-08-31, 08-24, 08-17, 08-10, 08-03, 07-27, 07-20, 07-13` ✔ |
| Eight windows, **Sunday** start | same instant, `weekStartsOn = 0` | `2026-09-06, 08-30, 08-23, 08-16, 08-09, 08-02, 07-26, 07-19` ✔; `weekStartsOn` echoed in the DTO ✔ |
| **`Pacific/Kiritimati` (UTC+14)** | session at `2026-09-06T21:30Z`, `now` = same instant | `asOfLocalDate = 2026-09-07`; the session lands in the week starting `2026-09-07` with 1 session / 1 work set ✔ |
| Same session, `D` held at `2026-09-06` | `now = 2026-09-06T09:00Z` | Training `0/0`; the selected exercise's row is `no_current_estimate` ✔ (the future guard applies to Strength as well as Training) |
| **DST fall-back** | `Europe/Ljubljana`, session at `2026-10-25 00:30` local (`2026-10-24T22:30Z`), `now = 2026-10-26` | lands in the week starting `2026-10-19`, not `2026-10-26` ✔ |
| Bodyweight windows | entries at D−0/1/2/30/31/32/36/37/89/90 | series = 9 points, `D−90` excluded, `D−89` included; prior window `[D−36, D−30]` = 4 entries ✔ |
| Recovery window | entries at D, D−6, D−7 | 7 rows `D−6…D`, `D−7` excluded, `daysLogged = 2`, `meanSleepHours.count = 2` ✔ |

### 8.2 Query plan, isolation and the selection

- **Exactly 11 statements** for `getMetricsDashboard` on a one-exercise selection with no active program and no default preset — matching §11.2 step for step (users, sessions, set rows, volume's users + fact join + programs + users, selection join, strength facts, bodyweight, recovery).
- **Every fact-table statement is bounded** by its own `started_at`/`date` predicate or by step 2's id list; step 9 carries `user_id`, both instant bounds, and the exact contractual `ORDER BY`.
- **Ownership holds on the read path independently of the write path**: a foreign `exercise_id` inserted directly into `dashboard_estimate_selections` is returned by neither `getMetricsDashboard` nor `getSelection`.
- **The database ceiling holds on its own**: a direct insert at `position 6` fails the check constraint; a direct insert reusing `position 3` fails the unique index; a six-id `replaceSelection` is refused and the stored five-row selection survives intact.
- **The advisory lock is load-bearing** (my own negative control): 32 concurrent `replaceSelection` calls over 8 rounds → 0 rejections and the stored list always one of the two whole lists; the identical races against a lock-free copy of the same transaction → 24 rejections.
- **Migration `0012`** applies cleanly from scratch on real PostgreSQL 16 (13/13) with the exact column set, composite PK, unique `(user_id, position)`, `between 1 and 5` check, and both `ON DELETE CASCADE` FKs.

### 8.3 Semantics and rendering

- **I-3 across services**: for the same fixture and `asOf`, the metrics row's `currentE1rmKg` / `confidence` / `latestPoolAgeDays` equal `getExerciseStrengthReport`'s (`135.67`, `high`, `3`) — the equality A-9 proves in the pure module, re-proved through both real server paths.
- **A-6(c)'s underlying property**: a session containing the same exercise at two `session_exercises` positions yields identical values from the metrics path and the detail endpoint (`158.67`, `low`).
- **Warm-up-only completed session**: Training `1 session / 0 work sets`, strength row `no_current_estimate`.
- **Completed deload session with no sets**: Training `1/0` **badged**, `volume.weeks[0].isDeload = false` — §8's divergence case (i), correct in the DTO and correctly rendered on Training.
- **Archived selected exercise (O-7)**: row retained with `archived: true`, `state: "estimate"`, a live `currentE1rmKg`; its sets still count in Training and Volume.
- **All four row states render**: `≈ 122.5 kg (likely 110–137.5) est. · high confidence · 3 days ago`, `No current estimate`, `Not available for this equipment type`, `Strength estimate turned off for this exercise`.
- **Every §15 must-appear sentence renders**: the four reused strength sentences, both metrics-owned lines, the algorithm stamp `Algorithm e1rm-epley-rir v1`, the Training caption, all three Volume captions, the Recovery caption, the header's `Weeks start …`, and `(so far)`.
- **Recovery's own count**: `Logged 2 of the last 7 days · mean sleep 7.5 h (1 of 7 days)` — M-12's distinct count, rendered.
- **Accessibility structure**: one `h1`, five `h2`, `svg[aria-hidden="true"]` with a following text line, 8 `th[scope=col]` / 15 `th[scope=row]`.
- **`/metrics` geometry**: no horizontal overflow at 320 / 360 / 390 / 430 px, including five long-named selected rows with an `Archived` badge and an eight-group volume table.
- **Nav geometry (O-1, R-4)**: `phase7Remediation.spec.ts` passes with "Metrics" added — no overflow and every link fully on-screen at 375×667, 390×664, 390×844, 430×844, and Today's HIGH-2 first-viewport assertion still holds at all four.
- **A-22's negative controls**: the full 106-test Playwright suite passes unmodified on a clean disposable database and a production build; `git diff --stat 1282795` over `src/ui/strength src/server/strength src/domain/strength src/server/volume src/domain/volume src/server/history src/domain/sync src/server/sync src/sync src/app/sw.ts next.config.ts package.json pnpm-lock.yaml src/server/today src/domain/progression src/server/progression` is **empty**; `drizzle/` differs by exactly the two new `0012` files plus a 7-line append to `_journal.json`; `phase7Remediation.spec.ts` differs by exactly one line; `testDb.ts` gains only the additive `createTestDbWithStatementLog`.

---

## 9. Acceptance-criterion audit (A-1 … A-34)

`MET` = the criterion's stated clauses are asserted by a shipped test I ran. `PARTIAL` = some clause is unasserted. `—` = withdrawn or deliberately deferred.

| # | Report | This review | Note |
|---|---|---|---|
| A-1 | ✅ | **PARTIAL** | clause 1 met; `weekStartsOn = 0` and `Pacific/Kiritimati` unasserted (M-4). Behaviour verified correct. |
| A-2 | ✅ | MET | base fixtures + all three divergence fixtures. The DOM consequence of (ii)/(iii) is defeated by M-1. |
| A-3 | ✅ | MET | |
| A-4 | ✅ | MET | |
| A-5 | ✅ | MET | |
| A-6(a)(b) | ✅ | MET | |
| A-6(c) | ♻️ | **NOT MET** | L-9; behaviour verified correct |
| A-7 | ✅ | MET | |
| A-8 | ✅ | MET | |
| A-9 | ✅ | MET | additionally re-proved across both server paths |
| A-10 | ✅ | MET | |
| A-11 | ✅ | MET | |
| A-12 | ✅ | **PARTIAL** | four exact counts and size-independence met; boundedness clause and step-9 `user_id` unasserted (M-3) |
| A-13 | ✅ | MET | |
| A-14 | ✅ | MET | both clauses |
| A-15 | ✅ | MET | |
| A-16 | ✅ | **PARTIAL** | round-trip real, `satisfies` vacuous (L-5) |
| A-17 | ✅ | **PARTIAL** | overflow/h1/h2/44 px/empty state met; `No current estimate` row (M-5), sparkline and table headers (L-7) unasserted |
| A-18 | ✅ | MET | string-equality clause weakened to `est.` (L-6) |
| A-19 | ✅/♻️ | (i) not covered; (ii)(iii) MET | (i) accepted per judgment call 7 |
| A-20 | ✅ | **PARTIAL** | bans, source scan, negative control and must-appear constants met; rendered-string clause unasserted (L-6); §15's "all strings in `copy.ts`" violated (L-3) |
| A-21 | ✅ | **PARTIAL** | inventory, both directions, synthetic edges and the six-directory rule met; `recommendations` clause absent (L-8) |
| A-22 | ✅ | MET | independently re-run in full |
| A-23 | — | — | withdrawn by the specification |
| A-24 | ⬜ | ⬜ | device acceptance not performed (correct for this pass) |
| A-25 | ✅ | MET (caveat) | reproduced; fixture lighter than specified (L-10) |
| A-26 | ✅ | MET | foreign-row read independently re-verified |
| A-27 | ✅ | MET | |
| A-28 | ✅ | MET | both DB layers independently re-verified |
| A-29 | ✅ | MET | |
| A-30 | ✅ | MET | |
| A-31 | ✅ | MET | independently run on real PostgreSQL 16 and shown load-bearing |
| A-32 | ✅ | MET | |
| A-33 | ✅ | **PARTIAL** | five clauses unasserted (M-6); the missing 320×568 measurement hid H-1 |
| A-34 | ✅ | MET | |

---

## 10. Report-vs-tree discrepancies

1. **A-33 `✅`** — the editor is never measured at 320×568, and the limit message, disabled ends, announcement and 44 px clauses are unasserted (M-6). H-1 is the defect this concealed.
2. **A-12 `✅ "verified load-bearing by negative control"`** — the negative control proves the count, not the boundedness clause, which is unasserted (M-3).
3. **A-1 `✅`** — the cited inheritance from `volumeWeekBuckets.test.ts` does not cover eight windows, `weekStartsOn = 0` through the service, or any non-default timezone (M-4).
4. **A-17 `✅ (… empty state)`** — the per-row `No current estimate` clause is not covered; the test named for it asserts the opposite (M-5).
5. **Judgment calls 1 and 2** — both are justified by the editor showing *why* a row has no estimate; the editor discards that field (M-2).
6. **§7 performance** — the fixture is ~4× lighter than §20 step 2's stated shape; at the specified shape p95 is 44.97 ms, not 20.93 ms (L-10).
7. **§2 item 8 / README** — the reworded comment fix is accurate, but the README sentence lands in a paragraph that still denies Phase 6 (L-11).

Everything else in the report that I could check is accurate, including the full gate table, the test counts (836 / 354+16 / 106), the must-not-change git-diff claims, the migration verification, the disposable-database cleanup, and the dev-database residue disclosure.

---

## 11. Remediation checklist

**Must fix before device acceptance**

1. **H-1** — `min-w-0` on the candidate label (`SelectionEditor.tsx:178`) and on the row name `<span>` (`:132`); `w-full` on the `<select>`. Add a `scrollWidth` assertion for `/metrics/exercises` at 320×568 **and** 390×844, on a fixture whose candidate list contains a ≥ 50-character exercise name.
2. **M-1** — render `thisWeek.isDeload` on the "This week" column header, and use the shared amber badge markup for both columns rather than an appended string. Add a DOM assertion for the in-progress-deload-in-W0 case.
3. **M-2** — either render `SelectionRowDto.state` in the editor **and** bound `queryAllTimeFactRows` to `[instant(D−89), instant(D+1))` as step 9 does, or remove the state field and its query. Update judgment calls 1–2 to match whichever is chosen.
4. **M-3** — assert A-12's boundedness clause over the captured SQL text (`createTestDbWithStatementLog` already provides it), including step 9's `user_id`.
5. **M-4** — add a metrics-level fixture at `weekStartsOn = 0` and one at `Pacific/Kiritimati` covering all three of A-1's clauses.
6. **M-5** — fix the mis-titled e2e test so it asserts `No current estimate`, and add DOM coverage for `not_available` and `turned_off`.
7. **M-6** — assert the remaining A-33 clauses (limit message, disabled ends, `role="status"` announcement, 44 px controls, both viewports).

**Should fix**

8. L-1 (sparkline text alternative below two points), L-2 (sign and unit), L-3 (strings into `copy.ts`), L-4 (retain data and offer Refresh on an HTTP error).

**Worth correcting in the record**

9. L-5, L-6, L-7, L-8, L-9 (test strengthening); L-10, L-11, L-12 (report/doc accuracy); L-13 (drop the hard-coded `loadStepKg`).

A remediation touching only the items above needs no schema, migration, sync, engine, or boundary change, and none of it disturbs any file on the must-not-change list.

---

## 12. Working tree, resources and cleanup

- **No implementation file was modified.** `git status --porcelain` at the end of this review is byte-identical to the snapshot at its start, plus this file. Every pre-existing uncommitted change (`CLAUDE.md`, the `HANDOFF.md` deletion, `HANDOFF(depracted).md`, `.claude/skills/`, `docs/input/product-ideas.md`, `docs/reviews/repository-agent-workflow-*.md`, `docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md`) is untouched, as are all six metrics review/verification documents.
- **Temporary artifacts removed**: four scratch `tsx` scripts at the repository root and seven temporary Playwright specs under `tests/e2e/`, plus `test-results/` and `playwright-report/`. `pnpm lint` is clean and `pnpm format:check` shows only the pre-existing `src/server/sync/service.ts` warning, confirming nothing of mine remains.
- **Disposable databases dropped**: `gymapp_review_metrics`, `gymapp_review_conc`, `gymapp_review_e2e`, `gymapp_review_perf`, `gymapp_review_perf2`. `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` returns exactly the six databases present before this review (`gymapp` plus five unrelated ones from earlier sessions, which I neither created nor touched).
- **No production contact.** Every database operation ran against the local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`). The local dev database `gymapp` was read for two factual checks only (migration count, selection-table emptiness, fixture residue) and not written to. The production server started for the e2e runs was pointed at a disposable database and has been stopped.
- No commit, push, tag, deploy, or migration of any non-disposable database was performed.

---

# `READY FOR REMEDIATION`
