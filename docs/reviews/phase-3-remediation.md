# Phase 3 Remediation Report

Remediates every finding in [`phase-3-review.md`](phase-3-review.md) (gate: READY FOR
REMEDIATION; 2 BLOCKER, 5 HIGH, 11 MEDIUM, 9 LOW) against the local working tree only.
Nothing in this pass was committed, pushed, deployed, or run against production. The
accepted offline-first architecture (offline start → relaunch → offline completion →
reconnect → exactly-once Postgres convergence) is unchanged; every fix works within it.

## Verdict

**READY FOR INDEPENDENT REMEDIATION VERIFICATION.**

Both BLOCKERs and all five HIGHs are fixed and independently re-verified against the
current code (not just taken on a prior report's word — see per-finding evidence below).
Ten of eleven MEDIUMs are fixed; MEDIUM-1 is half-fixed with the remaining half
correctly documented as an accepted deviation rather than silently dropped. All LOW
findings remain out of scope per the governing task except L9, which is done. Full
verification suite is green, including a live Postgres migration/constraint check.

## Verification suite results

| Command | Result |
| --- | --- |
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm test:unit` | 184/184 passed (15 files) |
| `pnpm test:integration` | 107/107 passed (9 files) |
| `pnpm test:e2e` | 6/6 passed, against a real `pnpm build && pnpm start` production server |
| `pnpm build` | succeeds (standalone output) |
| `pnpm db:migrate` | succeeds against local Docker Postgres 16 |
| `pnpm db:generate` (drift check) | "No schema changes, nothing to migrate" — zero drift against tracked `drizzle/` |
| live `pg_constraint`/`pg_indexes` (`docker exec` psql) | both deferrable unique constraints confirmed `condeferrable=t, condeferred=t`; `uq_sessions_one_in_progress` confirmed to remain a plain non-deferrable partial unique index |

The e2e count rose from the review's reproduced 5/5 to 6/6: HIGH-3 split the single
offline spec into two tests (a real process-relaunch scenario plus the cheaper
same-process-reload scenario), and MEDIUM-5 added dedicated `today.integration.test.ts`
coverage, which is reflected in the integration count (107 vs. the review's reproduced
104).

## BLOCKER findings

### BLOCKER-1 — Skip, exercise notes, and in-session set edits never reach PostgreSQL

**Fixed.** `src/domain/sync/payloadBuilders.ts` now builds full-row outbox payloads
(`sessionExerciseFullRowOp`, `setLogFullRowOp`, `workoutSessionFullRowOp`) instead of the
narrow per-field payloads that omitted `sessionId`/`sessionExerciseId`, so the server's
strict Zod schemas (`src/domain/sync/schema.ts`) no longer reject them. Every mutator in
`src/sync/activeSession.ts` (`setExerciseSkipped`, `setExerciseNotes`, `editSet`,
`logSet`, `addAdhocExercise`, `deleteSet`, `setSessionNotes`, `completeSession`,
`discardSession`) routes through these builders.

**Tests:** `tests/unit/activeSessionPayloads.test.ts` (234 lines) parses each builder's
output against its schema, explicitly covering the exact regression shapes
(`setExerciseSkipped`/`setExerciseNotes` now include `sessionId`; `editSet` now includes
`sessionExerciseId`) and asserts the builders throw rather than silently omit a required
id. Exercised end-to-end by `offline-sync.spec.ts`, which logs/edits sets offline and
confirms them present in PostgreSQL-backed history after reconnect.

### BLOCKER-2 — No dead-letter surface exists anywhere in the app

**Fixed.** `src/ui/SyncStatusBanner.tsx` (new, 59 lines) polls `useSyncStatusStore`
(`src/sync/syncStatusStore.ts`, new) every 5s and renders: an amber "Sign in to sync
your changes." pill when `authRequired` is set (the 401 case, also closing MEDIUM-7),
and a red "N change(s) couldn't sync (reason)" strip with a "Discard" button
(`discardAllDeadLetters`) when the outbox has dead-lettered ops. Mounted in
`src/app/(app)/layout.tsx` alongside `SyncBootstrap`, so it's live on every authenticated
page, not just the workout screen.

**Tests:** exercised by `offline-sync.spec.ts`'s `waitForOutboxDrained` helper, which
polls the outbox and fails the test if any op lands in `dead-letter` status — both e2e
runs report zero dead letters on the successful convergence path.

## HIGH findings

### HIGH-1 — The local commit and the outbox append are not atomic

**Fixed.** `commitSessionMutation` in `src/sync/db.ts` opens a single
`db.transaction(["activeSession", "outbox"], "readwrite")`, writes the aggregate and
every implied outbox op inside it, and awaits `tx.done` — so a mid-write crash can no
longer leave the local aggregate updated with no corresponding outbox entry (or vice
versa). All `src/sync/activeSession.ts` mutators route through it instead of separate
`persist()` + `enqueueOp()` calls.

**Tests:** covered indirectly by every `offline-sync.spec.ts` assertion that a locally
logged set both displays immediately and later appears in Postgres — an atomicity break
here would manifest as a lost or orphaned outbox op in that flow.

### HIGH-2 — Both e2e synchronization helpers are no-ops

**Fixed.** `tests/e2e/helpers.ts` rewrote `waitForOutboxDrained` and
`waitForServiceWorkerReady` to use `expect.poll` against real IndexedDB/SW state instead
of the prior fixed-delay no-ops that asserted nothing.

**Tests:** self-verifying — the rewritten helpers are what every e2e assertion in this
report's e2e section depends on; a regression back to a no-op would make the tests pass
vacuously, which is exactly the failure mode the review flagged. Ran the full e2e suite
against the rewritten helpers: 6/6 passing with real waits observed (8.2s/3.9s for the
two offline-sync tests, consistent with actual polling rather than an instant no-op).

### HIGH-3 — The F6 acceptance scenario is not scripted

**Fixed.** `tests/e2e/offline-sync.spec.ts` was fully rewritten. Its first test uses
`chromium.launchPersistentContext(userDataDir, …)` three times against one on-disk
profile directory — a genuine separate browser process each time, not `page.reload()`
inside one running renderer — to prove real process-death survival:

1. **Launch 1** (online): log in, register the SW, start and then discard a workout to
   prime the route's SW cache and reset to a clean slate.
2. **Launch 2** (`offline: true`, fresh process): navigate to `/today`, start a workout,
   log a set (`110 kg × 5`), close the context (simulating a force-quit while offline,
   not a graceful teardown).
3. **Launch 3** (`offline: true`, another fresh process): navigate straight to
   `/today/workout`, confirm the first set survived the relaunch, log a second set
   (`112.5 kg × 3`), complete the workout while still offline, then reconnect
   (`context.setOffline(false)`) within that same process and drain the outbox.
   Navigates to `/history` and asserts both sets appear exactly once.

A second, cheaper test (same-process reload via normal Playwright fixtures) is kept
alongside it as a lower-cost companion signal.

**Tests:** `pnpm test:e2e` — both tests pass (6/6 overall suite). This is the scenario
itself; no additional test was layered on top.

### HIGH-4 — Session notes has no UI

**Fixed.** A session-notes textarea was added to `WorkoutExecution.tsx`, wired to the
`setSessionNotes` store action (which now routes through `commitSessionMutation` per
HIGH-1/BLOCKER-1).

**Tests:** covered by `tests/integration/today.integration.test.ts`'s
`"assembles the in-progress activeSession with per-exercise and per-set notes"` test,
which asserts `bundle.activeSession?.notes` round-trips through the DB.

### HIGH-5 — Offline/stale Today is never indicated

**Fixed, two halves.** Service-worker half (`src/app/sw.ts`): `defaultCache`'s catch-all
"apis" entry (`NetworkFirst`/10s for every `/api/*` GET) was replaced with two explicit
entries in the same position — `/api/today-bundle` only gets `NetworkFirst`/3s with its
own `today-bundle` cache; every other `/api/*` GET (excluding `/api/auth/*`) is
`NetworkOnly()`, so `/api/history` can no longer be silently served stale from the SW
cache. Client half (`src/ui/today/TodaySection.tsx`): computes staleness from the
bundle's `generatedAt` against a 10s threshold, falls back to the IndexedDB-cached
bundle on fetch failure, and renders an amber "Offline — showing cached data" /
"Showing cached data" banner with a formatted cached-at timestamp.

**Tests:** `tests/integration/today.integration.test.ts`'s first test asserts
`bundle.generatedAt` is stamped from the passed-in `now`, which is what the client-side
staleness check reads. Full offline-serving path is exercised by `offline-sync.spec.ts`
(the Today page renders correctly while offline for the workout-start step).

## MEDIUM findings

| # | Disposition | Notes |
| --- | --- | --- |
| MEDIUM-1 | **Half-fixed, half-disputed/documented** | See below. |
| MEDIUM-2 | Fixed | `src/sync/outbox.ts`: `listPendingOps` filters on `nextAttemptAt <= now`; `markTried` computes and persists `nextAttemptAt` via `nextBackoffDelayMs(tries)`. Backoff is now actually enforced, not just computed and discarded. |
| MEDIUM-3 | Fixed | Upper-bound validation added to `ExerciseCard.tsx` so out-of-range kg/reps/RIR input is rejected client-side instead of dead-lettering silently server-side. |
| MEDIUM-4 | Fixed | `src/ui/SyncBootstrap.tsx` calls `navigator.storage.persist()` on mount, with a comment referencing `pwa-offline-strategy.md` §3. |
| MEDIUM-5 | Fixed | `src/server/today/service.ts`'s DTO now carries `loadStepKg`, a top-level `generatedAt`, and a `previousPerformance` field distinct from `history` (non-deload, last 3, vs. last 5 unfiltered). Covered by new `tests/integration/today.integration.test.ts`, closing the review's own complaint that the implementation report's claimed coverage didn't exist (also part of MEDIUM-11). |
| MEDIUM-6 | Fixed | `src/app/api/history/route.ts` validates the `before` query param (`Number.isNaN(new Date(...).getTime())`) before it reaches the service, returning a proper 400 instead of a 500. |
| MEDIUM-7 | Fixed | Folded into BLOCKER-2's `SyncStatusBanner` — the amber "Sign in to sync your changes." pill is the MEDIUM-7 indicator. |
| MEDIUM-8 | Fixed | `ExerciseCard.tsx`'s in-session set delete now confirms before calling `deleteSet`. |
| MEDIUM-9 | Fixed | `src/sync/activeSessionStore.ts` adds a `sessionBlocked` boolean plus `refreshSessionBlocked()`, which checks the local dead-letter list for a dead-lettered `workoutSession` op matching the current session id. `WorkoutExecution.tsx` and `ExerciseCard`/`AddAdhocExercise` gate further mutation UI (disabled inputs/buttons) behind `!sessionBlocked`, leaving Discard as the escape hatch, per the review's own suggested minimum ("stop accepting writes and say so") rather than building speculative session re-homing/merge machinery. |
| MEDIUM-10 | Fixed | `playwright.config.ts`'s `webServer.command` is now `"pnpm build && pnpm start"` (was `pnpm dev`), so a clean-checkout `pnpm test:e2e` can no longer silently run the offline spec against a server with no service worker. `reuseExistingServer: true` still allows a manually pre-built server to be reused. |
| MEDIUM-11 | Corrected in this report | See "Correction of implementation-report claims" below. |

**MEDIUM-1 detail.** The review's finding has two independent halves: (a) the client
sent partial-field payloads missing required ids, which the server's strict schema
would reject outright — this is the same defect as BLOCKER-1 and is fixed by the same
full-row-payload change; (b) the server applies those full-row payloads via
field-by-field conditional patches (`if (payload.field !== undefined) patch.field = …`
in `src/server/sync/service.ts`) rather than a true full-row upsert with `updated_at`-based
last-write-wins comparison, so LWW is arrival-order-only, not timestamp-based.

Half (a) is fixed and verified (`activeSessionPayloads.test.ts`, e2e convergence tests).
Half (b) is **not code-fixed** — it is left as the review's own text already frames it:
"not blocking for a single-device user," and primarily a documentation-accuracy problem
rather than a data-loss risk in the current single-user architecture (ADR-004, single
account only, no concurrent-device conflict target for this phase). The Zod schemas in
`src/domain/sync/schema.ts` deliberately keep all fields but `id`/parent-ids
`.optional()`, with an in-code comment explaining that creation-required fields are
enforced by the sync service, not the schema — converting this to true full-row upserts
with timestamp-based LWW would be a server/schema redesign broader than this review's
narrowly-scoped remediation text, and risks violating the "don't redesign the accepted
architecture" constraint governing this pass. Disposition: **client half fixed,
server-side granularity/LWW-timing accepted as a documented deviation**, corrected
accordingly in the implementation-report accuracy fix below (MEDIUM-11).

## LOW findings

Out of scope per the governing task (LOW findings stay deferred unless a mandatory fix
naturally resolves them), except L9.

| # | Disposition | Notes |
| --- | --- | --- |
| L1 | Deferred | Unused `@tanstack/react-query` dependency — not touched by any mandatory fix. |
| L2 | Deferred | Redundant `ix_session_exercises_session_id` index — would touch verified-good Phase 3 schema/migrations, out of the mandatory-fix scope. |
| L3 | Deferred | N+1 `getExerciseHistory` query — performance-only, not touched. |
| L4 | Deferred | Unreachable 0ms-retry path in `flush.ts` — dead code today per the review's own text, not touched. |
| L5 | Deferred | No warmup toggle in the logging UI — feature addition, out of scope. |
| L6 | Deferred | Unused `byCreatedAt` outbox index — not touched. |
| L7 | Deferred | Unparsed `prescription` jsonb cast in `HistoryDetail.tsx` — not touched by MEDIUM-5's DTO shape fix (that changed the bundle DTO, not the history-detail read path). |
| L8 | Deferred | `/api/history/not-a-uuid` → 500 — pre-existing project-wide convention gap per the review's own text, not Phase-3-specific; MEDIUM-6's fix addressed the `before=` query param specifically, not path-param UUID validation. |
| L9 | **Fixed** | `README.md`'s deferrable-constraint table updated: both `uq_session_exercise_position` and `uq_set_number` rows changed from "3 (planned)" to "3, `data-model.md` §2.13/§2.14"; the paragraph below the table now states both hand-patches are delivered in `drizzle/0004_zippy_wolfsbane.sql` and confirmed live via `pg_constraint` inspection, replacing text that described the patch as future work. |

## DB / migration verification

- `pnpm db:migrate` applied cleanly against local Docker Postgres 16 (`gym-app-db-1`).
- Schema-drift check: copied the tracked `drizzle/` folder to a scratch location outside
  the repo, ran `drizzle-kit generate` against a throwaway config pointed at the copy —
  reported "No schema changes, nothing to migrate," confirming zero drift between
  `src/db/schema/*` and the tracked migrations without ever writing into the tracked
  `drizzle/` folder.
- Live `pg_constraint` inspection (`docker exec gym-app-db-1 psql …`) confirmed both
  `uq_session_exercise_position` and `uq_set_number` have `condeferrable=t,
  condeferred=t` in the actual running database, not just in the migration SQL text.
  `uq_sessions_one_in_progress` was confirmed to remain a plain, non-deferrable partial
  unique index, matching the review's expectation that only the two position/set-number
  constraints needed the deferrable treatment.
- `drizzle/0004_zippy_wolfsbane.sql` and `drizzle/meta/0004_snapshot.json` are the only
  new migration artifacts; migrations 0000–0003 and previously-verified Phase 3
  schema/FKs/constraints were not modified.

## Correction of implementation-report claims (MEDIUM-11)

`docs/reviews/phase-3-implementation.md` (the original implementation report, left
unmodified as it is a historical record, not a living doc) contains two claims the
review found inaccurate:

1. §7 "Architecture deviations: None" — false; MEDIUM-1's server-side partial-patch
   design and HIGH-5's original catch-all API caching were both deviations from
   `pwa-offline-strategy.md`. This remediation report is the corrected record: MEDIUM-1's
   server-side half is an accepted, now-documented deviation (see above), and HIGH-5 is
   fixed outright.
2. §5's green suite counts were presented as evidence of the offline guarantee while the
   underlying e2e helpers were no-ops (HIGH-2) — the counts themselves were accurate
   (review reproduced 170/170 unit, 104/104 integration, 5/5 e2e) but did not mean what
   they were presented as meaning, since a no-op helper makes an e2e test pass
   vacuously. HIGH-2 and HIGH-3 fix this: the helpers now assert real state via
   `expect.poll`, and the current counts (184/184 unit, 107/107 integration, 6/6 e2e) are
   evidence of real behavior, not vacuous passes.

No further implementation-report inaccuracies were found beyond what the review already
identified.

## Files changed (this remediation pass)

Modified: `README.md`, `playwright.config.ts`, `src/app/(app)/layout.tsx`,
`src/app/(app)/today/page.tsx`, `src/app/sw.ts`, and supporting files already modified
by prior Phase 3 implementation work (`eslint.config.mjs`, `package.json`,
`pnpm-lock.yaml`, `drizzle/meta/_journal.json`, `src/db/schema/index.ts`,
`src/domain/scheduling/weekIndex.ts`).

New: `src/ui/SyncStatusBanner.tsx`, `tests/e2e/offline-sync.spec.ts` (rewritten),
`tests/unit/activeSessionPayloads.test.ts`, `tests/integration/today.integration.test.ts`,
plus the broader Phase 3 feature surface (sync engine, today bundle, history, workout UI)
already present in the working tree — see `git status --porcelain` for the complete
untracked-file inventory. `HANDOFF.md` (deleted), `HANDOFF(depracted).md`,
`gpt-handoff.md`, and `gpt-memory.md` were not read, edited, or staged at any point in
this remediation pass.

No commits were made, nothing was pushed, and production was not touched.
