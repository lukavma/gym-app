# Phase 7 — Bodyweight & Recovery Logs: Targeted Remediation Report

Status: remediation complete for the seven findings scoped by the user (BLOCKER-1, HIGH-1,
HIGH-2, HIGH-3, MEDIUM-1, MEDIUM-2, MEDIUM-3). Not committed, not pushed, not deployed. No
production access. All database/E2E verification ran against a disposable local PostgreSQL 16
database (`gymapp_phase7r`), created fresh, migrated from empty, seeded, and dropped again
within this session.

Source documents: `docs/reviews/phase-7-review.md` (independent review, unmodified by this
pass) and `docs/reviews/phase-7-implementation.md` (the original implementation report,
likewise unmodified — this is a separate, dated remediation record).

## Scope discipline

Only the seven named findings were remediated. Per instruction, the six LOW findings were left
untouched, with one unavoidable exception documented below (LOW-2). Nothing else was
independently re-reviewed or re-litigated — the review's own "what is correct" section (schema,
migration, timezone/DST handling, atomic daily upserts, ownership scoping, true deletion,
numeric precision, the non-consumption boundary, scope discipline) was taken as already proven
and is unchanged:

- **Migration/schema**: `drizzle/0009_gigantic_luminals.sql` is untouched. `pnpm db:generate`
  after this pass still reports **"No schema changes, nothing to migrate."**
- **Timezone/DST handling**: `userLocalDateString` usage is untouched; the new
  `getTodayRecoveryEntry` (HIGH-1) and the presence-aware `logRecovery` (MEDIUM-1) both reuse it
  exactly as before, and gained their own dedicated timezone test (see HIGH-1 below).
- **Atomic daily upserts**: `logBodyweight` is completely untouched. `logRecovery` is still a
  single `INSERT ... ON CONFLICT (user_id, date) DO UPDATE` statement — no read-then-write
  window was introduced (see MEDIUM-1's design note).
- **Ownership model**: no route, service, or query gained or lost a `userId` scoping condition.
- **Non-consumption boundary**: `src/domain/progression` was not touched by this pass; the
  boundary test was replaced with a strictly stronger one (HIGH-3), not a relaxed one.

## Findings — disposition

### BLOCKER-1 — nav overflow on every iPhone width

**Fix**: `src/app/(app)/layout.tsx` — the nav's `flex` container gained `flex-wrap` (was
implicitly `nowrap`), so seven links wrap onto as many rows as needed instead of overflowing the
viewport horizontally. No link was renamed, removed, or made scroll-only.

**Verified** (`tests/e2e/phase7Remediation.spec.ts`, "BLOCKER-1 remediation" describe block):

- At all four reviewed viewports (375×667, 390×664, 390×844, 430×844), on `/today`:
  `document.documentElement.scrollWidth` does not exceed the viewport width, and every one of
  the seven nav links (including Recovery) has a bounding box fully within `[0, viewportWidth]`
  — not merely `display`ed, but geometrically on-screen with zero horizontal scrolling required.
- The same "no horizontal overflow" check is repeated at 375×667 for `/bodyweight`, `/recovery`,
  `/volume`, `/exercises`, `/history`, and `/programs` — the review's finding that the overflow
  propagated to screens outside Phase 7's own scope is covered directly, not just inferred from
  the shared layout.

### HIGH-1 — recovery card re-prompts an already-logged day with synthetic defaults

**Fix**:

- `src/server/recovery/service.ts` gained `getTodayRecoveryEntry(db, userId, now)` — resolves
  "today" from `users.timezone` (via the existing `userLocalDateString`, never the client's
  clock) and returns the stored entry or `null`.
- New route `GET /api/recovery/today` (`src/app/api/recovery/today/route.ts`), auth-gated,
  thin wrapper.
- `src/ui/recovery/RecoveryCheckIn.tsx` was restructured into three explicit phases —
  `loading` → (`summary` | `form`). On mount it reads `/api/recovery/today` once. A day with no
  entry yet renders the editable form (neutral 3/3/3 defaults, same as before — there is nothing
  to preserve). A day that already has an entry renders a **read-only summary of the real stored
  values** (every non-null metric plus the note) with an explicit "Edit today's check-in" button;
  only tapping that button reveals editable sliders, and they are pre-filled from the *actual*
  entry, never from a neutral default.

**Verified**:

- `tests/integration/recovery.integration.test.ts` — new `getTodayRecoveryEntry` describe block:
  returns `null` with nothing logged; returns the correct entry when one exists (and not a
  different day's entry); resolves "today" from a `Pacific/Kiritimati` (UTC+14) user's own
  timezone against a UTC instant that is already the next calendar day there — the same
  UTC/user-local-disagreement style of proof the review used to validate the *existing*
  timezone code, applied here to the *new* function.
- `tests/e2e/phase7Remediation.spec.ts` ("HIGH-1 remediation"): logs a deliberate, non-neutral
  check-in (sleep quality 5, readiness 2, soreness 3, a distinctive note), reloads the page, and
  asserts the summary shows those exact values with the note — and that the blank check-in form
  is **not** rendered at all (`Save check-in` button absent). It then taps "Edit today's
  check-in" and asserts every slider's `value` attribute equals the real stored number (not 3),
  then saves without changing anything and re-asserts the same values survive — directly proving
  "saving without changes must never destroy existing observations."
- This is the destructive-read-back regression test required for HIGH-1.

### HIGH-2 — recovery card pushes "Start workout" below the fold

**Fix**: `src/ui/today/TodaySection.tsx` — `<BodyweightQuickLog />` and the conditional
`<RecoveryCheckIn />` were moved from *before* the session-state blocks (foreign-active banner /
continue-workout / start-workout) to *after* them, in the same return statement. No other JSX,
state, or logic changed.

**Verified** (`tests/e2e/phase7Remediation.spec.ts`, "HIGH-2 remediation"): at all four reviewed
viewports, with the recovery card genuinely visible (a fresh browser context, dismissal
preference unset) and no active session, the "Start workout" button's bounding box
(`box.y + box.height`) is within the viewport height — including the two viewports the review
found it failed on (375×667 and 390×664).

**Preserved**: the bodyweight quick-log is still directly embedded on Today with zero
navigation — filling the field and tapping Save is still exactly two interactions, unchanged by
the reordering (only its position on the page moved, not its interaction count).

### HIGH-3 — the boundary test misses the codebase's own prevailing import style

**Fix**: `tests/unit/progressionBoundary.test.ts` was rewritten against a new module,
`tests/unit/importGraphWalker.ts`, which extracts module specifiers via the **TypeScript
compiler's own AST** (`ts.createSourceFile` + `ts.forEachChild`), not a line-based regex. It
recognizes static `import` declarations (single- or multi-line — the parser doesn't see line
breaks as significant), `export ... from` / `export * from` (named re-exports and barrels),
dynamic `import(...)`, and `require(...)`, then resolves each specifier the same two ways this
codebase's own imports are spelled (`@/` → `src/`, and relative paths) and performs a real BFS
transitive closure over the resulting graph.

Roots: every file under `src/domain/progression` (unchanged from before) plus the exact named
assembly/consumption points the review itself identified —
`src/server/progression/service.ts` and the API routes for today-bundle, active-session, sync,
history, and volume.

**Verified**:

- The rewritten test's own suite (`tests/unit/progressionBoundary.test.ts`) confirms: the walk
  from all ROOTS never reaches any file under `src/{domain,server,ui}/{bodyweight,recovery}`;
  the walk **does** reach `src/db/schema/index.ts` (proving real transitivity — a resolver bug
  that silently failed every edge would make a "no forbidden files reached" result vacuous
  otherwise) and totals over 30 visited files.
- **Negative control** (the review's own methodology): the same walker run from
  `src/ui/today/TodaySection.tsx` — a file that genuinely imports `BodyweightQuickLog`,
  `RecoveryCheckIn`, and `dismissRecoveryCheckInForever` — correctly reports those as reached,
  proving the clean result above is meaningful rather than a walker that reports nothing no
  matter what.
- **Table-driven negative controls for every violation form HIGH-3 named**: eight unit tests
  feed synthetic source text (not files on disk) directly into `extractModuleSpecifiers` and
  assert it catches a single-line import, **a multi-line import** (the review's own "the
  serious one," reproduced verbatim as
  `import {\n  logRecovery,\n  listRecoveryEntries,\n} from "..."`), a dynamic `import()`, a
  `require(...)` call, a named `export { x } from` re-export, `export * from` (barrel), a
  type-only `import type`, and — as a precision check in the other direction — that an unrelated
  string literal that merely *looks like* a module path is never mistaken for one.

### MEDIUM-1 — `logRecovery`'s wholesale upsert nulls previously-recorded fields

**Fix**: `src/domain/recovery/schema.ts`'s `logRecoveryInputSchema` metric/note fields became
`.nullable()` (not just `.optional()`), so a day-upsert call can now distinguish "omitted —
preserve" (`undefined`) from "explicitly clearing" (`null`). `hasAnyMetricValue` (renamed from
`hasAnyMetric`) now requires an actual number in at least one metric slot — an explicit `null`
is present but carries no value, so it no longer satisfies the "at least one metric" refine on
its own.

`src/server/recovery/service.ts`'s `logRecovery` was rewritten around Drizzle's
`onConflictDoUpdate({ set })`: the `set` object only includes a column when the caller's input
for it was not `undefined`. A column absent from `set` is **never written** by Postgres on the
conflict path, so an omitted field keeps whatever the row already held; an explicit `null` is
included in `set` and clears it deliberately. The `INSERT` side still needs a concrete value for
every column (a brand-new day has nothing to preserve), so `insertValues` and `updateSet` are
built separately from the same input.

This keeps the **single-statement, race-free upsert** the review confirmed safe under 8
concurrent first-inserts — presence semantics live entirely in which keys appear in the `SET`
clause, not in an added query. The "at least one metric survives" invariant is enforced by
Postgres's own `ck_recovery_entries_has_metric` check constraint on both the insert and update
path; a violation (SQLSTATE `23514`) is caught and mapped to `RecoveryEntryHasNoMetricError`
rather than propagating as a raw 500 — the same mapping pattern (`isPostgresErrorCode`) every
other service in this codebase already uses for its own constraint classes.

**Verified** (`tests/integration/recovery.integration.test.ts`, "logRecovery presence
semantics" describe block, and `tests/unit/recoverySchema.test.ts`):

- Logging `{ sleepHours: 7.5, sleepQuality: 4 }` then a same-day call with only `{ readiness: 3
  }` preserves `sleepHours: 7.5` and `sleepQuality: 4` — the regression test required for
  "preserving sleepHours."
- Logging with a note, then a same-day call that omits `note` entirely, preserves the original
  note — the regression test required for "preserving notes."
- An explicit `sleepHours: null` (alongside a real value elsewhere) clears it; an explicit
  `note: null` clears the note — proving deliberate clearing is distinct from omission.
- A fresh day logged with all four metrics `null` and only a note throws
  `RecoveryEntryHasNoMetricError` (not an unmapped DB error), and leaves no row behind.
- A same-day re-log that would explicitly null the one existing metric throws the same error,
  and the original row is confirmed unchanged afterward (the rejected statement never committed).
- Unit-level: `logRecoveryInputSchema` now accepts an explicit `null` on one metric alongside a
  real value on another, and still rejects an input where every metric is `null` (with or
  without a note) — the schema-level half of the same guarantee.

### MEDIUM-2 — recovery history editor fabricates values for null metrics

**Fix**: `src/ui/recovery/RecoveryHistoryList.tsx`'s `EditRow` now tracks every metric
(`sleepHours`, `sleepQuality`, `readiness`, `soreness`) as `number | null`, matching the
entry's real stored shape instead of defaulting each to `?? 3`. A `null` metric renders as
"Not set" with an explicit "Set" affordance (which seeds a fresh value only on that deliberate
tap); a set metric renders its real value with an explicit "Clear" affordance. `sleepHours`
gained its own editable control (previously not editable here at all — LOW-1/MEDIUM-2's gap).
The client now refuses to submit (with an explicit, visible error) if every metric would end up
`null`, mirroring `ck_recovery_entries_has_metric` before the request is even sent; the server's
own `no_metric` (422) response is still handled as a fallback.

**Verified** (`tests/e2e/phase7Remediation.spec.ts`, "MEDIUM-2 remediation"): an entry logged
via the API with `sleepHours: 8` and every other metric genuinely `null` is opened for editing;
the test asserts "Sleep quality: not set", "Readiness: not set", and "Soreness: not set" are all
shown (not fabricated 3s), and that the sleep-hours field shows its real value (8). It then
clears the one set field (sleep hours) with nothing else set, attempts to save, and asserts the
client-side "at least one of sleep hours, sleep quality, readiness, or soreness is required"
error appears (submission blocked). It then explicitly sets a different metric via its own "Set"
affordance and saves successfully, and asserts the row shows only that metric — Readiness,
Soreness, and Sleep hours all remain absent from the row's rendered text (never fabricated to a
default).

### MEDIUM-3 — regex-only date validation lets impossible dates reach PostgreSQL as an unmapped 500

**Fix**: `src/domain/bodyweight/schema.ts`'s `dateOnlySchema` (shared by both `bodyweight` and
`recovery`) gained a `.refine()` calendar-validity check after the existing regex. It reuses
`parseDateOnly` (the same `Date.UTC(...)`-based parser `weekIndex.ts`/`weekBuckets.ts` already
use, so this doesn't introduce a second date convention) and round-trips the parsed epoch back
through `Date#getUTC*`, comparing every component to the original string. `Date.UTC` silently
normalizes out-of-range components (day 30 of a 28-day February rolls into March), so any
mismatch after round-tripping means the input was calendar-impossible.

**Verified** (`tests/unit/bodyweightSchema.test.ts`): `2026-13-01`, `2026-01-32`, `2026-02-30`,
`2026-04-31`, `2026-00-10`, and `2026-01-00` are all rejected; `2026-02-29` (non-leap year) is
rejected while `2028-02-29` (leap year) is accepted; ordinary month/day boundaries
(`2026-01-31`, `2026-12-31`, `2026-02-28`, `2026-06-30`) are all accepted. Since both POST routes
validate via this schema through `.safeParse()` before ever reaching the service/DB layer, an
invalid date now returns the route's documented `400 { error: "invalid_input" }` and never
reaches PostgreSQL at all — closing the unmapped-500 path the review found.

## LOW findings — left untouched, with one documented exception

Per instruction, LOW-1, LOW-3, LOW-4, LOW-5, and LOW-6 were not touched:

- **LOW-1** (bodyweight widget gives no already-logged indication) — unchanged; the bodyweight
  quick-log still starts empty on every mount.
- **LOW-3** (`mvp-scope.md` says "motivation," not `readiness`) — no doc edit made.
- **LOW-4** ("client-generatable" PK annotation) — no doc edit made.
- **LOW-5** (42px tap target) — no UI sizing change made.
- **LOW-6** (the original E2E spec couldn't catch layout findings) — `bodyweightRecovery.spec.ts`
  itself was not given new geometry assertions; the new geometry coverage lives entirely in
  `tests/e2e/phase7Remediation.spec.ts` instead, added because BLOCKER-1/HIGH-2 required it, not
  as a deliberate LOW-6 fix.

**One inseparable exception — LOW-2** (check-in's saved state was terminal until reload): fixing
HIGH-1 required replacing the old terminal "Thanks — logged for today." state with a persistent,
editable summary (`RecoveryCheckIn`'s new `summary` phase) — there is no way to give the user an
explicit read-back-and-edit path (what HIGH-1 requires) while also keeping a dead-end "thanks,
nothing more can be done here" terminal state (what LOW-2 described as the bug). The two designs
are mutually exclusive, so LOW-2 is resolved as a structural side effect of the HIGH-1 fix, not
independently reviewed or targeted. `tests/e2e/bodyweightRecovery.spec.ts`'s existing recovery
check-in test was updated only to match this now-necessary UI change (the assertion on the old
literal "Thanks" text was replaced with an assertion on the new summary text) — no new behavior
was added beyond what HIGH-1 already required.

## Judgment calls

1. **`logRecovery`'s presence semantics reuse the existing `onConflictDoUpdate({ set })`
   mechanism rather than adding a read-then-merge step.** A pre-read (fetch the existing row,
   compute a merge, then write) was considered and rejected: it would reintroduce exactly the
   kind of read-then-write window the review's own concurrency test (8 concurrent first-inserts)
   proved unnecessary, for no benefit — Postgres's own check constraint is already the correct,
   race-free arbiter of "does this write leave at least one metric," and mapping its rejection to
   a domain error is strictly simpler and safer than trying to predict the outcome in
   application code first.
2. **`RecoveryCheckInForm` never includes `sleepHours` in its POST payload.** The Today card has
   no control for it; omitting the key (rather than sending its current value or `null`) is what
   presence semantics make correct here — the card can edit sleep quality/readiness/soreness/note
   without ever being able to accidentally clear a value it doesn't even display.
3. **The history editor's "Set" default (3) is a deliberate user action, not a fabrication.**
   MEDIUM-2 was about *silently* defaulting null metrics to 3 without the user asking. Requiring
   an explicit tap on "Set" before a slider becomes editable (starting at a reasonable midpoint
   for a metric the user has just chosen to add) is a different, legitimate interaction — the
   value only ever reaches the server if the user goes on to tap Save.
4. **`getTodayRecoveryEntry` and `logRecovery` both call `resolveUserTimezone` independently**
   (one extra `SELECT` per call) rather than threading a timezone parameter through from a
   caller that might already have it. This matches the existing convention (`logBodyweight`
   already does the same), keeps both functions independently callable/testable, and the query
   is a single indexed row lookup — not worth a signature change for this phase's scope.

## Verification — exact commands and results

- `pnpm test:unit` — **459/459 passed** (35 files). Net new: `tests/unit/importGraphWalker.ts`
  (helper, not a test file itself), `tests/unit/progressionBoundary.test.ts` (rewritten, 12
  tests), plus new cases added to `tests/unit/bodyweightSchema.test.ts` (+9, calendar-date
  validation) and `tests/unit/recoverySchema.test.ts` (+3, nullable-metric presence semantics).
- `pnpm test:integration` (PGlite) — **246/246 passed, 5 skipped** (20 files: 18 passed + 2
  skipped-by-design concurrency suites gated on their own opt-in `DATABASE_URL` variables,
  unrelated to this phase). Net new: a `getTodayRecoveryEntry` describe block (3 tests) and a
  `logRecovery` presence-semantics describe block (6 tests) in
  `tests/integration/recovery.integration.test.ts`.
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean.
- `pnpm lint` (ESLint incl. the `boundaries` plugin) — clean.
- `pnpm format:check` — clean.
- `pnpm build` — succeeds; route manifest confirms `/api/recovery/today` alongside every
  pre-existing Phase 7 route.
- `pnpm db:generate` against the disposable database — **"No schema changes, nothing to
  migrate"** — confirms this pass touched no schema/migration file, as required.
- **Disposable database** (`gymapp_phase7r`, created fresh, dropped after use): `pnpm db:migrate`
  (0–9, clean) → `pnpm db:seed` (no-op catalog pass) → `pnpm test:e2e smoke.spec.ts` (creates the
  one account) → `pnpm db:seed` again (catalog now seeds per-user) → `pnpm tsx
  tests/e2e/seed.ts` (program/template/block fixtures) — the same documented recipe the original
  implementation and its review both used.
- **`pnpm test:e2e` (full suite) — 42/42 passed** (1.4 min) on the final clean run, including:
  - all 6 BLOCKER-1 geometry tests (4 viewports on `/today` + 6 routes at 375×667),
  - all 4 HIGH-2 CTA-fold-position tests (the 4 reviewed viewports),
  - the HIGH-1 destructive-read-back test,
  - the MEDIUM-2 fabrication-proof test,
  - every pre-existing spec (offline cold-launch, offline-sync exactly-once, active-schedule
    editing, deload, decimal-input, muscle-taxonomy v2, progression, set-deletion, smoke,
    stale-completed-session, today resume/takeover, volume, and the original
    `bodyweightRecovery.spec.ts` suite) — zero regressions.
- Two test-only bugs were found and fixed during this verification (not product bugs): an
  ambiguous locator in `bodyweightRecovery.spec.ts`'s recovery test once `/recovery` started
  rendering two independent summaries of the same entry (the check-in card's own summary plus
  the history list row), and a cross-test data leak where a test asserting "today has no entry
  yet" could observe another spec's leftover state from the same persistent e2e account. Both
  are fixed: assertions on `/recovery` are now scoped to the history list's `<ul>` specifically,
  and a new shared helper, `deleteAllRecoveryEntries` (`tests/e2e/helpers.ts`), gives any test
  that depends on a fresh day a guaranteed clean slate regardless of run order — the same
  pattern `ensureNoActiveSession` already establishes for workout sessions.

## Files changed

**Layout**: `src/app/(app)/layout.tsx` (nav `flex-wrap`, BLOCKER-1).

**UI**: `src/ui/today/TodaySection.tsx` (widget reorder, HIGH-2), `src/ui/recovery/RecoveryCheckIn.tsx`
(read-back + phased summary/form, HIGH-1), `src/ui/recovery/RecoveryHistoryList.tsx`
(nullable-metric editor + sleepHours control + client-side guard, MEDIUM-2).

**Domain**: `src/domain/recovery/schema.ts` (nullable metrics + `hasAnyMetricValue`, MEDIUM-1),
`src/domain/bodyweight/schema.ts` (calendar-date validation, MEDIUM-3 — shared by both entities).

**Server**: `src/server/recovery/service.ts` (`getTodayRecoveryEntry` new; `logRecovery`
rewritten for presence semantics + check-violation mapping, HIGH-1/MEDIUM-1).

**API**: `src/app/api/recovery/today/route.ts` (new, HIGH-1).

**Tests**: `tests/unit/importGraphWalker.ts` (new), `tests/unit/progressionBoundary.test.ts`
(rewritten, HIGH-3), `tests/unit/bodyweightSchema.test.ts` (+calendar-date cases, MEDIUM-3),
`tests/unit/recoverySchema.test.ts` (+nullable-metric cases, MEDIUM-1),
`tests/integration/recovery.integration.test.ts` (+`getTodayRecoveryEntry` and presence-semantics
describe blocks, HIGH-1/MEDIUM-1), `tests/e2e/phase7Remediation.spec.ts` (new — BLOCKER-1,
HIGH-1, HIGH-2, MEDIUM-2 regression coverage), `tests/e2e/bodyweightRecovery.spec.ts` (locator
fixes + cleanup helper + updated assertion for the now-necessary summary UI, no new scope),
`tests/e2e/helpers.ts` (+`deleteAllRecoveryEntries`).

User-owned files confirmed untouched (`git status` identical before/after for these): `CLAUDE.md`,
`HANDOFF.md` (pre-existing deletion), `docs/input/product-ideas.md`, `HANDOFF(depracted).md`,
`gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`. `docs/reviews/phase-7-review.md` and
`docs/reviews/phase-7-implementation.md` were read but not modified. No file under
`src/domain/progression`, `src/server/progression`, or the migration/schema layer was touched.

## Verdict

**READY FOR TARGETED REMEDIATION VERIFICATION**

---

## Verification follow-up (2026-08-26)

Source: `docs/reviews/phase-7-remediation-verification.md` (independent verification pass,
unmodified by this follow-up). Verdict there: six of the seven scoped findings — BLOCKER-1,
HIGH-1, HIGH-2, HIGH-3, MEDIUM-1, MEDIUM-3 — were confirmed genuinely closed and were **not**
revisited in this pass. One gap was found and is fixed here.

### The gap: MEDIUM-2 recurrence in `RecoveryCheckInForm`

The verifier found that this remediation's own two fixes interacted to recreate the original
MEDIUM-2 defect through a path made entirely of ordinary UI actions:

1. The HIGH-1 fix wrote a *second* recovery-metric editing surface (`RecoveryCheckInForm`, the
   "Edit today's check-in" path on Today) that seeded every slider with `entry?.x ?? NEUTRAL`.
2. The MEDIUM-2 fix gave the history editor a "Clear" affordance that produces the genuinely
   `null` state that seeding then silently fabricates back to `3`.

Verified reproduction (quoting the verification report): log today's check-in (3/3/3) → clear
Sleep quality and Soreness via the history editor's "Clear" button (`{sq: null, rd: 3, so:
null}`, correctly reflected on Today's summary) → tap "Edit today's check-in" → both cleared
metrics render as `3`, not "not set" → tap Save without changing anything → the cleared metrics
are written back as `3`. A separate, smaller defect was also flagged in the same code: emptying
`RecoveryHistoryList`'s sleep-hours text box left the previous number in component state (the
field displayed blank while Save silently kept the old value).

### Fix

- **`src/ui/recovery/NullableSliderField.tsx`** (new) — `NullableSliderField`, `UnsetField`, and
  `ClearButton` were extracted out of `RecoveryHistoryList.tsx` into their own module, with no
  behavioral change, so both editing surfaces for recovery metrics share exactly one
  implementation of "a null metric renders as not-set; only an explicit Set/Clear tap changes
  that." The slider's own `aria-label` changed from `Edit {label}` to the bare `{label}` (no
  functional change — this only affects the accessible name) so it matches the plain, non-null
  `SliderField` still used for a brand-new check-in, keeping every previously-verified locator
  (`getByLabel("Sleep quality", { exact: true })`, etc.) valid without needing to touch the
  HIGH-1 regression test's own assertions.
- **`src/ui/recovery/RecoveryCheckIn.tsx`** — `RecoveryCheckInForm` now distinguishes a brand-new
  check-in (`entry === null`, defaults all three sliders to a neutral midpoint — nothing exists
  yet to preserve) from editing an *existing* entry (`entry !== null`, initializes each slider
  directly from `entry.sleepQuality` / `entry.readiness` / `entry.soreness` — never through `??`,
  which would treat a real `null` the same as "absent" and reintroduce the bug) and renders the
  existing-entry path with the same `NullableSliderField` `RecoveryHistoryList` uses. Editing an
  existing entry now submits through **`PATCH /api/recovery/[id]`** instead of the day-upsert
  (`POST /api/recovery`): `logRecoveryInputSchema` requires at least one *numeric* metric in
  every POST payload (there is no prior row to merge into on that path), which a clears-only edit
  relying on an already-preserved `sleepHours` to satisfy the DB constraint would fail even
  though the merged row is valid — PATCH's own service fetches the existing row and validates the
  *merged* result instead, which is exactly what editing an already-existing entry needs. A
  brand-new check-in is unaffected and still goes through the same `POST` day-upsert as before.
  `sleepHours` is still never included in either payload from this card, so it is preserved
  whichever path is taken. A client-side "at least one metric" guard now accounts for the
  preserved (off-card) `sleepHours` value too, not just the three sliders this card shows.
- **`src/ui/recovery/RecoveryHistoryList.tsx`** — the sleep-hours text input's `onChange` now
  calls `setSleepHours(parseDecimalInput(draft))` unconditionally (previously
  `if (parsed !== null) setSleepHours(parsed)`, which never propagated a clear). Emptying the
  field now clears the value immediately and the component reflects that consistently by
  switching to the same "not set" representation a "Clear" tap produces — never a blank text box
  that still holds the old number internally. The companion "Set" affordance for sleep hours now
  also seeds the text-draft state (`"7"`) alongside the numeric state, fixing a latent
  round-trip gap in the same code path (Clear → Set previously left the input blank while the
  value was actually `7`).

### Regression coverage added

All in `tests/e2e/phase7Remediation.spec.ts` (new describe blocks; nothing existing was removed):

- **"MEDIUM-2 recurrence remediation"** — reproduces the verifier's exact chain end to end:
  log today's check-in with defaults → clear Sleep quality and Soreness via the history editor →
  back on Today, "Edit today's check-in" shows both as "not set" (never `3`) → Save without
  changes → both remain null afterward (asserted via the summary text, which now reads exactly
  `Logged today: Readiness 3/5`, omitting the two cleared metrics entirely).
- A second test in the same block: a **sleepHours-only entry** (logged directly via the API,
  every 1–5 metric genuinely `null`) — Today's edit path renders all three as "not set", and an
  unchanged Save preserves `sleepHours` exactly (still `Logged today: Sleep 7.5h`) without
  fabricating any of the three sliders.
- **"sleep-hours textbox remediation"** — a third test clears the sleep-hours text box directly
  (not via the "Clear" button) on an entry that also carries a soreness value (isolating the
  textbox bug from the at-least-one-metric guard), asserts the field switches to "Sleep hours:
  not set" rather than showing blank-with-stale-state, and confirms the saved row has no
  `Sleep …h` text at all afterward.

### Preserved (re-verified, not assumed)

- **Atomic upsert semantics**: `logRecovery` (the `POST` day-upsert) was not touched by this
  follow-up — a brand-new check-in still goes through it exactly as before. `updateRecoveryEntry`
  (the `PATCH` endpoint) was likewise not touched — Today's edit path is a new *caller* of an
  already-existing, already-verified endpoint, not a change to its implementation.
- **Read-back failure safety, timezone handling, CTA geometry, and the progression boundary**:
  no file under `src/server/recovery`, `src/domain/recovery` (other than the UI-facing
  `RecoveryCheckInForm` submission-path choice above, which does not change `dateOnlySchema` or
  timezone resolution), `src/app/(app)/layout.tsx`, `src/domain/progression`, or
  `src/server/progression` was modified in this follow-up.
- **LOW findings**: none were touched or expanded; this follow-up's scope was exactly the
  MEDIUM-2 recurrence and the sleep-hours-textbox LOW the verifier found, both explicitly in
  scope for this pass.

### Verification — exact commands and results

- `pnpm test:unit` — **459/459 passed** (35 files) — unchanged; this follow-up is UI-layer only
  and touched no domain/unit-tested logic.
- `pnpm test:integration` (PGlite) — **241 passed, 5 skipped (246 total, 20 files)** — unchanged
  from the prior remediation pass; correcting the wording the verifier flagged, this is reported
  as passed-vs-skipped-vs-total explicitly, not as a single "246/246" figure.
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean.
- `pnpm lint` (ESLint incl. the `boundaries` plugin) — clean.
- `pnpm format:check` — clean.
- `pnpm build` — succeeds; `/recovery` route present, size delta reflects the extracted
  `NullableSliderField` module being shared rather than duplicated.
- `pnpm db:generate` against a disposable database — **"No schema changes, nothing to
  migrate"** — this follow-up touched no schema/migration file.
- **Disposable database** (`gymapp_phase7v2`, created fresh, dropped after use), bootstrapped via
  the same documented recipe as every prior pass (migrate → seed → `smoke.spec.ts` creates the
  account → seed again → `tests/e2e/seed.ts`).
- **`pnpm test:e2e phase7Remediation.spec.ts` (targeted) — 19/19 passed**, including the 3 new
  regression tests above and all previously-verified BLOCKER-1/HIGH-1/HIGH-2/MEDIUM-2 tests
  unchanged.
- **`pnpm test:e2e` (full suite) — 45/45 passed** (1.6 min) — every pre-existing spec plus the
  full Phase 7 and remediation suites, zero regressions.
- Disposable database dropped after the run; no lingering server process left on port 3000.

### Files changed by this follow-up

**UI**: `src/ui/recovery/NullableSliderField.tsx` (new — extracted, no behavior change beyond
the aria-label noted above), `src/ui/recovery/RecoveryCheckIn.tsx` (existing-entry edit path
rewritten: real values not defaults, PATCH not POST, shared nullable-slider component),
`src/ui/recovery/RecoveryHistoryList.tsx` (sleep-hours clear-on-empty fix; imports the extracted
component instead of defining it locally).

**Tests**: `tests/e2e/phase7Remediation.spec.ts` (+3 new tests in 2 new describe blocks; no
existing test modified).

No file under `src/server/recovery`, `src/domain/recovery`, `src/domain/bodyweight`,
`src/server/bodyweight`, `src/db/schema`, `drizzle/`, `src/domain/progression`, or
`src/server/progression` was touched. `docs/reviews/phase-7-review.md` and
`docs/reviews/phase-7-remediation-verification.md` were read but not modified. No user-owned file
was touched.

### Verdict

**READY FOR SECOND TARGETED REMEDIATION VERIFICATION**
