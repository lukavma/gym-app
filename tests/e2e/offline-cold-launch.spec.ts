import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, test, expect, type BrowserContext, type Page } from "@playwright/test";
import { OFFLINE_SHELL_PATH } from "@/domain/pwa/offlineShell";
import {
  OFFLINE_RESOLVER_ARG,
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerControl,
} from "./helpers";

// Finding A regression — the device failure: after logging offline, force-
// quitting the PWA and reopening it still offline, Safari showed
//
//   FetchEvent.respondWith received an error: no-response ... {"url": ".../today"}
//
// i.e. a genuinely cold browser process asked the service worker for the
// `/today` DOCUMENT and the worker had nothing to answer with. Every existing
// offline spec (offline-sync.spec.ts) warms that document with a real online
// navigation first, in launch 1 of the same profile, so it can be — and was —
// answered from the "others" NetworkFirst runtime cache. That is precisely the
// dependency this spec removes:
//
//   * every non-precache Cache Storage bucket is deleted at the end of launch
//     1, so no route a previous visit happened to warm can answer anything;
//   * each offline launch is a genuine new browser process
//     (chromium.launchPersistentContext against a persisted profile dir);
//   * the HTTP disk cache is cleared over CDP before the first navigation of
//     each new process;
//   * the route under test is navigated to DIRECTLY as the process's very
//     first navigation — never warmed in the process that then reloads it;
//   * "offline" is enforced at the host resolver (OFFLINE_RESOLVER_ARG),
//     which applies from the process's first navigation onwards and cuts the
//     service worker's own fetches as well as the page's. (The `offline: true`
//     launch option passed alongside it is inert — see OFFLINE_RESOLVER_ARG's
//     comment in helpers.ts.)
//
// What is left to answer is the precached app shell (`/~offline`) plus the
// precached `_next/static` chunks, which is the fix.
//
// Needs a PRODUCTION build (the SW is disabled when NODE_ENV=development) and
// a seeded dev Postgres — see offline-sync.spec.ts's header and
// playwright.config.ts's `webServer`, which builds and starts one.
const BASE_URL = "http://localhost:3000";

interface CacheBucketReport {
  name: string;
  entries: number;
  hasShell: boolean;
}

async function readCacheBuckets(page: Page): Promise<CacheBucketReport[]> {
  return page.evaluate(async (shellPath) => {
    const report: CacheBucketReport[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      report.push({
        name,
        entries: keys.length,
        // Precached entries are keyed with a `__WB_REVISION__` search param,
        // so compare pathnames rather than whole URLs.
        hasShell: keys.some((request) => new URL(request.url).pathname === shellPath),
      });
    }
    return report;
  }, OFFLINE_SHELL_PATH);
}

async function deleteCacheBucketsExcept(page: Page, keep: string): Promise<string[]> {
  return page.evaluate(async (keepName) => {
    const deleted: string[] = [];
    for (const name of await caches.keys()) {
      if (name === keepName) continue;
      await caches.delete(name);
      deleted.push(name);
    }
    return deleted;
  }, keep);
}

// A fresh process would still be allowed to answer a navigation out of the
// profile's HTTP disk cache. Clearing it before the first navigation is what
// makes "cold" mean cold. (Cache Storage and the SW registration are separate
// storage and are deliberately left alone — they are the thing under test.)
//
// Note the side effect: `Network.clearBrowserCache` flips `navigator.onLine`
// back to true. Harmless here because the host resolver, not any Playwright
// offline emulation, is what severs this process's network.
async function clearHttpDiskCache(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
  } finally {
    await cdp.detach();
  }
}

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}

// phase-5.5-light-review.md §4 — this spec's only in-progress-session
// cleanup lives in launch 4's success path (the "Discard workout" click at
// the end), so a failure in any earlier launch previously left the shared
// dev Postgres holding an in_progress session — which then broke the NEXT
// run of this same spec via the ensureNoActiveSession race that helper's fix
// addresses above, i.e. the failure self-perpetuated. Runs only when the
// test did not pass (a passing run already cleaned up via launch 4); errors
// here are swallowed so a cleanup failure never masks the real test failure.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const browserInstance = await chromium.launch();
  try {
    const context = await browserInstance.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await login(page);
    await ensureNoActiveSession(page);
  } catch {
    // Best-effort only.
  } finally {
    await browserInstance.close();
  }
});

test("a cold browser process launched straight into /today works offline with no warmed route", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gym-app-e2e-cold-"));

  try {
    // ---- Launch 1 (online): install the SW, leave a real in-progress
    // session behind in IndexedDB, then strip every runtime cache.
    let context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
    try {
      const page = await context.newPage();
      await login(page);
      // Under the worker's control from here on, so the runtime caches this
      // launch fills — the ones deleted below — are really filled.
      await waitForServiceWorkerControl(page);
      await ensureNoActiveSession(page);

      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      await logSet(page, "110", "5");
      await expect(page.getByText("110 kg × 5")).toBeVisible();
      await waitForOutboxDrained(page);

      // Visit Today once so the IndexedDB bundle cache is populated — the
      // offline planning data, which is a separate mechanism from the app
      // shell and not what this spec is testing.
      await page.goto("/today");
      await expect(page.getByRole("button", { name: "Continue workout" })).toBeVisible();

      // The precached shell is the entire fix: assert it is actually in Cache
      // Storage before depending on it, and identify its bucket so everything
      // else can be deleted.
      await expect
        .poll(async () => (await readCacheBuckets(page)).some((bucket) => bucket.hasShell), {
          timeout: 20_000,
        })
        .toBe(true);
      const shellBucket = (await readCacheBuckets(page)).find((bucket) => bucket.hasShell);
      if (!shellBucket) throw new Error("unreachable: the poll above asserts one exists");
      const precacheBucket = shellBucket.name;

      const deleted = await deleteCacheBucketsExcept(page, precacheBucket);
      // At minimum the "others"/pages buckets that warmed /today above — if
      // nothing was deleted, this spec would not be testing anything.
      expect(deleted.length).toBeGreaterThan(0);
      expect(await readCacheBuckets(page)).toEqual([
        expect.objectContaining({ name: precacheBucket, hasShell: true }),
      ]);
    } finally {
      // A real process death while the profile holds an in-progress session.
      await context.close();
    }

    // ---- Launch 2: brand-new process, offline before its first navigation,
    // HTTP cache cleared, /today never requested in this process.
    context = await chromium.launchPersistentContext(userDataDir, {
      baseURL: BASE_URL,
      // The resolver arg is what severs the connection — see
      // OFFLINE_RESOLVER_ARG. `offline: true` as a LAUNCH OPTION is inert
      // (it does not even set `navigator.onLine`, which reads true
      // throughout this spec); it is left in only as a declaration of
      // intent. Do not rely on it, and do not read the absence of an
      // `online` event as meaningful here.
      offline: true,
      args: [OFFLINE_RESOLVER_ARG],
    });
    try {
      const page = await context.newPage();
      await clearHttpDiskCache(context, page);

      const response = await page.goto("/today");
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
      // The decisive assertion: what came back IS the precached app shell. A
      // live `/today` document renders an identical screen, so without this
      // marker a leaked network response would look like a pass.
      await expect(page.locator("[data-app-shell='offline']")).toHaveCount(1);
      // …and it is served FOR /today, not as a redirect to /~offline — the
      // address bar (and therefore the route the shell renders) is unchanged.
      expect(new URL(page.url()).pathname).toBe("/today");
      // Offline planning data still comes from IndexedDB, so the SW's own
      // today-bundle cache being gone is not what made this work.
      await expect(page.getByText(/Offline — showing cached data/)).toBeVisible();
      // A genuine local session stays resumable offline (Finding C's fix must
      // not have taken that away) and no remote resume/takeover is offered.
      await expect(page.getByRole("button", { name: "Continue workout" })).toBeVisible();
      await expect(page.getByText(/A workout is already in progress/)).toHaveCount(0);

      // The `destination === "document"` guard on the fallback: serwist
      // attaches the fallback plugin to EVERY runtimeCaching entry, so
      // without that guard an offline API GET would resolve with the shell's
      // HTML instead of rejecting — which is what HIGH-5's offline detection
      // depends on.
      const apiOutcome = await page.evaluate(() =>
        fetch("/api/history").then(
          (res) => `resolved:${res.status}`,
          () => "rejected",
        ),
      );
      expect(apiOutcome).toBe("rejected");
    } finally {
      await context.close();
    }

    // ---- Launch 3: another brand-new offline process, this time launched
    // directly into the Active Workout route.
    context = await chromium.launchPersistentContext(userDataDir, {
      baseURL: BASE_URL,
      offline: true,
      args: [OFFLINE_RESOLVER_ARG],
    });
    try {
      const page = await context.newPage();
      await clearHttpDiskCache(context, page);

      const response = await page.goto("/today/workout");
      expect(response?.status()).toBe(200);

      await expect(page.locator("[data-app-shell='offline']")).toHaveCount(1);
      await expect(page.getByText("110 kg × 5")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/today/workout");

      // Logging still works from the shell, not just reading.
      await logSet(page, "112.5", "3");
      await expect(page.getByText("112.5 kg × 3")).toBeVisible();
    } finally {
      // Killed again, this time with an undrained outbox.
      await context.close();
    }

    // ---- Launch 4: reconnected. The resolver rule is a launch argument, so
    // "back online" is necessarily another new process — which is also how it
    // happens on the phone: quit in the gym, reopen at home. Everything logged
    // across the two offline launches has to converge here.
    context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
    try {
      const page = await context.newPage();
      await page.goto("/today/workout");
      await expect(page.getByText("110 kg × 5")).toBeVisible();
      await expect(page.getByText("112.5 kg × 3")).toBeVisible();
      await waitForOutboxDrained(page);
      await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

      // Clean up so the shared dev Postgres is left without an in-progress
      // session for the next spec.
      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Discard workout" }).click();
      await page.waitForURL(/\/today$/);
      await waitForOutboxDrained(page);
    } finally {
      await context.close();
    }
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
