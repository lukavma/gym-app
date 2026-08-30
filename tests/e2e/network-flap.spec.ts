import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Phase 8 — required scenario: "network flap during an active workout".
// offline-sync.spec.ts and offline-set-edit-delete.spec.ts each flip
// connectivity once (online → offline → online). This spec flaps
// repeatedly — offline → online → offline → online, interleaved with
// mutations at each transition — to stress the flush/backoff/dedupe
// interaction under repeated transitions rather than a single one.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}

test("repeated connectivity flaps mid-workout never duplicate or lose a set", async ({
  page,
  context,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  // Flap 1: offline → log → online → drain.
  await context.setOffline(true);
  await logSet(page, "80", "8");
  await expect(page.getByText("80 kg × 8", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await waitForOutboxDrained(page);

  // Flap 2: offline → log another → online → drain.
  await context.setOffline(true);
  await logSet(page, "82.5", "8");
  await expect(page.getByText("82.5 kg × 8", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await waitForOutboxDrained(page);

  // Flap 3: offline → log a third, immediately flap online then offline
  // again before it's had any real chance to flush, then finally online.
  await context.setOffline(true);
  await logSet(page, "85", "6");
  await expect(page.getByText("85 kg × 6", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await context.setOffline(true);
  await context.setOffline(false);
  await waitForOutboxDrained(page);

  // All three sets present exactly once after the flapping settles.
  await expect(page.getByText("80 kg × 8", { exact: true })).toHaveCount(1);
  await expect(page.getByText("82.5 kg × 8", { exact: true })).toHaveCount(1);
  await expect(page.getByText("85 kg × 6", { exact: true })).toHaveCount(1);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  await page.goto("/history");
  const entry = page.getByRole("link").filter({ hasText: "3 sets" }).first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.getByText("80 kg × 8", { exact: true })).toHaveCount(1);
  await expect(page.getByText("82.5 kg × 8", { exact: true })).toHaveCount(1);
  await expect(page.getByText("85 kg × 6", { exact: true })).toHaveCount(1);
});
