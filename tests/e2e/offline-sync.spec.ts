import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerReady,
} from "./helpers";

// Phase 3 e2e — airplane-mode workout logging, survives a genuine
// browser-process relaunch (not just a same-process reload), and syncs
// exactly once on reconnect. Precondition: tests/e2e/seed.ts has been run
// against the target Postgres.
//
// This spec needs a PRODUCTION build (`pnpm build` then `pnpm start` on
// :3000), not `pnpm dev` — next.config.ts disables the service worker in
// development (`disable: process.env.NODE_ENV === "development"`), so an
// offline navigation can only be served by a build where the SW is
// precaching/runtime-caching the app shell. playwright.config.ts's
// `webServer.command` now runs `pnpm build && pnpm start` itself (MEDIUM-10),
// so a plain `pnpm test:e2e` on a clean checkout satisfies this
// automatically; `reuseExistingServer: true` still lets a manually-started
// `pnpm build && pnpm start` be reused for faster local iteration.
const BASE_URL = "http://localhost:3000";

// HIGH-3 — the review's own reference probe proved the full F6 claim by
// direct experiment: start a workout offline from the SW-cached shell, log
// a set, survive a genuine browser-process relaunch while still offline,
// log a second set, complete the workout offline, then reconnect and watch
// it converge exactly once into PostgreSQL. The spec this replaces only
// proved a weaker claim — `page.reload()` inside one already-running
// browser process/renderer, never a real relaunch — which the review
// flagged explicitly. `chromium.launchPersistentContext(userDataDir)`
// launches a genuine, separate browser process against a persisted profile
// directory, so closing and relaunching it is what a force-quit-and-reopen
// (or an OS-killed background tab) actually looks like: IndexedDB, Cache
// Storage, and the service worker's own registration all have to survive on
// disk, not just in a live renderer's memory.
test("logging a workout fully offline survives a real process relaunch and converges exactly once on reconnect", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gym-app-e2e-offline-"));

  try {
    // Launch 1 (online): log in, register the SW, and warm its runtime
    // cache for the /today/workout document with a real navigation — the
    // same priming step the previous version of this spec relied on. Then
    // discard the primed session so launch 2 starts from a clean slate;
    // only the SW's caches (on disk, in the profile) need to survive, not
    // this session's own local state.
    let context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
    try {
      const page = await context.newPage();
      await login(page);
      await waitForServiceWorkerReady(page);
      await ensureNoActiveSession(page);

      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      await waitForOutboxDrained(page);
      await page.reload();
      await expect(page.getByRole("button", { name: "Log" })).toBeVisible();

      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Discard workout" }).click();
      await page.waitForURL(/\/today$/);
      await waitForOutboxDrained(page);
    } finally {
      await context.close();
    }

    // Launch 2: a genuine new browser process, offline from its very first
    // navigation. Starting the workout here (offline) proves it comes from
    // the SW-cached shell + the locally cached today-bundle, not the network.
    context = await chromium.launchPersistentContext(userDataDir, {
      baseURL: BASE_URL,
      offline: true,
    });
    try {
      const page = await context.newPage();
      await page.goto("/today");
      await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);

      await logSet(page, "110", "5");
      await expect(page.getByText("110 kg × 5")).toBeVisible();
    } finally {
      // Closing (not context.setOffline(false)) simulates the process
      // actually dying while offline — a force-quit or an OS-killed tab —
      // not a graceful, in-memory teardown.
      await context.close();
    }

    // Launch 3: a second, independent relaunch, still offline. If IndexedDB
    // (the local set) or the SW registration/cache hadn't genuinely
    // survived to disk, this is where it would show up.
    context = await chromium.launchPersistentContext(userDataDir, {
      baseURL: BASE_URL,
      offline: true,
    });
    try {
      const page = await context.newPage();
      await page.goto("/today/workout");
      await expect(page.getByText("110 kg × 5")).toBeVisible();

      await logSet(page, "112.5", "3");
      await expect(page.getByText("112.5 kg × 3")).toBeVisible();

      // completeSession() is itself outbox-first and queues fine offline;
      // the resulting router.push("/today") is a same-process client
      // transition, not a network document fetch, so it isn't blocked by
      // being offline the way a hard reload would be.
      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Complete workout" }).click();
      await page.waitForURL(/\/today$/);

      // Reconnect within this same still-open context/process — no further
      // relaunch is needed to prove convergence, only to prove the offline
      // durability asserted above.
      await context.setOffline(false);
      await waitForOutboxDrained(page);

      await page.goto("/history");
      const entry = page.getByRole("link").filter({ hasText: "2 sets" }).first();
      await expect(entry).toBeVisible();
      await entry.click();

      // Exactly once: both sets present, each exactly once — not zero
      // (lost, BLOCKER-1) and not duplicated (double-applied) by the
      // offline replay, and zero dead letters (BLOCKER-2) per
      // waitForOutboxDrained above.
      await expect(page.getByText("110 kg × 5", { exact: true })).toHaveCount(1);
      await expect(page.getByText("112.5 kg × 3", { exact: true })).toHaveCount(1);
    } finally {
      await context.close();
    }
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

// Cheaper, same-process case kept alongside the real-relaunch scenario
// above: a hard reload while offline, within one already-running renderer.
// Still real signal (it's what actually caught HIGH-2's broken helpers),
// just a weaker claim than a genuine process relaunch.
test("logging sets fully offline survives a same-process reload and syncs exactly once on reconnect", async ({
  page,
  context,
}) => {
  await login(page);
  await waitForServiceWorkerReady(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  await page.reload();
  await expect(page.getByRole("button", { name: "Log" })).toBeVisible();

  await context.setOffline(true);

  await logSet(page, "100", "8");
  await expect(page.getByText("100 kg × 8")).toBeVisible();

  await page.reload();
  await expect(page.getByText("100 kg × 8")).toBeVisible();

  await logSet(page, "102.5", "6");
  await expect(page.getByText("102.5 kg × 6")).toBeVisible();

  await context.setOffline(false);
  await waitForOutboxDrained(page);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  await page.goto("/history");
  const entry = page.getByRole("link").filter({ hasText: "2 sets" }).first();
  await expect(entry).toBeVisible();
  await entry.click();

  await expect(page.getByText("100 kg × 8", { exact: true })).toHaveCount(1);
  await expect(page.getByText("102.5 kg × 6", { exact: true })).toHaveCount(1);
});

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}
