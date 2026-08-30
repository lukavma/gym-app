import { expect, type Page } from "@playwright/test";

// Shared helpers for the Phase 3 e2e specs (today.spec.ts,
// offline-sync.spec.ts). Reuses the same fixed single account as
// smoke.spec.ts (ADR-004) and assumes tests/e2e/seed.ts has already been
// run against the target Postgres.
export const E2E_EMAIL = "e2e-smoke@example.com";
export const E2E_PASSWORD = "e2e-smoke-password";

// Setup-or-login branch, copied from smoke.spec.ts's convention: middleware
// can't know account existence, so unauthenticated requests always land on
// /login first, then LoginForm client-side-redirects to /setup if needed.
export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForURL("**/login");

  const confirmPassword = page.getByLabel("Confirm password");
  const loginButton = page.getByRole("button", { name: "Log in" });
  const isSetup = await Promise.race([
    confirmPassword.waitFor().then(() => true),
    loginButton.waitFor().then(() => false),
  ]);

  if (isSetup) {
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await confirmPassword.fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
  } else {
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await loginButton.click();
  }

  await page.waitForURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

// A fresh context always has local=null, so right after login() the only
// reachable non-"Start workout" state is the foreign-active banner (a
// leftover in-progress session from a prior spec run against the same,
// persistent dev Postgres). Take it over so the test starts deterministic.
//
// phase-5.5-light-review.md §4 — TodaySection's loading gate stays on
// `remoteState.kind === "checking"` ("Loading…", neither button rendered)
// until the remote-session check resolves. A one-shot, non-retrying
// `isVisible()` right after `login()` returns can fire inside that window,
// see neither button, and wrongly conclude there's nothing to take over.
// Same `Promise.race(...waitFor())` idiom login() already uses below: wait
// for whichever of the two mutually-exclusive buttons actually renders,
// rather than sampling the DOM once.
const startWorkoutButtonName = "Start workout";
const takeoverButtonName = "Discard it & start fresh";

export async function ensureNoActiveSession(page: Page): Promise<void> {
  const takeover = page.getByRole("button", { name: takeoverButtonName });
  const startWorkout = page.getByRole("button", { name: startWorkoutButtonName });
  const hasForeignActive = await Promise.race([
    takeover.waitFor().then(() => true),
    startWorkout.waitFor().then(() => false),
  ]);
  if (hasForeignActive) {
    await takeover.click();
    await expect(startWorkout).toBeVisible();
  }
}

// A sentinel that can never equal the real `{pending:0, dead:0}` target —
// returned instead of letting a transient navigation-related failure escape
// and abort the whole poll below (Phase 8 hardening: an app-driven
// navigation — e.g. a background Link prefetch failing offline and Next.js
// recovering with its own re-navigation of the current route — can tear
// down the execution context mid-evaluate; that's a timing accident, not a
// reason to fail a poll that would otherwise have converged on the next
// tick).
const TRANSIENT_READ_FAILURE = { pending: -1, dead: -1 };

export async function readOutboxStatusCounts(
  page: Page,
): Promise<{ pending: number; dead: number }> {
  try {
    return await page.evaluate(async () => {
      const req = indexedDB.open("gym-app");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error as unknown as Error);
      });
      try {
        const tx = db.transaction("outbox", "readonly");
        const all: { status: string }[] = await new Promise((resolve, reject) => {
          const r = tx.objectStore("outbox").getAll();
          r.onsuccess = () => resolve(r.result as { status: string }[]);
          r.onerror = () => reject(r.error as unknown as Error);
        });
        return {
          pending: all.filter((op) => op.status === "pending").length,
          dead: all.filter((op) => op.status === "dead").length,
        };
      } finally {
        db.close();
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Execution context was destroyed") || message.includes("Target closed")) {
      return TRANSIENT_READ_FAILURE;
    }
    throw err;
  }
}

// HIGH-2 — polls the client's IndexedDB outbox directly (pwa-offline-
// strategy.md §3/§5) via `expect.poll`, not `page.waitForFunction` with an
// async callback: `waitForFunction`'s predicate must itself return the
// truthy/falsy result synchronously on each poll tick — handing it an async
// function makes the *Promise* the return value, which is always truthy, so
// it resolves on the very first tick regardless of outbox state. `expect
// .poll` correctly awaits the async evaluator each tick instead. Requires
// both "pending" count and "dead" count to be zero — a dead-lettered op is
// not a drained op, it's silent data loss, and this must fail loudly on it
// rather than treat it as a successful sync.
export async function waitForOutboxDrained(page: Page, timeoutMs = 20_000): Promise<void> {
  await expect
    .poll(() => readOutboxStatusCounts(page), { timeout: timeoutMs })
    .toEqual({ pending: 0, dead: 0 });
}

// offline-sync.spec.ts needs a real, SW-served offline reload, which only
// works once the worker has actually taken control of the page. Same
// `expect.poll` fix as waitForOutboxDrained above, for the same reason.
export async function waitForServiceWorkerReady(page: Page, timeoutMs = 20_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return false;
          const reg = await navigator.serviceWorker.ready;
          return Boolean(reg.active);
        }),
      { timeout: timeoutMs },
    )
    .toBe(true);
}

// Activated is not the same as in control. `src/app/sw.ts` sets
// `clientsClaim: false` on purpose (pwa-offline-strategy.md §8 — a worker must
// never take over a page mid-session), so the document that installed the
// worker keeps running uncontrolled: its requests never reach the SW and
// nothing it fetches lands in a runtime cache. Anything asserting on what the
// SW cached, or on the SW answering a request, has to get the page under its
// control first — which a reload does, since the next navigation is claimed by
// the already-activated worker.
export async function waitForServiceWorkerControl(page: Page, timeoutMs = 20_000): Promise<void> {
  await waitForServiceWorkerReady(page, timeoutMs);
  const controlled = () => page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (await controlled()) return;
  await page.reload();
  await expect.poll(controlled, { timeout: timeoutMs }).toBe(true);
}

// What actually provides cold-launch offline isolation in these specs.
//
// The `offline: true` LAUNCH OPTION on `chromium.launchPersistentContext` is
// inert — measured with no CDP session in play, so nothing could have cleared
// it: `navigator.onLine` stays true, the navigation is served live, a
// service-worker-mediated `/api/history` GET resolves 200, and the `others`
// runtime bucket is refilled. The specs still pass it, harmlessly, but it
// contributes nothing and must not be relied on.
//
// `context.setOffline(true)` — the METHOD — does work, including on a
// service-worker-controlled page: `/api/history` (NetworkOnly, so a controlled
// page's fetch of it is issued BY the worker) resolves 200 online and rejects
// immediately after the call. It is not used here only because it cannot be
// applied before a process's first navigation, which is the whole point of a
// cold-launch spec, and because CDP `Network.clearBrowserCache` (see
// clearHttpDiskCache in offline-cold-launch.spec.ts) flips `navigator.onLine`
// back to true and would partly undo it.
//
// The host resolver lives in the browser's shared network service, so breaking
// name resolution there cuts page and worker alike, from the process's very
// first navigation onwards. The ORIGIN is untouched (`http://localhost:3000`),
// which is what keeps the SW registration, Cache Storage, IndexedDB and the
// secure context service workers require. Being a launch argument, it applies
// per browser PROCESS — which suits these specs, since each offline phase is a
// fresh launch of a persisted profile anyway.
//
// Re-verified independently: in a cold process under this rule, with only the
// precache bucket in existence, `/today` is answered 200 from the precache
// while `/api/history`, `/api/active-session`, `/api/today-bundle` and a
// `POST /api/sync` all reject.
export const OFFLINE_RESOLVER_ARG = "--host-resolver-rules=MAP localhost ~NOTFOUND";

// phase-7-review.md remediation — Phase 7's recovery specs (bodyweightRecovery.spec.ts,
// phase7Remediation.spec.ts) all share the one persistent e2e account (ADR-004:
// single-account), running sequentially against the same disposable/dev
// database. A test that asserts on "today has no recovery entry yet" (the
// fresh-check-in path) would otherwise be at the mercy of whatever an earlier
// spec's own cleanup step did or didn't get to run — the same class of
// cross-test state leak `ensureNoActiveSession` exists to neutralize for
// workout sessions. Call this at the start of any such test to guarantee a
// clean slate regardless of run order or a prior test's mid-assertion failure.
export async function deleteAllRecoveryEntries(page: Page): Promise<void> {
  const res = await page.request.get("/api/recovery");
  const { entries } = (await res.json()) as { entries: { id: string }[] };
  for (const entry of entries) {
    await page.request.delete(`/api/recovery/${entry.id}`);
  }
}
