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
export async function ensureNoActiveSession(page: Page): Promise<void> {
  const takeover = page.getByRole("button", { name: "Discard it & start fresh" });
  if (await takeover.isVisible().catch(() => false)) {
    await takeover.click();
    await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
  }
}

async function readOutboxStatusCounts(page: Page): Promise<{ pending: number; dead: number }> {
  return page.evaluate(async () => {
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

// The only way to take a service-worker-backed page genuinely offline here.
//
// `context.setOffline(true)` and `context.route("**/*", abort)` both act on the
// PAGE's network stack. Requests issued by the SERVICE WORKER bypass both and
// still reach the real server, so an "offline" page can be answered by live
// HTTP — measured, not assumed: with either in force, `/api/today-bundle`
// still came back fresh and `/today` was still served from the network. An
// offline spec built on them proves nothing.
//
// The host resolver lives in the browser's shared network service, so breaking
// name resolution there cuts page and worker alike. The ORIGIN is untouched
// (`http://localhost:3000`), which is what keeps the SW registration, Cache
// Storage, IndexedDB and the secure context service workers require. Being a
// launch argument, it applies per browser PROCESS — which suits these specs,
// since each offline phase is a fresh launch of a persisted profile anyway.
export const OFFLINE_RESOLVER_ARG = "--host-resolver-rules=MAP localhost ~NOTFOUND";
