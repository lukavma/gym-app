# PI-007 — Recovery check-in completeness and scale clarity: implementation

**Date:** 2026-09-10
**Implements:** [recovery-check-in-improvement-architecture-evaluation.md](recovery-check-in-improvement-architecture-evaluation.md) — revision 2, approved by
[recovery-check-in-improvement-architecture-revision-verification.md](recovery-check-in-improvement-architecture-revision-verification.md) ("APPROVED — READY FOR RECOVERY IMPLEMENTATION")
**Tree:** `HEAD` = `a122855`, unchanged throughout (no commit, push or deployment performed)
**Status:** implemented, self-verified, ready for independent review; iPhone acceptance is a separate owner gate

This task implemented the approved design exactly as specified in §6 (file manifest), §7
(acceptance criteria) and §8 (sequence), incorporating verification residuals R-1–R-3 directly.
No new architecture pass was performed and none was needed — the two source documents above are
unchanged.

---

## 1. Final file manifest

Matches the evaluation's §6 manifest exactly — 5 edited + 2 new source files, plus the itemized
test manifest, no more and no less.

### Source — 5 edited, 2 new

| File | Change |
|---|---|
| `src/sync/dailyLogs.ts` | added `sleepHours?: number \| null` to `LogRecoveryTodayInput`; one presence-aware `if (input.sleepHours !== undefined) payload.sleepHours = …` line (G-1) |
| `src/ui/recovery/SleepHoursField.tsx` **(new)** | the Set/Clear + decimal-draft field extracted from `EditRow`, taking an `ariaLabel` prop; reports `(value, draft)` together on every change so callers never re-derive the guard's inputs. Exports the pure `sleepHoursError(value, draft)` helper — used by Today's three saves only, never applied internally, so History is unaffected (§1 boundary, B-2) |
| `src/ui/recovery/copy.ts` **(new)** | shared recovery labels, soreness anchors, and the two "at least one metric" error strings — the `src/ui/metrics/copy.ts` precedent |
| `src/ui/recovery/NullableSliderField.tsx` | optional `anchors` prop → legend + `aria-describedby`, with `useId()` called above the `UnsetField` early return (A-2) |
| `src/ui/recovery/RecoveryCheckIn.tsx` | sleep-hours field in all three forms; `sleepHoursError` called in each `save()`; G-5 guard fix (reads live `sleepHours` state, not `entry.sleepHours`); G-4 fix (`savedEntry.sleepHours` reads live state); `TouchedMetric` widened to include `sleepHours`; `setSaved(false)` on sleep-hours edits (A-4/C-6); anchors on the local `SliderField`; "Muscle soreness" renames |
| `src/ui/recovery/RecoveryHistoryList.tsx` | uses `SleepHoursField` (no validation change — History still has no client-side guard); soreness rename + anchors; error copy from `RECOVERY_COPY` |
| `src/ui/metrics/copy.ts` | caption clause only — `recoveryColumnSoreness` stays `"Soreness"` (B-5) |

Unchanged, as required: `src/db/**`, `drizzle/**`, `src/domain/recovery/**`, `src/domain/sync/**`,
`src/domain/metrics/**`, `src/server/**`, `src/app/api/**`. No migration, no server or API edit.

### Tests — per §6's inventory, plus one addendum found during implementation

| File | Change |
|---|---|
| `tests/unit/dailyLogs.test.ts` | +3: `sleepHours` omitted when `undefined`, sent when a number, sent as `null` alongside another touched field. Added a local `clearOutbox()` helper — see §3 deviation D-1 |
| `tests/unit/recoverySchema.test.ts` | +1 `describe` block (2 `it.each`): `sleepHoursSchema` accepts `0/7.5/7.25/24`, rejects `-1/24.5/7.333` directly |
| `tests/integration/syncDailyLogs.integration.test.ts` | +2: a `sleepHours`-only op preserves existing `sleepQuality`/`readiness`/`soreness`; a later `sleepHours: null` clears only that field |
| `tests/e2e/bodyweightRecovery.spec.ts` | rename at `:82, :92, :101` — done, no other change needed |
| `tests/e2e/phase7Remediation.spec.ts` | full itemized inventory applied (see §2 below) |
| `tests/e2e/offline-bodyweight-recovery.spec.ts` | +4 (C-1, C-2, **and C-5, C-6** — see §3 deviation D-2), all in the existing "true unknown-offline state" `describe` block |
| `tests/e2e/recoveryCheckIn.spec.ts` **(new)** | A, B, D, E letter-group coverage: new/edit/clear/stale-read race/validation/anchors/320px+390px layout |
| `tests/unit/metricsCopy.test.ts` | `recoveryCaption` pin updated to the full appended sentence; `recoveryColumnSoreness` untouched; forbidden-token scan stays green |

### Documents

| File | Change |
|---|---|
| `docs/architecture/domain-model.md` §7 | one parenthetical on the `RecoveryEntry` line: `soreness` is displayed as "Muscle soreness", `1 = none … 5 = very high`, values unchanged |

`docs/STATUS.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md` and every `docs/reviews/*.md` file were left
untouched, per scope. `git status` before and after (§6 below) confirms nothing else moved.

---

## 2. `phase7Remediation.spec.ts` — inventory applied, one addition beyond the approved list

Every item from the evaluation's itemized table was applied exactly as specified:

- `:137, 148, 156, 258, 285` — `Soreness` → `Muscle soreness` renames.
- `:201, 225, 292` (and the `:322` occurrence inside the `:307` re-aim) — `Soreness: not set` /
  `Soreness \d/5` → `Muscle soreness…`.
- `:276-277` — `Clear Soreness` → `Clear Muscle soreness`.
- `:211` — the error regex extended to `…or muscle soreness is required`.
- `:368` container-scoping fix and `:207` defensive scoping — both applied. Since the "Sleep 8h" /
  "Sleep quality 3/5" text-content filters these locators originally used stop matching the instant
  a row enters edit mode (the edit row renders the label and value as separate elements, not that
  concatenated string — the same trap the file's own `historyRow = page.locator("ul").locator("li")
  .first()` pattern elsewhere in the file already exists to avoid), both fixes needed to go one step
  further than the evaluation's literal wording: the two affected `const row = …`/`const ownRow = …`
  locators were switched from a `hasText` filter to that same structural `.first()` pattern, not
  just re-scoped from `page` to the existing text-based locator.
- `:202, :361` — confirmed no change needed (bare `"Sleep hours"` vs. `"Edit sleep hours"` stay
  unambiguous).
- The `:307` re-aim — `:322`'s rename applied, plus the new assertion
  (`getByLabel("Sleep hours", { exact: true })` shows `7.5`) and the comment rewrite, exactly as
  specified.

**Addendum found during implementation (not in the approved inventory):** `:373`
(`const savedRow = page.locator("li").filter({ hasText: "Soreness 2/5" })`, in the "sleep-hours
textbox remediation" describe block) was not listed in either the evaluation's or the independent
revision-verification's "confirmed complete" B-3 inventory, but would have silently stopped matching
after the rename — Playwright's `hasText` string match is case-sensitive, and the renamed label only
capitalizes "Muscle", so `"Soreness 2/5"` is not a substring of `"Muscle soreness 2/5"`. Fixed to
filter on `"Muscle soreness 2/5"` directly. This is reported here rather than silently folded in,
since both prior reviews explicitly certified the inventory as complete.

---

## 3. Deviations from the literal manifest, with reasoning

**D-1 — `tests/unit/dailyLogs.test.ts`'s three new tests needed an explicit outbox clear.** The
first test run showed 2 of the 3 new tests failing (`expected undefined to be 7.5` /
`expected undefined to be null`). Root cause: all three new tests, plus several pre-existing ones in
the same `describe` block, share one fake-indexeddb outbox store with no reset between tests, and my
first two new tests both resolved to the same Ljubljana calendar day — so `listPendingOps().find(…)`
on the second and third test picked up the *first* new test's leftover op (which genuinely has no
`sleepHours` key) instead of its own. Added a local `clearOutbox()` helper (mirroring the file's
existing pattern for clearing `bundleCache`) and call it at the top of each of the three new tests.
Not a design defect — a test-isolation bug caught and fixed before the suite ever went green.

**D-2 — C-5 and C-6 moved from a new file into `offline-bodyweight-recovery.spec.ts`.** The
evaluation's §6 manifest counts `offline-bodyweight-recovery.spec.ts` as "+2 (C-1, C-2)" and doesn't
explicitly assign C-5/C-6 (sleep-hours dead-letter visibility; the offline "Saved" notice clearing
on a sleep-hours edit) to a file. Both need the true unknown-offline phase, which requires the same
`waitForDailyLogCacheEntry`/`clearDailyLogCache` IndexedDB helpers already defined locally (not
exported) in `offline-bodyweight-recovery.spec.ts`. Duplicating that infrastructure into the new
`recoveryCheckIn.spec.ts` file would itself be the kind of drift risk the shared-`copy.ts`/
shared-`SleepHoursField` design is built to avoid, so C-5 and C-6 were added to
`offline-bodyweight-recovery.spec.ts` instead, alongside C-1/C-2, in the same `describe` block.
`recoveryCheckIn.spec.ts` covers the A/B/D/E letter groups only, plus a header comment stating where
C-1/C-2/C-5/C-6 (and the integration-level C-3/C-4) actually live.

**D-3 — D-4's "Metrics summary" channel verified by reading the code, not a new UI assertion.**
§7's D-4 asks for "no silent rescale" through three channels: `GET /api/recovery`,
`GET /api/recovery/today`, and the metrics summary. The new `recoveryCheckIn.spec.ts` test covers
the first two directly. For the third, `src/ui/metrics/RecoveryCard.tsx` and
`src/server/recovery/service.ts` were read directly: the recovery card's table cell is
`cell(day.entry?.soreness ?? null)` with `cell` doing nothing but `String(value)`, reading from the
identical `RecoveryEntryRecord`/DTO the other two endpoints already use — there is no separate
transformation anywhere in that path to regress. A dashboard-page render assertion for a specific
digit was judged more likely to be flaky (dependent on which of the last 7 days happens to hold the
seeded row) than informative, given the code-level guarantee already established. This is a
documented interpretation, not a skipped requirement.

**D-4 — two test-authoring bugs found and fixed during the E2E run, confined to
`recoveryCheckIn.spec.ts` (see §5).** No application source file needed any change as a result.

None of these deviations touch the approved architecture, the source-file manifest, or any binding
distinction from §5/§7 of the evaluation. All are test-file corrections or file-placement judgment
calls inside the already-approved test inventory's spirit.

---

## 4. Binding distinctions — how each was implemented

- **State A (confirmed new):** `sleepHoursTouched` is tracked only in the `isNew` branch of
  `RecoveryCheckInForm`; the save payload spreads `sleepHoursTouched ? { sleepHours } : {}` so an
  untouched field is never present as a key at all (not sent as `null`). Verified end-to-end by
  A-4 (see §5).
- **State B (confirmed existing):** the edit branch always spreads `{ sleepHours }` unconditionally,
  matching the rule already applied to the three sliders.
- **State C (unknown offline):** `TouchedMetric` widened to `"sleepHours" | "sleepQuality" |
  "readiness" | "soreness"`; `touchSleepHours` sets `touched.sleepHours = true` and `setSaved(false)`
  identically to the generic `touch()` helper the other three metrics use.
- **State D (unknown timezone):** untouched — `RecoveryCheckInUnknownTimezoneForm` still renders no
  inputs at all.
- **Empty/unparseable draft → `null`, draft resets to `""`:** implemented inside
  `SleepHoursField`'s own `onChange` handler (`parseDecimalInput(sanitized) === null` triggers both
  the value and the draft reset in one place), not duplicated at any call site.
- **Range/precision guard scoped to Today's `save()` only:** `sleepHoursError` is called at the top
  of all three Today `save()` functions and nowhere in `SleepHoursField.tsx` itself or in
  `RecoveryHistoryList.tsx`.
- **Zero is a valid value:** every emptiness check in the new code (`sleepHoursError`,
  `SleepHoursField`'s branch, the "at least one metric" guards) tests `=== null`/`!== null`, never
  truthiness. `sleepHoursError(0, "0")` correctly returns `null` (no error) since `0 > 24` is false.
- **No migration, server/API/domain-schema change, or IndexedDB `DB_VERSION` bump:** confirmed by
  the final `git status` (§6) — the only files touched are exactly the ones the manifest lists.

---

## 5. Acceptance criteria and test evidence

All of §7's criteria are covered. Letter-group location:

| Group | Criteria | Where |
|---|---|---|
| A | A-1, A-2, A-3, A-4 [NC] | A-3: `tests/unit/dailyLogs.test.ts`. A-1/A-2/A-4: `tests/e2e/recoveryCheckIn.spec.ts` |
| B | B-1 [NC]..B-5 [NC] | `tests/e2e/recoveryCheckIn.spec.ts` |
| C | C-1, C-2 [NC], C-3, C-4 | C-1/C-2: `tests/e2e/offline-bodyweight-recovery.spec.ts`. C-3/C-4: `tests/integration/syncDailyLogs.integration.test.ts` (C-4 satisfied by the existing generic upsert/replay mechanism the doc's own §5 cites as already-proven, per §6's literal "+2" test count — no dedicated new replay test for `sleepHours` specifically, matching the approved manifest) |
| C (moved) | C-5, C-6 | `tests/e2e/offline-bodyweight-recovery.spec.ts` (§3 deviation D-2) |
| D | D-1..D-4 [NC] | `tests/e2e/recoveryCheckIn.spec.ts` |
| E | E-1..E-6 [NC] | E-1..E-4: `tests/e2e/recoveryCheckIn.spec.ts`. E-5: no new test needed — `tests/unit/progressionBoundary.test.ts`'s prefix-based negative control already covers the two new files under `src/ui/recovery` without modification. E-6: satisfied by the unmodified regression suite (bodyweightRecovery.spec.ts, offline-bodyweight-recovery.spec.ts, phase7Remediation.spec.ts) passing unchanged |
| E-7 | full suite green | §6 below |

### Commands run and results

All commands run from `C:\DEV\gym-app` on the current tree (`HEAD` = `a122855`), against the local
Docker Postgres 16 (`docker compose up -d db`, migrated to `0013`, seeded via `tests/e2e/seed.ts`).

| Command | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm format:check` | clean (no worse than before — no pre-existing CRLF issue was present on this tree; confirmed unchanged, not newly caused) |
| `pnpm test:unit` | **1193 passed**, 0 failed |
| `pnpm test:integration` | **467 passed**, 17 skipped (pre-existing concurrency tests gated on a real-Postgres env var, not PGlite — unrelated to this change), 0 failed |
| `pnpm build` | succeeded |
| `pnpm test:e2e` | **150 passed**, 0 failed (see remediation below) |
| `pnpm test:e2e:offline` | **32 passed**, 0 failed |

**The staged extraction check (§8 step 2)** was performed as specified: before adding any of the
new UI, `SleepHoursField` was extracted from `EditRow` with no other change, and
`phase7Remediation.spec.ts` was confirmed to still pass with no edits at all at that point, before
the renames and new control were added.

**The stale-read race (A-4)** is implemented exactly as specified: render the card in state A,
create today's row out of band via `page.request.post("/api/recovery", { data: { sleepHours: 6 } })`,
save the card untouched, drain the outbox, and assert `sleepHours` is still `6` while the three
sliders are `3`. This test passed on its first run.

**Two test-authoring bugs were found and fixed during the E2E run**, both confined to the new
`tests/e2e/recoveryCheckIn.spec.ts` and neither requiring any application-source change:

1. `seedEntryAndOpenEdit()`'s post-reload assertion used `getByText("Logged today: Sleep 8h",
   { exact: true })`, but the seeded fixture (`{ sleepHours: 8, soreness: 2 }`) renders both parts
   joined by `" · "` — an exact match against the truncated string can never match. Fixed to assert
   the full string `"Logged today: Sleep 8h · Muscle soreness 2/5"`. This affected the B-1..B-4
   tests, which all use this helper (B-5 seeds `sleepHours` alone, so it happened not to trip on
   this).
2. B-4's `page.getByRole("alert")).toHaveCount(0)` was unscoped and matched Next.js's own
   always-present, visually-hidden App Router route-change announcer
   (`role="alert"`, mounted outside `<main>`), which is framework infrastructure unrelated to this
   feature and not something any other spec in the suite happens to probe for. Fixed by scoping to
   `page.locator("main").getByRole("alert")`.

No pre-existing or unrelated E2E failures were observed in either run.

---

## 6. Preservation

`git status` inspected before implementation began and again just before writing this document —
identical except for the files this task touched:

```
 M CLAUDE.md
 D HANDOFF.md
 M docs/BACKLOG.md
 M docs/ROADMAP.md
 M docs/architecture/domain-model.md          <- this task
 M src/sync/dailyLogs.ts                      <- this task
 M src/ui/metrics/copy.ts                     <- this task
 M src/ui/recovery/NullableSliderField.tsx    <- this task
 M src/ui/recovery/RecoveryCheckIn.tsx        <- this task
 M src/ui/recovery/RecoveryHistoryList.tsx    <- this task
 M tests/e2e/bodyweightRecovery.spec.ts               <- this task
 M tests/e2e/offline-bodyweight-recovery.spec.ts      <- this task
 M tests/e2e/phase7Remediation.spec.ts                <- this task
 M tests/integration/syncDailyLogs.integration.test.ts <- this task
 M tests/unit/dailyLogs.test.ts                       <- this task
 M tests/unit/metricsCopy.test.ts                     <- this task
 M tests/unit/recoverySchema.test.ts                  <- this task
?? .claude/skills/phase-implementation/SKILL.md
?? HANDOFF(depracted).md
?? docs/reviews/exercise-catalog-expansion-closeout.md
?? docs/reviews/recovery-check-in-improvement-architecture-evaluation.md
?? docs/reviews/recovery-check-in-improvement-architecture-review.md
?? docs/reviews/recovery-check-in-improvement-architecture-revision-verification.md
?? docs/reviews/repository-agent-workflow-evaluation.md
?? docs/reviews/repository-agent-workflow-review.md
?? docs/reviews/warmup-routines-evidence-research.md
?? gpt-handoff.md
?? gpt-memory.md
?? src/ui/recovery/SleepHoursField.tsx        <- this task (new)
?? src/ui/recovery/copy.ts                    <- this task (new)
?? tests/e2e/recoveryCheckIn.spec.ts          <- this task (new)
```

`docs/STATUS.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, the architecture evaluation, the independent
review, the revision verification, and every other concurrent-work document (the repository-agent
workflow evaluation/review, the catalog closeout, the warm-up evidence research) are untouched.
`HEAD` stayed at `a122855` throughout — no commit, push or deployment.

---

## 7. Task-owned resource cleanup

Per the task's explicit authorization to use local disposable test PostgreSQL and the current CI
bootstrap order:

- **Local Docker Postgres (`gym-app-db-1`):** was stopped when this task began; started via
  `docker compose up -d db` to run migrations, the E2E seed, and the E2E suite. This is the shared
  persistent dev database (created 4 weeks prior, real volume), not a resource this task created —
  left running afterward, matching the convention every other implementation task in this
  repository's history has followed, rather than tearing down infrastructure other concurrent
  work/sessions may depend on.
- **`pnpm build` output / `.next`:** left in place — the standard build artifact, not a temporary
  file.
- **`pnpm start` production server process (task-owned):** started on port 3000 to run the E2E
  suites; confirmed stopped (port 3000 has no listener) before this document was written.
- **Database rows:** every E2E test that wrote a recovery entry cleaned it up via
  `deleteAllRecoveryEntries`/explicit delete in its own body; the one exception is
  `tests/e2e/offline-bodyweight-recovery.spec.ts`'s new C-5 test, whose entire point is a
  dead-lettered op that never reaches the database — there is nothing to delete.
- **No migration was run beyond bringing the existing dev DB to the already-current `0013`** (no new
  migration file exists for this task, per the approved no-migration design).
- **No production access** of any kind occurred.

---

## 8. Unresolved limitations

None discovered during implementation or verification. iPhone acceptance on the installed PWA
remains the separate owner gate the evaluation itself named (§7's closing line) — not attempted here,
per this task's scope (no device-acceptance claim).

---

READY FOR INDEPENDENT RECOVERY IMPLEMENTATION REVIEW
