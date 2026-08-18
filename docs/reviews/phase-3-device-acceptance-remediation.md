# Phase 3 — device-acceptance remediation

Date: 2026-08-17
Branch: `main` (working tree only — nothing committed, pushed or deployed)
Scope: findings **A (HIGH)**, **C (HIGH)** and **D (LOW)** from the device-acceptance
review, implemented against the local Docker PostgreSQL 16 instance.

**Verdict: READY FOR INDEPENDENT DEVICE-ACCEPTANCE VERIFICATION.**

The three findings are implemented and covered by automated tests that fail without the
fixes. Those tests were written by the same author as the fixes and are not an
independent verification of them; the real-iPhone offline acceptance run remains the
gate, and §7 lists exactly what it still has to establish.

---

## 1. What was wrong

| # | Severity | Symptom on the device |
|---|---|---|
| A | HIGH | After logging offline, force-quitting the PWA and reopening it still offline: `FetchEvent.respondWith received an error: no-response … {"url": ".../today"}` — "Safari can't open the page". |
| C | HIGH | PostgreSQL held exactly one session, status `completed`, and no `in_progress` session at all, yet the phone offered "Resume here", adopted the completed session, and dead-lettered every subsequent set with `session_locked`. |
| D | LOW | Deleting set 2 of 4 left `1, 3, 4` on the device and in PostgreSQL, permanently. |

---

## 2. Finding A — cold offline launch

### Cause

A genuinely cold browser process asked the service worker for the `/today` **document**
and the worker had nothing to answer with. `/today` was only ever answerable from the
"others" `NetworkFirst` runtime cache, which requires that *some earlier process*
happened to navigate there (and which expires after 24h). Nothing in the SW was
independent of that history, so `respondWith` rejected — `no-response`.

### Fix

- **New precached app shell** `src/app/(app)/~offline/page.tsx` + `src/ui/OfflineShell.tsx`.
  It lives inside the `(app)` route group so it inherits the same chrome, `SyncBootstrap`
  and `SyncStatusBanner` as the routes it stands in for, and it derives which view to
  render from `window.location.pathname` **after mount** — Next's canonical URL from the
  prerendered flight payload always says `/~offline`, while the address bar (and the
  request the SW intercepted) says `/today` or `/today/workout`. Deferring to an effect
  also keeps server and first client render identical, so there is no hydration mismatch.
- **`next.config.ts`** adds `/~offline` to the precache manifest via `manifestTransforms`,
  **not** `additionalPrecacheEntries` — `@serwist/next` already uses the latter for its
  `public/` glob, and supplying our own would silently replace it and drop the precached
  icons. Its `revision` is derived from the hashes of every other entry in the build, so
  it changes exactly when the shell's script tags could have changed.
- **`src/app/sw.ts`** declares `fallbacks.entries` for that URL, guarded by
  `request.destination === "document"`. The guard is load-bearing: serwist pushes a
  `PrecacheFallbackPlugin` into **every** `runtimeCaching` entry whose handler has no
  `handlerDidError`, including the `NetworkOnly` API entries. Without it an offline
  `/api/*` GET would *resolve* with the shell's HTML instead of rejecting, which is
  precisely what HIGH-5's offline detection relies on.
- **`src/middleware.ts`** makes `/~offline` public. The SW fetches it at install time with
  whatever cookies exist (possibly none, e.g. a first install before login); a 307 there
  would precache the login page as the app shell, undetectably.
- `WorkoutExecution` and `TodaySection` accept an optional `navigate` prop, supplied only
  by the shell. Inside the shell a `router.push` would fetch an RSC payload that offline
  has no cache for; a full document navigation re-enters the SW, gets the same shell back,
  and the shell re-derives the view.

### Evidence

`tests/e2e/offline-cold-launch.spec.ts` — four real browser processes over one persisted
profile:

1. **online**: install the SW, take control, leave a real in-progress session in IndexedDB,
   then **delete every Cache Storage bucket except the precache** (asserting at least one
   was deleted, so the spec cannot pass vacuously).
2. **offline, brand-new process**, HTTP disk cache cleared over CDP, navigating *directly*
   to `/today` as its first navigation: response **200**, the served document carries the
   `data-app-shell="offline"` marker, `pathname` is still `/today` (served *for* the route,
   not redirected), the offline banner renders, "Continue workout" comes from IndexedDB,
   no remote resume is offered, and `fetch("/api/history")` **rejects** (the document guard).
3. **offline, another new process**, directly into `/today/workout`: shell marker again,
   the previously logged set is visible, and a further set logs successfully.
4. **online again** (necessarily another process — see §7.1): everything from both offline
   launches converges with zero dead letters.

A `data-app-shell="offline"` marker was added to the shell page because a live `/today`
document and the shell render an identical screen — without it, a network response that
leaked through would look exactly like a pass. That marker is what turned this spec from
"probably right" into a real assertion (§7.1).

---

## 3. Finding C — a cached bundle must never authorize Resume/Takeover

### Cause

`/api/today-bundle` carried `activeSession`, and that value reached the UI through two
caches: the SW's `today-bundle` `NetworkFirst` cache and the IndexedDB bundle cache. Both
outlive the fact they describe. A copy captured while the session really was `in_progress`
can never learn that the server has since completed or discarded it — so the UI offered,
and adopted, a finished session.

### Fix

Five changes, each closing one step of that path:

1. **No cached representation carries the session.**
   - `src/app/sw.ts`: a `cacheWillUpdate` plugin rewrites the today-bundle response
     *on the way into the cache*, forcing `activeSession: null`. `NetworkFirst` hands the
     caller the untouched network response and clones it for `cachePut`, so a live fetch
     still sees the real value. `generatedAt` is preserved so staleness detection keeps
     working. Non-JSON or non-`ok` responses are refused rather than cached unsanitized.
   - `src/sync/bundleCache.ts`: the same blanking on **write and on read**. Read-side
     sanitization is deliberate — devices in the field already hold a poisoned record, and
     this heals them on the next launch with no migration and no IndexedDB version bump.
2. **Remote state comes only from a fresh, uncacheable source.** New
   `GET /api/active-session` (`no-store`), routed `NetworkOnly` by the SW, read only
   through `src/sync/remoteActiveSession.ts`. Offline it returns `unavailable` — which is
   modelled as a *third* state, not as "nothing in progress". `!response.ok` (including a
   401 from an expired cookie) is `unavailable` too, and the call carries a 4s abort
   timeout. **That timeout bounds receipt of the response headers only.** `clearTimeout`
   runs in a `finally` as soon as `fetch` resolves, i.e. before `response.json()`, so a
   connection that delivers headers and then stalls its body is *not* bounded — Today's
   loading gate keeps `remoteState: "checking"` and renders "Loading…" indefinitely. Low
   probability for a tiny same-origin JSON body, but it is not the "Today cannot hang"
   guarantee an earlier draft of this document claimed. See the verification report's R3.
3. **Revalidate immediately before adopting, and require `in_progress`.**
   `adoptRemote` now takes an **id, not a session object** — the caller is structurally
   unable to supply the state that gets written. It re-reads from the server and writes
   only if `isAdoptableRemoteSession` holds: same id, still `in_progress`. Outcomes are
   `adopted` / `gone` / `unreachable`; neither of the latter two ever produces a local
   session. Takeover (the destructive branch) re-reads the same way before discarding.
4. **Offline or stale ⇒ no remote resume/takeover.** `TodaySection` models remote state as
   `checking | unavailable | fresh`, and only `fresh` can yield a session. A **local**
   IndexedDB session stays resumable regardless of what the server can be asked right now —
   that is the entire point of the offline outbox, and the fix does not take it away.
5. **`sessionBlocked` copy corrected.** The old text asserted a cause it cannot know ("it
   conflicts with a session on another device"), which is misleading in a single-account
   app (ADR-004). The new text states the fact, the consequence, and the consequence of
   discarding — that anything which never synced won't appear in History.

`TodayBundleDto.activeSession` is still served on a live response (removing it would
change verified Phase 3 behaviour) but is documented as not-for-client-use, with the
enforcement points named.

### Evidence

`tests/e2e/stale-completed-session.spec.ts` — the exact regression, over device A (a
context) and device B (a persisted profile, relaunched three times):

- A starts a workout and syncs it; the server holds one `in_progress` session.
- B sees it live and caches the planning bundle — and **both** cached representations are
  asserted to hold `activeSession: null` *while the session genuinely is in progress*.
  That is the invariant that makes the stale resume impossible rather than merely
  unlikely: there is no cached artefact left that could authorize one.
- A completes it. PostgreSQL now has no `in_progress` session while B's caches still
  describe that world — the exact production state.
- B reopens **offline** (asserted, not assumed: `/api/active-session` rejects): no "Resume
  here", no "Discard it & start fresh", no in-progress banner, `activeSession` in IndexedDB
  is `null` (nothing hydrated behind the scenes), and "Start workout" is still offered from
  the cached planning half.
- B back online: still no resume, and a fresh workout logs and drains with **zero dead
  letters** — pre-fix, everything after the stale adopt was rejected `session_locked`.

Plus 13 unit tests over `fetchRemoteActiveSession` / `isAdoptableRemoteSession` (non-`ok`,
401, 5xx, non-JSON, rejected fetch, `no-store`, completed/discarded/absent session, wrong
id, non-`in_progress` status) and a middleware test that the app shell stays reachable
unauthenticated.

**Not covered:** none of those 13 exercises `REMOTE_CHECK_TIMEOUT_MS` or the
`AbortController` path — the rejected-fetch case is a different failure. An earlier draft
of this document listed "timeout" among them; that was wrong. See the verification
report's R4.

---

## 4. Finding D — contiguous set renumbering

### Fix

- `src/domain/sync/setNumbering.ts` — `planSetDeletion`, pure and structural (anything with
  `id` + `setNumber`), returns `{ deleted, remaining, renumbered }` where `remaining` is
  renumbered to a contiguous `1..n` and `renumbered` is **ascending by new number**.
- `src/domain/sync/setDeletionOps.ts` — `buildSetDeletionOps` turns that plan into the
  outbox ops: **delete first, then one full-row upsert per renumbered set in ascending
  order**. The sync API applies one DB transaction per op, so `uq_set_number` is checked at
  each op's own COMMIT — ascending order is what guarantees every target number has already
  been vacated. **The ordering is the load-bearing property, not the deferral.** Because
  each op is a single statement in its own transaction, no intermediate state ever holds a
  duplicate, so an `INITIALLY IMMEDIATE` constraint would behave identically on this path;
  `uq_set_number` being `DEFERRABLE INITIALLY DEFERRED` (migration 0004) would only start
  to matter if several renumber statements ever shared one transaction. An earlier draft of
  this document credited the deferral with making the renumbering possible; it does not.
  The ordering is not cosmetic and is tested as such. See the verification report's R9.
- `src/sync/outbox.ts` — new `enqueueOps` writes a whole group in **one IndexedDB
  transaction**, so a process death mid-write cannot leave the queue holding a delete
  without its renumbering. In-session deletion commits the mutated aggregate and the ops
  together; FIFO order is preserved by `createdAt`/`opId`, both monotonic.
- Both deletion paths use it: `src/sync/activeSession.ts` (in-session) and
  `src/sync/corrections.ts` (post-completion History). `HistoryDetail` applies the same
  renumbering optimistically, so the screen shows what PostgreSQL will hold.

### Evidence

Three layers:

- **14 unit tests** (`tests/unit/setDeletion.test.ts`) — first/middle/last/only/absent,
  op ordering, id generation.
- **6 PGlite integration tests** (`tests/integration/sync.integration.test.ts`) against
  real SQL: first/middle/last deletion each leave `1,2,3` with the right rows and weights;
  a completed session renumbers too; the batch is idempotent on replay; and — the
  load-bearing one — **applying the same ops in descending order is rejected with
  `set_number_conflict`**, proving the ascending order is what makes this work rather than
  a coincidence.
- **1 e2e** (`tests/e2e/set-deletion.spec.ts`) — logs four sets, deletes the **first**
  (the case that renumbers every survivor and would collide if the order regressed),
  drains with zero dead letters, completes, and checks History (served straight from
  PostgreSQL, ordered by `set_number`) holds exactly three rows: none missing, none
  duplicated. Then deletes again from History and re-checks after a reload.

---

## 5. Gate results

All run locally against the Docker PostgreSQL 16 instance (`gym-app-db-1`, `localhost:5432`)
and a production build served by `pnpm start`.

| Gate | Result |
|---|---|
| `pnpm format:check` | 3 pre-existing warnings, none of them mine — see §7.4 |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm typecheck:sw` | pass |
| `pnpm test:unit` | **212 passed** (17 files) |
| `pnpm test:integration` | **113 passed** (9 files) |
| `pnpm test:e2e` | **9 passed** (9 tests) |
| `pnpm build` | pass |

### Files changed

Modified: `next.config.ts`, `src/app/sw.ts`, `src/middleware.ts`, `src/server/today/service.ts`,
`src/sync/{activeSession,activeSessionStore,bundleCache,corrections,outbox,types}.ts`,
`src/ui/today/TodaySection.tsx`, `src/ui/workout/WorkoutExecution.tsx`,
`src/ui/history/HistoryDetail.tsx`, `tests/e2e/helpers.ts`,
`tests/integration/sync.integration.test.ts`, `tests/unit/middleware.test.ts`.

Added: `src/app/(app)/~offline/page.tsx`, `src/ui/OfflineShell.tsx`,
`src/domain/pwa/offlineShell.ts`, `src/app/api/active-session/route.ts`,
`src/sync/remoteActiveSession.ts`, `src/domain/sync/{setNumbering,setDeletionOps}.ts`,
`tests/unit/{setDeletion,remoteActiveSession}.test.ts`,
`tests/e2e/{offline-cold-launch,stale-completed-session,set-deletion}.spec.ts`.

No migrations, no schema changes, no firewall changes, no production access, no commits.

---

## 6. A test-harness defect found and fixed along the way

> **Corrected 2026-08-18** by the independent verification pass (§2.4 of
> `phase-3-device-acceptance-remediation-verification.md`). The original text of this
> section blamed the wrong mechanism. The harness is sound and no spec changed; the
> explanation below is the measured one.

Worth recording because it invalidates the naive way of writing any offline PWA test, and
two of the specs here were initially wrong because of it.

**What is actually ineffective is the `offline: true` *launch option* on
`chromium.launchPersistentContext`.** Measured with no CDP session in play, so nothing
could have cleared it: `navigator.onLine` stays `true`, the navigation is served live, a
service-worker-mediated `/api/history` GET resolves 200, and the `others` runtime bucket is
refilled. It is inert. All three offline specs pass it, so in them it contributes nothing.

**`context.setOffline(true)` — the *method* — does work, including on a
service-worker-controlled page.** Measured on a real origin with
`navigator.serviceWorker.controller` set, fetching `/api/history` (routed `NetworkOnly`, so
a controlled page's fetch of it is performed *by the service worker*): `resolved:200`
online, `rejected` immediately after `setOffline(true)`; and with the runtime buckets
stripped, a `/today` navigation under it returns 200 carrying the `data-app-shell` marker,
which can only happen if the worker's own `fetch` failed. An earlier draft of this document
asserted the opposite; that claim was wrong.

One further subtlety, and the likely origin of the original mistake: CDP
`Network.clearBrowserCache` — which `clearHttpDiskCache()` calls on every offline launch —
flips `navigator.onLine` back to `true`, so even a correctly applied `setOffline(true)`
would be partly undone by the specs' own cache-clearing step.

The mechanism the specs actually rely on is `OFFLINE_RESOLVER_ARG` in
`tests/e2e/helpers.ts`: `--host-resolver-rules=MAP localhost ~NOTFOUND`. The host resolver
lives in the browser's shared network service, so it cuts page and worker alike, while the
**origin is unchanged** — which is what keeps the SW registration, Cache Storage, IndexedDB
and the secure context service workers require. Independently re-verified: in a cold
process under the rule, with only the precache bucket in existence, `/today` is answered
200 from the precache while `/api/history`, `/api/active-session`, `/api/today-bundle` and
a `POST /api/sync` all reject. It provides the real cold-launch isolation.

A third point, unaffected by the correction: deleting every non-precache Cache Storage
bucket before an offline launch is mandatory. An online launch refills `others` with the
live `/today` document, which then answers the "offline" navigation — 200, and no shell
marker. Any offline-shell spec that skips that strip is testing nothing.

A second harness subtlety: `src/app/sw.ts` sets `clientsClaim: false` by design, so the
page that *installs* the worker is never controlled by it — its requests never reach the
SW and nothing it fetches is cached. `waitForServiceWorkerControl` (new, in `helpers.ts`)
reloads until `navigator.serviceWorker.controller` is set. Without it the SW-cache
assertions in the Finding C spec were checking a cache that was empty for an unrelated
reason.

---

## 7. Limits — what this does *not* establish

**7.1 These tests are not an independent verification.** They were written by the author of
the fixes, in the same session. They are strong regressions — each was observed failing
against a real defect, and the cold-launch spec was rewritten once specifically because it
was passing for the wrong reason — but the device acceptance run is still the gate.

**7.2 Chromium ≠ WebKit.** The reported failure was Safari/iOS. The precache-plus-document-
fallback mechanism is standard Service Worker API with no Chromium-specific surface, but
iOS PWA storage eviction, the `~` in `/~offline`, and Safari's handling of a
`respondWith` from precache are **not** exercised by this suite. Only the real iPhone can
settle that.

**7.3 A ≤10s window where an offline screen is not marked stale.** `STALE_THRESHOLD_MS` is
10s, so a SW-cached bundle younger than that renders without the "showing cached data"
banner. This is pre-existing HIGH-5 behaviour, unchanged here, and it does **not** affect
resume safety — remote state comes from the network-only endpoint, which fails offline
regardless of the bundle's age. It is why the Finding C spec asserts the offline condition
via `/api/active-session` instead of via the banner: in a suite that runs in seconds, the
cached bundle is legitimately fresh.

**7.4 `pnpm format:check` is red on three files, none of them from this work.**
`CLAUDE.md` (a user edit in the working tree) and the two excluded `gpt-*.md` files. Left
untouched deliberately — the gpt files are excluded by instruction and `CLAUDE.md` is the
user's. Every file this work touched is formatted.

**7.5 Pre-existing, Windows-build-only:** the built `public/sw.js` contains icon precache
URLs with backslashes (`/icons\icon-192.png`). Traced to `@serwist/next`'s own `public/`
glob (`dist/index.mjs` lines 195-208), which uses `globSync` results verbatim regardless of
`manifestTransforms`. Not introduced by this work and not addressed by it; it would affect
a Windows-produced bundle only.

---

## 8. Suggested device acceptance script

The two conditions that produced the original reports, in the order that isolates them:

1. **Cold offline launch.** Online: open the PWA, start a workout, log a set, let it sync.
   Enable flight mode. Log two more sets. **Force-quit the app** (swipe away, don't just
   background it). Reopen, still in flight mode. Expected: Today opens — no "Safari can't
   open the page" — shows "Continue workout", and the workout screen still holds all three
   sets and accepts more.
2. **Stale completed session.** With that offline session synced and **completed**, open
   the app on a second device or after clearing nothing at all, then go offline and reopen.
   Expected: no "Resume here" and no "Discard it & start fresh" anywhere; Today offers
   "Start workout". Then reconnect: History updates, and nothing dead-letters.
3. **Set deletion.** Log four sets, delete the second, complete, reconnect. Expected: History
   shows three sets and the numbering is 1, 2, 3 — not 1, 3, 4.

If step 1 reproduces on iOS despite passing here, the next thing to check is whether the
`/~offline` entry survived in Cache Storage at all (iOS evicts aggressively), which is
distinguishable from the old failure: eviction yields the same `no-response`, but with an
empty precache bucket rather than a missing fallback rule.
