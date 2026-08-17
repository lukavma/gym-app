import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, test, expect, type Page } from "@playwright/test";
import {
  OFFLINE_RESOLVER_ARG,
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerControl,
} from "./helpers";

// Finding C regression — the exact device failure, reproduced end to end.
//
// Production state when it happened: PostgreSQL held exactly ONE session for
// the account, status `completed`, and no `in_progress` session at all. The
// phone nevertheless offered "Resume here", adopted that completed session,
// and then dead-lettered every subsequent set with `session_locked` — because
// the session it displayed came from a CACHED `/api/today-bundle` response
// (SW cache and/or IndexedDB), whose `activeSession` field was captured while
// the session really was in progress and can never learn that it isn't.
//
// The property under test is not "the UI eventually catches up": it is that no
// cached representation can authorize Resume/Takeover at all. So this spec
// asserts on the caches directly as well as on what Today offers, and it puts
// device B offline for the decisive step — the one condition under which a
// stale cached bundle is the only thing the client has.
//
// "Two browser profiles of the same account" is the same stand-in for "two
// devices" as today.spec.ts uses (ADR-004 is single-account, not
// single-session). Device B is a PERSISTENT profile relaunched three times,
// because its offline phase has to be offline for the service worker too —
// see OFFLINE_RESOLVER_ARG, which is a launch argument and therefore needs a
// new process. That the phases are separate processes is a bonus rather than a
// cost: it is exactly how the device hit this (log, quit, reopen).
//
// Needs a PRODUCTION build (the SW is disabled in development) and a seeded
// dev Postgres — see playwright.config.ts.
const BASE_URL = "http://localhost:3000";

interface CachedBundleProbe {
  present: boolean;
  activeSession: unknown;
}

// The SW's own cached copy of the planning bundle. Located by scanning every
// Cache Storage bucket for the request rather than by cache name, so this
// keeps working regardless of how serwist prefixes/suffixes `cacheName`.
async function readSwCachedBundle(page: Page): Promise<CachedBundleProbe> {
  return page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname !== "/api/today-bundle") continue;
        const response = await cache.match(request);
        if (!response) continue;
        const body = (await response.json()) as { activeSession?: unknown };
        return { present: true, activeSession: body.activeSession ?? null };
      }
    }
    return { present: false, activeSession: null };
  });
}

async function readIdbRecord(
  page: Page,
  store: "bundleCache" | "activeSession",
): Promise<unknown | null> {
  return page.evaluate(async (storeName) => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      if (!db.objectStoreNames.contains(storeName)) return null;
      const tx = db.transaction(storeName, "readonly");
      const record: unknown = await new Promise((resolve, reject) => {
        const r = tx.objectStore(storeName).get("current");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error as unknown as Error);
      });
      return record ?? null;
    } finally {
      db.close();
    }
  }, store);
}

async function readIdbCachedBundle(page: Page): Promise<CachedBundleProbe> {
  const record = (await readIdbRecord(page, "bundleCache")) as {
    bundle?: { activeSession?: unknown };
  } | null;
  if (!record?.bundle) return { present: false, activeSession: null };
  return { present: true, activeSession: record.bundle.activeSession ?? null };
}

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}

test("a session completed elsewhere is never offered for resume from a cached bundle", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const profileB = fs.mkdtempSync(path.join(os.tmpdir(), "gym-app-e2e-stale-"));

  try {
    const pageA = await deviceA.newPage();

    // ---- Device A starts a workout and syncs it: the server now holds one
    // in-progress session.
    await login(pageA);
    await ensureNoActiveSession(pageA);
    await pageA.getByRole("button", { name: "Start workout" }).click();
    await pageA.waitForURL(/\/today\/workout$/);
    await logSet(pageA, "80", "5");
    await expect(pageA.getByText("80 kg × 5")).toBeVisible();
    await waitForOutboxDrained(pageA);

    // ---- Device B, launch 1 (online): sees it live, from
    // `/api/active-session` (network-only), and caches the planning bundle
    // while doing so.
    let deviceB = await chromium.launchPersistentContext(profileB, { baseURL: BASE_URL });
    try {
      const pageB = await deviceB.newPage();
      await login(pageB);
      // The bundle only passes through the SW once the SW controls the page,
      // hence Control rather than Ready — the load that installs the worker is
      // not intercepted by it, so nothing it fetches would be cached.
      await waitForServiceWorkerControl(pageB);
      await expect(pageB.getByText(/A workout is already in progress/)).toBeVisible();

      // …but neither cached representation of that bundle may carry the
      // session, even now, while it genuinely IS in progress. This is the
      // invariant that makes the stale resume impossible rather than merely
      // unlikely: there is no cached artefact left that could authorize one.
      await expect
        .poll(() => readSwCachedBundle(pageB), { timeout: 20_000 })
        .toEqual({ present: true, activeSession: null });
      await expect
        .poll(() => readIdbCachedBundle(pageB), { timeout: 20_000 })
        .toEqual({ present: true, activeSession: null });
    } finally {
      await deviceB.close();
    }

    // ---- Device A completes it. PostgreSQL now has NO in-progress session,
    // while device B's caches still describe the same planning bundle, written
    // while one was: the exact production state.
    pageA.once("dialog", (d) => void d.accept());
    await pageA.getByRole("button", { name: "Complete workout" }).click();
    await pageA.waitForURL(/\/today$/);
    await waitForOutboxDrained(pageA);

    // ---- Device B, launch 2: reopened offline, with only its caches to go
    // on. Pre-fix this is where "Resume here" appeared and adopted the
    // completed session.
    deviceB = await chromium.launchPersistentContext(profileB, {
      baseURL: BASE_URL,
      offline: true,
      args: [OFFLINE_RESOLVER_ARG],
    });
    try {
      const pageB = await deviceB.newPage();
      await pageB.goto("/today");
      await expect(pageB.getByRole("heading", { name: "Today" })).toBeVisible();
      // This process really is cut off — asserted rather than assumed, since
      // the whole scenario is meaningless if anything reached the server.
      // `/api/active-session` is the right probe: Finding C makes it
      // network-only precisely so it can never be answered from a cache, so
      // offline it can only reject. (The planning data on screen below,
      // conversely, IS cached, which is why the screen renders at all.)
      const activeSessionProbe = await pageB.evaluate(() =>
        fetch("/api/active-session").then(
          (res) => `resolved:${res.status}`,
          () => "rejected",
        ),
      );
      expect(activeSessionProbe).toBe("rejected");
      // No staleness banner is asserted here: the SW-cached bundle is seconds
      // old in a spec that runs in seconds, so it is legitimately inside
      // STALE_THRESHOLD_MS. offline-cold-launch.spec.ts asserts the banner
      // where the bundle fetch genuinely fails, which is where it is exact.

      await expect(pageB.getByRole("button", { name: "Resume here" })).toHaveCount(0);
      await expect(pageB.getByRole("button", { name: "Discard it & start fresh" })).toHaveCount(0);
      await expect(pageB.getByText(/A workout is already in progress/)).toHaveCount(0);
      // Nothing was written to the local session store either — the completed
      // session was not hydrated behind the scenes.
      expect(await readIdbRecord(pageB, "activeSession")).toBeNull();
      // The planning half of the bundle is still usable offline; only the
      // active-session claim was dropped.
      await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
    } finally {
      await deviceB.close();
    }

    // ---- Device B, launch 3: back online, where the server's answer decides
    // — and it says nothing is in progress.
    deviceB = await chromium.launchPersistentContext(profileB, { baseURL: BASE_URL });
    try {
      const pageB = await deviceB.newPage();
      await pageB.goto("/today");
      await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
      await expect(pageB.getByRole("button", { name: "Resume here" })).toHaveCount(0);

      // ---- And the device is not poisoned: a fresh workout logs and syncs
      // with zero dead letters. Pre-fix, everything after the stale adopt was
      // rejected `session_locked` (waitForOutboxDrained fails on dead ops).
      await pageB.getByRole("button", { name: "Start workout" }).click();
      await pageB.waitForURL(/\/today\/workout$/);
      await logSet(pageB, "85", "5");
      await expect(pageB.getByText("85 kg × 5")).toBeVisible();
      await waitForOutboxDrained(pageB);
      await expect(pageB.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

      pageB.once("dialog", (d) => void d.accept());
      await pageB.getByRole("button", { name: "Discard workout" }).click();
      await pageB.waitForURL(/\/today$/);
      await waitForOutboxDrained(pageB);
    } finally {
      await deviceB.close();
    }
  } finally {
    await deviceA.close();
    fs.rmSync(profileB, { recursive: true, force: true });
  }
});
