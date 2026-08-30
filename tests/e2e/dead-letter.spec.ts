import { test, expect } from "@playwright/test";
import {
  login,
  waitForOutboxDrained,
  ensureNoActiveSession,
  waitForServiceWorkerControl,
} from "./helpers";

// Phase 8 — required scenario: "rejected operation enters dead-letter
// without losing its payload", plus the dedicated dead-letter screen itself
// (inspect/retry/discard, discard double-confirmed, never silently
// deleted). Constructs a genuine server-side rejection using the
// already-implemented `session_conflict` path
// (uq_sessions_one_in_progress, src/server/sync/service.ts): device B
// starts its own session while offline and unaware device A's is still
// live, so B's queued "create session" op is rejected — not a network
// failure, a real business-rule rejection — once B reconnects.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("a rejected op dead-letters with its payload intact, supports inspect/discard-with-double-confirm/retry", async ({
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

    // Device B: log in online (to get a cookie), then go offline before
    // ever checking for a foreign session — TodaySection's remote check
    // fails silently offline, so "Start workout" renders directly rather
    // than a conflict banner (same posture offline-sync.spec.ts relies on).
    await login(pageB);
    // Claim SW control (clientsClaim: false — a reload is required before
    // an offline navigation can be served from its precache at all).
    await waitForServiceWorkerControl(pageB);
    await deviceB.setOffline(true);
    await pageB.reload();
    await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
    await pageB.getByRole("button", { name: "Start workout" }).click();
    await pageB.waitForURL(/\/today\/workout$/);

    await deviceB.setOffline(false);

    // The queued create-session op collides with A's genuinely still-live
    // session and dead-letters (session_conflict) — never a silent drop.
    await expect(pageB.getByText(/couldn't sync/)).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole("link", { name: /Review/ }).click();
    await pageB.waitForURL(/\/sync-issues$/);

    const card = pageB.getByTestId("sync-issue-card").filter({ hasText: "Workout session" });
    await expect(card.getByText(/Rejected: session_conflict/)).toBeVisible();

    // Inspect: the full payload is visible, not just a summary.
    await card.getByRole("button", { name: "Inspect" }).click();
    const details = card.locator("pre");
    await expect(details).toContainText('"entity": "workoutSession"');
    await expect(details).toContainText('"status": "in_progress"');

    // Discard requires two explicit taps — never a single click.
    await card.getByRole("button", { name: "Discard" }).click();
    await expect(card.getByRole("button", { name: /Confirm discard/ })).toBeVisible();
    await expect(pageB.getByText("No sync issues.")).toHaveCount(0);
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByRole("button", { name: "Discard" })).toBeVisible();
    // Still present after cancelling — nothing was deleted.
    await expect(pageB.getByText(/Rejected: session_conflict/)).toBeVisible();

    // Resolve the underlying conflict — A discards its session, freeing
    // uq_sessions_one_in_progress — then Retry re-sends the SAME payload
    // (never altered) which now succeeds instead of re-rejecting.
    await pageA.bringToFront();
    pageA.once("dialog", (d) => void d.accept());
    await pageA.getByRole("button", { name: "Discard workout" }).click();
    await pageA.waitForURL(/\/today$/);
    await waitForOutboxDrained(pageA);

    await pageB.bringToFront();
    // Starting a session enqueues the workoutSession op AND its
    // sessionExercise op in the same batch (src/sync/activeSession.ts's
    // startSession) — the session op rejects with session_conflict, and
    // the session-exercise op (whose parent never got created) separately
    // rejects with not_found, so TWO ops dead-letter, not one. Retry the
    // session first — only once it exists server-side can its exercise's
    // retry succeed.
    await card.getByRole("button", { name: "Retry" }).click();
    const exerciseCard = pageB
      .getByTestId("sync-issue-card")
      .filter({ hasText: "Session exercise" });
    if (await exerciseCard.count()) {
      await exerciseCard.getByRole("button", { name: "Retry" }).click();
    }
    // Proof of REAL convergence, not just the screen's transient "no
    // longer dead" state (retrying flips status to pending immediately,
    // before the flush round-trip actually completes) — waitForOutboxDrained
    // polls IndexedDB directly and requires both pending:0 and dead:0.
    await waitForOutboxDrained(pageB);
    await pageB.reload();
    await expect(pageB.getByText("No sync issues.")).toBeVisible();

    // Device B's session is now genuinely in_progress server-side.
    const activeRes = await pageB.request.get("/api/active-session");
    const active = (await activeRes.json()) as { activeSession: { id: string } | null };
    expect(active.activeSession).not.toBeNull();

    await pageB.goto("/today/workout");
    pageB.once("dialog", (d) => void d.accept());
    await pageB.getByRole("button", { name: "Discard workout" }).click();
    await pageB.waitForURL(/\/today$/);
    await waitForOutboxDrained(pageB);
  } finally {
    await deviceA.close();
    await deviceB.close();
  }
});
