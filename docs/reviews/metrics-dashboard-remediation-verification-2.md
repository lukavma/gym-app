# Metrics Dashboard v1 / Phase 9a — Second Targeted Remediation Verification

Date: 2026-09-07
Role: closure check on the single item left open by `docs/reviews/metrics-dashboard-remediation-verification.md` (2026-09-06, verdict `REMEDIATION INCOMPLETE`) — **RV-1**, the racy L-4 end-to-end test — and on the report corrections that verification required, as delivered by §9 of `docs/reviews/metrics-dashboard-remediation.md` (the 2026-09-07 follow-up addendum).
Scope: RV-1 and the required corrections only. No settled finding, owner decision, or protected boundary was reopened.
Method: read-only with respect to the implementation and to every existing report. Reported results were re-derived rather than accepted: I reproduced the original race myself as a negative control, instrumented the new controls, and proved the assertion cannot pass without the behaviour it names. No commit, push, deploy, production contact, or device acceptance was performed.

---

## 1. Verdict

# `VERIFIED — READY FOR DEVICE ACCEPTANCE`

RV-1 is closed, and closed at the cause. The L-4 test now runs in a dedicated browser context with the service worker blocked and a route allowlist that aborts every request outside its own flow, so no unrelated authenticated response can re-issue the rolling session cookie between `clearCookies()` and the Refresh click. Crucially, the test also stopped inferring the outcome from the UI: it now waits for the **real** `GET /api/metrics` the click issues and asserts `status === 401` before asserting the banner, so it can no longer pass — or fail — on anything but the intended behaviour.

I verified this against a clean disposable PostgreSQL 16 and a production build:

- **L-4 alone, `--repeat-each=20` → 20/20.**
- **`metrics.spec.ts --repeat-each=10` (130 tests) → 130/130.**
- **Full Playwright suite → 112/112, three consecutive runs.**
- **Negative control (my own, not the report's):** the *old* approach — default context, no allowlist — still returns **200 instead of 401 in 5 of 16 iterations** (~31 %), reproducing RV-1 exactly and proving the new controls are what removes the race.
- **Instrumented replication of the shipped controls:** **16/16 real 401s**, and **no `Set-Cookie` reached the cookie jar from any path other than `/api/metrics`** during the window.
- **Discrimination:** with a live session the identical flow returns **200** and no banner — the shipped `expect(status).toBe(401)` would fail. The test is fail-closed.

No arbitrary sleep, retry, mocked success, weakened assertion, or product/auth change is involved: only two files changed since the first verification — `tests/e2e/metrics.spec.ts` and the remediation report's addendum — and every product source file is byte-unchanged. All previously verified fixes remain intact, re-confirmed both by the green suites and by my own DOM spot-check. The required report corrections are present and accurate.

---

## 2. What I ran

| Check | Environment | Result |
|---|---|---|
| `pnpm typecheck`, `pnpm typecheck:sw` | as-is | clean |
| `pnpm lint` | as-is | clean (0 problems) |
| `pnpm format:check` | as-is | fails only on the pre-existing `src/server/sync/service.ts` CRLF condition (`git diff 1282795` byte-unchanged) |
| `pnpm test:unit` | as-is | **61 files / 842 tests passed** |
| `pnpm test:integration` | as-is (PGlite) | **25 files / 359 passed, 16 skipped** |
| Concurrency (opt-in) | fresh `gymapp_rv2_conc`, migrated from scratch | **1/1 passed** |
| `pnpm build` | production | succeeds |
| L-4 alone, `--repeat-each=20` | clean disposable `gymapp_rv2_e2e`, production server | **20/20** |
| `metrics.spec.ts --repeat-each=10` (130 tests) | same | **130/130** |
| Full Playwright suite ×3 | same | **112/112**, **112/112**, **112/112** |
| Negative control: old approach ×16 | same | **5/16 non-401** |
| Instrumented shipped controls ×16 | same | **16/16 401**, zero stray `Set-Cookie` |
| Discrimination check (live session) | same | **200**, no banner |
| Product-intact DOM spot-check | same | H-1, M-1, M-2, M-5 all still correct |

The disposable database was created, migrated, seeded, had its account created via `smoke.spec.ts`, was re-seeded and had `tests/e2e/seed.ts` run before any measurement — the same preparation as the first verification, so the two passes are directly comparable.

---

## 3. RV-1 — the race is gone, at the cause

### 3.1 What changed

`tests/e2e/metrics.spec.ts:433-556` only. The L-4 test now:

- takes its own `browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })` and closes it in `finally`;
- installs `page.route("**/*")` that `route.continue()`s exactly `/api/auth/*`, `/_next/*`, `/sw.js`, `/manifest.webmanifest`, `/favicon.ico` and the paths `/`, `/login`, `/today`, `/metrics`, `/api/metrics`, `/api/active-session`, `/api/today-bundle`, and `route.abort()`s everything else;
- after `context.clearCookies({ name: "gym_app_session" })`, waits for the actual `GET /api/metrics` triggered by the Refresh click and asserts `response.status() === 401` **before** asserting the banner and the retained dashboard.

### 3.2 The mechanism claim is accurate — and corrects mine

The addendum re-attributes the confounding traffic to Next.js's automatic `<Link>` prefetching of every nav route (including "Choose exercises" → `/metrics/exercises`) rather than to `SyncStatusBanner`'s timer, which is what my own §4 named. I checked this in source and the addendum is right:

- `SyncStatusBanner.tsx:36-44` polls every 5 s, but `refreshDeadLetters` reads IndexedDB (`listDeadLetterOps`, `syncStatusStore.ts:32-35`) and `refreshSessionBlocked` reads local store state (`activeSessionStore.ts:141-144`) — neither issues a network request.
- `flushOutbox` returns `IDLE_RESULT` at `src/sync/flush.ts:62` when the outbox is empty, i.e. **before** its `fetch` at `:73`.

So the root cause I identified (the rolling session re-issuing `Set-Cookie` on any authenticated request that lands after the clear — `edgeSession.ts`, ADR-004) stands, while my attribution of *which* traffic was imprecise. The addendum's correction is the better-supported one, and it is the one the fix is built on.

My instrumentation independently supports it. Under the **old** approach, 4 of the 5 failing iterations read `cookiesBeforeClick=<none>` — the jar was genuinely empty at that instant, yet the request still authenticated. The restoring `Set-Cookie` therefore arrived from a response still in flight, between my cookie read and the request going out. That is exactly the shape of an in-flight prefetch, and it is why clearing the cookie once cannot be sufficient on its own.

### 3.3 Negative control — the controls are load-bearing

I did not modify the shipped test. Instead I wrote my own temporary spec that runs the **pre-fix** flow (default context, service worker allowed, no route handler, `clearCookies` then click) sixteen times, and the **shipped** controls sixteen times, in the same session against the same server:

```
[RV2-A] OLD approach: 5/16 iterations did NOT get a 401
        (200,401,401,200,401,401,200,401,401,401,401,200,401,401,200,401)
[RV2-B] SHIPPED controls: 0/16 non-401
        (401,401,401,401,401,401,401,401,401,401,401,401,401,401,401,401)
[RV2-B] cookie-jar leaks observed: none
```

The old approach reproduces RV-1's ~1-in-3 failure rate; the shipped controls eliminate it and admit no `Set-Cookie` from any path other than `/api/metrics` itself. This is the direct, same-session comparison the addendum's own revert-and-restore control describes, obtained without touching any file.

### 3.4 The assertions cannot pass conditionally

- **The real request is asserted, not inferred.** `page.waitForResponse(res => pathname === "/api/metrics" && method === "GET")` is registered inside the same `Promise.all` as the click, so it observes the click's own request; `expect(response.status()).toBe(401)` runs before any DOM assertion. A no-op click now fails the test on `waitForResponse` timeout rather than passing quietly.
- **A live session fails the test.** My discrimination check runs the identical setup *without* clearing the cookie: `/api/metrics status=200 bannerVisible=false`. The shipped `toBe(401)` would fail there, and so would the banner assertion. The test cannot pass unless the session is genuinely invalid and the product genuinely renders the banner while retaining the dashboard.
- **Nothing is mocked.** `grep` over the whole spec finds **no `route.fulfill()` and no `route.fetch()`** anywhere — the only `page.route` is the allowlist, which `continue()`s allowed requests to Chromium's real network stack. `/api/metrics` is `continue()`d, so the 401 comes from the real server and middleware.
- **No sleeps, no retries, no swallowing.** No `waitForTimeout`/`setTimeout` in the test (every textual match is inside its explanatory comment); `playwright.config.ts` sets `retries: 0` and no per-test override exists; the only `try/finally` closes the context and catches nothing.
- **`serviceWorkers: "block"` changes nothing material.** `src/app/sw.ts`'s HIGH-5 entry makes every same-origin `/api/*` GET other than `/api/auth/*` and `/api/today-bundle` **`NetworkOnly`**, so `/api/metrics` is a pass-through with or without the worker. (This also settles §5.5 of the first verification: the accurate strategy is now stated in the tree, in this test's own comment.)

### 3.5 Repeatability, alone and in the suite

| Execution | Result |
|---|---|
| L-4 alone, `--repeat-each=20` | **20/20** |
| `metrics.spec.ts --repeat-each=10` (130 tests, 10 of them L-4) | **130/130** |
| Full Playwright suite, run 1 | **112/112** |
| Full Playwright suite, run 2 | **112/112** |
| Full Playwright suite, run 3 | **112/112** |

That is 33 executions of the shipped test across exactly the whole-file and whole-suite conditions that produced 4 failures in 5 runs during the first verification, with zero failures — plus 16 further executions of its controls in my own replication. For comparison, the first verification's full-suite result on the same machine and the same preparation was 111/112, twice.

---

## 4. Required report corrections

| Correction required by the first verification | Status |
|---|---|
| Correct §4's and §6's `112/112` claim | **Done.** The addendum states plainly that both figures "were … incorrect as general claims" and that this session "independently reproduced the identical failure … disproving both the '112/112' and 'not reproducible' characterizations." Its "Corrected test counts" paragraph explains that the *total* is legitimately 112/112 now — no test was added or removed, only the L-4 implementation changed — and that the correction is to how the number should be read. My three runs confirm 112/112 is now the real result. |
| Correct the L-4 flake characterisation (§8 item 7's "single non-reproducible flaky failure") | **Done.** The addendum names the 4-in-5 reproduction, describes the mechanism concretely, and records that it reproduced the failure itself before fixing it. |
| §5.5's service-worker mis-diagnosis (optional) | **Addressed in substance.** The original §8 item 6 is left as written (the addendum is explicitly append-only), but the accurate strategy — `NetworkOnly` for `/api/metrics` — is now stated in the test's own comment in the tree, and the addendum's mechanism description supersedes the wrong reason. |

The addendum also volunteers a second near-miss (`route.fetch()` + `route.fulfill()` with `Set-Cookie` stripped, which still raced because `route.fetch()` updates the shared cookie jar on receipt) rather than presenting only the working attempt. That is the right disclosure, and it is consistent with what I observe: the shipped fix relays no confounding traffic through the network layer at all.

Both prior reports are byte-intact: `metrics-dashboard-remediation-verification.md` (210 lines, ending `REMEDIATION INCOMPLETE`) and `metrics-dashboard-review.md` (364 lines) were not modified, as the addendum states.

---

## 5. Nothing else regressed

- **Only two files changed** since the first verification: `tests/e2e/metrics.spec.ts` and `docs/reviews/metrics-dashboard-remediation.md`. Confirmed by a timestamp sweep over `src/`, `tests/`, `scripts/` and `docs/reviews/`.
- **No product or auth change.** `git diff --stat 1282795` over `src/{ui,server,domain}/strength`, `src/{server,domain}/volume`, `src/server/history`, `src/{domain,server}/sync`, `src/sync`, `src/app/sw.ts`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `src/server/today`, `src/{domain,server}/progression`, **`src/server/auth`**, **`src/middleware.ts`**, `src/ui/OfflineShell.tsx`, `src/ui/SyncStatusBanner.tsx` and `src/ui/SyncBootstrap.tsx` is **empty**. The rolling-session behaviour the test contends with was neither changed nor special-cased.
- **Every metrics source file is byte-unchanged** from the first verification (line-for-line identical inventory across `src/domain/metrics`, `src/server/metrics`, `src/ui/metrics`, both API routes and both pages), and `drizzle/` still differs only by the two `0012` files plus the journal append.
- **Previously verified product fixes re-confirmed at the DOM** by my own spot-check: the editor shows **0 px overflow at 320 px and 390 px** both on first visit with a 55-character candidate and with three exercises selected (H-1); the Volume card's current-week header reads `This week (so far) Deload` with exactly one `span.bg-amber-900/60` (M-1); the editor renders both refusal notes (M-2); all three non-estimate states render on the dashboard (M-5).
- **All suites green**: unit 61 files / 842 tests, integration 25 files / 359 passed + 16 skipped, opt-in concurrency 1/1 against a fresh disposable PostgreSQL 16, and the full Playwright suite three times.
- Every pre-existing spec continues to pass unmodified; the other 111 tests are unaffected by L-4's dedicated context.

---

## 6. Residual observations (non-blocking, unchanged in scope)

1. **The allowlist is broader than strictly necessary.** `/api/today-bundle` and `/api/active-session` are `continue()`d, and both can carry a rolling `Set-Cookie`. On `/metrics` they are not in flight at the moment that matters — my instrumentation observed no `Set-Cookie` from either across 16 iterations — so this is theoretical today. If `/metrics` ever begins issuing them, the race could return; narrowing the list to what the flow actually needs on that page would remove the possibility.
2. **This test no longer exercises the service-worker path.** Justified (`/api/metrics` is `NetworkOnly` either way) and documented in the test, but worth knowing that L-4's coverage is now SW-free. The A-19 offline tests still run with the worker active.
3. **The first verification's §5 secondary items remain open**, as the addendum states and the review framed them: the `1 entries` plural, L-3's residual inline count/unit fragments and the dead `formatCoverageCount`, the M-1 test's title promising an amber-markup assertion it does not make, the "14 sentences" miscount in the remediation report (seven are asserted on the page), and the two bodyweight-wiping tests. None affects correctness or the device-acceptance gate.

---

## 7. Working tree, resources and cleanup

- `git status --porcelain` returns the same 52 entries as before this pass, plus this file. Every unrelated pre-existing change is untouched, and no report was modified.
- Temporary artifacts removed: two temporary Playwright specs under `tests/e2e/`, plus `test-results/` and `playwright-report/`. A filesystem sweep confirms none remain; `pnpm lint` is clean and `pnpm format:check` shows only the pre-existing warning.
- Disposable databases `gymapp_rv2_e2e` and `gymapp_rv2_conc` were dropped. `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` returns exactly the six databases present before this pass (`gymapp` plus five unrelated ones from earlier sessions, neither created nor touched here).
- All database work ran against the local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`); the production server started for the e2e runs was pointed at the disposable database and has been stopped. No production contact, no commit, push, deploy, or device acceptance.

---

## 8. What remains before shipping

Nothing blocking. The outstanding work is the repository's normal next step: **A-24 iPhone device acceptance**, followed by §20 step 5's PI-004 nav-geometry trigger note, which by construction cannot be written until the device measurement exists. The three residual observations in §6 are optional cleanups.

---

# `VERIFIED — READY FOR DEVICE ACCEPTANCE`
