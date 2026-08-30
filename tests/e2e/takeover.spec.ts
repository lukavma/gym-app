import { test, expect } from "@playwright/test";
import { login, waitForOutboxDrained, ensureNoActiveSession } from "./helpers";

// Phase 8 — required scenario: "competing in-progress session and explicit
// takeover". stale-completed-session.spec.ts already proves the adjacent
// *stale-cache* case (a cached bundle must never resurrect a session the
// server has since completed); this is the live version — two genuinely
// simultaneous devices (ADR-004 is single-ACCOUNT, not single-session, so a
// second authenticated browser context is exactly a second phone) where
// device A's session is still really in_progress on the server when device
// B discovers it and takes over.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("device B discovers device A's live in-progress session and takeover converges to B's session", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  try {
    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    await login(pageA);
    await ensureNoActiveSession(pageA);

    // Device A starts and logs a set — a real, live in_progress session.
    await pageA.getByRole("button", { name: "Start workout" }).click();
    await pageA.waitForURL(/\/today\/workout$/);
    await pageA.getByLabel("kg").fill("60");
    await pageA.getByLabel("reps").fill("10");
    await pageA.getByRole("button", { name: "Log" }).click();
    await expect(pageA.getByText("60 kg × 10", { exact: true })).toBeVisible();
    await waitForOutboxDrained(pageA);

    // Device B, same account, fresh context/profile — sees the conflict
    // banner (src/ui/today/TodaySection.tsx) because the server genuinely
    // still holds A's session as in_progress, not from any stale cache.
    await login(pageB);
    await expect(pageB.getByRole("button", { name: "Discard it & start fresh" })).toBeVisible();

    await pageB.getByRole("button", { name: "Discard it & start fresh" }).click();
    await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
    await waitForOutboxDrained(pageB);

    await pageB.getByRole("button", { name: "Start workout" }).click();
    await pageB.waitForURL(/\/today\/workout$/);
    await pageB.getByLabel("kg").fill("65");
    await pageB.getByLabel("reps").fill("8");
    await pageB.getByRole("button", { name: "Log" }).click();
    await expect(pageB.getByText("65 kg × 8", { exact: true })).toBeVisible();
    await waitForOutboxDrained(pageB);

    // Server state converges to B's session only — A's was discarded, not
    // merged, per the deliberately simple conflict policy
    // (pwa-offline-strategy.md §6: "no silent merging").
    const activeRes = await pageB.request.get("/api/active-session");
    const active = (await activeRes.json()) as { activeSession: { id: string } | null };
    expect(active.activeSession).not.toBeNull();

    pageB.once("dialog", (d) => void d.accept());
    await pageB.getByRole("button", { name: "Complete workout" }).click();
    await pageB.waitForURL(/\/today$/);
    await waitForOutboxDrained(pageB);

    await pageB.goto("/history");
    const entry = pageB.getByRole("link").filter({ hasText: "1 set" }).first();
    await expect(entry).toBeVisible();
    await entry.click();
    // Only B's set exists — A's discarded session left no trace.
    await expect(pageB.getByText("65 kg × 8", { exact: true })).toHaveCount(1);
    await expect(pageB.getByText("60 kg × 10", { exact: true })).toHaveCount(0);
  } finally {
    await deviceA.close();
    await deviceB.close();
  }
});
