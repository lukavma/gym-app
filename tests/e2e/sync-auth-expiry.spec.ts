import { test, expect } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  readOutboxStatusCounts,
} from "./helpers";

// Phase 8 — required scenario: "expired-cookie flush retains every op,
// shows 'sign in to sync', and drains after login" (pwa-offline-strategy.md
// §7). Simulated by clearing the session cookie directly (no server
// test-hook needed) while ops are queued offline, then reconnecting with
// the bad cookie still in place — src/sync/flush.ts's 401 branch must leave
// every op exactly as queued (never marked-tried, never dead-lettered) and
// flip `authRequired`; a fresh login must then drain the queue with nothing
// lost.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("ops queued during an expired session are retained, surfaced, and drain after re-login", async ({
  page,
  context,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  // Queue a mutation with no way to reach the server yet.
  await context.setOffline(true);
  await page.getByLabel("kg").fill("70");
  await page.getByLabel("reps").fill("9");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("70 kg × 9", { exact: true })).toBeVisible();

  // The cookie "expires" while still offline — indistinguishable from the
  // 30-day rolling session lapsing mid-outage (ADR-004).
  await context.clearCookies({ name: "gym_app_session" });

  await context.setOffline(false);

  // The op must stay queued (never dead-lettered), regardless of whatever
  // else happens to this page in the meantime — checked first since it's
  // the durable, IndexedDB-backed invariant (unaffected by any navigation).
  // readOutboxStatusCounts tolerates a transient "execution context
  // destroyed" (a background Link prefetch failing once the cookie is
  // gone can trigger Next.js's own fallback navigation) by retrying rather
  // than aborting the poll — see its comment in helpers.ts.
  await expect
    .poll(() => readOutboxStatusCounts(page), { timeout: 15_000 })
    .toEqual({ pending: 1, dead: 0 });
  // (the setLog upsert from the offline log above — the workoutSession
  // create op already drained before we went offline, per the
  // waitForOutboxDrained right after starting the workout.)

  // "Not silently retrying with no visible state" (§7) — observed as
  // EITHER the pill (if this page is still the one that was loaded when
  // the cookie went bad) OR a bounce to /login (a background Next.js Link
  // prefetch — the nav bar's own Bodyweight/Recovery links — can fail once
  // the cookie is gone and fall back to a real browser navigation, which
  // middleware then correctly redirects; that's an even more visible signal
  // than the pill, not a silent one). Either way nothing was lost — the
  // count check above already proved that — and this is deliberately not
  // read as a strict either/or with a forced order: whichever the page
  // shows right now is what's asserted.
  const onLogin = page.url().includes("/login");
  if (!onLogin) {
    await expect(page.getByText("Sign in to sync your changes.")).toBeVisible();
  }

  // Re-login (online, per §7) resumes the flush.
  await login(page);
  await waitForOutboxDrained(page);
  await expect(page.getByText("Sign in to sync your changes.")).toHaveCount(0);

  await page.goto("/today/workout");
  await expect(page.getByText("70 kg × 9", { exact: true })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  await page.goto("/history");
  const entry = page.getByRole("link").filter({ hasText: "1 set" }).first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.getByText("70 kg × 9", { exact: true })).toHaveCount(1);
});
