import { test, expect } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Phase 3 e2e — precondition: tests/e2e/seed.ts has been run against the
// target Postgres (active block/template/prescription for the e2e
// account). Local-only, same as smoke.spec.ts (needs a real Postgres via
// docker-compose) — never run in CI.
//
// "Two browser sessions of the same account" stands in for "two devices":
// ADR-004 is single-account, not single-session, so a second Playwright
// browser context authenticated as the same account is exactly what a
// second phone/tab looks like server-side.

test.describe("today: resume and takeover", () => {
  test("a workout survives a same-device reload and shows as in-progress on Today", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await page.getByLabel("kg").fill("100");
    await page.getByLabel("reps").fill("8");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText("100 kg × 8")).toBeVisible();

    await page.reload();
    await expect(page.getByText("100 kg × 8")).toBeVisible();

    await page.goto("/today");
    await expect(page.getByRole("button", { name: "Continue workout" })).toBeVisible();

    // Clean up so later specs (and reruns against the same dev DB) start fresh.
    await page.getByRole("button", { name: "Continue workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Discard workout" }).click();
    await page.waitForURL(/\/today$/);
  });

  test("a second browser session can resume into an in-progress workout", async ({ browser }) => {
    const deviceA = await browser.newContext();
    const deviceB = await browser.newContext();
    try {
      const pageA = await deviceA.newPage();
      const pageB = await deviceB.newPage();

      await login(pageA);
      await ensureNoActiveSession(pageA);
      await pageA.getByRole("button", { name: "Start workout" }).click();
      await pageA.waitForURL(/\/today\/workout$/);
      await pageA.getByLabel("kg").fill("60");
      await pageA.getByLabel("reps").fill("12");
      await pageA.getByRole("button", { name: "Log" }).click();
      await expect(pageA.getByText("60 kg × 12")).toBeVisible();
      // Wait for device A's own writes to reach the server before device B
      // asks for /api/today-bundle, so this doesn't race the flush.
      await waitForOutboxDrained(pageA);

      await login(pageB);
      await expect(pageB.getByText(/A workout is already in progress/)).toBeVisible();
      await pageB.getByRole("button", { name: "Resume here" }).click();
      await pageB.waitForURL(/\/today\/workout$/);
      await expect(pageB.getByText("60 kg × 12")).toBeVisible();

      // Clean up via device B (it now holds the same session locally too).
      pageB.once("dialog", (d) => void d.accept());
      await pageB.getByRole("button", { name: "Discard workout" }).click();
      await pageB.waitForURL(/\/today$/);
    } finally {
      await deviceA.close();
      await deviceB.close();
    }
  });

  test("a second browser session can discard an in-progress workout and start fresh", async ({
    browser,
  }) => {
    const deviceA = await browser.newContext();
    const deviceB = await browser.newContext();
    try {
      const pageA = await deviceA.newPage();
      const pageB = await deviceB.newPage();

      await login(pageA);
      await ensureNoActiveSession(pageA);
      await pageA.getByRole("button", { name: "Start workout" }).click();
      await pageA.waitForURL(/\/today\/workout$/);
      await waitForOutboxDrained(pageA);

      await login(pageB);
      await expect(pageB.getByText(/A workout is already in progress/)).toBeVisible();
      await pageB.getByRole("button", { name: "Discard it & start fresh" }).click();
      // Discard resolves the one-in-progress-session constraint server-side;
      // device B, which never held the session locally, goes straight to a
      // fresh Today rather than being routed into (and then out of) it.
      await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
    } finally {
      await deviceA.close();
      await deviceB.close();
    }
  });
});
