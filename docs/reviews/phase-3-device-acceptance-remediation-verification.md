# Phase 3 — device-acceptance remediation: independent verification

Date: 2026-08-18
Verifier: independent pass over findings **A (HIGH)**, **C (HIGH)** and **D (LOW)**
Baseline: the remediation working tree, which was committed to `d9a6a3f` by something
outside this session while verification was in progress (see §8.1). Content identical to
the tree that was reviewed.
Database: local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`) only. No
production access, no migrations, no schema changes, no commits, no deploys.

**Verdict: READY FOR DEPLOYMENT AND MANUAL IPHONE VERIFICATION.**

No correctness defect was found in A, C or D. All three fixes were reproduced at runtime
by evidence independent of the specs that ship with them, including two conditions the
repository's own tests do not cover (an already-poisoned field cache, and the stored set
numbering in real PostgreSQL). Nine residual risks are recorded in §7; one of them (R1)
means the originally-reported symptom persists for data already written, and one (R3) is a
low-probability hang the remediation report describes as impossible. Neither blocks
deployment. The remediation report contains one factually wrong technical claim (§6 of that
document, corrected in §2.4 below); it misdescribes why the test harness works, not whether
it works.

---

## 1. What "independent" means here

The remediation report's own §7.1 concedes that its tests were written by the author of the
fixes. Accordingly, nothing below rests on those tests passing. Every claim in §§2–4 is
supported by at least one of:

- **the built artefact** — `public/sw.js` after a fresh `pnpm build`, read directly,
  including serwist's own runtime code;
- **a purpose-written probe** — six standalone Playwright/Node scripts written for this
  verification, kept outside the repository (they must not modify it) and sharing no code
  with `tests/e2e/`;
- **direct SQL against the live Docker PostgreSQL**, not PGlite;
- **raw HTTP** against the running production server.

The repository's own suites were then run once, in full, and are reported in §5 as
corroboration — not as proof.

---

## 2. Finding A — genuine cold offline navigation

### 2.1 `/~offline` is precached, and is a document-only fallback

Read out of the built `public/sw.js` (49,604 bytes) after `pnpm build`:

```
…,{'revision':'b18a65818057dfb40de6f17594d58296','url':'/icons\\icon-maskable-512.png'},
  {'revision':'2d81f3ee14f95884','url':'/~offline'}],
skipWaiting:!1,clientsClaim:!1,navigationPreload:!0,runtimeCaching:ev,
fallbacks:{entries:[{url:"/~offline",matcher:e=>{let{request:t}=e;return"document"===t.destination}}]}
```

- The route URL `/~offline` **is** in the precache manifest, with the derived revision.
- The `public/` icon entries are **still present** alongside it, so `manifestTransforms`
  did not displace `@serwist/next`'s own `additionalPrecacheEntries`. Confirmed against the
  plugin source: `dist/index.mjs:161` destructures `manifestTransforms = []` and
  `:220` composes `[...manifestTransforms, <builtin>]`, while `:195-196` skips the `public/`
  glob entirely when the caller supplies `additionalPrecacheEntries`. The remediation
  report's reasoning for choosing `manifestTransforms` is correct.
- `/~offline` is prerendered static (`.next/prerender-manifest.json` lists it;
  `.next/server/app/(app)/~offline/` exists), so the precached document is a real,
  stable app-shell HTML.

### 2.2 The `destination === "document"` guard is load-bearing — proved from serwist's own code

The claim that serwist attaches the fallback to *every* runtime-caching entry is not taken
on trust. From the built bundle (`Serwist`'s constructor):

```js
if (void 0 !== u) {                                   // u = fallbacks
  let e = new eg({ fallbackUrls: u.entries, serwist: this });
  o.forEach(t => {                                    // o = runtimeCaching
    t.handler instanceof J &&                         // any Strategy
    !t.handler.plugins.some(e => "handlerDidError" in e) &&
    t.handler.plugins.push(e)
  })
}
```

and the plugin itself:

```js
var eg = class {
  async handlerDidError(e) {
    for (let t of this._fallbackUrls)
      if ("string" == typeof t) { … }
      else if (t.matcher(e)) { let r = await this._serwist.matchPrecache(t.url); if (void 0 !== r) return r }
  }
}
```

No app-supplied plugin defines `handlerDidError` (`grep` over the bundle: the only three
occurrences are library code), so the fallback plugin is pushed into **every** entry —
including the two `NetworkOnly` API entries. The `matcher` is therefore the only thing
standing between an offline `/api/*` GET and a 200 response carrying the shell's HTML. It is
present, and §2.3 shows it works.

### 2.3 Cold offline launch, reproduced independently

Probe #2 (`probe2.mjs`), one persisted profile, four real browser processes, no code shared
with `offline-cold-launch.spec.ts`:

| Phase | Setup | Result |
|---|---|---|
| P1 online | install SW, take control, log a set, sync, then delete every non-precache bucket | buckets before: `serwist-precache-v2-…` (79 entries, has shell), `others` (holds the `/today` document), `today-bundle`, `pages-rsc-prefetch`, `pages-rsc`. After strip: precache only. |
| P2 cold offline `/today` | brand-new process, `--host-resolver-rules=MAP localhost ~NOTFOUND`, HTTP disk cache cleared over CDP, `/today` is the process's first navigation | **status 200**, `pathname /today`, `controlled true`, **`data-app-shell='offline'` marker × 1**, buckets at nav time = **precache only** |
| P2 network probes | from that same page | `/api/history` **rejected**, `/api/active-session` **rejected**, `/api/today-bundle` **rejected**, `POST /api/sync` **rejected** |
| P2 UI | | "Continue workout" visible, remote-resume banner count **0**, "Offline — showing cached data" count **1** |
| P3 cold offline `/today/workout` | another brand-new offline process, disk cache cleared, `/today/workout` first navigation | **status 200**, `pathname /today/workout`, marker × 1, previously logged set visible, **a further set logged successfully from inside the shell** |
| P5 reconnect | new online process | both offline sets present, outbox drained `{pending: 0, dead: 0}`, `sessionBlocked` banner count 0 |

The navigation returned 200 from Cache Storage in a process where every network request
failed, and the only cache bucket in existence was the precache. There is no other artefact
that could have answered it.

**Offline API requests reject rather than receiving HTML.** All four probes above rejected
with `TypeError: Failed to fetch`, in a process where the *document* navigation was
simultaneously being answered from the precache. That is the guard in §2.2 working: the same
fallback plugin was attached to the `NetworkOnly` handler and declined to fire.

**The marker is a genuine discriminator.** Measured on a live, online `/today` document:
`document.querySelectorAll("[data-app-shell='offline']").length === 0`. A leaked network
response cannot be mistaken for the shell.

**The strip step is necessary, and demonstrably so.** Probe #1 accidentally ran an online
launch between the strip and the offline launch. The `others` bucket was refilled with the
live `/today` document, and the subsequent "offline" navigation returned it — 200, marker
count 0. Any offline-shell spec that does not delete the runtime buckets first is testing
nothing. `offline-cold-launch.spec.ts` does delete them, and asserts at least one deletion
occurred.

**`/~offline` is public.** Raw HTTP against the running production server, no cookies:

```
GET http://localhost:3000/~offline  ->  status=200, Location=<none>,
                                        body contains data-app-shell, body is not the login page
```

### 2.4 Correction — the remediation report's §6 is wrong about *why* the harness works

The remediation report states that `context.setOffline(true)` "does not take a
service-worker-backed page offline … Requests issued by the service worker bypass [it] and
still reach the real server — measured, not assumed." **This is not reproducible.** Probe #4,
on a real origin with the page confirmed under service-worker control, measuring
`/api/history` (routed `NetworkOnly`, so a controlled page's fetch of it is performed *by
the service worker*):

```
1. online, SW in control:              { onLine: true,  controlled: true, swMediatedGet: "resolved:200" }
2. after context.setOffline(true):     { onLine: false, controlled: true, swMediatedGet: "rejected"     }
```

`context.setOffline(true)` **does** cut service-worker-issued requests. Probe #2 P4 confirms
it end to end: with the runtime buckets stripped and `setOffline(true)` in force, a `/today`
navigation returned **200 with marker × 1** — the precache fallback fired, which can only
happen if the worker's own `fetch` failed.

What *is* ineffective is a different thing: the **`offline: true` launch option** on
`chromium.launchPersistentContext`, which all three new specs pass. Probe #5, with no CDP
session created at all so nothing could have cleared the emulation:

```
launch option {offline:true}, no CDP: { navStatus: 200, onLine: true, controlled: true,
                                        shellMarker: 0, swMediatedGet: "resolved:200",
                                        buckets: [precache, "others"] }
```

Entirely inert: `navigator.onLine` stayed true, the navigation was served live, the
service-worker-mediated GET resolved 200, and the `others` bucket was refilled. Separately,
CDP `Network.clearBrowserCache` — which the spec's own `clearHttpDiskCache()` calls on every
offline launch — flips `navigator.onLine` back to true (probes #3 B2→B3 and #4 step 4), so
even a correctly applied `setOffline(true)` would be partially undone by the spec's own
cache-clearing step.

**Consequences for the verification:**

- The harness is **sound**. `OFFLINE_RESOLVER_ARG` does 100% of the work and genuinely
  severs page and worker alike (§2.3). No spec is invalidated and no result above is
  weakened.
- The rationale recorded in the remediation report's §6 is wrong, and the comment in
  `offline-cold-launch.spec.ts:157-158` ("`offline: true` for what the page can observe
  (`navigator.onLine`)") is wrong in practice — `navigator.onLine` reads `true` throughout
  those specs. This matters only because `src/sync/flush.ts:35` early-returns when
  `navigator.onLine === false`: with the option inert, the offline specs actually exercise
  the *attempt-and-fail* flush path, which is the more realistic one. Nothing is under-tested
  as a result.

---

## 3. Finding C — a cached bundle must never authorize Resume/Takeover

### 3.1 Neither cached representation carries the session — measured while it genuinely was in progress

Probe #1, online, service worker in control, with a real `in_progress` session on the server
(confirmed by the page rendering "Continue workout" and by the session existing in
PostgreSQL at that moment):

```
SW cached today-bundle: { present: true, activeSession: null, hasGeneratedAt: true, hasToday: true }
IDB bundleCache.activeSession: null
IDB bundleCache has today half: true
```

Both caches were blanked; `generatedAt` (staleness detection) and the `today` planning half
(the reason to cache at all) survived. The `cacheWillUpdate` plugin also refuses non-`ok`
and non-JSON responses rather than caching them unsanitized.

### 3.2 The residual production state, reproduced exactly — including a pre-fix poisoned cache

This is the condition the repository's own spec does **not** cover.
`stale-completed-session.spec.ts` asserts that a cache written by the *fixed* build is clean;
it never plants a record written by the *pre-fix* build, which is what every device in the
field is actually holding. Probe #6 does:

1. Started and synced a real workout; captured the live DTO from `/api/active-session`
   (`id 01a013c7-8f6b-7ecf-bb14-3583dd15546b`).
2. Completed it. Verified from the page: `/api/active-session` → `activeSession: null`.
   PostgreSQL now holds a `completed` session and **no `in_progress` session at all**.
3. Planted the pre-fix poison in **both** representations — IndexedDB `bundleCache` and the
   service worker's `today-bundle` cache entry — each carrying that session with
   `status: "in_progress"`. Read back and confirmed:
   `{ idbRaw: "poisoned (in_progress)", sw: "poisoned (in_progress)" }`.
4. Relaunched offline under the host resolver, so the stale caches were the only thing the
   client had.

Result:

```
{ activeSessionProbe: "rejected",        // genuinely offline, asserted not assumed
  resumeHere: 0,
  discardAndStartFresh: 0,
  alreadyInProgressBanner: 0,
  startWorkoutOffered: 1,
  continueWorkoutOffered: 0 }
{ rawIdbStillPoisoned: false, localActiveSessionHydrated: false }
```

**The completed session could not be adopted**, no takeover was offered, nothing was
hydrated into the local session store, and the planning half of the bundle remained usable
offline. The poisoned IndexedDB record was additionally rewritten clean during the render —
the offline `/api/today-bundle` fetch was answered from the (poisoned) SW cache, and
`setCachedBundle`'s write-side sanitization overwrote the record. Note what this shows: even
when a poisoned bundle *was* handed to the page, the UI ignored its `activeSession`, because
remote state now comes only from `fetchRemoteActiveSession()`. That is defence in depth
working, not a single guard holding.

### 3.3 `/api/active-session` is network-only and user-scoped

- **Never cacheable.** It matches the catch-all same-origin API entry in `src/app/sw.ts:278-286`
  (`NetworkOnly`), and the route sets `Cache-Control: no-store, must-revalidate`; the client
  additionally requests it with `cache: "no-store"`. Measured: it **rejected** in every
  offline probe (§2.3 P2, §3.2, and `stale-completed-session.spec.ts`'s own assertion).
- **User-scoped.** `route.ts` calls `requireUserId()` and 401s without it;
  `getActiveSession` filters `eq(workoutSessions.userId, userId)` **and**
  `eq(workoutSessions.status, "in_progress")` in SQL. A completed or discarded session
  cannot be returned by this endpoint at all — the client-side status check is a second,
  structural guard rather than the only one.

### 3.4 `adoptRemote` accepts only an id, re-fetches, and hydrates only `in_progress`

Verified by reading the call path end to end:

- `ActiveSessionState.adoptRemote: (sessionId: string) => Promise<AdoptRemoteOutcome>` —
  the signature makes it structurally impossible for the caller to supply the state that
  gets written.
- `adoptRemote` calls `fetchRemoteActiveSession()` immediately before the write;
  `status !== "fresh"` ⇒ `"unreachable"`, `!isAdoptableRemoteSession(live, sessionId)` ⇒
  `"gone"`. Neither branch writes anything.
- `hydrateFromServer` **throws** on any status other than `in_progress` — a third guard,
  independent of the first two.
- `TodaySection.handleTakeover` (the destructive branch) re-reads the same way before
  `discard`, and discards `live.activeSession.id`, not the id on screen.
- `remote` is derived solely from `remoteState.kind === "fresh"`; `unavailable` yields
  `null`, so neither Resume nor Takeover can render. No component reads
  `bundle.activeSession` any more (`grep` over `src/**/*.tsx`: the only `activeSession`
  references in the UI are `remoteState`/`live` ones in `TodaySection`).

### 3.5 Offline/stale hides remote resume — but local IndexedDB resume still works

Measured in §2.3 P2: offline, in a cold process, `Continue workout` **visible** (local
session, driven by IndexedDB) while the remote-resume banner count was **0**. The fix does
not take the offline outbox's whole point away. `TodayBundleDto.activeSession` is still
served on a live response and is documented as not-for-client-use, with the two enforcement
points named — accurate as written.

---

## 4. Finding D — contiguous set numbering

### 4.1 Both deletion paths renumber, atomically

- `planSetDeletion` is pure, sorts survivors by `setNumber`, renumbers to `1..n`, and
  returns `renumbered` **ascending by new number**; it does not mutate its input.
- `buildSetDeletionOps` emits **delete first, then one full-row upsert per renumbered set in
  ascending order**, and emits nothing at all when the id is absent.
- In-session (`src/sync/activeSession.ts` `deleteSet`): the mutated aggregate and every op
  go through `commitSessionMutation`, i.e. **one IndexedDB transaction** across
  `activeSession` + `outbox` — a process death cannot leave the delete queued without its
  renumbering, nor the aggregate updated without the ops.
- Post-completion (`src/sync/corrections.ts` `deleteHistorySet`): `enqueueOps` writes the
  whole group in **one IndexedDB transaction**.
- `HistoryDetail` applies `planSetDeletion(...).remaining` optimistically, so a second
  deletion in the same screen session plans from correctly renumbered state.
- Server-side, `applySetLogUpsert` rejects only `discarded` sessions, so post-completion
  renumbering of a `completed` session is permitted by design (`domain-model.md §7`).

### 4.2 Ordering survives the queue

- `listPendingOps` orders by the `byCreatedAt` index. Ops built in the same millisecond
  share `createdAt`, and IndexedDB breaks index-key ties by primary key — here `opId`,
  generated by monotonic uuidv7. A unit test asserts the generated `opId`s are strictly
  ascending with the real factory.
- `flushOutbox` posts up to 50 pending ops in that order; `applySyncBatch` applies them
  **strictly in array order, one transaction per op**. A batch boundary splitting a group is
  harmless: order is preserved across batches and each op commits independently.

### 4.3 The deferrable constraint — verified in the live Docker database, not just the migration

```
conname       | contype | condeferrable | condeferred | def
uq_set_number | u       | t             | t           | UNIQUE (session_exercise_id, set_number) DEFERRABLE INITIALLY DEFERRED
```

and its actual timing, exercised in a transaction that was rolled back (rows verified
unchanged afterwards):

```
UPDATE set_logs SET set_number = 2 WHERE id = <the row holding 1>;
-> UPDATE 1                       -- statement SUCCEEDED: the check is deferred
SELECT set_number, count(*) …     -> set_number 2 appears twice
COMMIT;
-> ERROR: duplicate key value violates unique constraint "uq_set_number"
   DETAIL: Key (session_exercise_id, set_number)=(…, 2) already exists.
post-state: 1 -> 105.00, 2 -> 107.50   (unchanged)
```

The constraint is valid, deferred, and enforced at COMMIT. See R9 for a nuance about how
much of the fix this property actually carries.

### 4.4 Convergence in real PostgreSQL

The e2e suite cannot assert numbering — the History screen never renders set numbers, only
weight × reps (§7, R2). So the stored numbering was read directly out of Docker PostgreSQL
after the suite ran. The `set-deletion` spec logs 100 / 102.5 / 105 / 107.5, deletes the
**first** in-session (renumbering all three survivors), completes, then deletes the first
survivor again **from History**:

```
session_id                           | status    | set_number | weight_kg | reps
01a013b6-194a-7c93-be0f-f08ce078ca5b | completed |          1 |    105.00 |    5
01a013b6-194a-7c93-be0f-f08ce078ca5b | completed |          2 |    107.50 |    5
```

Contiguous `1,2`, correct weights on the correct rows, nothing missing, nothing duplicated —
through **both** deletion paths, with the outbox drained to `{pending: 0, dead: 0}`. This is
the pre-fix symptom (`1,3,4` forever) directly disproved in the real engine.

The PGlite integration tests additionally establish that applying the same ops in
**descending** order is rejected with `set_number_conflict`, so the ascending order is
load-bearing rather than incidental; that replaying the whole batch is idempotent; and that a
completed session renumbers.

---

## 5. Full suite, run once (corroboration only)

All against the local Docker PostgreSQL and a production build served by `pnpm start`.

| Gate | Result | Matches remediation report? |
|---|---|---|
| `pnpm typecheck` | pass (exit 0) | yes |
| `pnpm typecheck:sw` | pass (exit 0) | yes |
| `pnpm lint` | pass (exit 0) | yes |
| `pnpm format:check` | **fail (exit 1)** — 3 files: `CLAUDE.md`, `gpt-handoff.md`, `gpt-memory.md` | yes — none from this work; §7.4 of that report is accurate |
| `pnpm build` | pass (exit 0) | yes |
| `pnpm test:unit` | **212 passed** (17 files) | yes |
| `pnpm test:integration` | **113 passed** (9 files) | yes |
| `pnpm test:e2e` | **9 passed** (9 tests, 30.9s) | yes |

Focused runs, before the full ones: `setDeletion` + `remoteActiveSession` + `middleware` →
35 passed; `sync.integration.test.ts` → 13 passed, including all six new
`set deletion renumbering` cases.

Every number in the remediation report's gate table reproduced exactly.

---

## 6. Challenges to the new tests

Each risk the brief names, tested rather than argued.

| Risk | Verdict | Basis |
|---|---|---|
| Leaked network access | **Not present** | Probe #2 P2/P3: four independent fetch probes (including a POST, which no SW route matches and which therefore uses the page's own network stack) all rejected in the same process where the navigation returned 200. |
| Uncontrolled service-worker pages | **Handled** | `clientsClaim: false` means the installing page is never controlled; `waitForServiceWorkerControl` reloads until `navigator.serviceWorker.controller` is set. Probes confirm `controlled: true` at every point where a cache or SW-mediated result is asserted. Without this the Finding C cache assertions would read an empty cache. |
| Cached HTTP response masquerading as the shell | **Not present** | The `data-app-shell` marker is absent from a live `/today` (measured, count 0) and present on the offline one (count 1). Probe #1's accidental refill shows exactly what a leak looks like: 200, marker 0. The HTTP disk cache is cleared over CDP before each offline launch, and Cache Storage is stripped to the precache. |
| Assertions passing before sync completes | **Not present** | `waitForOutboxDrained` requires `{pending: 0, dead: 0}` — a dead-lettered op fails it rather than counting as drained. Every call site follows a UI assertion that can only be true after `commitSessionMutation` resolved, i.e. after the ops are already in the outbox, so there is no empty-queue-too-early window. Corroborated by §4.4 reading the converged state out of PostgreSQL rather than trusting the drain. |
| Spec passes for the wrong reason (harness) | **Rationale wrong, harness sound** | §2.4. `offline: true` is inert; the resolver arg is what works, and it does. |
| Test cannot fail | **One case: yes** | R2 — the set-deletion e2e would still pass if renumbering were removed entirely. Covered elsewhere (unit, PGlite, §4.4). |

---

## 7. Residual risks

**R1 — Data already written stays non-contiguous. ACCEPTED — no action will be taken.**
The fix corrects future deletions; it does not repair rows already stored. Any existing
workout with sets numbered `1, 3, 4` will stay `1, 3, 4` until another set in that same
exercise is deleted, at which point `planSetDeletion` repairs the whole run (covered by the
"repairs numbering that was already non-contiguous" unit test).

**Disposition (2026-08-18):** accepted as-is. The affected rows are test data from
pre-fix runs, not real training history worth preserving the numbering of. **No backfill
migration will be written and no manual production repair will be performed.** This risk is
closed, not outstanding — it needs no revisiting during the iPhone acceptance run beyond
not mistaking pre-existing `1, 3, 4` rows for a failure of the fix (see §9, step 3).

**R2 — The set-deletion e2e cannot detect missing renumbering. (Low; test coverage)**
History renders `weight × reps`, never the set number, so the spec asserts survivor labels,
row count and zero dead letters. If `buildSetDeletionOps` regressed to emitting only the
delete op, the spec would still pass. Contiguity is covered by 14 unit tests, 6 PGlite
integration tests and — now — the direct PostgreSQL read in §4.4.

**R3 — The 4s remote-check timeout bounds headers, not the body. (Low; hang)**
`fetchRemoteActiveSession` clears its `AbortController` timer in a `finally` that runs as
soon as `fetch` resolves, i.e. before `response.json()`. A connection that delivers headers
and then stalls is unbounded; `remoteState` stays `{kind: "checking"}` and `TodaySection`
renders "Loading…" indefinitely, because the remote check is part of the loading gate. The
remediation report's "Today cannot hang behind a `NetworkOnly` request on a flaky
connection" is stronger than what the code guarantees. Low probability (a tiny same-origin
JSON body), but it is the one path that can wedge the Today screen.

**R4 — §3 of the remediation report overstates the unit coverage. (Low; documentation)**
There are indeed 13 tests over `fetchRemoteActiveSession`/`isAdoptableRemoteSession`, but
none exercises `REMOTE_CHECK_TIMEOUT_MS` or the abort path; the enumeration lists "timeout"
among them. The rejected-fetch test covers a different failure.

**R5 — The offline shell's revision can miss a server-only change. (Low; staleness)**
`/~offline`'s precache revision is derived from the hashes of every *other* manifest entry. A
change affecting only server-rendered output — e.g. text in the `(app)` layout — need not
alter any client chunk hash, leaving the precached shell stale until some other asset
changes. Any change that touches client code does bump it.

**R6 — Chromium ≠ WebKit. (Unchanged; this is the gate)** The reported failure was
Safari/iOS. The mechanism is standard Service Worker API with no Chromium-specific surface,
but iOS storage eviction, the `~` in `/~offline`, and Safari's handling of a `respondWith`
served from precache are not exercised by any of this. Only the iPhone settles it.

**R7 — The shell answers document requests for `/login` too. (Very low)** An offline,
logged-out user gets the app shell instead of a login page. Offline login is impossible
anyway, so this is cosmetic.

**R8 — Windows-built precache manifest contains backslash icon URLs. (Pre-existing)**
Reproduced: `'/icons\\icon-192.png'` etc. in `public/sw.js`. Traced to `@serwist/next`'s own
`public/` glob, not to this work, and would affect a Windows-produced bundle only.

**R9 — `DEFERRABLE` is not what makes the renumbering work. (Documentation nuance)** Because
the sync API runs one statement per transaction and the upserts ascend, no intermediate state
ever violates `uq_set_number` — an `INITIALLY IMMEDIATE` constraint would behave identically
on this path. The **ordering** is load-bearing; the deferral is not (it would only matter if
several renumber statements shared a transaction). The integration test proves the right
thing (descending order → `set_number_conflict`); §4 of the remediation report attributes
more to the constraint than it carries.

---

### 7.1 Closeout — what was corrected in the tree

Documentation and comments only; no behavioural code was changed and no test logic was
touched. Committed alongside this report:

| File | Correction |
|---|---|
| `docs/reviews/phase-3-device-acceptance-remediation.md` | §6 rewritten (setOffline vs. the inert launch option vs. the resolver rule); §3 timeout scope + unit-coverage claim; §4 deferral vs. ordering |
| `tests/e2e/helpers.ts` | `OFFLINE_RESOLVER_ARG` comment: names the launch option as the inert mechanism, records that `setOffline` works, states why the resolver is used anyway |
| `tests/e2e/offline-cold-launch.spec.ts` | header + launch-site + `clearHttpDiskCache` comments: `offline: true` is inert, `Network.clearBrowserCache` resets `navigator.onLine` |
| `tests/e2e/stale-completed-session.spec.ts` | launch-site comment: the resolver severs, the option does not, the condition is asserted not assumed |
| `tests/e2e/set-deletion.spec.ts` | header no longer credits `DEFERRABLE` with enabling the fix |
| `tests/integration/sync.integration.test.ts` | descending-order test: records what it does *not* show about deferral |
| `src/sync/remoteActiveSession.ts` | `REMOTE_CHECK_TIMEOUT_MS`: bounds headers only, stalled body unbounded, no direct timeout/abort unit coverage |
| `src/domain/sync/setNumbering.ts` | ordering is load-bearing; `DEFERRABLE` is not required for one-statement-per-transaction |
| `src/domain/sync/setDeletionOps.ts` | same, cross-referenced |

R1's disposition (§7) was recorded as accepted at the same time. R2–R9 remain as written;
none is an action item beyond the iPhone run.

---

## 8. Notes on the verification itself

**8.1 The tree was committed mid-verification.** Work began against the dirty working tree
described in the brief. Partway through, commit `d9a6a3f` ("Fix cold-offline launch, stale
session resume, and set renumbering") appeared, created outside this session, moving all 29
files into history. The commit's contents are byte-identical to the working tree that was
reviewed (same per-file line counts: `next.config.ts` +35, `src/app/sw.ts` +69, and so on),
so no analysis was invalidated; the diff baseline simply moved from "uncommitted" to
`2c02b00..d9a6a3f`.

**8.2 Nothing in the repository was modified by this verification.** `git status` after the
run shows only the pre-existing user-owned entries (`CLAUDE.md` modified, `HANDOFF.md`
deleted, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md` untracked) plus this
report. `pnpm build` regenerated `public/sw.js`, which is untracked and git-ignored. All six
probes live outside the repository. The one SQL experiment that wrote anything (§4.3) was
rolled back and the affected rows verified unchanged.

**8.3 Test data.** The probes leave the shared dev database with additional `completed` and
`discarded` sessions (they clean up their in-progress sessions; §3.2 deliberately leaves one
completed session, which is the point of that probe). No `in_progress` session is left
behind, so the next suite run starts clean.

---

## 9. Remaining manual iPhone acceptance script

This is the gate. Three steps, in this order, on the real device against the deployed build.
Each step's expectation is written so that a pass is unambiguous.

**Step 1 — Cold offline launch (Finding A).**
Online: open the PWA, start a workout, log one set, wait for it to sync. Enable Flight Mode.
Log two more sets. **Force-quit the app** — swipe it away from the app switcher; backgrounding
it is not the same thing and does not test this. Reopen it, still in Flight Mode.
*Expected:* Today opens. No "Safari can't open the page", no `no-response` error. The
"Offline — showing cached data" notice appears, "Continue workout" is offered, and opening it
shows **all three** sets and accepts a fourth.
*If it fails:* check whether Cache Storage still holds `/~offline` at all. iOS evicts PWA
storage aggressively, and eviction produces the same `no-response` symptom as the original
bug — but with an empty precache bucket rather than a missing fallback rule, which is how
the two are told apart.

**Step 2 — Stale completed session (Finding C).**
With that workout synced and **completed**, put the phone back in Flight Mode and reopen the
app (do not clear anything — the stale cache is the point).
*Expected:* no "Resume here" and no "Discard it & start fresh" anywhere on Today; Today
offers "Start workout". Then leave Flight Mode: History updates and nothing dead-letters (no
"The server rejected this workout's changes" banner).
*Note:* this is the one step whose pre-fix cache state cannot be recreated after the new
build installs — if the phone has already updated, the poisoned-cache case is covered by
§3.2 instead, and this step then verifies only the post-fix behaviour.

**Step 3 — Set deletion (Finding D).**
Log four sets in one exercise, delete the **second**, complete the workout, reconnect.
*Expected:* History shows three sets, in the original order minus the deleted one. Because
the History screen does not display set numbers (R2), confirm the numbering is `1, 2, 3` and
not `1, 3, 4` by checking PostgreSQL directly, or by deleting one more set from History and
confirming it still leaves a clean, gap-free list after a reload.
*Also check:* any pre-existing workout still holding `1, 3, 4` is expected and accepted
(R1) — it is pre-fix test data, will not be repaired, and is not a failure of this fix.
