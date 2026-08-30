# Phase 8 — Targeted Remediation Verification

Independent verification pass over `docs/reviews/phase-8-remediation.md` and the dated correction in
`docs/reviews/phase-8-implementation.md`, against the findings in `docs/reviews/phase-8-review.md`.

Nothing was committed, pushed, deployed, or tagged. No production access. All work ran against two
disposable PostgreSQL 16 databases (`gymapp_p8v2`, `gymapp_p8v2_conc`) created and dropped inside the
local Docker instance; the developer's own `gymapp` database was never written to. No implementation
file, test, or report was modified — three files were temporarily edited as negative controls and
restored byte-identically (SHA-256 verified, §11). `git status --porcelain` at the end of this pass is
identical to its state at the start, with `docs/reviews/phase-8-remediation-verification.md` as the
only addition.

No shipped test or report claim was accepted as proof: every finding below was re-derived with
fixtures written from scratch for this pass, and each fix was checked against a negative control that
reproduces the original failure.

---

## Verdict

**REMEDIATION INCOMPLETE**

Eight of the nine required outcomes are genuinely and thoroughly fixed, several of them better than
the report claims. **B-3 is not.** Its core is repaired — every timezone case I tested now day-keys to
`users.timezone` — but the fix reads the account timezone out of the cached Today bundle without
validating it, and a bundle cached by *any* pre-remediation build has no `timezone` field. The
resulting `undefined` slips past the `=== null` guard and `Intl` silently falls back to the **device**
zone. Reproduced deterministically, 3/3: a recovery check-in wrote to the device's calendar day and
overwrote a real stored entry (`5/5/5, note "real entry"`) with `3/3/3, note null` — bit-for-bit the
original BLOCKER-3 data destruction. This is the *default* upgrade path for an already-installed PWA,
not an edge case, and it is silent (the UI reports "Saved.").

The fix is a one-line tightening of a single guard. Everything else here is ready.

---

## 1. Summary

| Finding | Verified | Evidence |
|---|---|---|
| B-1 FIFO after failures | **FIXED** | §2 |
| B-2 lost-response idempotence | **FIXED** (one narrow residual, §3) | §3 |
| B-3 account-timezone day attribution | **NOT FIXED on the upgrade path** | §4 |
| HIGH-1 recovery lost update | **FIXED** | §5 |
| HIGH-2 progression boundary | **FIXED** | §6 |
| HIGH-3 report evidence | **FIXED** (correction accurate line-by-line) | §7 |
| MEDIUM-1 serialization regression test | **FIXED** | §8 |
| MEDIUM-2 offline bodyweight/recovery coverage | **FIXED** | §8 |
| MEDIUM-3 dailyLogCache contract | **FIXED** (its date-key half depends on B-3) | §8 |
| MEDIUM-4 IndexedDB upgrade blocking | **FIXED** (verified with real browser clients) | §8 |

Suites, reproduced independently on a from-scratch database and a production build:

| Check | Result |
|---|---|
| `pnpm typecheck` / `typecheck:sw` / `lint` / `format:check` | clean |
| `pnpm test:unit` | **474/474**, 38 files |
| `pnpm test:integration` | **248 passed, 9 skipped**, 19 passed + 3 skipped files |
| `recoveryConcurrency.integration.test.ts` (gated, real PostgreSQL) | 4/4 tests, 4 consecutive runs |
| Full `pnpm exec playwright test` | **62/62, five consecutive runs** |
| `pnpm test:e2e:offline` (CI gate) | **9/10** runs at 21/21 (§9) |

---

## 2. B-1 — FIFO after failures: FIXED

**The fix.** Per-op `nextAttemptAt` is gone from `OutboxOpRecord` entirely; `listPendingOps`
(`src/sync/outbox.ts:52`) now returns every pending op oldest-first with no filtering, and backoff
moved to a single queue-level `nextFlushAllowedAt` scalar checked once at the top of `flushOutbox`
(`src/sync/flush.ts`). `markTried` is informational only. This removes the mechanism itself rather
than papering over it: there is no longer any per-op quantity that could make one op eligible while an
older one is not.

**Independently reproduced, on the exact scenarios that failed before.**

*Transient failures while `navigator.onLine` stays true* (captive portal / dead zone / deploy window),
injected as both a network-level abort and a 503, three rounds each: three sets logged, set 2 edited,
set 3 deleted, several failing attempts allowed to pile up, then the failures stopped.

```
  [abort] local=["1:100x5","2:103x6"]  server=["1:100x5","2:103x6"]     x3 rounds
  [503]   local=["1:100x5","2:103x6"]  server=["1:100x5","2:103x6"]     x3 rounds
```

Every request carried the complete queue in creation order:

```
  REQ ["up#1=100x5","up#2=102.5x5","up#3=105x5","up#2=103x6","DEL#3"]   (retried whole, never split)
```

Before the remediation this exact scenario diverged in 2 of 8 runs, with the stale insert reverting
the edit or the delete arriving before its insert.

*Ops appended during the backoff window* — a fresh op has `tries = 0` and, under the old design, no
delay of its own, so it was the clearest way for a later op to overtake an earlier one. Three rounds:
`local == server` every time, and every batch's set numbers were ascending with no gaps.

*Offline mutations + offline reload + reconnect* (the required Phase-8 scenario, which failed 5–6 of 10
times before): 3/3 converge exactly.

*Backlog larger than `BATCH_SIZE`* — 62 ops queued offline, then reconnect:

```
  batch sizes: [50,12]        first/last of each: [[1,50],[51,62]]
```

Exactly one full batch then the remainder, non-overlapping, in order, 62/62 rows server-side matching
local.

*Identical `createdAt` timestamps* — `enqueueOps` writes a set deletion and its renumbering in one
transaction, so several ops can share a millisecond. 40 records written with a byte-identical
`createdAt` came back from the `byCreatedAt` index in exact `opId` order (`[0,1,2,…,39]`), confirming
the index falls back to the primary key and FIFO survives ties.

**Observation (not a defect).** Backoff is now a property of the queue, so recovery from a pure
server-side outage waits out the deadline: measured **58.5 s** after failures stopped with no
connectivity event, versus **230 ms** when an `online` event fires. Attempts were spaced
`51, 2308, 6390, 15933, 34057, 68160 ms` — textbook exponential backoff capped at 60 s, exactly what
`pwa-offline-strategy.md` §5 specifies. Data converges in both cases.

---

## 3. B-2 — Lost-response idempotence: FIXED (one narrow residual)

**The fix.** All three create paths (`applyWorkoutSessionUpsert`, `applySessionExerciseUpsert`,
`applySetLogUpsert`) now insert with `.onConflictDoNothing({ target: <table>.id })` and fall through to
the existing update branch when the row already exists. The arbiter is the op's own id, so a retried
delivery of the same id no-ops into a harmless update, while a *different* id claiming the same
business slot still raises that other index's violation.

**Independently reproduced with a true lost response** — the request fully delivered and applied by the
server, the socket then abandoned without an RST so the runtime cannot abort the handler, followed by
the identical resend `flush.ts` performs:

```
  PASS  lost-response retry of a workoutSession  create is idempotent (6 runs)  :: 0 dead-lettered
  PASS  lost-response retry of a sessionExercise create is idempotent (6 runs)  :: 0 dead-lettered
  PASS  lost-response retry of a setLog          create is idempotent (6 runs)  :: 0 dead-lettered
```

Repeated twice, plus 20 more lost-response retries on a 42-op batch (so the server is still applying
when the retry lands): **56 lost-response retries, 0 dead letters.** This is the shape the client
actually produces, and it was 5/5 dead-lettering before.

**Different-id conflicts still reject, and the lifecycle guards were not weakened:**

```
  PASS  a DIFFERENT session id still rejects session_conflict
  PASS  a DIFFERENT session-exercise id on the same position still rejects position_conflict
  PASS  a DIFFERENT set-log id on the same set number still rejects set_number_conflict
  PASS  the original set is unchanged by the rejected different-id op   :: ["1:100x5"]
  PASS  in_progress -> completed still allowed
  PASS  completed -> in_progress still rejected (invalid_lifecycle_transition)
  PASS  completed -> discarded still rejected (terminal)
  PASS  a new set on a completed session still rejects session_locked
  PASS  replaying the original create AFTER completion is still rejected
  PASS  a set log with an unknown parent still rejects not_found
```

**Residual (LOW).** In 92 *fully simultaneous* deliveries of an identical create batch, one produced a
`workoutSession/session_conflict`. `onConflictDoNothing({ target: workoutSessions.id })` arbitrates
only the primary key; `uq_sessions_one_in_progress` is a different index and still raises. So the
remediation's claim — carried into `duplicate-replay.spec.ts`'s new header comment — that all three
create paths are "now safe under BOTH shapes" is slightly overstated for `workoutSession`. The
simultaneous shape is not one the client's single-flight flush loop can produce, and the
client-reachable shape is clean, so this is an accuracy point rather than a defect.

---

## 4. B-3 — Account-timezone day attribution: NOT FIXED on the upgrade path

**What is fixed.** `deviceLocalDateString()` is gone; `users.timezone` now ships in the Today bundle
(`src/server/today/service.ts`) and quick-logs resolve "today" through
`src/sync/accountTimezone.ts`. Measured across five device zones, online, with the clock frozen at
instants where device and account days disagree:

| device zone | device day | account day | outbox op | persisted row |
|---|---|---|---|---|
| Pacific/Kiritimati (UTC+14) | 2026-06-16 | 2026-06-15 | 2026-06-15 ✓ | 2026-06-15 ✓ |
| Pacific/Niue (UTC−11) | 2027-03-14 | 2027-03-15 | — | 2027-03-15 ✓ |
| UTC at 22:30 | 2026-06-15 | 2026-06-16 | 2026-06-16 ✓ | 2026-06-16 ✓ |
| Australia/Lord_Howe (half-hour DST) | 2026-10-05 | 2026-10-04 | 2026-10-04 ✓ | 2026-10-04 ✓ |
| Asia/Kathmandu (+05:45) | 2027-04-11 | 2027-04-10 | — | 2027-04-10 ✓ |
| America/New_York (DST fall-back) | 2027-11-07 | 2027-11-07 | — | 2027-11-07 ✓ |

The adjacent-day overwrite the original review reproduced is prevented: an evening check-in from a
UTC device left `2026-06-15`'s real `5/5/5, note "real entry"` untouched and created the check-in on
the account day `2026-06-16`. The `unknown-timezone` phase renders with no inputs and no save action
when no timezone can be resolved at all, and `logBodyweightToday`/`logRecoveryToday` throw
`UnknownAccountTimezoneError` rather than guessing.

**What is not fixed.** `getAccountTimezone()` (`src/sync/accountTimezone.ts`) returns
`cached.bundle.timezone` with no runtime validation, typed `string` but not guaranteed to be one:

```ts
const cached = await getCachedBundle();
if (cached) return cached.bundle.timezone;     // `undefined` for any pre-remediation cached bundle
```

`resolveTodayDate()` then checks `if (timezone === null) throw new UnknownAccountTimezoneError()` —
`undefined` is not `null`, so it proceeds to `userLocalDateString(undefined)`, and
`new Intl.DateTimeFormat("en-CA", { timeZone: undefined })` resolves to the **runtime default**, i.e.
the device zone (verified directly: resolves to `Europe/Berlin` on this host).

`bundleCache` is written by `TodaySection` on every Today load and survives the additive v1→v2
IndexedDB upgrade untouched, so **every already-installed PWA and every existing browser profile
carries a record with no `timezone` field the moment this build ships** — until Today is loaded once
and re-caches. Any quick-log before that uses the device zone.

Reproduced by stripping only `timezone` from the cached record (exactly what a previous build wrote),
device pinned to Pacific/Kiritimati, clock frozen where the two zones disagree — **3 of 3 runs
identical**:

```
  account=2027-08-11  device=2027-08-12
  device-day row  = {"date":"2027-08-12","sleepQuality":3,"readiness":3,"soreness":3,"note":null}
  account-day row = undefined
```

The pre-existing, deliberate `5/5/5, note "real entry"` on `2027-08-12` was overwritten with neutral
defaults and its note cleared — the original BLOCKER-3 failure, unchanged. Bodyweight behaves the same
way (`rowsAt93.6 = ["2027-07-21"]`, the device day, while the UI showed "Saved.").

The same root cause also re-mixes the `dailyLogCache` key: `RecoveryCheckIn.tsx:83` derives `today`
from the same call, so in this state the cache is keyed to the device day too — the "mixed cache key"
half of MEDIUM-3 is only closed while the timezone resolves correctly.

**Scope of the fix.** Treat anything that is not a non-empty string as unknown, in the one place that
reads it:

```ts
const tz = cached?.bundle.timezone;
if (typeof tz === "string" && tz.length > 0) return tz;   // then fall through to the live fetch
```

and apply the same guard to the live-fetch branch's `data.timezone`. The existing
`UnknownAccountTimezoneError` / `unknown-timezone` surfacing then handles it correctly and safely, as
it already does when nothing is cached at all.

I was unable to reproduce the equivalent through the live-fetch path: the service worker answered
`/api/today-bundle` from its own `today-bundle` runtime cache with a current body, so the stripped
response never reached the client. That vector is therefore unproven, but the guard should cover it
anyway, since the SW cache also survives a deployment.

---

## 5. HIGH-1 — Recovery lost update: FIXED

**The fix.** The pre-read/backfill is gone from `applyRecoveryEntryUpsert`; `logRecovery`
(`src/server/recovery/service.ts`) now catches the CHECK violation from its single-statement upsert and
retries as one plain `UPDATE` built from the same presence-aware `updateSet`. A plain UPDATE has no
proposed insert tuple, so PostgreSQL validates against the real post-merge row, and row-level locking
serializes concurrent writers — no read-then-write window is reintroduced.

**Independently reproduced** with a real multi-connection `pg.Pool` against real PostgreSQL 16, driving
the real `applySyncBatch` entry point (the layer the bug lived in), three consecutive runs, all pass:

```
  PASS  12x concurrent partial updates on different metrics                          :: 0 lost
  PASS  8x concurrent explicit clears of DIFFERENT metrics both land                 :: 0 bad
  PASS  10x concurrent clears that would together empty the row:
        exactly one wins, one rejects no_metric, row never empty                     :: 0 bad
  PASS  note-only op takes the CHECK-retry path and preserves the untouched metric
  PASS  note-only op on a fresh day rejects no_metric and creates no row
  PASS  clearing the only metric rejects and leaves the row unmodified
  PASS  6 concurrent writers on one day: every distinct metric survives
```

The original symptom was 5 of 6 concurrent partial-update pairs losing a metric; 36 pairs across these
runs lost none.

**Latent trap (LOW).** The CHECK-failure → UPDATE retry is only safe outside an explicit transaction.
Called with a transaction handle, the first statement's failure aborts the transaction and the retry
fails with SQLSTATE **`25P02`** (`in_failed_sql_transaction`) — confirmed directly. No production caller
does this today: `applySyncBatch` opens a transaction per op *inside* the individual apply functions and
passes the pool to `logRecovery`, and `POST /api/recovery` passes `getDb()`. The pool remains fully
usable afterwards (verified). The code comment's "neither leaves the row modified" holds only for the
pool case; a future transactional caller would break silently.

---

## 6. HIGH-2 — Progression boundary: FIXED

**The fix.** `walkImportGraph` now returns `allParents: Map<string, Set<string>>` recording every edge
into every file regardless of discovery order, and `isSyncTransportException` requires *every* recorded
parent to be an approved one. An `extraEdges` option lets a test fold in a synthetic edge without ever
writing it to real source.

**Independently verified** with a boundary predicate re-implemented from scratch (the shipped test file
was not trusted), injecting a forbidden edge from **7 different source files** — including the two the
original review used, plus `server/history/service.ts`, the `db/schema/index.ts` **barrel**,
`server/today/service.ts`, a `domain/progression` leaf, and a named root — into **4 target files**,
under **4 different traversal orders** (default, reversed, sync-route-first, sync-route-last):

```
  PASS  the real tree has zero recovery/bodyweight consumption paths
  PASS  every injected forbidden edge is detected (112 combinations x 4 traversal orders) :: 0 missed
  PASS  the exemption is withdrawn once a non-approved parent exists (transport edge still present)
  PASS  positive control: TodaySection's real UI edges are still flagged :: 8 found
```

The real tree's parents are exactly the transport plus genuine intra-cluster edges:

```
  domain/bodyweight/schema.ts  <- [domain/sync/schema.ts, domain/recovery/schema.ts, server/bodyweight/service.ts]
  domain/recovery/schema.ts    <- [domain/sync/schema.ts, server/recovery/service.ts]
  server/bodyweight/service.ts <- [server/sync/service.ts]
  server/recovery/service.ts   <- [server/sync/service.ts]
```

The previously-invisible `server/volume/service.ts → @/server/recovery/service` bypass is now caught in
every traversal order. The exception also fails closed for a hypothetical new file inside a forbidden
directory, since only the four named files are ever eligible.

---

## 7. HIGH-3 — Report evidence: FIXED

The dated correction appended to `docs/reviews/phase-8-implementation.md` was validated line by line
against my original measurements. **All seven items are accurate**, including the two that are
unflattering to the original report (the misattributed `active-schedule-edit.spec.ts` failure, and the
`14/14` claim that was really 5/8). It correctly states the actual failing specs were
`network-flap.spec.ts` and `offline-set-edit-delete.spec.ts`, correctly identifies the
eleven-vs-twelve serialized mutators, correctly retracts the "verified against real Postgres 16" claim
for `syncDailyLogs.integration.test.ts` (still PGlite-only — confirmed), and correctly restates the
integration file count as 19 passed + 2 skipped. The original body is preserved unedited, as claimed.

**Accuracy gap in the remediation report itself (LOW).** Its "Exact changed files" section lists
`package.json` only for the `test:e2e:offline` script. `package.json` also gained a new devDependency
(`fake-indexeddb@^6.2.5`) and `pnpm-lock.yaml` changed accordingly; neither is mentioned. The
dependency itself is appropriate — it is what makes MEDIUM-1's and MEDIUM-4's tests possible — but a
new dependency and a lockfile change belong in the changed-files list.

---

## 8. MEDIUM-1 … MEDIUM-4

**MEDIUM-1 — the serialization regression test is real.** With `serialize()` bypassed
(`return fn();`), `tests/unit/activeSessionConcurrency.test.ts` fails **2/2 deterministically** with
exactly the lost-write signatures (`expected 100 to be 105`; array length mismatch). Restored
byte-identically (SHA-256 verified) and both pass again. This is the proof the previous coverage
lacked — the shipped `offline-set-edit-delete.spec.ts` would still pass with the fix reverted.

**MEDIUM-2 — offline bodyweight/recovery coverage.** Verified end-to-end with my own fixtures:

```
  after offline refresh, queued = ["2026-08-29"]      (survives a reload while still offline)
  converged rows = ["2026-08-29"]                     (exactly the account day, once reconnected)
  queued payload keys = ["date","id","readiness"]     (unknown-offline form sends ONLY the touched field)
  merged row = {"sleepQuality":5,"readiness":3,"soreness":5,"note":"pre-existing"}
```

Untouched real metrics and the note survived the merge. The CI gate now includes
`transient-failure-fifo`, `lost-response-retry` and `offline-bodyweight-recovery` (14 files, 21 tests).

**MEDIUM-3 — the `dailyLogCache` contract holds.**

```
  after a confirmed read (no entry): {"date":"2026-08-29","entry":null,...}   <- account day
  immediately after save (pre-confirmation): {"date":"2026-08-29","entry":null,...}  <- NOT overwritten
  after reload: cached entry id == the real server row id
```

The premature optimistic write is gone and the cache only ever holds server-confirmed state. Its
date-key correctness is inherited from B-3 and therefore shares B-3's upgrade-path gap (§4).

**MEDIUM-4 — verified with real browser IndexedDB clients, not `fake-indexeddb`.** Driven in Chromium
through Playwright:

```
  {"current":2,"blockedBeforeClose":true,"resolvedBeforeClose":false,"resolvedAfterClose":true,"newVersion":3}
  holder opened v99: {"ok":true,"blocked":false,"v":99}
```

A second real client holding the database blocks a version bump, `blocked` fires, the upgrade does not
complete while blocked, and closing the holder lets it resolve — the required "close the old client and
pending work continues" path. Separately, the app's own live connection **closes itself** when a newer
version opens elsewhere (the newer open succeeded without ever having to report blocked), proving the
`blocking` handler works in a real browser. The user-facing surfacing exists in `SyncStatusBanner`
("Waiting on another open tab of this app to update — close it to continue.") driven by
`idbUpgradeStore`.

---

## 9. Repeated runs, CI gate, and the two investigated specs

**Full E2E suite: 62/62, five consecutive runs** on a from-scratch database (migrate → seed → build →
production server → account bootstrap via `smoke.spec.ts` → re-seed → fixture seed). No failures at all.

**CI offline gate (`pnpm test:e2e:offline`): 9 of 10 runs passed** at 21/21. The single failure was
`offline-bodyweight-recovery.spec.ts:239` (the remediation's own new "unknown account timezone — safe
surfacing" test) failing a visibility assertion; it did **not** reproduce in **12 isolated runs** of
that file. The remediation reports 10/10; I measure 9/10. Either way this is a decisive improvement
over the pre-remediation gate, which failed 3 of 8 runs on genuine defects (B-1 and B-2 signatures) —
those signatures never appeared once here.

An earlier 10/10 gate *failure* run in this pass was my own fault and is worth recording, because it
exposes a real fragility: `offline-bodyweight-recovery.spec.ts:231` finds its row with
`entries.find((e) => e.weightKg === 81.2)` across **all** dates. One of my own fixtures had written a
`81.2 kg` row on a different date, and the spec then asserted against that row instead
(`Expected: "2026-06-15"  Received: "2026-10-04"`) — 10 consecutive false failures. Scoping the lookup
by date as well as weight would make it robust. This matters because the suite normally runs against a
long-lived local dev database, and this exact class of cross-contamination has already misled two
earlier reports in this phase. **LOW.**

**`active-schedule-edit.spec.ts` — the incidental fix is correct and root-caused.** Independently
validated by removing only the added `await waitForOutboxDrained(page);`:

| | isolated runs |
|---|---|
| with the wait (as shipped) | **6/6 pass** |
| without it (pre-fix) | **3/8 pass, 5/8 fail** — every failure `"exercises": Array []` vs populated |

That is precisely the claimed cause: the spec read the *server's* view of the session immediately after
`startSession` committed locally, before the outbox had flushed. The fix does not mask a product defect
— `waitForOutboxDrained` requires `dead: 0`, so a genuine sync failure would still fail the spec.

**`bodyweightRecovery.spec.ts` "dismissed permanently" anomaly — not reproduced.** 12/12 isolated runs
passed, and it never appeared in any of my 5 full-suite runs or 10 gate runs. The remediation's
reasoning also checks out on inspection: the card's `header`, which contains the "Don't ask again"
button, is rendered in *every* phase including the two new ones (`unknown-timezone`, `unknown-offline`)
and `loading`, so the phase changes cannot hide it. `dismissedPreference.ts` is untouched. I record it
the same way the remediation did — a one-off that neither of us could reproduce, with no identified
mechanism connecting it to this work.

---

## 10. Regression checks on previously credited behaviour

**Service worker — no regression.** Executable negative control, seven authenticated API GETs warmed
online through a controlled page then re-fetched offline:

```
  offline /api/history?limit=5 -> rejected     offline /api/recovery       -> rejected
  offline /api/active-session  -> rejected     offline /api/recovery/today -> rejected
  offline /api/bodyweight      -> rejected     offline /api/volume         -> rejected
  offline /api/exercises       -> rejected
  offline /api/today-bundle    -> {"status":200,"activeSession":null,"hasTimezone":true}
```

Still exactly one cached API GET, still sanitized to `activeSession: null`, and it now correctly
carries the new `timezone` field.

**SW update lifecycle — no regression.** Driven with a genuinely byte-different worker script: the new
worker installed and **waited** (`hasWaiting: true`, `controllerStillOld: true`), the toast appeared,
it was still waiting 1.5 s later with no user action, and only an explicit tap activated it, after
which the page reloaded, the waiting worker became active and the toast cleared. `public/sw.js`
restored byte-identically.

**Cached-bundle staleness — no regression.** Offline past the 10 s threshold, Today renders
`Showing cached data as of 8/29/2026, 10:45:25 PM.`

**Dead letters, takeover, storage-persist, auth-expiry, cold launch, stale-completed-session** — all
green across 10 CI-gate runs and 5 full-suite runs, including `dead-letter.spec.ts`'s
inspect / double-confirmed-discard / retry path and `takeover.spec.ts`'s two genuinely separate browser
contexts.

**Serialization** — `serialize()` itself is unchanged (SHA-256 of `src/sync/activeSession.ts` identical
before and after my negative control), and now has the regression test it lacked.

**LOW findings — confirmed untouched, as the remediation states.** LOW-1 (`next start` against an
`output: "standalone"` build; the warning still prints), LOW-2 (`SyncStatusBanner` still renders only
`deadLetterOps[0]?.deadReason`), LOW-3 (`clearLocalSession` still exported, still unserialized, still
zero call sites), LOW-4 (the `{pending:-1,dead:-1}` sentinel in `helpers.ts`), LOW-5 (`dailyLogs.ts`
still enqueues and writes the cache in two separate transactions), LOW-6 (safe-area CSS still not
executably verifiable headless).

---

## 11. Restoration and scratch hygiene

Three files were temporarily edited as negative controls and restored byte-identically:

| File | SHA-256 before and after |
|---|---|
| `src/sync/activeSession.ts` (serialize bypass, MEDIUM-1) | `37C4159025AC51DE…3554C43474` |
| `tests/e2e/active-schedule-edit.spec.ts` (wait removed, §9) | `D1D43867F724A7E7…75352FC5D4` |
| `public/sw.js` (gitignored build artifact, SW update test) | `8027BFB7B478028B…922370DA75` |

All review fixtures (14 files: 4 Node harnesses, 8 Playwright specs, a boundary-graph analyzer and a
transaction probe) live entirely outside the repository. The temporary `node_modules` junction used to
run them was removed; the real `node_modules` is intact. `test-results/` was removed. `.next/` and
`public/sw.js` were regenerated by `pnpm build`; both are gitignored. The disposable databases
`gymapp_p8v2` and `gymapp_p8v2_conc` were dropped — only `gymapp` remains. Production was never
contacted. `docs/reviews/phase-8-review.md`, `docs/reviews/phase-8-remediation.md`,
`docs/reviews/phase-8-implementation.md`, `docs/input/product-ideas.md`, `CLAUDE.md`,
`HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md` and `.claude/skills/` were not modified.
`git status --porcelain` is unchanged apart from this file.

---

## 12. Outstanding work

| # | Severity | Item |
|---|---|---|
| 1 | **BLOCKER** | `getAccountTimezone()` returns an unvalidated `timezone` from the cached Today bundle; a bundle cached by any pre-remediation build has none, and `undefined` passes the `=== null` guard into `Intl`'s device-zone default. Reproduced 3/3 destroying a real adjacent-day recovery entry. Guard for a non-empty string in both the cached and live-fetch branches (§4). |
| 2 | LOW | `logRecovery`'s CHECK-failure → UPDATE retry breaks with SQLSTATE `25P02` if ever called inside an explicit transaction. No caller does today; worth an assertion or a comment (§5). |
| 3 | LOW | `onConflictDoNothing({ target: id })` does not arbitrate `uq_sessions_one_in_progress`; ~1% of fully simultaneous identical create batches still dead-letter. Not client-reachable, but the "safe under BOTH shapes" comment in `duplicate-replay.spec.ts` overstates it (§3). |
| 4 | LOW | `offline-bodyweight-recovery.spec.ts` finds its row by weight across all dates; scope it by date too (§9). |
| 5 | LOW | The remediation report's changed-files list omits the new `fake-indexeddb` devDependency and the `pnpm-lock.yaml` change (§7). |

Item 1 alone blocks device acceptance: it reproduces the original data-destroying defect on the
ordinary upgrade path, silently, with the UI reporting success. Items 2–5 are safe to carry forward.
Once item 1 is guarded, a short re-verification limited to §4's cases should be sufficient — nothing
else in this pass showed a crack.

**REMEDIATION INCOMPLETE**
