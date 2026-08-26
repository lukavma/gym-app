# Phase 7 — Targeted Remediation Verification

Verifier: independent verification pass. Date: 2026-08-26.
Subject: uncommitted working tree at `main` @ `8c09049`, after the remediation described in
`docs/reviews/phase-7-remediation.md`.

Documents reviewed: `docs/reviews/phase-7-review.md` (the original independent review),
`docs/reviews/phase-7-remediation.md`, and the actual working-tree diff.

Scope: verify that BLOCKER-1, HIGH-1, HIGH-2, HIGH-3 and MEDIUM-1, MEDIUM-2, MEDIUM-3 are
genuinely closed; confirm previously-proven areas were not regressed; confirm the LOW findings
were not silently expanded.

No implementation file, review report, or user-owned file was modified. Nothing was
remediated, committed, pushed or deployed. No production access. All database and browser work
ran against a disposable local PostgreSQL 16 database (`gymapp_rev7b`), created fresh and
dropped within this pass; the working tree was verified byte-identical to its pre-verification
state afterwards.

---

## 1. Method

Shipped assertions were re-run, but nothing was concluded from them. Every finding was
re-tested by **reproducing the original failure mode** from `phase-7-review.md` against the
remediated code, with independent fixtures and negative controls.

| Instrument | Purpose |
|---|---|
| Fresh `gymapp_rev7b`, migrated 0000–0009 from empty, seeded via the documented recipe | Real PostgreSQL, not PGlite |
| 63-assertion service-layer harness on real PostgreSQL | MEDIUM-1 presence semantics, MEDIUM-3 date fuzz, HIGH-1 server half, **plus a full re-run of every area the original review proved correct** |
| 924-input exhaustive date fuzz vs. independently computed ground truth | MEDIUM-3, including leap-century rules |
| 11 independent end-to-end controls driving the **real** `walkImportGraph` over on-disk fixture files | HIGH-3 — the shipped suite only proves extraction on synthetic *strings* |
| Playwright geometry probes, 4 viewports × 7 routes | BLOCKER-1, HIGH-2 |
| UI-only reproduction of the original destructive-save sequence | HIGH-1 |
| Three read-back failure modes (abort / HTTP 500 / malformed JSON) with `serviceWorkers: "block"` | HIGH-1 failure path |
| UI-only reachability chain for the fabrication defect | MEDIUM-2 |
| Runtime non-consumption differential with volatile-field and sensitivity controls | Regression check on the boundary |

One correction to my own instrumentation: an initial read-back-failure probe reported 0
intercepted requests — `page.route()` was not seeing the fetch because the service worker was
serving it. Re-run with `serviceWorkers: "block"`, all three failure modes intercepted and
passed. That earlier result was a probe defect, not a product defect.

---

## 2. Findings verified closed

### BLOCKER-1 — nav overflow · **CLOSED**

`src/app/(app)/layout.tsx` adds `flex-wrap` with `gap-x-4 gap-y-2`. Measured independently at
every reviewed viewport, across all seven routes (`/today`, `/bodyweight`, `/recovery`,
`/volume`, `/exercises`, `/history`, `/programs`):

| Viewport | Document overflow | All 7 nav links fully on-screen | Nav rows |
|---|---|---|---|
| 375×667 (iPhone SE) | none | yes | 2 |
| 390×664 (Safari usable) | none | yes | 2 |
| 390×844 (iPhone 12–15) | none | yes | 2 |
| 430×844 (15 Pro Max) | none | yes | 2 |

The original defect — `scrollWidth 481` vs `clientWidth 375/390/430`, "Recovery" at x=426–481
entirely off-screen on every width, and horizontal page scroll propagating to routes outside
Phase 7's scope — does not reproduce anywhere. `Recovery` is now geometrically on-screen with
zero scrolling, so the fallback that makes permanent dismissal of the Today card safe is
genuinely reachable on a phone.

### HIGH-1 — destructive re-prompt · **CLOSED**

The original sequence was reproduced exactly: log 5/5/5 with a distinctive note, reload, then
save. Results against the remediated build:

- After reload, **no blank check-in form is rendered at all** (0 "Save check-in" buttons). The
  card shows `Logged today: Sleep quality 5/5 · Readiness 5/5 · Soreness 5/5` plus the note.
- "Edit today's check-in" pre-fills every slider from the **real** entry (5/5/5, not 3/3/3) and
  the real note.
- Saving without changing anything preserves `5/5/5` and the note, and still yields exactly one
  row. The original one-tap destruction has no remaining path.
- `sleepHours` set out-of-band (7.25) survives a card save untouched — the card omits the key
  rather than nulling a value it cannot display.

Server half, on real PostgreSQL: `getTodayRecoveryEntry` returns `null` with nothing logged,
returns today's entry resolved from the **user's** timezone (a `Pacific/Kiritimati` user at
`2026-06-15T12:00Z` correctly gets the `2026-06-16` row, which a UTC-based implementation would
miss), never returns a different day's row, and is user-scoped.

**Failure path** (the risk being that a failed read-back falls back to the destructive blank
form): under network abort, HTTP 500, and a malformed JSON body, the card renders an explicit
"Couldn't check today's recovery entry" message with **zero** sliders and zero save buttons,
presents no stale summary as fact, and the stored entry is untouched in all three cases.

### HIGH-2 — CTA below the fold · **CLOSED**

`TodaySection.tsx` moves both widgets after the session-state blocks. Measured with the
recovery card in its tallest (unlogged form) state and no active session:

| Viewport | "Start workout" bottom | Verdict | Recovery card top |
|---|---|---|---|
| 375×667 | 344 px | above fold (was 716 px, needed 97 px of scroll) | 513 px |
| 390×664 | 344 px | above fold (was 716 px, needed 100 px of scroll) | 513 px |
| 390×844 | 344 px | above fold | 513 px |
| 430×844 | 344 px | above fold | 513 px |

The trade-off was checked rather than assumed: the bodyweight quick-log now sits at y=413 px —
still **above the fold at every reviewed viewport**, including 375×667 — and F10's headline
criterion still holds, verified by real taps: tap field, type, tap Save, entry persisted, URL
stays `/today`. Two interactions, no navigation, no scrolling required.

### HIGH-3 — weak boundary guard · **CLOSED**

`tests/unit/importGraphWalker.ts` parses with the TypeScript compiler's AST. The shipped suite
proves the extractor handles each form on synthetic *strings* and that the walk is clean from
the real roots — but its only live positive control, `TodaySection.tsx`, uses single-line
imports, i.e. the one form the old regex already caught. I closed that gap with 11 independent
controls that write real fixture files and run the **actual** `walkImportGraph`:

| Control | Resolved *and* traversed to a forbidden module |
|---|---|
| Multi-line static import (the form the old test missed) | yes |
| Dynamic `import()` | yes |
| `require(...)` | yes |
| Named re-export `export { x } from` | yes |
| Type-only `import type` | yes |
| Relative path (not the `@/` alias) | yes |
| Side-effect-only `import "…"` | yes |
| 3-hop chain through two re-exporting barrels | yes |

Precision holds in the other direction: string literals that merely look like module paths are
not followed, and bare package specifiers resolve to `null`. The live boundary re-walks clean —
65 modules from 8 roots, no forbidden module reachable, and the walk demonstrably reaches
`src/db/schema/index.ts`, so the clean result is not vacuous. Roots now include
`src/server/progression/service.ts` and the five API assembly routes, closing the review's
second gap.

### MEDIUM-1 — wholesale upsert · **CLOSED**

Verified on real PostgreSQL:

- Log `{sleepHours: 7.5, sleepQuality: 4, note: "first note"}`, then a same-day
  `{readiness: 3}` → `sleepHours` **7.5 preserved**, `sleepQuality` **4 preserved**, note
  **preserved**, readiness applied. Both original data-loss modes are gone.
- Explicit `null` still clears deliberately, and untouched fields survive the clear.
- The has-metric guard maps to `RecoveryEntryHasNoMetricError`, not a raw 500 —
  `isPostgresErrorCode` recurses through `err.cause`, which is the correct shape for
  drizzle-orm's wrapped driver errors. The rejected statement never commits.
- **Atomicity preserved**: 8 concurrent first inserts through the rewritten path — zero
  rejections, exactly one surviving row. Two concurrent *partial* upserts each preserve the
  fields they omit (`sleepHours` 8, `sleepQuality` 5, note intact).

One accurate characterization, not a defect: because the INSERT side fills omitted columns with
`null` and PostgreSQL evaluates CHECK constraints against the proposed insert tuple even when
the statement takes the DO UPDATE branch, a *clears-only* payload is rejected even though the
merged row would be valid. This is unreachable through the route —
`logRecoveryInputSchema.refine(hasAnyMetricValue)` requires at least one numeric metric on every
accepted payload — and the rejected statement leaves the row untouched. Worth knowing before
the schema is ever relaxed.

### MEDIUM-3 — impossible dates reaching PostgreSQL · **CLOSED**

An exhaustive fuzz of 924 inputs (two years × months 00–13 × days 00–32) compared
`dateOnlySchema` against independently computed ground truth: **0 mismatches**, and **0 accepted
dates were rejected by PostgreSQL**. Leap rules are right at the century boundaries —
`1900-02-29` and `2100-02-29` rejected, `2000-02-29` and `2028-02-29` accepted. Every specific
string from the original finding (`2026-13-45`, `2026-02-30`) is now a 400 at the schema layer
and never reaches the database.

---

## 3. Finding NOT fully closed

### MEDIUM-2 — metric fabrication · **history editor fixed; the same defect now exists in the Today card**

The finding as literally written is closed. `RecoveryHistoryList`'s `EditRow` was verified
directly: an entry with `sleepHours: 8` and all three 1–5 metrics genuinely `null` renders
"Sleep quality: not set" / "Readiness: not set" / "Soreness: not set", saving preserves the
nulls (`{sh:8, sq:null, rd:null, so:null}`), `sleepHours` is editable and shows its real value,
and clearing the last metric is blocked client-side with a visible error while nothing is
written.

But the **same defect class now lives in `RecoveryCheckInForm`**, which this remediation newly
wrote for HIGH-1. Its sliders are seeded `entry?.sleepQuality ?? NEUTRAL`, and it always submits
all three as numbers. So a null metric on *today's* entry is fabricated as `3` the moment the
user opens the Today card's new edit path.

This is reachable through the remediated UI alone — no API calls, no unusual state. Verified
step by step:

1. Log today's check-in from the Today card. → `sleepQuality 3, readiness 3, soreness 3`
2. On `/recovery`, use the history editor's **"Clear" affordance that this remediation added**
   to clear Sleep quality and Soreness. → `{sq: null, rd: 3, so: null}` — correct, and the
   Today summary correctly omits them (`Logged today: Readiness 3/5`).
3. Back on Today, tap "Edit today's check-in". → sliders render
   `Sleep quality=3 Readiness=3 Soreness=3` — the two cleared metrics silently reappear as 3s.
4. Tap "Save check-in" without changing anything. → **`sleepQuality 3, soreness 3` are written
   back.** The user's deliberate clear is overwritten with synthetic observations.

The remediation's own MEDIUM-2 fix creates the state that its own HIGH-1 fix then destroys. The
harm is the one the original finding named: fabricated values become indistinguishable from real
ones in the history whose entire purpose (EVIDENCE-027 / OD-09) is honest accumulation for a
future heuristic. Severity is unchanged from the original: **MEDIUM**.

The fix is small and local — `RecoveryCheckInForm` needs the `number | null` treatment
`NullableSliderField` already implements in the sibling component, or it must omit null metrics
from its payload rather than sending a fabricated number.

### New LOW — emptying the sleep-hours text box shows one value and saves another

Also in newly-written MEDIUM-2 code. `RecoveryHistoryList`'s sleep-hours input only commits
`if (parsed !== null)`, so clearing the text box leaves the previous number in component state.
Verified: field displays `""`, stored value after Save is still `8`. No data is lost, and the
"Clear" button is the correct affordance, but the control silently ignores an edit the user
believes they made. Worth folding into the MEDIUM-2 fix.

---

## 4. Regression checks — all clean

**Every area the original review proved correct was re-verified, not assumed** (63/63
service-layer assertions on real PostgreSQL):

- **Timezone/DST**: UTC+14 vs UTC−11 users diverge correctly on the same instant; spring-forward
  and fall-back both yield one row on the correct day. Recovery DST now runs through the
  *rewritten* upsert and still preserves the omitted field across the transition.
- **Atomic upserts**: bodyweight (untouched) and recovery (rewritten) both survive 8 concurrent
  first inserts with exactly one row.
- **Ownership scoping**: all four cross-user mutations → `NotFound`, victim's row untouched,
  attacker's list empty. The new `getTodayRecoveryEntry` does not leak across users, and the new
  `GET /api/recovery/today` returns 401 with no payload to an anonymous caller.
- **True deletion**: row physically gone; no `archived_at`/`deleted_at` columns.
- **Numeric precision**: 83.455 rejected, 83.45 round-trips exactly, range bounds enforced,
  schemas still `.strict()`.
- **Non-consumption**: statically re-walked clean (65 modules), and re-verified at runtime —
  worst-case recovery data (`sleepHours 0, sleepQuality 1, readiness 1, soreness 5`) changes
  nothing in `/api/today-bundle`, `/api/active-session` or `/api/history` beyond the volatile
  `generatedAt` field a no-write control shows changing on its own. A sensitivity control
  confirms the method detects real changes.
- **Schema/migration untouched**: `pnpm db:generate` reports no drift; `drizzle/0009_*.sql` and
  both schema modules are unchanged from the reviewed state. No file under
  `src/domain/progression` or `src/server/progression` was modified.

**Shipped suites, re-run independently**: `test:unit` 459/459 (35 files) · `test:integration`
241 passed + 5 skipped (246 total, 20 files) · `test:e2e` 42/42 including all 6 BLOCKER-1
geometry tests, all 4 HIGH-2 fold tests, the HIGH-1 and MEDIUM-2 regression tests, and every
pre-existing spec with zero regressions · `typecheck`, `typecheck:sw`, `lint`, `format:check`
all clean · build emits `/api/recovery/today`.

**LOW findings were not silently expanded.** LOW-1 (`BodyweightQuickLog` still starts empty, no
read-back), LOW-3 and LOW-4 (`docs/architecture/` has no diff at all), LOW-5 (input sizing
unchanged) and LOW-6 all remain exactly as the review left them. LOW-2 is resolved as the
remediation report documents, and its reasoning holds: a persistent editable summary and a
terminal "thanks" state are mutually exclusive, so HIGH-1 could not be fixed without it. The
`tests/e2e/helpers.ts` addition is a scoped test-cleanup helper with no product surface.

**Remediation report accuracy.** The changed-file list matches `git status` exactly, with
nothing unreported. Counts reproduce (`progressionBoundary.test.ts` 12 tests; unit 459; e2e 42).
One wording slip: the report states `test:integration` was "246/246 passed, 5 skipped"; the
actual result is 241 passed and 5 skipped for 246 total — the same convention the original
implementation report used correctly. No substantive claim depends on it.

---

## 5. Assessment

Six of the seven scoped findings are genuinely and thoroughly closed, and several are closed
better than the remediation report claims. BLOCKER-1 and HIGH-2 are now measured facts at every
reviewed viewport rather than assertions. HIGH-1's read-back holds under all three failure modes
I could construct, including the one that mattered most — a failed read-back must not fall back
to the destructive blank form, and it does not. MEDIUM-1's presence semantics are correct
*without* sacrificing the single-statement atomic upsert, which was the hard part and was solved
well. MEDIUM-3 survives an exhaustive fuzz against independent ground truth. HIGH-3's walker is a
genuine improvement that my own end-to-end controls could not defeat.

The one gap is narrow but real, and it is not a leftover — it is new code. In fixing HIGH-1 the
remediation wrote a second editing surface for recovery metrics and gave it the exact
`?? NEUTRAL` seeding that MEDIUM-2 was raised about, while the MEDIUM-2 fix simultaneously gave
users a "Clear" button that produces the null state which triggers it. The two fixes interact to
recreate the original defect through a path that consists entirely of ordinary UI actions.

Nothing here is architectural, and nothing else regressed. But a confirmed, UI-reachable path
that silently overwrites a deliberate user action with fabricated data is the same class and
severity of defect the user scoped as blocking for this gate, so it should be closed before the
phase goes to a device.

---

## Verdict

**REMEDIATION INCOMPLETE**
