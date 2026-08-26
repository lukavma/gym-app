# Phase 7 — Bodyweight & Recovery Logs: Independent Adversarial Review

Reviewer: independent review pass. Date: 2026-08-25.
Subject: uncommitted working tree at `main` @ `8c09049` (Phase 6 volume tracking).
Implementation report under review: `docs/reviews/phase-7-implementation.md`.

Binding sources: `implementation-plan.md` Phase 7 · `mvp-scope.md` F10 and §1 cross-cutting
constraints · `domain-model.md` §7 · `data-model.md` §1 and §§2.18–2.19 ·
`evidence-to-design.md` EVIDENCE-027 / map row 14 · `open-decisions.md` OD-09.

No implementation file, the implementation report, or any user-owned file was modified.
Nothing was committed, pushed, or deployed. No production access. All database work ran
against a disposable local PostgreSQL 16 database (`gymapp_rev7`), created and dropped
within this review; the working tree was verified byte-identical to its pre-review state
afterwards.

---

## 1. What this review did

The review did not accept the report or the shipped tests as evidence. Independent
fixtures were built and run, and every shipped suite was re-executed from scratch.

| Instrument | What it was for |
|---|---|
| Fresh `gymapp_rev7` PostgreSQL 16 database, migrations 0000–0009 applied from empty | Real-schema verification, not PGlite |
| `\d bodyweight_entries` / `\d recovery_entries` on the live database | Column, constraint, index, FK, ownership verification |
| 42-assertion service-layer harness against real PostgreSQL | Timezone/DST, concurrency, ownership, deletion, precision, upsert semantics, merge guards |
| Independent transitive import-graph walker (resolves `@/`, relative, dynamic `import()`, `require()`, re-exports) | Non-consumption, stronger than the shipped test |
| Negative control on the walker (`TodaySection.tsx`, which genuinely does import both) | Proof the walker detects real edges |
| Negative control replicating the *shipped* boundary test's own line filter | Measure what that test can and cannot catch |
| Playwright geometry probes at 390×844, 375×667, 430×844, 390×664 | iPhone layout, ≤2-interaction claim, nav reachability, fold position |
| Live UI probe of the recovery re-prompt path | Data-preservation behaviour across a reload |
| Runtime non-consumption control with an A/B clock control and a sensitivity control | Prove engine output is unaffected by recovery data, and that the method could detect it if it were |
| Full `test:unit`, `test:integration`, `test:e2e`, `typecheck`, `typecheck:sw`, `lint`, `format:check`, `db:generate` | Reproduce every claim in the report |

---

## 2. What is correct

These were adversarially probed and held up. They are stated here because several are the
riskiest parts of the phase and they are genuinely well built.

**Schema and migration.** `drizzle/0009_gigantic_luminals.sql` is generated, not hand-edited.
Applied from an empty database, the live schema matches `data-model.md` §§2.18–2.19
column-for-column: types, nullability, `uq_bodyweight_day` / `uq_recovery_day`, all five
recovery check constraints including `ck_recovery_entries_has_metric`, the weight range
check, and both `user_id` FKs. `pnpm db:generate` re-run afterwards reports no drift and
leaves the working tree untouched. No `archived_at`/`deleted_at` column exists on either
table, matching `data-model.md` §1's "true row deletion for user-owned facts".

**User-local date handling — genuinely correct, and better than the shipped tests prove.**
The shipped integration test asserts `2026-08-20T12:00:00Z` → `2026-08-20` for a
`Europe/Ljubljana` user. That assertion passes identically under a naive UTC implementation,
so it proves nothing. Probes were built where UTC and user-local disagree:

- `Pacific/Kiritimati` (UTC+14) and `Pacific/Niue` (UTC−11) given the **same instant**
  produce `2026-06-16` and `2026-06-15` respectively — the user's own timezone is genuinely
  the input, read per-user from `users.timezone`.
- `2026-06-15T23:30:00Z` correctly rolls a Ljubljana user to `2026-06-16`.
- Spring-forward (`Europe/Ljubljana`, 2026-03-29): 00:30 CET and 03:30 CEST both resolve to
  `2026-03-29` and **upsert the same row** (identical id), so the transition cannot split a
  day into two entries.
- Fall-back (`America/New_York`, 2026-11-01): the repeated 01:30 local hour maps to
  `2026-11-01` on both passes and yields exactly one row.

`userLocalDateString` delegates to `Intl.DateTimeFormat` with an explicit `timeZone`, so the
*server's* own timezone is irrelevant. The browser's timezone is likewise irrelevant: the
quick-log never sends a date, and both history lists render `entry.date` as a raw string
without ever constructing a `Date`, so there is no off-by-one on display.

**Same-day upserts are truly atomic.** `logBodyweight` / `logRecovery` use a single
`INSERT … ON CONFLICT (user_id, date) DO UPDATE`. Eight genuinely concurrent *first* inserts
for the same user and day, on separate real pool connections, were fired for both entities:
zero rejections, exactly one surviving row each. There is no read-then-write window and no
409 path. This satisfies the plan's "second entry same day = update" requirement under
concurrency, not just serially.

**Ownership scoping is complete.** List, PATCH and DELETE were each attacked cross-user with
a valid foreign entry id. All four mutation paths raise `…NotFoundError` (→ HTTP 404),
identical to "does not exist" — no existence leakage — and the victim's row was verified
byte-identical afterwards. `listBodyweightEntries` / `listRecoveryEntries` return zero rows
for the non-owner. All routes gate on `requireUserId()` before any database access.

**True deletion.** After `deleteBodyweightEntry`, the row is physically absent
(`count(*) = 0`), and neither table carries a soft-delete column.

**Numeric precision.** `83.455` is rejected by `.multipleOf(0.01)` before it can silently
round to `83.46` in `numeric(5,2)`; `83.45` round-trips exactly and returns as a JS `number`.
Range boundaries (`19.99`, `400.01`) are rejected at the schema layer, in front of the DB
check constraint.

**Non-consumption — verified two independent ways, both stronger than the shipped test.**

1. *Static, transitive.* Walking the full import graph from `engine.ts`,
   `evaluateSession.ts`, `server/progression/service.ts`, `/api/today-bundle`,
   `/api/active-session`, `/api/sync`, `/api/history` and `/api/volume` — 65 modules reached
   — nothing under `src/domain/{bodyweight,recovery}`, `src/server/{bodyweight,recovery}` or
   `src/ui/{bodyweight,recovery}` is reachable. The walker's negative control
   (`TodaySection.tsx`) correctly reports its three real edges, so the clean result is
   meaningful. The only path that touches the new tables at all is the `src/db/schema` barrel
   that `db/client.ts` hands to `drizzle()` — a table registry every service shares, not a
   read path.
2. *Runtime.* With the worst-case recovery signal the API accepts logged
   (`sleepHours: 0, sleepQuality: 1, readiness: 1, soreness: 5` — precisely what an
   autoregulated deload would key on) plus an extreme bodyweight, `/api/today-bundle`,
   `/api/active-session` and `/api/history` were captured before and after and diffed
   field-by-field. The **only** differing field is `generatedAt`, which a no-write control
   1.1 s apart shows changing on its own. A sensitivity control confirms the method detects
   real changes. `EvaluationContext.recovery` remains `recovery?: undefined`. No file under
   `src/domain/progression` was modified. OD-09 stays closed; EVIDENCE-027 is respected.

**No unauthorized scope.** No charts, trends, rolling averages, sparklines or persisted
aggregate columns anywhere in the new code. No charting or other dependency was added
(`package.json` / `pnpm-lock.yaml` unchanged). No outbox, IndexedDB, service-worker or sync
involvement — the new endpoints are plain online REST, and nothing in `src/sync` references
them. Nothing from Phase 8/9/10 leaked in.

**The ≤2-interaction bar is met.** Measured on a real 390×844 touch viewport: tap the
bodyweight field, type, tap Save — two taps, no navigation, URL stays `/today`, confirmation
rendered. F10's headline acceptance criterion passes.

**Report accuracy.** Every verification claim in the implementation report reproduced
exactly: `test:unit` 449/449 (35 files); `test:integration` 232 passed / 5 skipped (18 files
+ 2 skipped); `test:e2e` 26/26 against a freshly bootstrapped disposable database following
the documented seed recipe; `typecheck`, `typecheck:sw`, `lint`, `format:check` all clean;
`db:generate` reports no drift. Per-file new-test counts (13 / 14 / 14) are exact. The
"Files changed" list matches `git status` with nothing unreported. `CLAUDE.md`,
`docs/input/product-ideas.md`, `HANDOFF.md`, `gpt-handoff.md`, `gpt-memory.md` and
`.claude/skills/` are pre-existing working-tree state unrelated to Phase 7, as the report
states — the `CLAUDE.md` diff is the compaction-policy section, not a Phase 7 edit.

One claim in the report is **not** accurate; see BLOCKER-1.

---

## 3. Findings

### BLOCKER-1 — The two new nav links overflow every iPhone width, horizontally scrolling every screen in the app and pushing "Recovery" entirely off-screen

`src/app/(app)/layout.tsx:26-31`

The nav is `flex w-full max-w-sm gap-4` with computed `flex-wrap: nowrap` and
`overflow-x: visible`. It held five links. Phase 7 added two more. Measured link geometry:

| Viewport | Pre-Phase-7 nav ended at | "Bodyweight" | "Recovery" | Document width |
|---|---|---|---|---|
| 375 px (iPhone SE) | x = 321 — **fit** | 337–410 → clipped | 426–481 → **fully off-screen** | 481 vs 375 |
| 390 px (iPhone 12–15) | x = 321 — **fit** | 337–410 → clipped | 426–481 → **fully off-screen** | 481 vs 390 |
| 430 px (15 Pro Max) | x = 328 — **fit** | visible | 433–488 → **fully off-screen** | 488 vs 430 |

Because the nav neither wraps nor scrolls internally, the overflow propagates to
`documentElement`: **every screen in the app** now has 91 px of horizontal page scroll —
`/today`, `/bodyweight`, `/recovery`, and also `/volume`, `/exercises`, `/history`,
`/programs`, which Phase 7 otherwise never touched. Confirmed by probing each route
individually and identifying the two new `<a>` elements as the sole offenders.

Why this is a blocker rather than cosmetic:

1. It violates `mvp-scope.md` §1's cross-cutting constraint, "phone-first layouts for every
   MVP screen", and regresses screens outside this phase's scope.
2. It falsifies a load-bearing claim in the implementation report — "added 'Bodyweight' and
   'Recovery' nav links (findable from every screen, not just Today)". On every iPhone width
   tested, "Recovery" is findable from *no* screen without discovering horizontal page scroll.
3. It undermines the design that makes permanent dismissal safe. The report's own argument
   for `RecoveryCheckIn`'s "Don't ask again" is that "the dedicated `/recovery` page always
   offers a check-in regardless of that preference, satisfying 'recovery is optional but
   never inaccessible'." Dismiss the Today card and the only remaining entry point is a nav
   link that is off-screen on the target device. Optional-but-reachable degrades to
   effectively unreachable.

The new E2E spec runs at 390×844 yet asserts nothing about nav visibility or horizontal
overflow, which is why this passed through a green suite.

### HIGH-1 — Today's recovery card re-prompts an already-logged day with neutral defaults; one tap silently destroys that day's real data

`src/ui/recovery/RecoveryCheckIn.tsx` · `src/server/recovery/service.ts` (`logRecovery`)

`RecoveryCheckIn` never reads the existing entry. It initialises all three sliders to a
hardcoded `NEUTRAL = 3` and the note to `""`, and `logRecovery` upserts the row *wholesale*.
Verified end-to-end through the real UI:

1. Deliberate check-in saved: `sleepQuality 5, readiness 5, soreness 5, note "deliberate entry"`.
2. Reload Today. The card **re-prompts** — it has no idea the day is already logged — showing
   `3 / 3 / 3` and an empty note, not the stored values.
3. A single tap on "Save check-in", touching nothing: the row becomes
   `sleepQuality 3, readiness 3, soreness 3, note null`.

The day's real observations are gone. No warning, no confirmation, no undo, and — because
the upsert is by design not a duplicate — no second row from which to recover. For a feature
whose entire justification (EVIDENCE-027, OD-09) is *accumulating an honest history so a
future heuristic has inputs*, silently replacing real observations with synthetic neutral
midpoints is the most damaging failure mode available.

Judgment call 1 in the report argues the neutral default is safe because "the check-in as a
whole is what's skippable". That reasoning holds only for a day with no entry yet. It does
not hold once the day is logged, which the card cannot distinguish.

### HIGH-2 — The recovery card pushes Today's primary CTA below the fold on smaller iPhones and in Safari with browser chrome

`src/ui/today/TodaySection.tsx:271-277`

Both widgets render *above* the foreign-active banner, "Continue workout", and the
`TodayResolutionView` that carries "Start workout". The recovery card is ~320 px tall.
Measured position of the primary CTA:

| Context | CTA top | Result |
|---|---|---|
| 390×844, card dismissed | 396 px | above the fold |
| 390×844, card visible | 716 px | above the fold (fits, barely) |
| 375×667 (iPhone SE), card visible | 716 px | **below the fold — 97 px of scrolling** |
| 390×664 (Safari usable height on a 844-tall iPhone), card visible | 716 px | **below the fold — 100 px of scrolling** |

The second row is the realistic browser case today: F11's installable standalone PWA shell,
which would recover the full 844 px, is Phase 8 and not yet shipped. F10's wording —
"skipping recovery entry never blocks any flow" — is not literally violated, since nothing
is blocked. But an optional observational widget demoting the application's single most
important control below the fold is a real phone-first regression, and it is exactly what
device acceptance exists to catch.

### HIGH-3 — The mandated non-consumption boundary test misses the repo's own prevailing import style

`tests/unit/progressionBoundary.test.ts`

`implementation-plan.md` Phase 7 names this assertion as a deliverable ("assert via
boundaries test"), and `mvp-scope.md` F10 makes it an acceptance criterion ("a code-level
check confirms no engine input path reads these tables"). The check filters for lines
matching `/^\s*import\b/` or `/^\s*export\s+\*\s+from/`, then greps those lines. Replicating
that exact filter against synthetic violations:

| Violation form | Caught? |
|---|---|
| `import { x } from "@/server/recovery/service"` (single line) | caught |
| `import type { X } from "@/server/recovery/service"` | caught |
| `export * from "@/server/recovery/service"` | caught |
| **`import {\n  x,\n} from "@/server/recovery/service"` (multi-line)** | **missed** |
| **`await import("@/server/recovery/service")` (dynamic)** | **missed** |
| **`require("@/server/recovery/service")`** | **missed** |
| **`export { x } from "@/server/recovery/service"` (named re-export)** | **missed** |

The multi-line miss is the serious one: Prettier's `printWidth` makes multi-line imports the
dominant style in this codebase — `src/domain/progression/` itself contains four of them
(`evaluateSession.ts` ×2, `loadProgression.ts`, `repProgression.ts`), and so do the new
Phase 7 route files. The most likely way a future engineer would actually write the
forbidden import is precisely the form the guard cannot see.

Two further gaps: the scan covers only `src/domain/progression`, not `src/server/progression`
or the bundle-assembly path where an `EvaluationContext` is actually populated; and it can
only see literal path text, so an import routed through a re-exporting barrel evades it.

The boundary is currently **intact** — Section 2 verifies that transitively and at runtime —
so this is a defective guard against future regression, not a live violation. It is
nonetheless a named acceptance criterion that does not do what it claims.

### MEDIUM-1 — `logRecovery`'s wholesale upsert nulls previously-recorded fields

`src/server/recovery/service.ts` (`logRecovery`)

The `onConflictDoUpdate` `set` clause writes all five value columns unconditionally from
`input.x ?? null`, so any field the second call omits is cleared rather than left alone.
Verified: an entry logged with `sleepHours 7.5, sleepQuality 4`, followed by a three-slider
check-in for the same day, comes back with `sleepHours: null`. A subsequent call omitting the
note clears a previously saved note.

`sleepHours` has no UI writer today (judgment call 3), so the field most exposed right now is
the note — and this is the mechanism underlying HIGH-1. It is a defensible modelling choice
for "a check-in replaces the day's check-in", but it is undocumented in the report and it
means the API cannot be used to build a day's entry incrementally, which the schema's
all-fields-optional design otherwise invites.

### MEDIUM-2 — The recovery history editor fabricates metric values the user never entered

`src/ui/recovery/RecoveryHistoryList.tsx` (`EditRow`)

`EditRow` seeds each slider with `entry.sleepQuality ?? 3` (likewise readiness, soreness) and
then always submits all three. Editing an entry that legitimately has null metrics — a shape
the API accepts, the domain schema documents as "all fields optional", and
`ck_recovery_entries_has_metric` explicitly permits — writes `3` into every null slot.

Verified: an entry stored as `sleepHours: 8` with all three 1–5 metrics null, edited only to
change its note, comes back as `sleepQuality 3, readiness 3, soreness 3`. Fabricated
observations are now indistinguishable from real ones in the history the phase exists to
accumulate. The editor also offers no control for `sleepHours` and no way to clear a metric
back to null, so the `null` state is reachable by the API but not repairable by the UI.

### MEDIUM-3 — Date validation is regex-only; impossible dates reach PostgreSQL as an unmapped 500

`src/domain/bodyweight/schema.ts` (`dateOnlySchema`, used by both entities)

`/^\d{4}-\d{2}-\d{2}$/` accepts `2026-13-45` and `2026-02-30`. Both pass `safeParse`, reach
the insert, and PostgreSQL rejects them with SQLSTATE **22008**. Nothing in the service or
route layer maps that class, so it propagates as an unhandled HTTP 500 rather than the 400
the route's own validation contract implies.

Not reachable from the shipped UI — neither quick-log sends a date, and the edit schemas
exclude it. But `date` is a documented, accepted input on both POST endpoints (the report
calls it "reachable at the API layer for a future UI"), so this is a live authenticated API
surface returning 500 for input its own validator approved. Every other error class in these
routes is deliberately mapped (404, 422, 400); this one is the gap.

### LOW-1 — Today's bodyweight widget gives no indication the day is already logged

`src/ui/bodyweight/BodyweightQuickLog.tsx` starts empty on every mount and never reads
today's entry. The user cannot tell from Today whether they logged today without navigating
to `/bodyweight`. Materially less dangerous than HIGH-1 — overwriting requires deliberately
typing a weight — but it is the same missing read-back.

### LOW-2 — The check-in's saved state is terminal until a reload

Once `saved` is set, `RecoveryCheckIn` replaces the form with "Thanks — logged for today."
for the lifetime of the component. A user who notices they mis-set a slider cannot correct it
from the card and must go to `/recovery` history and edit — which then runs into MEDIUM-2. On
`/recovery` itself the same lock prevents a second check-in without a page reload.

### LOW-3 — `mvp-scope.md` F10 still names a field the authoritative models do not have

F10 describes the check-in as "sleep quality, soreness, **motivation**", while
`domain-model.md` §7 and `data-model.md` §2.19 specify `readiness`. The implementation
correctly follows the authoritative models, as the task directed. The scope document is
stale; worth a one-word correction so the two stop disagreeing. No code change.

### LOW-4 — Undocumented reconciliation of the "client-generatable" PK note

`data-model.md` §§2.18–2.19 annotate the PK "(client-generatable)", while §1's
client-generated list covers only the four offline-outbox tables. The implementation chose
server-generated UUIDv7 (judgment call 5), which is the correct reading — these are online
REST entities with no offline requirement in F10 — but the two doc lines still read as
contradictory to the next implementer. Worth an explicit note in `data-model.md`.

### LOW-5 — Bodyweight input tap target is 42 px, marginally under the 44 px iOS HIG minimum

Measured 96×42 px. Consistent with input sizing elsewhere in the app, so this is a
pre-existing convention rather than a Phase 7 regression — recorded only because device
acceptance is the next gate.

### LOW-6 — The new E2E spec cannot catch the layout findings it runs inside

`tests/e2e/bodyweightRecovery.spec.ts` correctly uses a 390×844 viewport, but asserts only on
element visibility and text. It never checks horizontal overflow, nav-link reachability, or
CTA fold position, so BLOCKER-1 and HIGH-2 both reproduce inside a fully green run. Its
"never blocks any flow" assertion is `expect(page.getByText("Today")).toBeVisible()` — the
`h1`, which is present in every state — rather than an assertion that the workout CTA is
reachable.

---

## 4. Finding summary

| ID | Severity | Finding |
|---|---|---|
| BLOCKER-1 | BLOCKER | Two new nav links overflow every iPhone width; "Recovery" fully off-screen, all app screens gain horizontal page scroll |
| HIGH-1 | HIGH | Recovery card re-prompts an already-logged day with neutral defaults; one tap silently destroys that day's data |
| HIGH-2 | HIGH | Recovery card pushes "Start workout" below the fold on iPhone SE and Safari-with-chrome heights |
| HIGH-3 | HIGH | Mandated non-consumption boundary test misses multi-line, dynamic, `require`, and named re-export imports |
| MEDIUM-1 | MEDIUM | `logRecovery` wholesale upsert nulls previously-recorded `sleepHours` / `note` |
| MEDIUM-2 | MEDIUM | Recovery history editor fabricates `3/3/3` for null metrics; cannot clear a metric or edit `sleepHours` |
| MEDIUM-3 | MEDIUM | Regex-only date validation → impossible dates reach PostgreSQL as an unmapped HTTP 500 |
| LOW-1 | LOW | Today's bodyweight widget gives no already-logged indication |
| LOW-2 | LOW | Check-in saved state terminal until reload |
| LOW-3 | LOW | `mvp-scope.md` F10 says "motivation"; authoritative models say `readiness` |
| LOW-4 | LOW | "client-generatable" PK annotation unreconciled with §1 |
| LOW-5 | LOW | 42 px tap target, marginally under iOS HIG (pre-existing convention) |
| LOW-6 | LOW | New E2E spec asserts nothing that could catch BLOCKER-1 or HIGH-2 |

Nothing was found wrong with the migration, the live schema, upsert atomicity, timezone or
DST handling, ownership scoping, true deletion, numeric precision, the non-consumption
boundary itself, or scope discipline. The report's verification claims all reproduced.

---

## 5. Assessment

The server-side engineering here is strong, and it is strong in exactly the places that are
hard to fix later: the schema matches the data model without deviation, the daily-grain
upsert is genuinely atomic under concurrent first inserts, timezone handling is correct
per-user across both DST directions, and the observational boundary that EVIDENCE-027 and
OD-09 depend on is airtight under both static transitive analysis and runtime differential
testing. Scope discipline is exemplary — no charts, no aggregates, no sync architecture, no
new dependencies, nothing borrowed from a later phase.

The defects cluster in the client layer, and they share one root cause: **the UI writes
day-grain data without ever reading it back.** The check-in card does not know whether the day
is logged (HIGH-1), the quick-log does not either (LOW-1), the history editor does not know
which metrics were actually set (MEDIUM-2), and the upsert underneath them replaces rather
than merges (MEDIUM-1). Pairing a write-only UI with wholesale-replace upsert semantics is
what converts a correct backend into silent data loss.

BLOCKER-1 is independent of that and is the simplest to fix — the nav needs to wrap or scroll
— but it is the finding that most clearly fails device acceptance, because it degrades every
screen in a phone-first app and quietly removes the fallback that makes permanent dismissal
of the recovery card safe.

None of this is architectural. The blocker is a layout fix; the HIGH findings are a read-back
on mount, a render-order change, and a stronger boundary assertion. The migration and service
layer should not need to change at all.

---

## Verdict

**READY FOR REMEDIATION**
