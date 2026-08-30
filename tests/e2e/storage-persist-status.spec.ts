import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Phase 8 — required scope: "request navigator.storage.persist() and
// surface granted/denied/unavailable status" (implementation-plan.md
// Phase 8). SyncBootstrap.tsx already made the call (Phase 3/MEDIUM-4); this
// spec is the "surface" half — src/sync/syncStatusStore.ts's
// `storagePersist` state, rendered by src/ui/SyncStatusBanner.tsx only when
// it's anything other than "granted" (quiet in the common case).
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("denied persistent storage is surfaced, not silently discarded", async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.storage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.storage as any).persist = () => Promise.resolve(false);
    }
  });
  await login(page);
  await expect(
    page.getByText("Persistent storage wasn't granted — offline data could be evicted"),
  ).toBeVisible();
});

test("a browser with no Storage API is surfaced as unavailable, not silently ignored", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
  });
  await login(page);
  await expect(page.getByText("This browser doesn't support persistent storage")).toBeVisible();
});

test("granted persistent storage stays quiet — no warning banner", async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.storage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.storage as any).persist = () => Promise.resolve(true);
    }
  });
  await login(page);
  await expect(page.getByText(/Persistent storage wasn't granted/)).toHaveCount(0);
  await expect(page.getByText(/doesn't support persistent storage/)).toHaveCount(0);
});
