import { test, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD, ensureNoActiveSession } from "./helpers";

// phase-5.5-light-review.md §4 / phase-5.5-light-remediation.md — regression
// for the harness race the review found in offline-cold-launch.spec.ts:
// `ensureNoActiveSession` used to probe the takeover button with a single
// non-retrying `isVisible()` right after `login()` returned. TodaySection's
// loading gate stays on `remoteState.kind === "checking"` ("Loading…", with
// NEITHER "Start workout" nor "Discard it & start fresh" rendered) until its
// `/api/active-session` check resolves — so a one-shot check made while that
// request is still in flight sees nothing, concludes there's no foreign
// session, and returns. The caller then waits indefinitely for a "Start
// workout" button that never renders because the foreign-session banner
// takes its place instead.
//
// This spec reproduces that window directly by delaying `/api/active-session`
// and calling `ensureNoActiveSession` without first waiting for the page to
// settle (unlike `login()`, which — because the "Today" heading is itself
// gated behind the same remote check — cannot return before the window this
// bug lived in has already closed). Against the pre-fix one-shot
// `isVisible()`, this test fails: `ensureNoActiveSession` returns having done
// nothing, and the final assertion for "Start workout" times out because the
// foreign-session banner is what actually renders once the delayed check
// resolves.
test("waits for the remote active-session check to resolve before deciding there's nothing to take over", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  try {
    // ---- Device A: puts a real in-progress session on the server, which is
    // "foreign" from device B's separate, empty IndexedDB.
    const pageA = await deviceA.newPage();
    await pageA.goto("/");
    await pageA.waitForURL("**/login");
    await pageA.getByLabel("Email").fill(E2E_EMAIL);
    await pageA.getByLabel("Password").fill(E2E_PASSWORD);
    await pageA.getByRole("button", { name: "Log in" }).click();
    await pageA.waitForURL(/\/today$/);
    await ensureNoActiveSession(pageA);
    await pageA.getByRole("button", { name: "Start workout" }).click();
    await pageA.waitForURL(/\/today\/workout$/);

    // ---- Device B: delay the exact request TodaySection's loading gate is
    // waiting on, then log in WITHOUT waiting for the page to settle past
    // that gate (no heading/button assertion) — reproducing the moment the
    // pre-fix helper was called into: remoteState is still "checking".
    const pageB = await deviceB.newPage();
    await pageB.route("**/api/active-session", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await pageB.goto("/");
    await pageB.waitForURL("**/login");
    await pageB.getByLabel("Email").fill(E2E_EMAIL);
    await pageB.getByLabel("Password").fill(E2E_PASSWORD);
    await pageB.getByRole("button", { name: "Log in" }).click();
    await pageB.waitForURL(/\/today$/);

    await ensureNoActiveSession(pageB);

    // If the helper had returned early, this would see the foreign-session
    // banner instead and time out.
    await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
    await expect(pageB.getByText(/A workout is already in progress/)).toHaveCount(0);
  } finally {
    await deviceA.close();
    await deviceB.close();
  }
});
