# Phase 2 Remediation — H1, M1, M2, M3

Date: 2026-08-16
Remediates: [phase-2-review.md](./phase-2-review.md) (reviewed uncommitted Phase 2 working tree on top of `f5b9b45`)

## Summary

Fixed all findings the review gated Phase 3 on: H1 (the classification bug
itself), M1 (the `defaultConfigFor()` contract gap that's the same root
cause), M2 (`currentWeekIndex` bounds/status), and M3 (durable record of the
`DEFERRABLE` migration hazard) — matching the review's own recommendation
that M1 is "the natural scope" to fix alongside H1, and that M3 "warrants
one paragraph in a durable contributor doc before Phase 3." Review's M4
(schedule-entry id churn on planned-block edits) and L1–L6 are deferred as
the review itself recommended — untouched. No schema change, no migration
edit, no Phase 3 behavior (no session/execution tables, no `evaluate()`).

Task-brief numbering used in commit/PR discussion shifts by one after H-1
(H-1 / M-2 / M-3 / M-4 in that brief == this review's H1 / M1 / M2 / M3);
this document uses the review's own numbering throughout.

## H1 / M1 — Progression default classification + strategy default contract

**Root cause:** [registry.ts](../../src/domain/progression/registry.ts)
declared exercise/scheme-derived config fields (`incrementKg`, `repRange`'s
`repCap`) as `.optional()` with **no** `.default()`. Zod omits an optional
key entirely from `schema.parse({})`, so the raw parsed config could never
`JSON.stringify`-equal `defaultConfigFor()`'s materialised value — every
load-progression prescription created through the normal UI default path
(`config: {}`) was classified `user_defined` instead of `heuristic`. The
same root cause meant `defaultConfigFor()` had no scheme context, so it
couldn't derive `repCap = scheme.maxReps` for `repRange` schemes either
(M1) — the two findings share one fix.

**Fix:**

- `defaultConfigFor(strategyId, exercise)` → `defaultConfigFor(strategyId,
  scheme, exercise)`. Derives `repCap = scheme.maxReps` for `repRange`;
  leaves `repCap` unset for `fixed` (no natural default — required-but-
  user-chosen, per `progression-engine.md` §4.2).
- `resolveProgression(strategyId, rawConfig, exercise)` →
  `resolveProgression(strategyId, rawConfig, scheme, exercise)`. Now
  materialises the effective config by layering the user's parsed input
  over `defaultConfigFor()`'s output (`{...defaultConfig, ...parsedConfig}`)
  **before** classifying, and that merged object — not the raw input — is
  what gets returned/persisted. Classification compares the merged config
  against the default via the existing `jsonEqual()` (`JSON.stringify`,
  safe because both sides come from `schema.parse()` and therefore share
  declared-key order).
- Call sites updated: `src/server/prescriptions/service.ts`
  (`createPrescription`, `updatePrescription` — the latter now resolves
  `effectiveScheme` first so a progression patch is classified against the
  *effective* scheme, not a stale one).
- A required, scheme-derived field being present (`repCap` on a `repRange`
  default) is no longer treated as user customization — only a value that
  *diverges* from the derived default is.

**Tests added/updated:**

`tests/unit/progressionRegistry.test.ts` (rewritten; all calls updated to
the new 3-arg/4-arg signatures):

| Scenario | Test |
|---|---|
| Default load progression → heuristic | `default load progression (config {}) classifies as heuristic` |
| Customized load progression → user_defined | `customized load progression (incrementKg tuned) classifies as user_defined` |
| Default rep progression on repRange → heuristic | `default rep progression on a repRange scheme classifies as heuristic` |
| Required/default repCap isn't itself user customization | `an explicit repCap matching the required/default scheme.maxReps does not itself imply user_defined` |
| A genuinely different repCap still counts as tuning | `a repCap that diverges from scheme.maxReps on a repRange scheme classifies as user_defined` |
| Manual default remains heuristic | `manual default (no config knobs) remains heuristic` |
| Non-incrementKg tuning still flips classification | `classifies a tuned load-progression config as user_defined (non-incrementKg field)` |
| Invalid shapes/unknown keys still rejected | `rejects an invalid config shape`, `rejects unknown keys (strict schemas)` |
| `defaultConfigFor` scheme-awareness | `seeds load-progression's incrementKg from the exercise's loadStepKg`, `leaves repCap unset for rep-progression on a fixed scheme`, `derives rep-progression's repCap from scheme.maxReps on a repRange scheme`, `returns an empty manual config` |

`tests/integration/prescriptions.integration.test.ts`:

- The review's flagged wrong-expectation test (line 153,
  *"classifies an omitted incrementKg... as user_defined"*) was rewritten
  as `classifies the default load-progression config (UI default path,
  config {}) as heuristic` — asserts `classification === "heuristic"` and
  `config.incrementKg === 2.5` (the exact UI path the review traced
  through `PrescriptionForm.tsx`).
- `does not require repCap for rep-progression with a repRange scheme, and
  defaults+classifies it as heuristic` — extended to also assert
  `config.repCap === 12` and `classification === "heuristic"`.

Verification established these two integration tests fail against the
pre-fix `resolveProgression()`/`defaultConfigFor()` (both previously
asserted or would have observed `user_defined`); all listed unit tests are
new regression coverage per the remediation brief's explicit list.

## M2 — currentWeekIndex bounds/status

**Root cause:**
[blocks/service.ts](../../src/server/blocks/service.ts) computed
`currentWeekIndex` unconditionally from `weekIndex(startDate, today)`
regardless of block status: a completed block's index grew forever against
the wall clock, a still-`planned` block (which may not have started, or may
never start on schedule) reported a raw, possibly negative/zero index, and
an active block starting in the future could do the same.

**Fix:** new pure domain function
[currentWeekIndex](../../src/domain/scheduling/weekIndex.ts) —
`currentWeekIndex(status, startDate, today, completedDate): number | null`,
kept in `src/domain/scheduling/` (not `server/`) per the `boundaries`
lint rule that `domain` may only import from `domain`:

- `planned` → `null`. A block that hasn't been activated has no "current"
  execution week yet, regardless of what its calendar `startDate` says.
- `active` → `Math.max(1, weekIndex(startDate, today))`. Floored at 1 so
  an early-activated or future-dated block never reports 0/negative.
  **Not** clamped above `weeksPlanned` — `domain-model.md` §5 explicitly
  sanctions this: "A block that runs past `weeksPlanned` stays active
  (calendar shows overdue) until the user completes or extends it."
- `completed` / `abandoned` → frozen at `weekIndex(startDate,
  completedDate)`, floored at 1. Stops advancing once the block stops
  running, instead of growing against whatever clock is passed to
  `getBlock()` later.

`currentWeekIndex` is still fully derived per-request, never persisted —
`blocks/service.ts::toRecord()` calls it on every read using the caller's
`now` and the row's `completedAt`. `BlockRecord.currentWeekIndex` and
`ui/blocks/types.ts`'s `BlockDto.currentWeekIndex` changed from `number` to
`number | null`; `BlockForm.tsx` needed no change — it already guarded on
`currentWeekIndex !== null` for `active`/`completed` display.

**Tests added:**

`tests/unit/weekIndex.test.ts` (`describe("currentWeekIndex", ...)`, 7 new
cases): before-start planned (both before and after its own start date),
active floored at 1 before start, active exact on its final planned day,
active **not** capped beyond planned weeks (asserted equal to raw
`weekIndex()` and `> weeksPlanned` — proving the overdue case isn't
clamped), completed frozen at `completedAt` ignoring later dates, abandoned
frozen at `completedAt` ignoring later dates, abandoned floored at 1 even
if abandoned before its own start date.

`tests/integration/blocks.integration.test.ts`:

- `reports a null currentWeekIndex for a still-planned block` (new).
- `freezes currentWeekIndex at completion instead of growing with the wall
  clock` (new) — completes a block, then re-reads it with
  `getBlock(..., new Date("2030-01-01T00:00:00Z"))` and asserts the index
  is unchanged.
- The pre-existing `computes currentWeekIndex against the provided clock`
  test predated status-awareness: it checked a block that was **never
  activated** and asserted a numeric week index, which is exactly the
  M2 bug (a `planned` block reporting a calendar-derived index). Renamed
  to `computes currentWeekIndex against the provided clock for an active
  block` and updated to call `activateBlock()` first — it now correctly
  tests active-block week progression, which is what it was written to
  test in the first place. Caught by running the suite after the fix
  (`expected null to be 1`), confirming the fix is real and the review's
  concern was live.

## M3 — durable DEFERRABLE-constraint workflow record

**Root cause:** confirmed as the review described — `drizzle-kit`'s
migration snapshot models unique constraints as `{name, nullsNotDistinct,
columns}` with no `deferrable` field, so any future `db:generate` that
drops and recreates `uq_prescriptions_position` or `uq_schedule_position`
would silently emit a plain (non-deferrable) `UNIQUE(...)`. The hand-patch
workflow existed only in per-table code comments
(`src/db/schema/exercisePrescriptions.ts`,
`src/db/schema/blockScheduleEntries.ts`) and the reviewer's own notes —
nothing centralized, and no `CLAUDE.md` exists in this repo.

**Fix:** did **not** redesign the migration approach and did **not** touch
any existing migration file (`drizzle/0003_chief_miracleman.sql`'s two
`DEFERRABLE INITIALLY DEFERRED` constraints are unchanged). Added a new
"Deferrable unique constraints need a manual migration patch" section to
[README.md](../../README.md), placed directly under the `Commands` table
(README is the doc map's #1 read and evergreen; `HANDOFF.md` is explicitly
session-scoped and gets overwritten each session per its own header, making
it unsuitable for something durable). The section:

- Explains why `drizzle-kit` can't express `DEFERRABLE INITIALLY DEFERRED`
  (no `.deferrable()` builder API, no snapshot field).
- States the required workflow: after `pnpm db:generate` touches an
  affected table, hand-append `DEFERRABLE INITIALLY DEFERRED` to the
  generated migration SQL before committing, matching the existing style
  in `0003_chief_miracleman.sql`; this is stable across future
  `db:generate` runs because drizzle-kit diffs its own TS-schema snapshot,
  not live SQL.
- Lists, in a table, both existing Phase 2 constraints
  (`uq_prescriptions_position` on `exercise_prescriptions
  (template_id, position)`, `uq_schedule_position` on
  `block_schedule_entries (block_id, position)`) and the two Phase 3
  constraints identified in `data-model.md` §2.13/§2.14
  (`uq_session_exercise_position` on `session_exercises
  (session_id, position)`, `uq_set_number` on `set_logs
  (session_exercise_id, set_number)`), so the next phase hits a
  documented step instead of rediscovering the hazard.
- Explicitly tells a future contributor/agent not to "fix" this by
  redesigning the migration approach.

**Proof of discoverability:** README.md is read first per its own doc map
and is the file every other Phase 0–2 handoff points to; the note sits
immediately after the `db:generate`/`db:migrate` command table, where a
contributor generating a migration for the Phase 3 tables would naturally
land.

## Verification results

All run locally against the working tree after remediation:

| Check | Result |
|---|---|
| `pnpm lint` (incl. `boundaries`) | pass |
| `pnpm exec prettier --check .` | pass (2 files auto-fixed: `README.md`, `tests/unit/progressionRegistry.test.ts`) |
| `pnpm typecheck` | pass |
| `pnpm typecheck:sw` | pass |
| `pnpm test:unit` | **150/150 pass**, 12 files |
| `pnpm test:integration` | **97/97 pass**, 7 files (PGlite, real migrations) — after fixing the one pre-existing test M2's status-awareness invalidated |
| `pnpm build` | pass (standalone production build, all 39 routes) |
| Schema drift | Docker/live PostgreSQL unavailable in this environment. Ran `drizzle-kit generate` directly (schema-vs-snapshot diff; does not require a live connection) — **"No schema changes, nothing to migrate", 11 tables**, no migration file emitted, `git status` on `drizzle/` unchanged before/after. |

Diff scope check: grepped the full touched surface for `session_exercises`,
`set_logs`, `SessionExercise`, `SetLog`, `evaluate(` — the only hits are
comments correctly noting these are future-phase concepts, not
implementations. No schema file, migration, or API route was added or
changed; the touched set is exactly `src/domain/progression/registry.ts`,
`src/server/prescriptions/service.ts`, `src/domain/scheduling/weekIndex.ts`,
`src/server/blocks/service.ts`, `src/ui/blocks/types.ts`, `README.md`, and
the four test files listed above.

## Review closure

- **H1 — progression default classification: FIXED.** Proven by
  `default load progression (config {}) classifies as heuristic` and
  `customized load progression (incrementKg tuned) classifies as
  user_defined` (`progressionRegistry.test.ts`), and by `classifies the
  default load-progression config (UI default path, config {}) as
  heuristic` (`prescriptions.integration.test.ts`) — the exact path the
  review traced through the UI.
- **M1 — `defaultConfigFor()` strategy contract: FIXED.** Proven by
  `derives rep-progression's repCap from scheme.maxReps on a repRange
  scheme` (unit) and `does not require repCap for rep-progression with a
  repRange scheme, and defaults+classifies it as heuristic` (integration,
  asserts `config.repCap === 12`).
- **M2 — `currentWeekIndex` bounds/status: FIXED.** Proven by the 7-case
  `currentWeekIndex` unit suite (`weekIndex.test.ts`) plus the two new
  integration tests (`reports a null currentWeekIndex for a still-planned
  block`, `freezes currentWeekIndex at completion instead of growing with
  the wall clock`).
- **M3 — durable `DEFERRABLE` workflow record: FIXED.** Proven by the new
  README.md section, discoverable from the doc map, listing both Phase 2
  constraints and both named Phase 3 constraints; no migration file
  changed.
- **M4 — schedule-entry id churn on planned-block edits: DEFERRED AS
  APPROVED**, per the review's own "safe to defer" recommendation (bounded
  by the lifecycle lock — no block that can own sessions is affected).
- **L1–L6: DEFERRED AS APPROVED** — not touched, per the remediation
  brief's explicit scope limit and the review's own deferral
  recommendation.

## Unresolved issues

- `pnpm db:migrate` / a live-Postgres `pnpm db:generate` were not run
  against a real database in this environment (no Docker here, same
  limitation noted in the Phase 1 remediation docs). Schema-drift safety
  was instead confirmed via `drizzle-kit generate`'s snapshot diff, which
  needs no live connection and reported zero changes; recommend a human
  confirm `db:migrate` still applies cleanly against a real Postgres (or
  the actual deploy pipeline) before or during the next deploy.

## Status

**READY FOR REMEDIATION VERIFICATION**
