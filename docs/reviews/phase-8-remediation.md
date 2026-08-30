# Phase 8 — Targeted Remediation Report

Scope: exactly B-1 through B-3, HIGH-1 through HIGH-3, and MEDIUM-1 through MEDIUM-4 from `docs/reviews/phase-8-review.md`. LOW findings (LOW-1 through LOW-6) were left untouched — none turned out to be inseparable from a required fix. One incidental, out-of-scope pre-existing test bug was found and fixed; see "Incidental fix" below for why.

Status: all nine required outcomes implemented, verified against a fresh disposable PostgreSQL 16 (migrated + seeded from empty), a production build, and repeated automated runs. Not committed, not pushed, not deployed, no production access.

---

## B-1 — Restore strict FIFO after failures

**Root cause (confirmed by re-reading the exact code):** `src/sync/outbox.ts`'s `listPendingOps` filtered "pending" against each op's own independently-jittered `nextAttemptAt` (computed per-op in `markTried`). After any failed flush, "pending" became an arbitrary re-sorted subset: a freshly-enqueued op (no attempt yet, so no delay) could be sent before an older op that had already failed once and was still serving its own longer backoff.

**Fix:**
- `src/sync/db.ts` — `OutboxOpRecord`/`OutboxOpInput` no longer carry `nextAttemptAt`.
- `src/sync/outbox.ts` — `listPendingOps` now returns every pending op, oldest-first (by `byCreatedAt` index), with no per-op filtering at all. `markTried` is now purely informational (increments `tries` for the dead-letter screen's "N attempts" display).
- `src/sync/flush.ts` — backoff moved to the QUEUE: a single `nextFlushAllowedAt` scalar, checked once at the top of `flushOutbox()` before `listPendingOps` is ever called. A whole-batch failure (network throw, non-2xx, or an op the server left unclassified) increments `queueTries` and sets one deadline for the entire queue; any success resets it. This makes "which ops are eligible" purely `createdAt` order — a batch either goes out complete and in order, or not at all.

**Negative control (required: "transient first-flush failure followed by edit/delete"):** `tests/e2e/transient-failure-fifo.spec.ts` — the first two `/api/sync` POSTs are forced to fail with a real 500 (route interception, not a network drop). While the resulting batch is failing/backing off, an edit to the already-enqueued set and a full insert+delete of a second set are enqueued. Verified server-side: the surviving set carries its **edited** value (65kg, not the pre-edit 60kg — an insert-then-edit reversal is exactly what per-op reordering would produce) and the deleted set is genuinely gone (not resurrected by an out-of-order insert). Passed **10/10 consecutive runs** as part of the offline gate (see Repeated-run results).

## B-2 — Make lost-response retries genuinely idempotent

**Root cause:** `applyWorkoutSessionUpsert`, `applySessionExerciseUpsert`, and `applySetLogUpsert` (`src/server/sync/service.ts`) each did a pre-read SELECT then a plain `INSERT` on the not-found branch. A lost response (server applies the create, client never sees the reply — e.g. the app's own reconnect flow does a full page navigation that can tear down an in-flight fetch client-side while the server keeps processing it) makes the client resend the identical op; the plain INSERT then hits the row the first delivery already created and gets mapped to the same business-conflict reason (`session_conflict`/`position_conflict`/`set_number_conflict`) as a genuine different-id conflict — permanently dead-lettering an op that had already succeeded.

**Fix:** all three functions now use `.onConflictDoNothing({ target: <table>.id })` on the insert, falling through to the existing update-branch logic when the target row already exists (re-selected). This targets the op's own id specifically: a retried delivery of the SAME id quietly no-ops into the update path (a no-op update, since the payload is identical); a genuinely DIFFERENT id claiming the same business slot (position/set-number/one-in-progress-session) still raises that OTHER unique index's violation, uncaught by the narrow `onConflictDoNothing` target, and is still mapped to the correct business-rejection reason by the existing `catch` blocks.

`applyRecommendationUpsert` and `applyBodyweightEntryUpsert` were assessed and need no change: the former already returns `applied` for any pre-existing id without content comparison (immutable-after-insert, safe by construction); the latter's target is `(userId, date)`, not `id`, so an id collision on retry is moot.

**Negative controls (both required):**
- *"Response applied server-side but lost client-side, followed by retry"*: `tests/e2e/lost-response-retry.spec.ts` — a route handler performs the **real** `/api/sync` request via `route.fetch()` (so the server genuinely applies the create) and then `route.abort()`s instead of fulfilling, simulating the client never seeing the reply. The op is retried unchanged on the next flush. Verified: outbox drains with **zero dead letters**, and exactly one set row exists server-side with the correct values (not duplicated, not rejected).
- *"Different id genuine uniqueness conflict"*: same file, second test — a hand-built `/api/sync` payload with a brand-new id claims an already-occupied `(sessionExerciseId, setNumber)` slot. Verified the response's `rejected` array contains exactly `{opId, entity: "setLog", reason: "set_number_conflict"}`, and the original set's value is unchanged.

`tests/e2e/duplicate-replay.spec.ts`'s header comment (which previously asserted the architecture "doesn't promise to handle" concurrent duplicate delivery — the exact wrong premise the review called out) was corrected to describe the sequential-vs-concurrent distinction accurately and point to the new spec.

## B-3 — Restore account-timezone day attribution

**Root cause:** `src/domain/time/localDate.ts` exported `deviceLocalDateString()` (device's own resolved IANA zone), and every quick-log call site (`src/sync/dailyLogs.ts`, online and offline) used it unconditionally instead of `users.timezone`.

**Fix:**
- `src/server/today/service.ts` — `TodayBundle` now includes `timezone: string`, populated from the SAME `users.timezone` query `buildTodayBundle` already ran for its own internal date resolution (no new query). `src/sync/types.ts`'s client-side `TodayBundleDto` mirrors this field.
- `src/sync/accountTimezone.ts` (new) — `getAccountTimezone()`: reads the cached Today bundle (`src/sync/bundleCache.ts`) first; if nothing is cached yet (a device that's never successfully loaded Today), falls back to a live `/api/today-bundle` fetch (works when online, e.g. a first-ever visit straight to `/bodyweight`/`/recovery`) and caches the result. Returns `null` only when neither source has an answer.
- `src/sync/dailyLogs.ts` — `logBodyweightToday`/`logRecoveryToday` resolve "today" via `getAccountTimezone()` + `userLocalDateString()`; if the timezone is unknown, they throw `UnknownAccountTimezoneError` instead of ever falling back to a device-computed guess. `deviceLocalDateString()` was removed entirely (no remaining legitimate call site).
- `src/ui/recovery/RecoveryCheckIn.tsx` — a new `unknown-timezone` phase (distinct from the pre-existing `unknown-offline` phase, which still assumes "today" is a known, correct value and only doesn't know if it already has an entry) renders when the account timezone truly can't be resolved: no inputs, no save action offered at all — there is no day it would be safe to write to.
- `src/ui/bodyweight/BodyweightQuickLog.tsx` — distinguishes `UnknownAccountTimezoneError` with a specific, actionable message instead of the generic save-failure text.

**Negative controls (required: "account timezone versus Pacific/UTC browser zones," "UTC boundaries," "DST," "existing-row overwrite prevention"):**
- `tests/unit/dailyLogs.test.ts` — `userLocalDateString` resolves a UTC-boundary-crossing instant correctly for `Europe/Ljubljana` (CEST, DST-observing) vs. `Pacific/Kiritimati` (UTC+14, no DST) as two different calendar days from the same instant; a plain UTC-at-22:30 instant resolves to the next day only for a zone ahead of UTC. `logBodyweightToday`/`logRecoveryToday` day-key to the cached account timezone (verified via frozen `vi.useFakeTimers`), never to any device notion of "now."
- `tests/e2e/offline-bodyweight-recovery.spec.ts` — an end-to-end version with a real browser context pinned to `timezoneId: "Pacific/Kiritimati"` and `page.clock.setFixedTime()` frozen to `2026-06-15T21:50:00Z` (Ljubljana reads this as `2026-06-15`; Kiritimati reads the identical instant as `2026-06-16`). Verified: the enqueued outbox op's `date` field, and the eventual server-persisted row's `date`, are both `2026-06-15` — never `2026-06-16`. A separate test proves the unknown-timezone safe-surfacing state (cleared `bundleCache`, offline, no live fetch possible): the check-in shows an explicit "hasn't learned the account's timezone" message with **no inputs offered at all**, never a guessed day.
- "Existing-row overwrite prevention" is covered by MEDIUM-3's fix below (the cache can no longer hold optimistic/mis-keyed state that a reload could act on as if confirmed).

## HIGH-1 — Remove the recovery lost-update window

**Root cause, re-derived (the review's own correction to my original framing):** the trigger for the eager-CHECK-on-proposed-tuple false rejection is NOT "touch one field while another exists" (Drizzle's presence-aware `ON CONFLICT DO UPDATE SET <touched-only>` already handles that correctly and atomically) — it is specifically when a payload's own touched fields are **all null** (an explicit-clear-only or note-only op), making the proposed insert tuple all-null regardless of the row's true state. The adapter's pre-read/backfill "fix" for this reopened exactly the lost-update window it was meant to avoid: a real-Postgres concurrency test showed 5/6 concurrent partial-update pairs on different metrics lost one of them, because each call's stale pre-read clobbered whatever the other had just committed.

**Fix:**
- `src/server/sync/service.ts`'s `applyRecoveryEntryUpsert` — the pre-read/backfill removed entirely; it now passes the payload's own fields through as-is (undefined for untouched).
- `src/server/recovery/service.ts`'s `logRecovery` — catches the CHECK-violation from the single-statement upsert and retries as a **single plain UPDATE** using the same presence-aware `updateSet` (only the caller's own touched fields). A plain UPDATE has no "proposed tuple" — Postgres validates its CHECK constraint against the real post-merge row. Zero rows affected means a genuinely empty fresh day (rejected, `no_metric`); a second CHECK violation on the retry means this row's other metrics really were already all null, i.e. this op would clear the last one (also rejected, row left unmodified — Postgres rolls back the failed statement).

This keeps the common case (a touched field with its own non-null value) on the original single-statement, race-free path; only the all-null-tuple case takes the one-statement retry, which relies on Postgres's own row-level locking for correctness under concurrency (a second concurrent UPDATE to the same row blocks until the first commits, then re-validates against the now-current row — not a read-then-separate-write race).

**Negative control (required: "concurrent partial recovery updates on real PostgreSQL"):** `tests/integration/recoveryConcurrency.integration.test.ts` (new), gated on `RECOVERY_CONCURRENCY_DATABASE_URL`, driving the real `applySyncBatch` entry point (not `logRecovery` in isolation — the bug lived in the adapter) with a real multi-connection `pg.Pool`:
- Seeds each of 8 trial days with both metrics set, then fires two concurrent `applySyncBatch` calls per day touching readiness and soreness independently. **Both survive in every trial, across 8 fresh-database runs.**
- **Proved the test actually detects the original bug**: temporarily restored the old pre-read/backfill adapter and reran — failed reproducibly (3/3 runs) with `readiness lost to a concurrent write: expected 4 to be 1` (the exact review-reported failure mode). Reverted the temporary change (confirmed via `pnpm typecheck`/`pnpm lint`/diff inspection that no residue remained) and reran — passed reliably again (8/8 fresh-database runs).
- Additional cases: a note-only op on a day with an untouched existing metric doesn't clear it; clearing a day's only metric is rejected (`no_metric`) and leaves the row unmodified; two concurrent explicit-clears that would together empty a row resolve to exactly one applying and one correctly rejecting (`no_metric`), never both, never neither, and the row is never left empty.

## HIGH-2 — Repair the progression boundary

**Root cause:** `tests/unit/importGraphWalker.ts`'s `walkImportGraph` recorded only the FIRST parent per file in `reachedFrom`. `isSyncTransportException` checked only that one entry, so once any of the four co-location exception files was first reached via the approved sync-transport edge (an accident of BFS queue order), a second, genuinely forbidden edge into the SAME file from anywhere else was invisible. Negative controls: `src/server/volume/service.ts → @/server/recovery/service` was NOT detected (13/13 passed); `src/server/progression/service.ts → @/server/recovery/service` WAS detected (2 failed) — same forbidden edge shape, different BFS discovery order.

**Fix:**
- `tests/unit/importGraphWalker.ts` — `walkImportGraph` now also returns `allParents: Map<string, Set<string>>`, recording EVERY edge into every file regardless of whether that file was already visited. Also added an `extraEdges` option (`SyntheticEdge[]`) letting a test fold in a non-real edge without ever writing it to an actual source file — needed for the negative controls below, since the bypass edges must never legitimately exist in production code.
- `tests/unit/progressionBoundary.test.ts` — `isSyncTransportException` now requires **every** recorded parent of a sync-transport-exception file to itself be one of the two real transport files OR one of the other three exception files (their genuine, expected intra-cluster edges — e.g. `domain/recovery/schema.ts` importing a shared `dateOnlySchema` from `domain/bodyweight/schema.ts`). A parent from progression, volume, history, or a barrel — anywhere else — still fails, regardless of which edge the BFS happened to record first.

**Negative controls (required: "for each bypass identified by the reviewer"):** new `describe` block in `tests/unit/progressionBoundary.test.ts` injects the exact two synthetic edges via `extraEdges` and asserts both are now caught: `server/volume/service.ts → server/recovery/service.ts` (previously invisible) and `server/progression/service.ts → server/recovery/service.ts` (already worked, confirmed no regression). All 15 tests in the file pass, including the pre-existing negative control (`TodaySection.tsx`'s real UI edges still flagged) and the exact-four-exception-files check (re-verified correct after tightening the parent-set logic to admit the exception files' own genuine intra-cluster edges).

## HIGH-3 — Correct report evidence

Handled as its own deliverable: see the dated correction appended to `docs/reviews/phase-8-implementation.md` (not rewritten — the original body is preserved as history). It identifies each inaccurate verification claim from that report by name, states the actual passed/skipped counts and exact repeated-run results, and does not attribute the `active-schedule-edit.spec.ts` failure the original report saw to anything without the same-environment baseline control this remediation performed independently (see "Incidental fix," below — a *different*, actually-reproduced root cause than the original report's unverified guess).

## MEDIUM-1 — Add a deterministic regression test for `serialize()`

**Root cause:** the only existing coverage, `offline-set-edit-delete.spec.ts`'s `await row.waitFor({ state: "detached" })`, doesn't actually wait for `editSet`'s promise to resolve — the row detaches on a synchronous `setEditing(false)` called immediately when `onEdit(...)` is invoked, not once the async call settles. Reverting `serialize()` would not fail any existing test.

**Fix:** `tests/unit/activeSessionConcurrency.test.ts` (new) — drives the REAL production mutators (`editSet`, `deleteSet`, `logSet` from `src/sync/activeSession.ts`, not copies) against a real IndexedDB (`fake-indexeddb`), calling two/three of them with **no `await` between the calls** (matching the actual UI's fire-and-forget invocation pattern) so their `requireLocalSession()` reads genuinely race for the same pre-mutation snapshot.

**Verified it fails when `serialize()` is removed** (the explicit required proof): temporarily changed `serialize` to `return fn()` (bypassing the queue) — both tests failed deterministically (`expected 100 to be 105`; array length mismatch — one mutation's write clobbered another's, exactly the mechanism `serialize()` fixes). Reverted (confirmed via diff and a clean `pnpm typecheck`/`pnpm lint`) — both tests pass again.

## MEDIUM-2 — Add missing deterministic tests (offline bodyweight/recovery coverage + CI gate)

- `tests/unit/dailyLogs.test.ts` (new, 8 tests) — `userLocalDateString`, `getAccountTimezone` (cached / live-fetch-fallback / null-when-neither), `logBodyweightToday`/`logRecoveryToday` (correct day-keying, and `UnknownAccountTimezoneError` thrown before any outbox write).
- `tests/unit/idbUpgrade.test.ts` (new, 2 tests) — see MEDIUM-4.
- `tests/e2e/offline-bodyweight-recovery.spec.ts` (new, 4 tests) — offline bodyweight log surviving a refresh and converging on reconnect; the true unknown-offline recovery state (no live read, no same-day cache) converging through its touched-only merge, verified to send only the touched field; account-vs-device timezone disagreement (see B-3); unknown-account-timezone safe surfacing.
- `tests/integration/recoveryConcurrency.integration.test.ts` (new) — see HIGH-1.
- `package.json`'s `test:e2e:offline` script (the CI offline gate) now includes `transient-failure-fifo.spec.ts`, `lost-response-retry.spec.ts`, and `offline-bodyweight-recovery.spec.ts` alongside the existing 11 files.

All required scenarios from the task's explicit list are covered: unknown offline recovery state, refresh, reconnect, touched-only merge, account/device timezone disagreement, exact server convergence, and a true lost-response retry test (not an immediate successful sequential replay — see B-2).

## MEDIUM-3 — Restore the dailyLogCache contract

**Root cause:** `src/ui/recovery/RecoveryCheckIn.tsx`'s known-state form wrote to `dailyLogCache` immediately after enqueueing (before server confirmation), under a client-generated id the server only honors on insert — an already-existing day (created from another device in the interim) would get cached under a nonexistent id. Separately, a successful online read cached under `data.entry?.date ?? today`, mixing the server's own date (when an entry exists) with a device-timezone-derived fallback (when it doesn't).

**Fix:**
- The premature `setCachedRecoveryToday(...)` call right after enqueueing was removed from `RecoveryCheckInForm.save()`. The component's own React state (`onSaved(savedEntry)`) still updates immediately for UI responsiveness — an optimistic view held only for this render's lifetime, never persisted as confirmed, exactly the "or explicitly model optimistic state separately without treating it as confirmed" alternative the finding allows. The next successful read (a fresh mount, or reconnect) repopulates the durable cache with the real server-confirmed row. This aligns the known-state form with the sibling unknown-offline form, which already deliberately never writes to `dailyLogCache`.
- The `today` fallback used for the confirmed-read cache write is now always the account-timezone-resolved value (via `getAccountTimezone()`), never a device-timezone fallback — closing the date-key-mixing half of the finding as a direct consequence of the B-3 fix.

## MEDIUM-4 — Handle IndexedDB upgrades

**Fix:** `src/sync/db.ts`'s `getIdb()` gained `blocked`/`blocking` handlers. `blocked` (this connection's own open request is stuck behind another, already-open, older connection) sets a new `idbUpgradeStore` flag, surfaced by `SyncStatusBanner.tsx` as "Waiting on another open tab of this app to update — close it to continue." `blocking` (this connection is itself standing in a newer version's way elsewhere) synchronously closes the connection and drops the memoized `dbPromise`, so a subsequent `getIdb()` call in this tab reopens fresh rather than reusing a closed connection.

**Negative control (required: "verify with two real clients... v1 holds the DB, v2 reports blocked, closing v1 allows the upgrade and queued work to continue"):** `tests/unit/idbUpgrade.test.ts` (new), using real `fake-indexeddb` clients (not mocked):
- Test 1: an older connection (`v1`, opened raw, deliberately without its own `blocking` handler so it doesn't self-close) blocks the REAL `getIdb()`'s open request (`v2`). Verified `blocked` becomes `true`, then closing `v1` lets `v2` resolve and `blocked` clears.
- Test 2: the real `getIdb()`'s own connection, when a genuinely newer version opens elsewhere, closes itself (verified: a subsequent `.transaction(...)` call on it throws) so the newer open's `upgrade` callback fires and it resolves — proving the required "close the current connection when it blocks a future upgrade" behavior end-to-end, not just that the callback exists.

---

## Required negative controls — consolidated

| Control | Where | Result |
|---|---|---|
| Transient first-flush failure followed by edit/delete | `tests/e2e/transient-failure-fifo.spec.ts` | 10/10 consecutive runs pass |
| Response applied server-side but lost client-side, followed by retry | `tests/e2e/lost-response-retry.spec.ts` | Passes; zero dead letters, exactly one converged row |
| Different-id genuine uniqueness conflict | `tests/e2e/lost-response-retry.spec.ts` (2nd test) | Passes; correctly rejects `set_number_conflict` |
| Account timezone vs. Pacific/UTC browser zones | `tests/unit/dailyLogs.test.ts`, `tests/e2e/offline-bodyweight-recovery.spec.ts` | Both pass; deterministic UTC-boundary instant |
| Concurrent partial recovery updates on real PostgreSQL | `tests/integration/recoveryConcurrency.integration.test.ts` | 8/8 fresh-DB runs pass; proved to fail against the old adapter (3/3) |
| Forbidden recovery import from volume/history | `tests/unit/progressionBoundary.test.ts` | Both reviewer bypasses now caught |
| Serialization temporarily bypassed | `tests/unit/activeSessionConcurrency.test.ts` | Proved to fail when `serialize()` bypassed (2/2), passes restored (2/2) |
| Blocked IndexedDB upgrade (two real clients) | `tests/unit/idbUpgrade.test.ts` | Both directions verified with real fake-indexeddb clients |

---

## Incidental fix (out of the required scope, documented rather than silently applied)

While repeatedly rerunning the full E2E suite to get honest evidence for this report, `tests/e2e/active-schedule-edit.spec.ts` (Phase 5, untouched by any of the nine required outcomes) failed intermittently. Investigated per the instruction to root-cause rather than label flaky, using a same-environment baseline control: reset the database fully fresh, ran the spec in complete isolation immediately after the standard migrate+seed+bootstrap sequence. **It reproduced on the very first clean run** — not cross-spec contamination, not caused by anything in this remediation's B/HIGH/MEDIUM scope.

Root cause: the spec queries `/api/active-session` (the SERVER's view) immediately after `waitForURL(/\/today\/workout$/)`, without first waiting for the outbox to actually flush the session-create ops. `startSession` commits locally to IndexedDB synchronously, but the SERVER only reflects it after the async sync round-trip completes — a pre-existing timing gap in this spec, predating Phase 8's outbox work, never previously exercised because nothing had rerun the full suite this many times in a row against one long-lived database. Fixed with one `await waitForOutboxDrained(page);` call (the same helper dozens of other specs already use) before the server-side read. Reproduced (4/5 isolated runs failing) before the fix and eliminated (6/6, then part of three consecutive clean 62/62 full-suite runs) after it.

This is fixed here — despite being outside the nine required findings — because it was the one thing standing between "repeated full-suite runs" (an explicit requirement of this remediation) and honest, reproducible green results; leaving a known, root-caused, one-line-fixable flake in place would have made every subsequent repeated run misleading in exactly the way HIGH-3 exists to correct.

---

## Real-PostgreSQL evidence

All runs below used a database dropped and recreated fresh (`DROP DATABASE`/`CREATE DATABASE` against the local Docker `postgres:16` container), migrated from empty (`pnpm db:migrate`), seeded (`pnpm db:seed`), with the one ADR-004 account bootstrapped through the real running app (`smoke.spec.ts`, since the seed script's `setupAccount()` needs an active request scope), re-seeded (post-account catalog), and the Phase 3 fixture seed (`tests/e2e/seed.ts`) — never PGlite, never the shared/long-lived dev database from any prior session, never production.

- `tests/integration/recoveryConcurrency.integration.test.ts`: 8/8 fresh-database runs pass with the fix; 3/3 fresh-database runs fail (reproducing the exact review-reported symptom) with the old adapter temporarily restored.
- Every E2E run below (`offline-cold-launch`, `offline-sync`, `offline-set-edit-delete`, `network-flap`, `duplicate-replay`, `sync-auth-expiry`, `takeover`, `dead-letter`, `stale-completed-session`, `storage-persist-status`, `transient-failure-fifo`, `lost-response-retry`, `offline-bodyweight-recovery`, `active-schedule-edit`, `bodyweightRecovery`, `deload`, `exerciseDecimalInput`, `ensureNoActiveSession`, `muscleTaxonomyV2`, `offline-recommendation`, `phase7Remediation`, `progression`, `set-deletion`, `smoke`, `today`, `volume`) exercises a real Postgres 16 instance via the production Next.js server (`pnpm build && pnpm start`), never a mock.

## Repeated-run results (exact)

- `pnpm typecheck` / `pnpm typecheck:sw` / `pnpm lint` / `pnpm format check` — clean throughout every edit in this remediation, re-verified after every fix and after every revert of a temporary verification change.
- `pnpm test:unit` — **474/474 passed**, 38 files (was 460/460, 35 files, before this remediation added `activeSessionConcurrency.test.ts`, `dailyLogs.test.ts`, `idbUpgrade.test.ts`).
- `pnpm test:integration` — **248/248 passed, 9 skipped** (was 248/248, 5 skipped — the 4 additional skips are `recoveryConcurrency.integration.test.ts`'s tests, correctly gated off without its dedicated opt-in env var, matching the existing convention for the other two real-Postgres-only concurrency files), **19 passed + 3 skipped = 22 files**.
- `pnpm build` — clean production build.
- Full `pnpm exec playwright test` (all 62 specs, entire `tests/e2e/` directory) against a freshly created, migrated, and seeded database: **first run 61/62 passed, 1 failed** (`active-schedule-edit.spec.ts` — root-caused and fixed, see above, unrelated to any B/HIGH/MEDIUM item); **after that fix, three consecutive runs, 62/62 passed each time.** A fourth run later in the session (after a Prettier reformat with no logic change) saw one further, different single failure — `bodyweightRecovery.spec.ts`'s pre-existing, untouched-by-this-remediation "dismissed permanently" test. Investigated the same way: 8/8 isolated reruns of that file passed, and 3 further full-suite reruns immediately after all passed 62/62 with no recurrence. It was not reproduced again despite this additional, deliberate effort, and no mechanism connecting it to any B/HIGH/MEDIUM change was found — `dismissedPreference.ts` (what that specific test exercises) was never touched, and the parts of `RecoveryCheckIn.tsx` this remediation did change (which phase it resolves to) don't gate the assertions that test makes (the header, including the dismiss button, renders unconditionally in every phase). Reported here rather than omitted, in the same spirit as HIGH-3: a true one-off anomaly, not swept under "flaky," but also not overclaimed as caused by, or fixed by, anything in this remediation. **Total across the session: 12 full-suite runs, 10 clean 62/62, 2 single-spec failures — one root-caused and fixed (`active-schedule-edit.spec.ts`), one investigated and not reproduced (`bodyweightRecovery.spec.ts`).**
- `pnpm test:e2e:offline` (the exact CI command, now 14 files / 21 tests): the first 10-run loop, run before an unrelated timing bug in my OWN new `offline-bodyweight-recovery.spec.ts` test (not a production defect — a test-harness race between the spec's own cache-clearing step and the app's asynchronous confirmed-read cache write) was found and fixed, showed **6/10 passed, 4/10 failed**, all four failing for the identical, single root cause (root-caused via the exact same investigate-don't-dismiss standard, then fixed by polling for the real cache write before clearing it). **After that fix: 10/10 consecutive runs passed** (21/21 tests each run), then reconfirmed with **3 additional consecutive full-suite runs, 62/62 passed each time.**

No failure in this remediation was attributed to anything without first reproducing it against a same-environment baseline control (a fresh database, isolated re-run, and — where the root cause was in this remediation's own new code — a temporary revert-and-observe-failure pass).

## Exact changed files

**New:**
`src/sync/accountTimezone.ts`, `src/sync/idbUpgradeStore.ts`, `tests/unit/activeSessionConcurrency.test.ts`, `tests/unit/idbUpgrade.test.ts`, `tests/unit/dailyLogs.test.ts`, `tests/integration/recoveryConcurrency.integration.test.ts`, `tests/e2e/transient-failure-fifo.spec.ts`, `tests/e2e/lost-response-retry.spec.ts`, `tests/e2e/offline-bodyweight-recovery.spec.ts`, `docs/reviews/phase-8-remediation.md` (this file).

**Modified:**
`src/sync/outbox.ts`, `src/sync/db.ts`, `src/sync/flush.ts` (B-1); `src/server/sync/service.ts` (B-2, HIGH-1); `src/server/recovery/service.ts` (HIGH-1); `src/server/today/service.ts`, `src/sync/types.ts`, `src/domain/time/localDate.ts`, `src/sync/dailyLogs.ts`, `src/ui/recovery/RecoveryCheckIn.tsx`, `src/ui/bodyweight/BodyweightQuickLog.tsx` (B-3, MEDIUM-3); `tests/unit/importGraphWalker.ts`, `tests/unit/progressionBoundary.test.ts` (HIGH-2); `src/ui/SyncStatusBanner.tsx` (MEDIUM-4); `tests/e2e/duplicate-replay.spec.ts` (B-2, comment correction only — no behavior change); `tests/e2e/active-schedule-edit.spec.ts` (incidental fix, see above); `package.json` (`test:e2e:offline` script).

**Explicitly untouched, per instruction:** `docs/reviews/phase-8-review.md`, earlier independent verification reports, `docs/input/product-ideas.md`, `CLAUDE.md`, `HANDOFF.md`/`HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`. `docs/reviews/phase-8-implementation.md` was appended to, never rewritten — its original body is preserved as history below a dated correction section.

No LOW finding (LOW-1 through LOW-6) was touched — none was inseparable from a required fix.

---

## Verdict

**READY FOR TARGETED REMEDIATION VERIFICATION.**

---

## 2026-08-29 — B-3 follow-up: `getAccountTimezone()` upgrade-path guard

Scope: narrowly `docs/reviews/phase-8-remediation-verification.md` §4/§12 item 1 (BLOCKER) only —
`getAccountTimezone()` returning an unvalidated `timezone` from the cached Today bundle, so a bundle
cached by any pre-remediation build (no `timezone` field at all) let `undefined` slip past
`resolveTodayDate`'s `=== null` guard into `Intl.DateTimeFormat`'s silent device-zone default. The
eight outcomes the independent verification pass already found fixed were not revisited, and items
2–5 (all LOW) were left untouched, per the task's instruction.

**The fix** — `src/sync/accountTimezone.ts`: a new `readValidTimezone(bundle)` helper reads
`bundle.timezone` as `unknown` (not the declared-but-unenforced `string`) and accepts only a
non-empty string; anything else (`undefined`, `""`, or any other legacy shape) resolves to `null`.
Applied identically to both branches `getAccountTimezone()` can return from:

- the cached-bundle branch — an invalid cached record now falls through to the live fetch instead
  of being returned as-is;
- the live-fetch branch — a legacy response (including, per the review's own note, one a stale
  service-worker `today-bundle` runtime-cache entry might replay) is validated the same way, since
  the code has no way to distinguish a genuine network reply from an SW-served cache hit at this
  layer.

`getAccountTimezone()` returns `null` only when neither source has a valid answer — the existing
`UnknownAccountTimezoneError`/`unknown-timezone` surfacing (unchanged) then correctly blocks every
quick-log write, exactly as it already did for the "nothing cached at all" case. No fallback to the
device timezone remains anywhere in this path.

**Regression coverage added:**

- `tests/unit/dailyLogs.test.ts` — 5 new cases in `describe("getAccountTimezone …")` and
  `describe("logBodyweightToday / logRecoveryToday …")`: a legacy cached bundle with a missing
  `timezone` field falls through to a live fetch rather than returning `undefined`; the same for an
  empty-string `timezone`; `null` (never `undefined`) when both the cached bundle and the live-fetch
  response are legacy/invalid; `null` when only the live-fetch response has an empty-string
  `timezone`; and — driving the real call chain, not just the resolver in isolation —
  `logBodyweightToday`/`logRecoveryToday` both throw `UnknownAccountTimezoneError` and enqueue
  nothing for the exact pre-remediation `bundleCache` shape (a record with no `timezone` field at
  all), offline.
- `tests/e2e/offline-bodyweight-recovery.spec.ts` — a new describe block, `"legacy pre-remediation
  Today bundle — B-3 upgrade path regression"`, with 4 tests against a real browser, real IndexedDB,
  and the real service worker:
  - two **online** tests, each arriving directly at `/bodyweight` or `/recovery` — deliberately
    *not* via a `/today` reload, since `TodaySection` re-caches a fresh, valid bundle on every Today
    load regardless of this fix, which would silently self-heal the cache before the write and mask
    the defect entirely (an early draft of this test made exactly that mistake — see "one wrong
    turn," below). With a legacy (`timezone`-less) cached bundle and the device pinned to
    `Pacific/Kiritimati` against the seeded account's `Europe/Ljubljana`, both bodyweight and
    recovery writes land on the account day, never the device day, and a pre-existing device-day
    recovery entry (seeded with distinguishing values, `5/5/5, note "real entry"`) survives
    byte-identical;
  - two **offline** tests (`timezone` missing / empty-string) confirming the unknown-timezone state
    surfaces correctly for a cached record that *exists but is invalid* — the one shape the existing
    "unknown account timezone — safe surfacing" spec (an empty `bundleCache` store) didn't cover: no
    recovery inputs or Save button offered, the bodyweight save is rejected with the same
    "hasn't learned the account's timezone" message, and neither `outbox` nor `dailyLogCache` gains
    an entry.
  - a fifth scenario (a legacy *live-fetch* response, e.g. a stale SW-cache replay) was attempted via
    `page.route()`/`context.route()` interception of `/api/today-bundle` and dropped: like the
    independent verification pass itself noted, a controlled page's fetch for that endpoint is
    issued by the service worker's own fetch handler, which route interception at the page/context
    level could not reliably substitute a response for — the interception was silently bypassed and
    the real (valid) network response won. Since `readValidTimezone` applies the identical guard to
    the live-fetch branch regardless of what served the response, `dailyLogs.test.ts`'s "returns
    null … when both the cached bundle and the live-fetch response are legacy/invalid" test (which
    mocks `fetch` directly, the same boundary this code actually reads through) is the faithful
    regression coverage for that requirement instead.

**Proof the tests fail against the unguarded implementation** — `src/sync/accountTimezone.ts` was
temporarily reverted to the exact pre-remediation body (`if (cached) return cached.bundle.timezone;`
/ `return data.timezone;`, no validation) and every new test rerun before being restored:

- `tests/unit/dailyLogs.test.ts`: **5/5 new cases failed** against the unguarded body (`expected
  "America/New_York" … Received: undefined`, `expected '' to be 'Pacific/Kiritimati'`, `expected
  undefined to be null`, and the `logBodyweightToday`/`logRecoveryToday` case resolving instead of
  rejecting). Restored, reran: **13/13 pass** (8 pre-existing + 5 new).
- `tests/e2e/offline-bodyweight-recovery.spec.ts`: the 4 new tests **all failed** against the
  unguarded body. The online/bodyweight case is worth quoting exactly, since it is a live,
  first-party reproduction of the original BLOCKER-3 data-destruction pattern the independent
  verification pass found: `Expected: "2026-06-15" / Received: "2026-06-16"` — a real write landing
  on the device's calendar day instead of the account's, online, with the UI reporting "Saved."
  Restored, reran: **4/4 pass**, then the full 8-test file **3 consecutive times, 24/24**, and again
  inside the CI offline gate and the full suite below.

**One wrong turn, corrected during this pass** — the online test was first written as a `/today`
reload (matching the "account vs device timezone disagreement" spec's own existing convention) and
passed even against the deliberately-unguarded implementation, which is the opposite of what a
negative control must do. Root cause: `TodaySection` fetches and re-caches a fresh, valid bundle on
every `/today` load through its own code path, entirely independent of `getAccountTimezone()` — so a
`/today` reload heals a poisoned cache regardless of whether this fix exists, and can never exercise
it. Rewritten to arrive directly at `/bodyweight`/`/recovery` (bypassing `/today`, as
`getAccountTimezone()`'s own doc comment already names as the scenario its live-fetch fallback
exists for) — this version genuinely reproduces the defect against the unguarded body, as shown
above. A second, narrower mistake in the same test — `bwEntries.find(e => e.weightKg === 83.5)`,
scoped by weight only — silently matched a stale row from an earlier failed debugging run left in
the disposable database and produced a false pass; corrected to scope by weight **and** date, the
exact fragility the independent verification pass already flagged as LOW-4 for the pre-existing
specs in this same file (not otherwise touched here).

**Quality gates, all against the local Docker PostgreSQL 16, never production:**

| Check | Result |
|---|---|
| `pnpm typecheck` / `pnpm typecheck:sw` / `pnpm lint` / `pnpm format:check` | clean |
| `pnpm test:unit` | **479/479** (474 baseline + 5 new), 38 files |
| `pnpm test:integration` | **248 passed, 9 skipped** — unchanged from the prior verification pass |
| `tests/e2e/offline-bodyweight-recovery.spec.ts` alone | **8/8, 3 consecutive runs (24/24)** |
| `pnpm test:e2e:offline` (CI gate, 14 files) | **25/25** |
| Full `pnpm exec playwright test` (66 specs) | **66/66** |

All of the above ran against a from-scratch disposable database (`gymapp_b3v`, created, migrated,
seeded, account-bootstrapped via `smoke.spec.ts`, re-seeded, fixture-seeded — the same recipe the
independent verification pass used) and a production build (`pnpm build && pnpm start`), on the
local Docker Postgres 16 instance only. `gymapp_b3v` was dropped at the end; the developer's own
`gymapp` database was never written to. Nothing was committed, pushed, deployed, or tagged; no
production access.

**Exact changed files:** `src/sync/accountTimezone.ts` (modified — the guard), `tests/unit/dailyLogs.test.ts`
(modified — 5 new cases), `tests/e2e/offline-bodyweight-recovery.spec.ts` (modified — new describe
block, 4 tests), `docs/reviews/phase-8-remediation.md` (this section). No other file was touched;
`docs/reviews/phase-8-review.md`, `docs/reviews/phase-8-remediation-verification.md`,
`docs/input/product-ideas.md`, and the user-owned CLAUDE/HANDOFF/gpt-memory/skills files were not
modified. Items 2–5 (all LOW) from §12 were not addressed.

**READY FOR SECOND TARGETED REMEDIATION VERIFICATION**
