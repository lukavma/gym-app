# Phase 3 Review — Today + Workout Execution, Outbox-First

**Reviewer:** independent adversarial review (Claude Opus 5)
**Date:** 2026-08-17
**Scope reviewed:** complete working-tree diff against `HEAD` (`1818876`), including untracked Phase 3 files
**Artifact under review:** `docs/reviews/phase-3-implementation.md` (treated as claims to verify, not as evidence)
**Excluded as unrelated user-owned changes:** deleted `HANDOFF.md`, untracked `HANDOFF(depracted).md`, untracked `gpt-handoff.md` (not read)
**Repository changes made by this review:** this file only.

---

## 1. Executive verdict

Phase 3 is a large, mostly high-quality vertical slice. The database layer, the server-side sync
service, snapshot immutability, ownership isolation, lifecycle locking, and the carry-forward chain
are correct and were independently verified against a live PostgreSQL 16 instance. The core
offline promise works better than the implementation report claims: I verified by direct
experiment that a workout can be **started offline from the cached bundle, logged offline, survive a
genuine browser-process relaunch while still offline, be completed offline, and converge
exactly-once into PostgreSQL on reconnect** — the mvp-scope F6 scenario the shipped e2e spec
deliberately avoids.

That success makes the failures sharper, not softer. Three of the eight execution-facts mutations
the UI exposes — **skip an exercise, exercise notes, and editing a set during the session** —
construct outbox payloads that the server's own schema cannot accept. Every one of them is
rejected `invalid_payload`, dead-lettered, and then never shown to anyone, because the dead-letter
surface required by the plan was not built at all. I reproduced this end-to-end against the
production build and real PostgreSQL: the UI showed 102.5 kg, skipped, with a note; the database
held 100.00 kg, not skipped, no note; the outbox held three silent `dead` rows; and no pixel
anywhere in the app said so. On completion the local aggregate is cleared and the divergence
becomes permanent. That is a direct breach of the one non-negotiable requirement in
`pwa-offline-strategy.md` §1.

The test suite cannot catch any of this, and the reason is mechanical rather than a matter of
judgement: both e2e synchronization helpers are built on `page.waitForFunction(async () => …)`,
which resolves immediately because a Promise object is truthy. I demonstrated this directly —
`waitForFunction(async () => false)` returns in 15 ms. `waitForOutboxDrained()` and
`waitForServiceWorkerReady()` wait for nothing. Meanwhile every payload in the new integration
suite was hand-written with the parent ids the client omits, so the suite validates a contract the
client does not satisfy.

**2 BLOCKER, 5 HIGH, 11 MEDIUM, 9 LOW.** Phase 3 cannot close in this state, and the defects are
bounded and mechanical: three payload literals, one banner, one transaction, and two test helpers
account for both blockers and three of the five highs.

---

## 2. Findings

### BLOCKER-1 — Skip, exercise notes, and in-session set edits never reach PostgreSQL and are silently discarded

**Evidence.** The three mutators enqueue payloads without the parent foreign key their schema
requires:

| Call site | Enqueued payload | Required by |
|---|---|---|
| [activeSession.ts:194](src/sync/activeSession.ts#L194) `setExerciseSkipped` | `{ id, skipped }` | `sessionId` — [schema.ts:62-72](src/domain/sync/schema.ts#L62-L72) |
| [activeSession.ts:206](src/sync/activeSession.ts#L206) `setExerciseNotes` | `{ id, notes }` | `sessionId` — same |
| [activeSession.ts:275](src/sync/activeSession.ts#L275) `editSet` | `{ id, ...patch }` | `sessionExerciseId` — [schema.ts:77-90](src/domain/sync/schema.ts#L77-L90) |

Both payload schemas are `.strict()` with required parent ids. The server rejects at
[service.ts:264-265](src/server/sync/service.ts#L264-L265) and
[service.ts:360-361](src/server/sync/service.ts#L360-L361); the client dead-letters the rejection at
[flush.ts:76](src/sync/flush.ts#L76).

Verified three ways:

1. **Schema probe** — parsing the exact literals above against the exported schemas:
   `[sessionId] Required`, `[sessionId] Required`, `[sessionExerciseId] Required`. The
   `corrections.ts` control payload (which *does* carry `sessionExerciseId`) parses fine.
2. **End-to-end against the production build and local PostgreSQL 16** — drove the real UI
   (log a set → edit it → add exercise notes → skip). Final IndexedDB outbox:

   ```
   DEAD  setLog.upsert          reason=invalid_payload  payload={id,weightKg,reps,rir}
   DEAD  sessionExercise.upsert reason=invalid_payload  payload={id,notes}
   DEAD  sessionExercise.upsert reason=invalid_payload  payload={id,skipped}
   ```
3. **Database state at that moment** — client showed 102.5 kg, skipped, note present:

   ```
   position | skipped | notes | set_number | weight_kg | reps
          0 | f       |       |          1 |    100.00 |    8
   ```

**Impact.** Three of the eight execution-fact mutations are permanently lost. `completeSession()`
([activeSession.ts:311](src/sync/activeSession.ts#L311)) clears the local aggregate, so after the
workout ends the correct values exist nowhere. A user who logs 100 kg, notices the mistake, corrects
it to 102.5 kg, and finishes the session ends up with 100 kg in their history — silently, and with
the wrong value then feeding the carry-forward chain into every subsequent session.

**Violated requirement.** `pwa-offline-strategy.md` §1 ("A set logged in the gym must never be
lost"); mvp-scope F5 (edit a set, skip an exercise, notes are listed capabilities); mvp-scope F6
("unsyncable ops surfaced, never dropped").

**Remediation (bounded).** Add the parent id at each of the three call sites — both are in scope
locally (`session.id` in `setExerciseSkipped`/`setExerciseNotes`; the `sessionExerciseId` parameter
in `editSet`). Then add a test that asserts the payload each `activeSession` mutator enqueues parses
against the corresponding schema in `src/domain/sync/schema.ts`, so the class of defect cannot
recur. The implementation report notes that four such payloads were caught *while writing the
integration tests* and fixed — but they were fixed **in the tests**, not in the client, which is
precisely why nothing catches it.

---

### BLOCKER-2 — No dead-letter surface exists anywhere in the app

**Evidence.** [outbox.ts:43](src/sync/outbox.ts#L43) `listDeadLetterOps` and
[outbox.ts:71](src/sync/outbox.ts#L71) `discardDeadLetter` have **zero callers** anywhere in `src/`.
There is no retry path for a dead-lettered op. `TodaySection` renders an offline banner
([TodaySection.tsx:124-129](src/ui/today/TodaySection.tsx#L124-L129)) and an in-progress banner, but
nothing about sync failures. My end-to-end probe confirmed it: with three dead-lettered ops in the
outbox, the substring "sync" does not appear anywhere in the rendered text of the workout page or
of `/today`.

**Impact.** Every rejection class the server can emit — `invalid_payload`, `session_conflict`,
`session_locked`, `invalid_reference`, `position_conflict`, `set_number_conflict` — disappears
without a trace. This is the amplifier that turns BLOCKER-1 from a bug into silent data loss, and
it would do the same for any future rejection. It is independently blocking: even with BLOCKER-1
fixed, a second-device takeover that dead-letters an entire offline session leaves the user with no
signal that their workout will never sync.

**Violated requirement.** `implementation-plan.md` Phase 3 Builds: "dead-letter store (surfaced in
Phase 8's dedicated screen; **minimal banner now**)". `pwa-offline-strategy.md` §6: "the op moves to
a dead-letter list shown in a 'sync issues' screen with payload preserved — never silently dropped."

**Remediation (bounded).** A minimal client banner mounted alongside `SyncBootstrap` in
[layout.tsx](<src/app/(app)/layout.tsx>): poll `listDeadLetterOps()`, and when non-empty show a
persistent "N changes couldn't sync" strip with the reason and a discard action. Phase 8 replaces it
with the full screen. Cover it with an e2e assertion that the outbox contains zero `dead` rows at
the end of the offline scenario.

---

### HIGH-1 — The local commit and the outbox append are not atomic

**Evidence.** Every mutator performs two independent IndexedDB transactions: `persist(session)`
([activeSession.ts:44-47](src/sync/activeSession.ts#L44-L47), a bare `db.put`) followed by a
separate `enqueueOp(...)` `db.put` — see [activeSession.ts:236-248](src/sync/activeSession.ts#L236-L248)
for `logSet`, and the same shape in `addAdhocExercise`, `setExerciseSkipped`, `setExerciseNotes`,
`editSet`, `deleteSet`, `setSessionNotes`.

**Impact.** If the process dies between the two puts — iOS reclaiming a backgrounded PWA is the
realistic case — the set is in `activeSession` (so the UI shows it on resume, confirming it to the
user) but has no outbox op. It will never sync, and `completeSession()` then clears the aggregate,
so it is gone. The window is short, but the requirement is unconditional and the fix is cheap: all
three stores already live in one IndexedDB database
([db.ts:10-11](src/sync/db.ts#L10-L11)).

**Violated requirement.** `pwa-offline-strategy.md` §5 sequence diagram, explicitly annotated:
"*both writes commit before UI confirms the set*"; §1.

**Remediation (bounded).** Add a helper that opens one `readwrite` transaction across
`["activeSession", "outbox"]`, writes the aggregate and appends the op, and awaits `tx.done`; route
all seven mutators through it. No schema change, no version bump.

---

### HIGH-2 — Both e2e synchronization helpers are no-ops, so the sync gate asserts nothing

**Evidence.** [helpers.ts:56](tests/e2e/helpers.ts#L56) `waitForOutboxDrained` and
[helpers.ts:79](tests/e2e/helpers.ts#L79) `waitForServiceWorkerReady` both pass an **async** callback
to `page.waitForFunction`. The callback returns a Promise, which the polling predicate sees as
truthy, so it resolves on the first tick regardless of state. Demonstrated directly:

```
waitForFunction(async () => false)              -> RESOLVED after 15ms
waitForFunction(async idb-open then false)      -> RESOLVED after 5ms
```

(Contrast: my own probes had to poll with `expect.poll(async () => page.evaluate(…))` to actually
wait — the same drain that "completed" instantly under the repo helper took ~8 s under a real poll.)

**Impact.** `waitForOutboxDrained` is called three times in `offline-sync.spec.ts`
([lines 41, 68, 73](tests/e2e/offline-sync.spec.ts#L41)) and in `today.spec.ts`; none of them
establish the precondition they claim. The offline spec's exactly-once assertions survive only
because `expect(...).toHaveCount(1)` auto-retries. The specs therefore cannot fail on BLOCKER-1, and
the cross-device resume/takeover tests race against server state rather than waiting for it.
Compounding this, the drain predicate is `all.every((op) => op.status !== "pending")` — which counts
a **dead-lettered op as drained**, so even a working helper would treat permanent data loss as a
successful sync.

**Violated requirement.** mvp-scope F6 ("Playwright-scripted"); `implementation-plan.md` Phase 3
Acceptance ("F6 (Playwright offline scenario green)"). Green here does not mean what it appears to.

**Remediation (bounded).** Convert both helpers to `expect.poll(async () => page.evaluate(…))`, and
change the drain predicate to require `status === "pending"` count zero **and** `status === "dead"`
count zero, failing loudly on any dead letter.

---

### HIGH-3 — The F6 acceptance scenario is not scripted; the shipped offline spec proves a weaker claim

**Evidence.** [offline-sync.spec.ts](tests/e2e/offline-sync.spec.ts) starts the workout **online**
(line 39), goes offline at line 49, and clicks "Complete workout" at line 71 — **after**
`context.setOffline(false)` at line 67. The relaunch is `page.reload()` (line 59), which keeps the
same browser process, the same renderer, and the same warm memory state. The implementation report
acknowledges the completion ordering and justifies it by RSC-transition concerns under connectivity
loss.

I tested the justification and it does not hold. Using a persistent Chromium profile so IndexedDB
and Cache Storage survive a real process teardown, I ran the full F6 scenario:

- **Started the workout offline** from the cached bundle (launch was offline from the first byte);
  `/today` and `/today/workout` were served by the service worker.
- Logged 110 kg × 5 offline, closed the entire browser, relaunched still offline — the set was
  there.
- Logged 112.5 kg × 3, clicked **Complete workout while still offline**;
  `router.push("/today")` completed normally (20 s budget, no hang).
- Reconnected; the outbox drained to empty with zero dead letters.
- PostgreSQL: one `completed` session, `completed_at` set, exactly two `set_logs` rows —
  `1 | 110.00 | 5` and `2 | 112.50 | 3`.

**Impact.** The behaviour is correct; the *evidence* for it does not exist in the repository. mvp-scope
F6 requires the scenario be Playwright-scripted, and `implementation-plan.md` makes "F6 (Playwright
offline scenario green)" a Phase 3 acceptance gate. As shipped, the regression that would break
offline completion or offline start would not be caught.

**Remediation (bounded).** Rewrite `offline-sync.spec.ts` around
`chromium.launchPersistentContext(userDataDir)`: prime online, relaunch with `{ offline: true }`,
start the workout offline, log, close and relaunch offline, complete offline, then reconnect and
assert convergence plus zero dead letters. This is roughly the shape of the probe I ran; it took ~9 s
wall-clock. Keep `page.reload()` as a separate, cheaper same-process case.

---

### HIGH-4 — Session notes (an explicit F5 capability) has no UI

**Evidence.** `setSessionNotes` exists in [activeSession.ts:294](src/sync/activeSession.ts#L294) and
is exposed on the store at [activeSessionStore.ts:68](src/sync/activeSessionStore.ts#L68), but no
component calls it — `WorkoutExecution` renders exercises, ad-hoc add, complete and discard only
([WorkoutExecution.tsx:54-89](src/ui/workout/WorkoutExecution.tsx#L54-L89)). Only *per-exercise*
notes are reachable ([ExerciseCard.tsx:140-158](src/ui/workout/ExerciseCard.tsx#L140-L158)).

**Impact.** A listed Phase 3 capability is undeliverable to the user. (Its op shape is correct, so
it will work as soon as a control exists — unlike the exercise-notes path in BLOCKER-1.)

**Violated requirement.** mvp-scope F5: "…add an unplanned exercise; skip an exercise; **session
notes**; complete/abandon"; `implementation-plan.md` Phase 3 Builds lists "notes".

**Remediation (bounded).** A collapsible notes textarea in `WorkoutExecution`, `onBlur` →
`setSessionNotes`, mirroring the existing per-exercise control.

---

### HIGH-5 — Offline/stale Today is never indicated, because the service worker silently serves the bundle

**Evidence.** [sw.ts](src/app/sw.ts) is **unmodified since Phase 0** — `git log -1 -- src/app/sw.ts`
returns `0762d97 Phase 0: project foundation and walking skeleton`, and `git status` on that path is
empty. Its `runtimeCaching: defaultCache` caches *all* same-origin `/api/*` GETs with `NetworkFirst`
/ `cacheName: "apis"` / `networkTimeoutSeconds: 10`
(`node_modules/@serwist/next/src/index.worker.ts:192-203`).

Measured on the production build with a persistent profile:

```
CACHE STORAGE (online):  "apis": ["/api/today-bundle"]
/api/today-bundle while OFFLINE: status=200 fromSW=true
Offline banner shown: false
/today body offline: "…E2E Phase 3 Day  Week 1  Barbell Back Squat  3 × 5  Start workout"
```

Because the fetch resolves 200, `TodaySection`'s `.catch()` branch
([TodaySection.tsx:44-56](src/ui/today/TodaySection.tsx#L44-L56)) never runs: `status` never becomes
`"offline"`, the "Offline — showing cached data from …" banner never renders, and the IndexedDB
`bundleCache` fallback is effectively dead code in a production build.

**Impact.** The user is shown arbitrarily old prescriptions, week index and carry-forward prefills
with no indication whatsoever that they are cached. The same applies on a flaky connection: the 10 s
`NetworkFirst` timeout silently serves stale data as if fresh. Caching every other `/api/*` GET also
means `/api/history` and `/api/history/[id]` are cached, so a post-completion correction can be
followed by a stale history render.

**Violated requirement.** `pwa-offline-strategy.md` §4: "Staleness is acceptable and **displayed**
('as of 07:41')"; §7: "The service worker never caches API responses containing data beyond the
bundle mechanism"; §8: "`NetworkFirst` (**3s** timeout → cache) for `/api/today-bundle` GET… **No
caching of other API GETs in MVP** (stale-data complexity without a requirement)."

The implementation report's §1 claim — "`src/app/sw.ts`'s `runtimeCaching` extended to cover
`/api/today-bundle`" — is **false**; the file was never touched.

**Remediation (bounded).** Replace `defaultCache` with an explicit list: `NetworkFirst` at 3 s for
`/api/today-bundle` only, plus the asset strategies; exclude all other `/api/*` GETs. Then make
`TodaySection` treat staleness explicitly rather than inferring it from a thrown fetch — e.g. compare
a `generatedAt` field on the bundle (see MEDIUM-5) against now, or send `cache: "no-store"` for the
freshness probe and fall back to `bundleCache` deliberately.

---

### MEDIUM findings

**MEDIUM-1 — Partial field patches instead of full-row upserts, and LWW is arrival-order only.**
Every update path in [service.ts](src/server/sync/service.ts) applies only the fields present in the
payload plus `updatedAt: new Date()`; `updated_at` is never *compared*. `implementation-plan.md`
Phase 3 specifies "idempotent **full-row** upserts keyed by client UUIDv7; **LWW on `updated_at`**",
and `pwa-offline-strategy.md` §5 says "ops are full-row upserts/deletes keyed by entity UUID, so
replays converge". With partial patches applied in arrival order, two devices editing different
fields of the same row produce a merged row that never existed on either device — the failure mode
row-level LWW is specifically supposed to prevent. (`pwa-offline-strategy.md` §6's "by arrival order"
makes the *ordering* compliant; the *granularity* is not.) Not blocking for a single-device user,
but it is an undocumented deviation and the report states "Architecture deviations: None."

**MEDIUM-2 — Exponential backoff is computed but never enforced.**
[outbox.ts:81-82](src/sync/outbox.ts#L81-L82) writes `nextAttemptAt`, but
[outbox.ts:40](src/sync/outbox.ts#L40) `listPendingOps` filters on `status` only and never reads it.
Observed during the offline probe: `tries` climbed 0→3 within ~1.5 s of wall-clock offline time while
`nextAttemptAt` sat in the future. On a long outage the client retries every 5 s plus once per
mutation. Violates `pwa-offline-strategy.md` §5 ("exponential backoff with jitter, capped at 60s").
Fix: `listPendingOps` filters `nextAttemptAt <= now`.

**MEDIUM-3 — No client-side upper-bound validation, so out-of-range input dead-letters silently.**
[ExerciseCard.tsx:45-48](src/ui/workout/ExerciseCard.tsx#L45-L48) checks only lower bounds. Probed
against the schemas: `rir: 42` → "Number must be less than or equal to 10"; `reps: 500` → "less than
or equal to 100". Weight above 9999.99 behaves the same. Each becomes a silent dead letter (see
BLOCKER-2). The `SetRow` edit path ([ExerciseCard.tsx:203-210](src/ui/workout/ExerciseCard.tsx#L203-L210))
validates nothing at all. Fix: mirror the schema bounds at the input, inline error message.

**MEDIUM-4 — `navigator.storage.persist()` is never requested.** No occurrence anywhere in `src/`.
`pwa-offline-strategy.md` §3: "On app start: `navigator.storage.persist()` requested". Without it the
active session and outbox are evictable storage — directly relevant to the iOS case §1 names.

**MEDIUM-5 — The bundle omits `loadStepKg`, `generatedAt`, and a distinct `previousPerformance`.**
`pwa-offline-strategy.md` §4 specifies `perExercise: { previousPerformance (last 3 non-deload),
history for engine (last 5) }`, `exercises metadata (loadStepKg…)`, and `generatedAt`.
[today/service.ts](src/server/today/service.ts) builds one `history` array
(`HISTORY_WINDOW = 8`, sliced to `HISTORY_DISPLAY_LIMIT = 5`) serving both roles, with no
non-deload filter, no `loadStepKg`, and no `generatedAt`. `loadStepKg` exists in the schema and
domain but never reaches the client. No Phase 3 impact (`is_deload` is always false, no Decision
layer), but Phase 4 needs `loadStepKg` for client-side evaluation and `generatedAt` is what a
staleness display (HIGH-5) needs.

**MEDIUM-6 — `/api/history?before=` is unvalidated and 500s.** [route.ts:16-20](src/app/api/history/route.ts#L16-L20)
validates `limit` but passes `before` straight through to `new Date(...)` in
[history/service.ts](src/server/history/service.ts). Measured:
`/api/history?before=not-a-date → 500`, `?before=9999999999999999 → 500`. Inconsistent with the
`limit` handling in the same function. Fix: parse `before` and return 400.

**MEDIUM-7 — No "sign in to sync" indicator on 401.** [flush.ts:61-66](src/sync/flush.ts#L61-L66)
correctly retains ops untouched on 401 (verified by inspection — no `markTried`, no
`markDeadLetter`), but `pwa-offline-strategy.md` §7 also requires "UI shows a persistent 'sign in to
sync' pill". Nothing renders. Naturally folds into the BLOCKER-2 banner work.

**MEDIUM-8 — In-session set delete has no confirmation.**
[ExerciseCard.tsx:237](src/ui/workout/ExerciseCard.tsx#L237) deletes on a single tap, while the
history equivalent confirms ([HistoryDetail.tsx:205](src/ui/history/HistoryDetail.tsx#L205)). Sweaty
hands, small target, destructive and unrecoverable — the inconsistency is the tell.

**MEDIUM-9 — A dead-lettered session op leaves the local session unrecoverable.** If device B takes
over, device A's queued ops fail with `session_conflict`/`session_locked` and dead-letter. Device A
keeps accepting sets into a session that can never sync, and `completeSession()` then clears them.
Even with the BLOCKER-2 banner there is no path to re-home those ops onto a new session id. Phase 3
should at minimum stop accepting writes and say so.

**MEDIUM-10 — The e2e harness cannot run the offline spec as configured.**
[playwright.config.ts](playwright.config.ts) starts `pnpm dev`, and
[next.config.ts](next.config.ts) disables the service worker when `NODE_ENV === "development"`. The
offline spec's header documents that you must run `pnpm build && pnpm start` by hand first, but
nothing enforces it: on a clean checkout `pnpm test:e2e` runs against dev, where the only reason a
service worker registers at all is that `public/sw.js` (gitignored) may be left over from an earlier
production build — [ServiceWorkerUpdater.tsx:17](src/ui/ServiceWorkerUpdater.tsx#L17) registers
`/sw.js` unconditionally. That also means dev sessions silently run a stale worker. Fix: a
`webServer.command` that builds and starts, or a fixture that fails fast when the SW is absent.

**MEDIUM-11 — Inaccuracies in the implementation report.** Beyond the false `sw.ts` claim (HIGH-5):
§7 states "Architecture deviations: None" while MEDIUM-1 and HIGH-5 are both deviations; §5 presents
green suite counts as evidence of the offline guarantee when the helpers underpinning them are
no-ops (HIGH-2). The counts themselves are accurate — I reproduced 170/170 unit, 104/104 integration,
5/5 e2e.

### LOW / non-blocking

- **L1** `@tanstack/react-query` was added to `dependencies` but is imported nowhere in `src/` or
  `tests/`. Remove it or use it.
- **L2** `ix_session_exercises_session_id` is redundant: `uq_session_exercise_position
  (session_id, position)` already serves `session_id`-prefix lookups. It is also not in
  `data-model.md` §2.13.
- **L3** `getExerciseHistory` is called once per prescription in `buildTodayBundle` (N+1). Fine at
  6–8 exercises; worth a single windowed query later.
- **L4** [flush.ts:82](src/sync/flush.ts#L82) schedules a 0 ms retry when `untouched.length > 0`. The
  current server classifies every op, so this is unreachable — but if it ever became reachable it is
  a tight loop.
- **L5** No warmup toggle in the logging UI; `isWarmup` is always false in practice, though the
  column, the payload field and the carry-forward "first work set" logic all depend on it.
- **L6** The `byCreatedAt` outbox index ([db.ts:41](src/sync/db.ts#L41)) is never used. FIFO happens
  to hold because `getAll()` returns key order and keys are time-sortable UUIDv7 — correct, but by
  coincidence rather than by construction.
- **L7** History detail casts the `prescription` jsonb to `PrescriptionSnapshot` without parsing
  ([history/service.ts:203](src/server/history/service.ts#L203)), and
  [HistoryDetail.tsx:98](src/ui/history/HistoryDetail.tsx#L98) then reads `snapshot.scheme`
  unguarded. Safe today because writes are validated; a v2 envelope would break rendering.
- **L8** `/api/history/not-a-uuid` → 500 (measured). The same pattern exists in Phase 2 routes
  (e.g. [templates/[id]/route.ts:19](<src/app/api/templates/[id]/route.ts#L19>)), so this is a
  pre-existing project-wide convention gap, not Phase 3-specific.
- **L9** `README.md`'s deferrable-constraint table still marks `uq_session_exercise_position` and
  `uq_set_number` as "3 (planned)". They are delivered; the row should say so.

---

## 3. Phase 3 requirement / acceptance matrix

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| Three tables with FK policies + partial uniques | plan Phase 3; data-model §§2.12–2.14 | ✅ | Live `psql` introspection, column-for-column match |
| `uq_sessions_one_in_progress` partial unique (immediate) | data-model §2.12 | ✅ | `UNIQUE, btree (user_id) WHERE status = 'in_progress'` |
| Deferrable uniques hand-patched | README workflow | ✅ | Both `condeferrable=t, condeferred=t` live |
| Only migration 0004 adds Phase 3 schema; 0000–0003 untouched | plan | ✅ | `git status drizzle/`; journal appends idx 4 only |
| Today resolution: weekday + rotation | plan Phase 3 | ✅ | `todayTemplate.ts`; 9 unit tests |
| Carry-forward chain, no Decision layer | prescription-model §4 | ✅ | `carryForward.ts`; 11 unit tests; live snapshot `prefill.loadKg: 100` traced to prior session |
| Bundle: effective prescriptions, engine history | plan Phase 3; pwa §4 | ⚠️ | present; `loadStepKg`, `generatedAt`, distinct `previousPerformance` missing (MEDIUM-5); no test coverage of `buildTodayBundle` |
| Snapshot frozen at start, versioned, validated, written once | ADR-007; domain-model §6 | ✅ | `{v:1,snapshot:{…}}` in live DB; update path never writes `prescription`; integration test |
| History renders from snapshots after template delete / exercise archive | mvp-scope F9 | ✅ (untested) | `SET NULL` lineage; snapshot-sourced names; no test exercises the deletion path |
| Post-completion corrections via the same outbox path | plan Phase 3 | ✅ | `corrections.ts` carries parent ids; integration test |
| Raw integer/null RIR preserved | data-model §2.14 | ✅ | `smallint`, ck 0–10, null preserved end-to-end |
| Every execution-fact mutation via IndexedDB + outbox | ADR-005; pwa §5 | ✅ | single write path; no direct REST writes |
| Local commit + outbox append atomic | pwa §5 | ❌ | HIGH-1 |
| Full-row idempotent ops | plan; pwa §5 | ⚠️ | MEDIUM-1 |
| Idempotent replay / duplicate batches | pwa §5 | ✅ | integration test; exactly-once verified in PostgreSQL |
| FIFO, parent-before-child ordering | pwa §5 | ✅ | UUIDv7 key order; verified in the offline probe |
| Backoff with jitter, capped 60 s | pwa §5 | ❌ | MEDIUM-2 |
| Rejected ops retained **and surfaced** | pwa §6; plan | ❌ | BLOCKER-2 |
| 401 → ops preserved | pwa §7 | ⚠️ | preserved ✅; "sign in to sync" pill missing (MEDIUM-7) |
| Ownership enforced without existence leakage | domain-model | ✅ | three `not_found`; integration test |
| One in-progress enforced; explicit resume/takeover | ADR-005; pwa §6 | ✅ | integration + `today.spec.ts`; no silent merge or discard |
| Forward-only lifecycle; completed/discarded locked | domain-model §7 | ✅ | `ALLOWED_SESSION_TRANSITIONS`; integration test |
| LWW on `updated_at` | plan Phase 3 | ⚠️ | arrival-order only (MEDIUM-1) |
| Skip / exercise notes / edit set usable end-to-end | mvp-scope F5 | ❌ | BLOCKER-1 |
| Session notes usable | mvp-scope F5 | ❌ | HIGH-4 |
| Prefilled set logged in ≤3 interactions | mvp-scope F5 | ✅ | prefill + kg/reps + one "Log" tap |
| In-progress session survives refresh **and full relaunch** | mvp-scope F5 | ✅ (partly untested) | verified by probe; repo test covers reload only |
| Complete workout in airplane mode, exactly once in PostgreSQL | mvp-scope F6 | ✅ behaviour / ❌ scripted | verified by probe; HIGH-3 |
| Cached Today/workout routes work offline | pwa §2 | ✅ | `status=200 fromSW=true`; start-offline verified |
| Stale bundle clearly indicated | pwa §4 | ❌ | HIGH-5 |
| Dead-letter visibility | plan Phase 3 | ❌ | BLOCKER-2 |
| Manual iPhone acceptance | plan Phase 3 acceptance | ⛔ not performed | acknowledged in the implementation report §8 |

---

## 4. Architecture and scope compliance

**Layering.** The new `sync` boundary type in [eslint.config.mjs](eslint.config.mjs) (`sync → domain,
sync`; `app`/`ui → sync`) is a coherent extension of the existing one-way rule and keeps the client
sync layer free of server imports. `pnpm lint` passes.

**Snapshot-on-use (ADR-007).** Correctly implemented. `buildPrescriptionSnapshotData` assembles the
Phase 3 subset; `wrapPrescriptionSnapshot` versions it; the session-exercise update path never writes
`prescription`, which I confirmed both by reading the write layer and via the integration test that
mutates the live prescription and replays a conflicting snapshot. Live jsonb inspection shows a
complete, well-formed `{v: 1, snapshot: {…}}` envelope.

**ADR-005 (online-first app, local-first workout).** Honoured. Definitions remain online REST;
execution facts go exclusively through IndexedDB + outbox; conflict handling is LWW + explicit
takeover with no merge UI.

**Scope discipline.** Good. `isDeload` is hardcoded false with a Phase 5 comment; no Decision layer,
no recommendations, no volume math leaked in. The carry-forward implementation is exactly the
Phase 3 subset prescription-model §4 specifies.

**Deviations not recorded in `docs/architecture/deviations.md` or the implementation report:**
partial patches instead of full-row upserts (MEDIUM-1); `updated_at` not compared despite the plan's
"LWW on `updated_at`" (MEDIUM-1); service-worker runtime caching left at Phase 0 `defaultCache`
against pwa §7/§8 (HIGH-5); `navigator.storage.persist()` omitted (MEDIUM-4).

---

## 5. Verification performed

All checks ran against the local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`) per
`CLAUDE.md`. **Production (Azure) was never contacted.**

| Command | Result |
|---|---|
| `pnpm lint` | pass, no output |
| `pnpm typecheck` | pass |
| `pnpm typecheck:sw` | pass |
| `prettier --check` on `src/**`, `tests/**`, `drizzle/**` (implementation-owned only; `gpt-handoff.md` untouched) | "All matched files use Prettier code style!" |
| `pnpm test:unit` | 14 files, **170 passed** |
| `pnpm test:integration` | 8 files, **104 passed** (incl. 7 new sync tests) |
| `pnpm build` | pass |
| `pnpm test:e2e` against `pnpm build && pnpm start` on :3000 | **5 passed** (4.7 s) |
| `pnpm db:migrate` | applied cleanly |
| drift check: `drizzle-kit generate --out` → a **copy** of `drizzle/` outside the repo | "No schema changes, nothing to migrate" — no drift, and the repository's migration folder was not written to |

**Live database verification (not snapshot inspection).**

- `pg_constraint`: `uq_session_exercise_position` and `uq_set_number` both `condeferrable=t,
  condeferred=t`, definitions ending `DEFERRABLE INITIALLY DEFERRED`. All other constraints
  `f/f` — notably `uq_sessions_one_in_progress` is a plain immediate partial unique index, as
  specified.
- `\d` on all three tables: every column type, nullability, default and CHECK matches
  `data-model.md` §§2.12–2.14 exactly (`numeric(6,2)` weight, `smallint` reps/RIR, `reps` 1–100,
  `rir` 0–10, `set_number >= 1`, `weight_kg >= 0`, both status/source enums).
- FK actions verified live: block/template `SET NULL`, session `CASCADE`, exercise `RESTRICT`,
  session-exercise `CASCADE`.
- Only deviation from the spec's index list: the extra `ix_session_exercises_session_id` (L2).

**Independent probes** (all outside the repository, in `C:\tmp\probe\`; none modified project files):

1. **Payload probe** — the exact literals `activeSession.ts` enqueues, parsed against the exported
   schemas. Three rejections, one control acceptance, plus confirmation that RIR > 10 and reps > 100
   are rejected.
2. **UI probe** — drove the real production build: log → edit → notes → skip, then read IndexedDB and
   PostgreSQL. Three `dead` rows with `deadReason: "invalid_payload"`, zero UI surface, database
   diverged from the screen.
3. **`waitForFunction` semantics probe** — established that an async predicate resolves immediately
   (15 ms), invalidating both e2e helpers.
4. **Full-offline probe (persistent profile, real process relaunch)** — two variants: start online
   then go offline, and start offline from the cached bundle. Both completed offline and converged
   exactly-once in PostgreSQL (`110.00 × 5`, `112.50 × 3`; `100.00 × 8`, `102.50 × 6`), zero dead
   letters.
5. **Service-worker cache probe** — `apis` cache contains `/api/today-bundle`; offline it returns
   `200 fromSW=true`; the offline banner never renders.
6. **API validation probe** — `?before=not-a-date` → 500, `?before=9999999999999999` → 500,
   `/api/history/not-a-uuid` → 500, valid uuid → 404, `/api/today-bundle` → 200.

**What I did not verify.** Real iOS Safari / installed-PWA behaviour (no device); storage eviction
behaviour; anything requiring production.

---

## 6. Answers to the pre-review concerns

**(a) Do the parent-id-less payloads dead-letter?** **Yes — confirmed, and this is BLOCKER-1.**
`setExerciseSkipped`, `setExerciseNotes` and `editSet` all produce `invalid_payload` rejections that
become permanent dead letters. The suspicion was right and the consequence is worse than "these ops
fail": combined with BLOCKER-2 there is no signal, and `completeSession()` destroys the only correct
copy. Note the causal irony — the implementation report records that four payloads were caught
missing parent ids while writing the integration tests; the fix went into the tests, which is why
the suite now encodes a contract the client violates.

**(b) Is the separate-transaction persistence a real violation?** **Yes — HIGH-1.** `persist()` and
`enqueueOp()` are two independent `db.put` calls, i.e. two IndexedDB transactions, in all seven
mutators. `pwa-offline-strategy.md` §5 annotates the requirement explicitly ("both writes commit
before UI confirms the set"). The kill window is small but real, the failure is silent and
permanent, and all three stores are already in one database, so a single multi-store transaction is
a contained fix. I did not attempt to hit the window experimentally — it is sub-millisecond and
process-kill-timing dependent; the code structure is dispositive.

**(c) Does `offline-sync.spec.ts` reconnect before completing?** **Yes — confirmed, HIGH-3**, and it
is weaker still than that: it also *starts* online, and `page.reload()` is not a relaunch. But the
implementation is better than its test. I ran the real scenario — offline start from cache, offline
logging, genuine browser-process relaunch while offline, offline completion, then reconnect — and it
converged exactly once. `router.push("/today")` after an offline completion worked fine, so the
stated RSC-transition rationale for avoiding it does not hold. This is a test-adequacy failure, not
a functional one; F6 nonetheless requires it be scripted.

**(d) Were previous-performance and engine-history actually implemented and tested?** **Implemented
with gaps; not tested at all.** `buildTodayBundle` fetches an 8-session window per prescription and
exposes the first 5 as `history`, one array serving both the "previous performance (last 3
non-deload)" and "history for engine (last 5)" roles from `pwa-offline-strategy.md` §4, with no
non-deload filter (harmless in Phase 3, where `is_deload` is always false) and no `loadStepKg` or
`generatedAt` (MEDIUM-5). More significantly, **`buildTodayBundle` has zero test coverage** — there
is no integration test for the bundle at all. `resolveTodayTemplate` and `resolveCarryForwardLoadKg`
are well unit-tested as pure functions, but the assembly that wires timezone → weekday → block →
schedule → template → prescriptions → history → snapshot is verified only by the e2e specs
incidentally rendering it. I confirmed the chain works end-to-end by observing a live snapshot whose
`prefill.loadKg: 100` correctly traced to the previous completed session's first work set.

---

## 7. Deferred / non-blocking observations

- The deferrable uniques are currently load-bearing for nothing: `nextSetNumber` uses `max + 1`
  ([activeSession.ts:62-64](src/sync/activeSession.ts#L62-L64)), so deleting a mid-list set leaves a
  permanent gap rather than renumbering. That is *correct* (no collision on the next log), and the
  constraints are right to exist for the renumbering `data-model.md` §2.14 anticipates — just note
  that no code path exercises deferral yet, so the guarantee is untested in practice.
- Ownership of `exerciseId` / `blockId` / `templateId` in sync payloads is checked by FK existence
  only, not by user. Under ADR-004 (exactly one account ever) this is unexploitable; worth a note if
  multi-user is ever revisited.
- `drizzle-kit`'s snapshot cannot represent `DEFERRABLE`, so "no drift" (verified) says nothing about
  the hand-patch. Anyone running `drizzle-kit push` would silently drop it. The README workflow
  covers regeneration; `push` is worth an explicit warning.
- History is completed-only, matching domain-model's "discarded sessions are retained but excluded
  from history". Discarded sessions accumulate with no UI at all — expected for Phase 3.
- The `AddAdhocExercise` path is correct (carries `sessionId`, `prescription: null`) but has no e2e
  or integration coverage; likewise skip/notes/edit/correction flows. The three defects in BLOCKER-1
  are exactly the three flows with no coverage.

---

## 8. Final gate

**READY FOR REMEDIATION.**

2 BLOCKER and 5 HIGH findings stand; any one of the blockers is sufficient to hold the gate. Phase 3
must not be marked complete, committed as final, or deployed in this state — BLOCKER-1 causes silent,
permanent loss of user-entered training data, which is the precise failure mode
`pwa-offline-strategy.md` §1 declares non-negotiable, and BLOCKER-2 guarantees the user will never
find out.

The remediation is well-bounded and mechanical. Three payload literals (BLOCKER-1), one banner
component (BLOCKER-2, absorbing MEDIUM-7), one shared IndexedDB transaction helper (HIGH-1), two
corrected test helpers plus a rewritten offline spec (HIGH-2, HIGH-3), one textarea (HIGH-4), and an
explicit `runtimeCaching` list plus a real staleness signal (HIGH-5). Everything the review found
verified-good — the schema, the migration, the sync service, snapshot immutability, ownership,
lifecycle, idempotence, and the carry-forward chain — stays as it is.

Recommended next command:

```
S5-XH | P03 | Remediation — Workout Execution
```

After remediation, re-run the F6 scenario as a scripted Playwright test (persistent profile, offline
start, real relaunch, offline completion) and assert zero dead-lettered ops, then proceed to the
manual iPhone acceptance that `implementation-plan.md` Phase 3 requires and that has not yet been
performed.
