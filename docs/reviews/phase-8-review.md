# Phase 8 — Offline & PWA Hardening: Independent Adversarial Review

Reviewer: independent pass, no involvement in the implementation.
Scope: the working tree as it stands (uncommitted), against `implementation-plan.md` Phase 8,
`pwa-offline-strategy.md`, `adr/ADR-005-pwa-offline.md`, and `mvp-scope.md` F6/F11.
Report under review: `docs/reviews/phase-8-implementation.md`.

Nothing was committed, pushed, deployed, or tagged. No production access. All work ran against a
disposable PostgreSQL 16.14 database (`gymapp_p8review`) created and dropped inside the local
Docker instance; the developer's own `gymapp` database was never written to. No implementation
file, test, or report was modified — two files were temporarily edited as negative controls and
restored byte-identically (SHA-256 verified, see §9). `git status --porcelain` at the end of this
review is byte-identical to its state at the start.

---

## Verdict

**READY FOR REMEDIATION**

Three blocker-class defects were reproduced, two of them causing **silent, permanent divergence
between the client's local state and the server** with a fully drained outbox, no dead letters, and
no error surfaced anywhere in the UI. One destroys a real, previously stored recovery check-in on a
different calendar day with a single tap while fully online. The phase's own new CI gate fails
3 runs out of 8 on a clean database because of two of these defects, so the gate as shipped is not
deterministic. The implementation report's headline verification numbers could not be reproduced,
and the failure it attributes to an unrelated pre-existing spec is not the failure that actually
occurs.

The phase also contains genuinely good work — the `serialize()` fix is correct and its underlying
race is real, the service-worker posture holds up under executable negative controls, the
dead-letter screen behaves exactly as specified, and the "unknown offline state" recovery form does
what it claims. Those are recorded in §8.

---

## 1. What was executed

| Check | Result |
|---|---|
| `pnpm typecheck` | clean (reproduced) |
| `pnpm typecheck:sw` | clean (reproduced) |
| `pnpm lint` | clean (reproduced) |
| `pnpm format:check` | clean (reproduced) |
| `pnpm test:unit` | **460/460 passed**, 35 files (reproduced) |
| `pnpm test:integration` | **248 passed, 5 skipped**, 19 files + 2 skipped (reproduced) |
| `pnpm build` | clean; `/sync-issues` in route output (reproduced) |
| CI job replayed step-by-step on a from-scratch PostgreSQL 16 database | reproduced exactly (§7) |
| `pnpm test:e2e:offline` (the CI gate) × 8, clean DB | **5 passed, 3 failed** |
| `pnpm exec playwright test` (full suite) × 4, clean DB | 55/55, 55/55, 54/55, 54/55 — two *different* failing specs, neither the one the report names |
| Independent fixtures written for this review | 14 (8 Node harnesses against the live server + raw SQL, 6 Playwright specs run from a scratch config against the running production build) |

Independent fixtures were kept entirely outside the repository (scratch directory + a private
Playwright config pointing at the already-running production server), so none of them touched the
tree under review.

---

## 2. BLOCKER-1 — The outbox stops draining FIFO after any failed flush; offline edits are reverted and deleted sets come back

**Where:** `src/sync/outbox.ts:104-111` (`markTried`) together with `src/sync/outbox.ts:42-48`
(`listPendingOps`), driven from `src/sync/flush.ts:57`, `:73`, `:90`.

**What the architecture promises.** `pwa-offline-strategy.md` §5: *"**Ordering:** outbox flushes
FIFO in one batch per request; parent-before-child ordering is guaranteed by append order."*
`mvp-scope.md` F6: *"A complete workout performed in airplane mode — including app kill and relaunch
mid-session — appears fully and exactly once in Postgres after connectivity returns."*

**The defect.** `markTried()` computes a *separate, independently jittered* deadline for every op:

```ts
const nextAttemptAt = new Date(Date.now() + nextBackoffDelayMs(tries)).toISOString();
```

and `listPendingOps()` then filters on that deadline:

```ts
return all.filter((op) => op.status === "pending" && op.nextAttemptAt <= now).slice(0, limit);
```

So after even one failed flush the pending queue is no longer a queue: it is an arbitrary
order-violating subset, re-sorted by each op's own random backoff. Because every op is a *full-row*
upsert or a delete, an out-of-order replay is **not** idempotent:

- a set's original insert arriving *after* its edit **overwrites the edit** with the pre-edit values;
- a delete arriving *before* its insert is treated as applied (`applySetLogDelete` is deliberately
  idempotent-by-absence), and the later insert then **resurrects the deleted set**.

`flush.ts` calls `markTried` on every pending op on a network failure (`:57`), on any non-401 !ok
response (`:73`), and for `untouched` ops (`:90`) — i.e. on exactly the conditions the documented
backoff exists for: flaky signal, captive portal, a 5xx during a deploy.

**Reproduction 1 — the required Phase-8 scenario, no artificial concurrency.** "log/edit/delete sets
offline, refresh, resume", then reconnect. Local IndexedDB was correct in every run; the server was
not:

```
5 of 10 runs diverged (edit and delete dispatched sequentially, exactly as the shipped spec does)
6 of 10 runs diverged (edit and delete dispatched in one task)

  REQ  [up#1=100x5, up#2=102.5x5, up#3=105x5, up#2=103x6, DEL#3]
  REQFAIL net::ERR_INTERNET_DISCONNECTED          <- one failed attempt -> markTried on all five
  REQ  [up#1=100x5, up#3=105x5, up#2=103x6]        <- non-FIFO subset
  RESP applied 3
  REQ  [up#2=102.5x5, DEL#3]                       <- the stale insert lands AFTER the edit
  RESP applied 2
  LOCAL  ["1:100x5","2:103x6"]
  SERVER ["1:100x5","2:102.5x5"]                   <- the edit is gone, permanently
```

Other runs produced `["1:100x5","2:103x6","3:105x5"]` (deleted set resurrected) and
`["1:100x5","2:102.5x5","3:105x5"]` (both). In all cases the outbox reached `pending: 0, dead: 0`.

**Reproduction 2 — no offline, no reload, no Playwright artifact.** The page stayed online for the
whole test; a transient network failure was injected on the sync POSTs only. 2 of 8 runs diverged:

```
  REQ  [up#1, up#2=102.5, up#3=105, up#2=103x6]
    -> transient failure
  REQ  [DEL#3]                                     <- the delete flushes ALONE and FIRST
  REQ  [up#1, up#2=102.5, up#3=105, up#2=103x6]    <- the inserts arrive after it
  LOCAL  ["1:100x5","2:103x6"]
  SERVER ["1:100x5","2:103x6","3:105x5"]
```

**Reproduction 3 — the algorithm in isolation.** `nextBackoffDelayMs`, `markTried` and
`listPendingOps` copied verbatim, 2000 trials per case:

```
after 1 failed flush attempt(s): FIFO violated in 100.0% of 2000 trials
  e.g. batch1=["ins#2","ins#3","edit#2"] then ["ins#1","del#3"]  (deadline spread 2059ms)
after 2 failed flush attempt(s): FIFO violated in  87.4% of 2000 trials  (spread 190-400ms)
after 3 failed flush attempt(s): FIFO violated in  87.8% of 2000 trials
```

The spread is 0.2–2.1 s wide, and the app fires a flush on a 5 s interval plus every `online` event
and every mutation, so a flush landing inside the spread is the common case, not the corner case.

**Reproduction 4 — the phase's own shipped specs.** On a clean disposable database,
`pnpm test:e2e:offline` fails 3 of 8 runs with precisely these signatures
(`offline-set-edit-delete.spec.ts` reporting `weightKg: 105` present server-side; see §7).

**Severity.** The user's local state and the server disagree forever. History, the progression
carry-forward chain, and volume aggregation all read the server copy, so a reverted edit or a
resurrected set silently propagates into future recommendations. Nothing in the UI indicates a
problem — the outbox reports itself fully drained. This is the exact failure `pwa-offline-strategy.md`
§1 forbids ("a set logged in the gym must never be lost — not to dead Wi-Fi"), reached through the
ordinary reconnect path.

**Note on ownership.** `markTried`/`listPendingOps` are Phase 3 code, untouched by this phase. That
does not move the finding out of Phase 8: the phase's stated goal is *"the offline story proven, not
assumed"*, its acceptance is F6 plus the §12 suite, it added the three specs that should have caught
this (`offline-set-edit-delete`, `network-flap`, `duplicate-replay`), and it gates CI on them.

---

## 3. BLOCKER-2 — A duplicate delivery after a lost response permanently dead-letters an applied op

**Where:** `src/server/sync/service.ts:435-540` (`applySetLogUpsert` — pre-insert `SELECT` then a
plain `INSERT`, with any `23505` mapped to `set_number_conflict`), reached from `src/sync/flush.ts`'s
retry-after-failure path.

**What the architecture promises.** §5: *"**Idempotency:** every op carries a client `opId` … ops are
full-row upserts/deletes keyed by entity UUID, so replays converge. Retries are safe."* §12:
*"Duplicate-flush test: replay the same op batch twice → server state identical (idempotency)."*
§6 reserves the dead-letter list for *rejected* ops (validation, FK) and expects the sync-issues
screen to be *"essentially never seen"*.

**Verified working — sequential replay.** Re-POSTing an identical batch, and re-POSTing the same
payload under a *fresh* `opId` (what the client actually does after a lost response), are both fully
idempotent. 3/3 applied, no duplicate rows.

**The defect — a lost response.** When the response is lost but the server completes the request (a
radio drop, or the app's own reconnect navigation tearing down the page mid-POST), the client resends
while the first delivery is still applying. The pre-insert `SELECT` finds nothing in both, both
`INSERT`, one hits the unique index, and the op is **permanently dead-lettered**:

```
true lost response (request fully delivered, socket abandoned, then the client resends):
  run 0..4: retryRejected=[{"entity":"setLog","reason":"set_number_conflict"}]
  SUMMARY: 5/5 retries permanently dead-lettered
```

Concurrent delivery of a whole session-start batch dead-letters three ops at once
(`session_conflict`, `position_conflict`, `set_number_conflict`), 5/5.

**Reachability is not theoretical.** In a clean full-suite run, `network-flap.spec.ts` — Phase 8's
own new spec — failed with exactly this, and the app's own banner rendered the user-facing text:

```
"1 change couldn't sync (set_number_conflict). Review"
```

CI-gate run 6 (§7) failed the same way inside `offline-sync.spec.ts` with `dead: 1`. Instrumenting
the app showed why the window opens at all: on reconnect the app performs a full page navigation
(the same behaviour `tests/e2e/helpers.ts:70-77` documents and works around), which cancels the
in-flight `/api/sync` POST client-side while the server keeps applying it.

**On the report's disclosure.** Judgment call 3 identifies this mechanism and then designs
`duplicate-replay.spec.ts` around it, on the grounds that *"the client's own flush loop never
overlaps two POSTs — pwa-offline-strategy.md §5's single `flushing` guard"* and that concurrent
duplicates are *"a scenario the architecture doesn't promise to handle"*. Both premises are wrong.
The `flushing` guard is released the moment the client's `fetch` rejects, which is precisely when the
server is still working; and §5 does promise it ("retries are safe"). Naming a defect in a judgment
call is not the same as resolving it, and the spec that was supposed to prove §12's duplicate-flush
requirement now avoids the only case where it fails.

---

## 4. BLOCKER-3 — Quick-log day attribution moved from the account timezone to the device timezone, and destroys a different day's stored data

**Where:** `src/domain/time/localDate.ts:22` (`deviceLocalDateString`), used unconditionally by
`src/sync/dailyLogs.ts:30` and `:58` and by `src/ui/recovery/RecoveryCheckIn.tsx:54`.

**What the architecture requires.** `data-model.md` §1: *"Day-keyed tables additionally carry a `date`
column representing the **user-timezone local date**."* `src/domain/bodyweight/schema.ts:4-6`, still
present and now contradicted by the code it documents: *"`date` is the user-timezone local date
(data-model.md §1); **a client never resolves its own "today"** — the quick-log flow lets the server
assign it."* `phase-7-review.md` HIGH-1 required *"determine today using the user's server-side
timezone"*.

**The change.** `BodyweightQuickLog` no longer POSTs to `/api/bodyweight` at all and
`RecoveryCheckInForm` no longer POSTs/PATCHes `/api/recovery`; both go through the outbox, which
stamps `date` from `Intl.DateTimeFormat().resolvedOptions().timeZone`. This applies **online as well
as offline** — the report frames it purely as an offline necessity and never mentions that the online
path changed. `users.timezone` defaults to the hardcoded `'Europe/Ljubljana'`
(`src/db/schema/users.ts:36`) and is never sent to the client, so any device not in CET/CEST diverges.

**Measured, fully online:**

| device zone | device "today" | account "today" | row actually written |
|---|---|---|---|
| Pacific/Kiritimati (UTC+14) | 2026-06-16 | 2026-06-15 | **2026-06-16** ✗ |
| Pacific/Niue (UTC−11) | 2026-06-14 | 2026-06-15 | **2026-06-14** ✗ |
| UTC, 22:30 | 2026-06-15 | 2026-06-16 | **2026-06-15** ✗ |
| America/New_York, DST fall-back | 2026-11-01 | 2026-11-01 | 2026-11-01 ✓ (zones agree) |

The third row is the everyday case: with the default account zone, **any device west of CEST between
22:00 and midnight writes to the previous day.**

**The damaging consequence, reproduced deterministically.** Because these are day-grain upserts, the
misattributed write lands on a day that may already hold real data. `RecoveryCheckIn` reads
`/api/recovery/today` (account day → empty), renders the "brand-new" form seeded at the NEUTRAL 3/3/3
defaults, and the save is stamped with the device day:

```
  seeded  2026-06-15 -> {"sleepQuality":5,"readiness":5,"soreness":5,"note":"real entry"}
  ... one tap of "Save check-in", fully online, device in UTC at 22:30 ...
  after   2026-06-15 -> {"sleepQuality":3,"readiness":3,"soreness":3,"note":null}
  after   2026-06-16 -> undefined
```

A real, deliberate check-in was overwritten with fabricated neutral defaults and its note cleared.
This is the precise failure mode `phase-7-review.md` HIGH-1 and `phase-7-remediation-verification.md`
MEDIUM-2 were written to eliminate ("an already-logged recovery day never re-prompts with synthetic
defaults"), reintroduced through a different door. It also fails this phase's own stated bar that
unknown state must "never fabricate, clear or lose metrics" — here neither offline nor ambiguity is
involved at all.

**Why no existing test sees it.** The E2E host runs `W. Europe Standard Time` (Europe/Berlin), which
has the same UTC offset as `Europe/Ljubljana` year-round, so device and account dates always agree in
the suite. GitHub's runners are UTC, which *would* diverge for two hours a day — but no bodyweight or
recovery spec is in the CI gate at all (§6, MEDIUM-2).

**On "the only signal available".** The report argues the device zone is the sole option because
`users.timezone` is never sent to the client. That is a property of the current payloads, not a
constraint: `/api/today-bundle` is already fetched on every Today load and already cached for offline
use. Shipping the account zone in it (falling back to the device zone only when no bundle has ever
been cached) preserves offline capability without changing the day-keying contract.

---

## 5. HIGH findings

### HIGH-1 — The new recovery pre-read backfill reintroduces a lost-update race and silently clears a metric

**Where:** `src/server/sync/service.ts:783-825` (`applyRecoveryEntryUpsert`).

The adapter pre-reads the day's row and passes **all four** metrics into `logRecovery`, so all four
now appear in the `ON CONFLICT … DO UPDATE SET` clause instead of only the touched ones. That
converts a single-statement upsert into a read-then-write, undoing the property
`src/server/recovery/service.ts:118-128` explicitly claims for itself — *"keeps the single-statement
`INSERT … ON CONFLICT DO UPDATE` this codebase's independent review confirmed is race-free under 8
concurrent first-inserts (no read-then-write window)"*.

Measured against real PostgreSQL 16, two concurrent syncs touching different metrics on the same day:

```
run 0: state={"sq":4,"rd":5,"so":1}
run 1: state={"sq":4,"rd":null,"so":1}   <-- LOST UPDATE
run 2..5: same
SUMMARY: 5/6 concurrent partial-update pairs lost a metric
```

`readiness` was written as 5 and then **explicitly cleared to null** by the second request, whose
stale pre-read supplied `readiness: null` as a "backfill". No rejection, no dead letter, no error.
Combined with BLOCKER-2 (concurrent sync requests from a single client are reachable), this is live.

**The fix is also broader than the bug it was written for.** The report states the trigger as *"a
recovery op that only touches `readiness` while `sleepQuality` is the day's sole existing metric was
being wrongly rejected as `no_metric`"*. That does not reproduce — the same SQL through the online
REST path, which has **no** backfill, handles it correctly:

```
seed sleepQuality=4 : 201
partial readiness=5 (NO backfill): 201  -> {"sleepQuality":4,"readiness":5}
```

The underlying PostgreSQL behaviour the report describes **is** real and I confirmed it directly
against PostgreSQL 16.14 — a CHECK constraint is evaluated against the proposed insert tuple before
the conflict is detected:

```
INSERT ... (b) VALUES (NULL) ON CONFLICT (user_id,d) DO UPDATE SET b = EXCLUDED.b;
ERROR:  new row for relation "ck_probe" violates check constraint "ck_probe_has_metric"
DETAIL:  Failing row contains (u1, 2026-01-01, null, null, null).
```

— but it only bites when the payload's own metric values are **all** null, i.e. an explicit clear or
a note-only op (which `syncDailyLogs.integration.test.ts`'s "explicit null clears" test does cover).
A backfill restricted to that case, or catching the `23514` and retrying as a plain `UPDATE`, would
fix the rejection without opening the lost-update window.

### HIGH-2 — The progression-boundary exception is order-dependent, not narrow, and does hide a real consumption path

**Where:** `tests/unit/progressionBoundary.test.ts:53-57`, resting on
`tests/unit/importGraphWalker.ts:141`.

`walkImportGraph` records **only the first** parent that reaches a file
(`if (!reachedFrom.has(resolved)) reachedFrom.set(resolved, file)`), and `isSyncTransportException`
consults exactly that one entry. The four excused files are all first discovered at BFS depth 2 from
the sync transport (depth 1), so once the exception is granted, *any* other import edge into them
discovered later in the queue is silently excused.

Negative control, run on the real tree:

| injected edge | boundary test |
|---|---|
| `src/server/volume/service.ts` → `@/server/recovery/service` | **13/13 passed — not detected** |
| `src/server/progression/service.ts` → `@/server/recovery/service` | 2 failed — correctly detected |

`server/volume/service.ts` and `server/history/service.ts` are both direct dependencies of the named
assembly roots and both sit after the sync transport in the walk, so both can acquire a recovery or
bodyweight read without the guard noticing. The added test *"the sync-transport exception is exactly
the four known co-location files"* does not close this — it only asserts the four **are** reachable
via the transport, never that they are reachable via nothing else. Recording every parent (or
re-walking with the transport edges removed and requiring the forbidden set to be empty) would.

Both files were restored byte-identically afterwards (SHA-256 before and after recorded in §9).

### HIGH-3 — The implementation report's verification results are not reproducible, and the failure it attributes is not the failure that occurs

Run on a **from-scratch** disposable database created, migrated and seeded exactly as the new CI job
specifies:

| Report claim | Measured |
|---|---|
| "Full `pnpm exec playwright test` … **54/55 passed, run twice**" | 55/55, 55/55, 54/55, 54/55 across four clean runs |
| "The one consistent failure is the pre-existing, unrelated `active-schedule-edit.spec.ts`" | `active-schedule-edit.spec.ts` **passed in all four clean full-suite runs**. The observed failures were `network-flap.spec.ts` (`set_number_conflict`) and `offline-set-edit-delete.spec.ts` (resurrected set) — both new Phase 8 specs, both failing on the defects in §2 and §3 |
| "`pnpm test:e2e:offline` … **14/14 passed, three separate runs**" | 5 of 8 clean runs passed; 3 failed |
| §4: "A recovery op that only touches `readiness` while `sleepQuality` is the day's sole existing metric was being wrongly rejected as `no_metric`" | not reproducible; the same call succeeds with no backfill (HIGH-1) |
| §5: "every one of those **eleven** functions" | **twelve** are serialized — the list omits `startSession` (`src/sync/activeSession.ts:239`). `clearLocalSession` (`:73`) mutates the same store and is *not* serialized (harmless: zero call sites) |
| "the real Postgres constraint-timing bug found and fixed in §4 … see the integration test file's comment" | `tests/integration/syncDailyLogs.integration.test.ts` contains no such comment, and all 7 of its tests run on PGlite only — no real-Postgres run is present in the suite |
| "19 files" for the integration suite | 19 passed + 2 skipped = 21 |

The report's own negative-control paragraph asserts that a clean-database re-run distinguishes "caused
by this phase's code" (claimed: none) from "caused by heavy reuse of one long-lived local database"
(claimed: all of them). On a genuinely clean database that control inverts: the long-lived-database
failures disappear and the surviving failures are Phase 8's own specs, exposing Phase 8-scope defects.

Everything else in the report's "Exact changed files" section is accurate — the list matches
`git status` exactly, including the untracked files and the deliberately untouched user-owned files.

---

## 6. MEDIUM findings

### MEDIUM-1 — The §5 concurrency fix has no regression test

`tests/e2e/offline-set-edit-delete.spec.ts:89` inserts `await row.waitFor({ state: "detached" })`
between the edit and the delete, with a comment stating this ensures the edit "must have fully
committed". It does not: the row detaches on `setEditing(false)`, a synchronous React state update
that runs immediately after `onEdit(...)` is *called*, not after `editSet`'s promise resolves. What
the wait does achieve is removing most of the overlap — so the spec no longer exercises the race the
fix exists for, and reverting `serialize()` would not fail any test in the suite.

The fix itself is correct (§8). An independent fixture that dispatches the edit's Save and another
row's Delete in the **same synchronous task** — the true worst case — confirms it holds: local state,
outbox contents, an offline reload and server convergence were all correct in every run where the
unrelated BLOCKER-1 reordering did not intervene.

### MEDIUM-2 — The entire new bodyweight/recovery offline feature is untested and outside the CI gate

`src/sync/dailyLogs.ts`, `src/domain/time/localDate.ts`, the `dailyLogCache` store and
`RecoveryCheckInUnknownOfflineForm` have **no unit, integration or E2E coverage whatsoever**. The only
specs touching the two changed components (`bodyweightRecovery.spec.ts`, `phase7Remediation.spec.ts`)
are pre-existing, exercise the online path only, and are not in `test:e2e:offline` — so the CI gate
cannot catch a regression in the feature Phase 8 added. Only the server-side adapter is covered
(`syncDailyLogs.integration.test.ts`, PGlite).

Fixtures written for this review confirm the behaviour is otherwise sound where the timezone does not
intervene (§8), but that verification does not exist in the repository.

### MEDIUM-3 — `dailyLogCache` is written from an unconfirmed prediction, contrary to its own contract

`src/sync/db.ts:67-73` states the store holds *"only … a CONFIRMED read (a successful
`/api/recovery/today` fetch, or a save made from an already-confirmed state) — never a
merely-guessed/ambiguous offline state"*. Two paths weaken that:

- `RecoveryCheckIn.tsx:224` writes the cache immediately after **enqueueing** the op, before any
  server confirmation, and `savedEntry.id` for a new day is a client id the server honours only on
  insert — so a day that already had a row is cached under an id that does not exist.
- `RecoveryCheckIn.tsx:63` caches a successful read under `data.entry?.date ?? today`, mixing the
  server's account-timezone date (when an entry exists) with the device-timezone key (when it does
  not). Under BLOCKER-3's conditions the `entry === null` branch stores a "confirmed: no entry today"
  claim keyed to a day the server never checked.

Impact is limited to a wrong pre-fill, not lost data, because the touched-fields payload is
unaffected — but the documented invariant does not currently hold.

### MEDIUM-4 — The first-ever IndexedDB version bump has no `blocked`/`blocking` handler

`src/sync/db.ts:102-127` raises `DB_VERSION` 1 → 2. The upgrade callback is correctly guarded and
additive. `openDB` is called with no `blocked` or `blocking` handler, and `dbPromise` is memoised —
so if any other client still holds the v1 database open, the upgrade blocks, `getIdb()` never
settles, and every store read and write hangs silently with no error and no retry for the life of the
page. An installed iOS PWA is single-"tab" in practice (§9 of the strategy doc), which keeps this
narrow, but this is the release that first makes it reachable, and a browser-tab user with two tabs
open is a realistic way to meet it.

---

## 7. CI job validation

The new `offline-e2e` job was replayed step-by-step on a from-scratch PostgreSQL 16 database, in the
job's own order: `db:migrate` → `db:seed` (pre-account) → `pnpm build` → backgrounded server →
`playwright test tests/e2e/smoke.spec.ts` (account bootstrap) → `db:seed` again → `tsx
tests/e2e/seed.ts` → `pnpm test:e2e:offline`.

**The job's structure is correct.** Every step behaved as its comment describes; the two-pass seed is
genuinely required (the first pass reports `users=0`, the second `users=1`), and bootstrapping the
account through the running app rather than a bare script is genuinely necessary. The
`test:e2e:offline` script and the CI step share one definition, so they cannot drift.

**The gate is not deterministic.** Eight consecutive runs on a clean database:

```
gate run 1..5: PASS
gate run 6: FAIL  offline-sync.spec.ts             — "dead": 1   (BLOCKER-2)
gate run 7: FAIL  offline-set-edit-delete.spec.ts  — server holds weightKg: 105  (BLOCKER-1)
gate run 8: FAIL  offline-set-edit-delete.spec.ts  — same
CI offline gate: pass=5 fail=3 of 8
```

A job described in its own header as *"the deterministic, headless offline/PWA suite"* would fail
roughly a third of pushes to `main`. Both failure modes are the blockers above, not test-harness
flakiness — the assertions are correct and the product is wrong.

**LOW-1.** The job runs `pnpm start` (`next start`) against a build configured `output: "standalone"`,
and Next 15 emits `⚠ "next start" does not work with "output: standalone" configuration. Use "node
.next/standalone/server.js" instead.` It works today and is inherited from `playwright.config.ts`, but
CI now depends on behaviour Next explicitly says is unsupported; `package.json` already has a
`start:standalone` script.

---

## 8. Verified correct

These were tested adversarially and hold up. Several were claimed in the report on the strength of a
code read only; they are now backed by executable evidence.

**`serialize()` is correct, and the race it fixes is real.** The helper
(`src/sync/activeSession.ts:57-66`) was extracted verbatim and probed: strict invocation ordering
under maximally overlapping calls; not poisoned by a rejected mutation (`mutationQueue.then(fn, fn)`
and a never-rejecting tail are both load-bearing); correct for a synchronous throw; no unbounded
chain growth over 2000 sequential calls. The negative control — the identical workload without it —
loses two of three writes, confirming the underlying read-modify-write race the report describes is
genuine and not invented to justify a fix. All twelve serialized entry points claim their queue slot
synchronously (the store wrappers in `src/sync/activeSessionStore.ts` call the mutator before their
first `await`), so queue order is user-action order.

**The service worker caches nothing it should not.** Executable negative control rather than
inspection — seven authenticated API GETs warmed online through a service-worker-controlled page,
then re-fetched offline:

```
  offline /api/history?limit=5 -> rejected     offline /api/recovery       -> rejected
  offline /api/active-session  -> rejected     offline /api/recovery/today -> rejected
  offline /api/bodyweight      -> rejected     offline /api/volume         -> rejected
  offline /api/exercises       -> rejected
  offline /api/today-bundle    -> {"status":200,"activeSession":null,"hasToday":true}
```

Exactly one API GET is cached, and its `activeSession` is sanitised to `null` as `sw.ts`'s
`sanitizeCachedTodayBundle` intends — satisfying §7 and §8 and preserving the Finding C guarantee.

**The SW update lifecycle works, and is automatable.** Driven end-to-end with a genuinely
byte-different worker script: the new worker installed and **waited** (`hasWaiting: true`,
`controllerStillOld: true` — `skipWaiting: false` honoured), the "Update available" toast appeared,
the worker was still waiting 1.5 s later with no user action, and only an explicit tap sent
`SKIP_WAITING`, after which the waiting worker activated, the page reloaded, and the toast cleared.
The report marks this "code read"; it does not need to be.

**Cached-bundle staleness is displayed.** Offline past the 10 s `STALE_THRESHOLD_MS`, Today renders
`Showing cached data as of 8/28/2026, 9:48:21 PM.` Within the threshold no banner appears, which is
the documented intent (a fresh network response must never be misclassified as stale).

**Dead letters.** Payload preserved verbatim and inspectable as raw JSON; discard requires a second
explicit "Confirm discard — permanent" tap with a working Cancel; `retryDeadLetterOp`
(`src/sync/outbox.ts:88-102`) rebuilds the record without `deadReason`, preserves `payload`, and
deliberately preserves `tries`; `discardAllDeadLetters` is genuinely gone from the store, and no
bulk-delete path remains anywhere. The rejection driving the spec is a real `session_conflict` from
`uq_sessions_one_in_progress`, not a synthetic payload.

**Takeover** uses two genuinely separate browser contexts against a session the server really holds
`in_progress`, and asserts the discarded session leaves no trace.

**Sequential duplicate replay is idempotent**, including a resend under a fresh `opId` — the case the
client actually produces after a lost response. Only the *concurrent* case fails (BLOCKER-2).

**The unknown-offline recovery form does what it claims.** Verified end-to-end against a real hidden
entry the device had never read: only the touched field was sent (`{id, date, readiness}` — nothing
else), and the server merge preserved every untouched value:

```
  server row after merge: {"sleepQuality":5,"readiness":3,"soreness":5,"note":"pre-existing"}
```

This is the one place the report says required real design work, and the design is right.

**Offline bodyweight** round-trips correctly (3/3 runs): queued while offline, applied unchanged on
reconnect.

**Recovery semantics on the sync path**: explicit-null clearing works; clearing the day's last
metric is correctly rejected as `no_metric` with the row left intact; a note-only op preserves
existing metrics; the client-side guard prevents the UI from queuing an all-null save. Client id is
honoured only on insert; day-grain convergence holds under a fresh id.

**The PostgreSQL constraint-timing claim is correct** — independently confirmed against Docker
PostgreSQL 16.14 with a minimal SQL repro (§5).

**Exclusions hold.** No Web Push, `PushManager`, or `showNotification` anywhere in `src/` or
`tests/`; no CRDT or sync-engine dependency (`@electric-sql/pglite` is the integration-test database,
not ElectricSQL sync); `SYNC_ENTITIES` contains only execution facts and the two day-log entities —
no definition entity was added, so offline definition editing did not leak in; no Phase-9 analytics
or charting code.

**The iPhone checklist is genuinely unexecuted.** All seven items are unchecked, and the report
claims no device results anywhere. Phase 7 carries no deploy or device gate in
`implementation-plan.md` (only "Acceptance: mvp-scope F10"), and the report does not claim one — the
only such gate in the plan belongs to Pre-Phase 6 Release 2.

---

## LOW findings

- **LOW-1** — CI runs `next start` against an `output: "standalone"` build against Next's explicit
  warning (§7).
- **LOW-2** — `SyncStatusBanner` renders only `deadLetterOps[0].deadReason` even when several ops
  failed for different reasons, so the banner can misdescribe the problem.
- **LOW-3** — `clearLocalSession()` (`src/sync/activeSession.ts:73`) is exported, deletes the
  `activeSession` record, is not serialised, and has zero call sites. Either serialise it or delete
  it; leaving it is a trap for the next caller.
- **LOW-4** — `readOutboxStatusCounts`'s new `{pending:-1, dead:-1}` sentinel converts a *persistent*
  execution-context failure into a poll timeout rather than the underlying error. Worth noting that
  the navigation it works around is the same one that opens BLOCKER-2's window; the helper hides the
  symptom in tests.
- **LOW-5** — `logBodyweightToday`/`logRecoveryToday` enqueue in one IndexedDB transaction and the
  caller writes `dailyLogCache` in another, while `src/sync/dailyLogs.ts:20-24` claims parity with
  `commitSessionMutation`'s single-transaction invariant. The failure mode is benign (a stale cache
  hint, never a lost op), but the comment overstates the guarantee.
- **LOW-6** — Safe-area padding could not be exercised: `env(safe-area-inset-*)` resolves to 0 in
  headless Chromium, so `phase7Remediation.spec.ts` passing does not demonstrate the CSS works, only
  that it does not regress a zero-inset layout. This remains genuinely device-gated. The manifest
  (`display: standalone`, portrait, theme/background `#0f172a`, 192/512/maskable-512 icons),
  `apple-touch-icon.png` (180×180), `appleWebApp` metadata and `viewportFit: "cover"` are all present
  and correct by inspection.

---

## 9. Restoration and scratch hygiene

- Two files were temporarily edited as negative controls for HIGH-2 and restored byte-identically:
  - `src/server/volume/service.ts` — SHA-256 `66991DEC…F364C2A` before **and** after.
  - `src/server/progression/service.ts` — SHA-256 `15CC439E…CD5BE4CD` before **and** after.
- `public/sw.js` (a gitignored build artifact) was temporarily appended to for the SW update-lifecycle
  test and restored; SHA-256 `BEB6BB9B…5B2AFCF4` before and after.
- All review fixtures live outside the repository. The temporary `node_modules` junction used to run
  them was removed; the real `node_modules` is intact.
- `test-results/` (gitignored) was removed. `.next/` and `public/sw.js` were regenerated by
  `pnpm build`; both are gitignored.
- The disposable database `gymapp_p8review` was dropped; only `gymapp` remains. Production was never
  contacted.
- `docs/input/product-ideas.md`, `CLAUDE.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`,
  `gpt-memory.md` and `.claude/skills/` were neither read for content nor modified.
- `git status --porcelain` after this review is byte-identical to its state before it, with
  `docs/reviews/phase-8-review.md` as the only addition.

---

## 10. Remediation summary

| # | Severity | Finding |
|---|---|---|
| B-1 | **BLOCKER** | Per-op jittered `nextAttemptAt` + `nextAttemptAt <= now` filtering breaks FIFO after any failed flush; offline edits are reverted and deleted sets resurrected, silently and permanently |
| B-2 | **BLOCKER** | Duplicate delivery after a lost response permanently dead-letters an already-applied op (`set_number_conflict`) |
| B-3 | **BLOCKER** | Quick-logs are day-keyed by the device timezone, online included; overwrites a different day's real check-in with fabricated defaults |
| H-1 | HIGH | The recovery pre-read backfill reintroduces a read-then-write window; concurrent partial updates silently clear a metric (5/6) |
| H-2 | HIGH | The progression-boundary sync-transport exception is BFS-order-dependent and hides a real recovery consumption path |
| H-3 | HIGH | Report's headline verification results are not reproducible and misattribute the failing spec |
| M-1 | MEDIUM | The `serialize()` fix has no regression test; the spec was changed to avoid the overlap |
| M-2 | MEDIUM | The new bodyweight/recovery offline feature has no unit/integration/E2E coverage and is outside the CI gate |
| M-3 | MEDIUM | `dailyLogCache` is written from an unconfirmed prediction and mixes two date bases, against its own documented contract |
| M-4 | MEDIUM | First IndexedDB version bump has no `blocked`/`blocking` handler; a second open client hangs the store forever |
| L-1…L-6 | LOW | `next start` on a standalone build in CI; single-reason dead-letter banner; unused unserialised `clearLocalSession`; sentinel masks persistent read failures; non-atomic daily-log commit vs. its comment; safe-area CSS not executably verified (device-gated) |

Device acceptance should not be attempted until B-1, B-2 and B-3 are remediated: two of them corrupt
server state silently, and the third destroys stored data on any device whose timezone differs from
`users.timezone` — which the iPhone checklist would have no reliable way to notice.

**READY FOR REMEDIATION**
