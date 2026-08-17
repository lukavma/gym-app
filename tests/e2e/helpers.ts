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
