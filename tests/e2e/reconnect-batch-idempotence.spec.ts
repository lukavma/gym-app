import { test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerControl,
} from "./helpers";

// docs/reviews/mvp-v1-independent-review.md MEDIUM-1 — the review's own real-
// client reproduction ("Reproduction (real client, Playwright, production
// build)"): log a full airplane-mode workout, reconnect, and lose the reply
// to the reconnect flush AFTER the server has genuinely applied it. Before
// the fix this permanently dead-lettered the session-create
// (`invalid_lifecycle_transition`) and any session-exercise whose skip/notes
// state a later op in the same batch had since moved on (`session_locked`),
// showing a false "couldn't sync" banner on the exact scenario F6 is about,
// with a Retry that could never succeed.
//
// Everything below happens OFFLINE first so every op — session create, a
// skip/unskip round-trip, a set create, a correction of it, notes, and
// completion — accumulates unsent as ONE pending FIFO batch
// (src/sync/flush.ts only ever drains the whole queue in a single POST).
// Reconnecting then triggers that one batch; the routed handler lets the
// REAL request reach the server (`route.fetch()`, so it genuinely commits)
// and only then discards the reply (`route.abort()`), simulating the reply
// being lost after the server already committed it — a real reconnect race
// (a full page navigation tearing down an in-flight fetch, iOS suspending
// the tab mid-request, a gateway reset). The client's own automatic backoff
// retry then resends the identical batch, which must converge cleanly.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

function setRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=ancestor::li[1]");
}

function editingRow(page: Page) {
  return page
    .locator("li:not(:has(li))")
    .filter({ has: page.getByRole("button", { name: "Save" }) });
}

test("a lost reply to a full reconnect batch (create, skip toggle, notes, set create+edit, completion) converges automatically with zero dead letters", async ({
  page,
  context,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  // The service worker must actually be CONTROLLING this page (clientsClaim:
  // false — a reload is required) before an offline navigation to
  // /today/workout can be served from its precache at all (same requirement
  // dead-letter.spec.ts and offline-sync.spec.ts document).
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);

  // Skip/unskip round-trip — the create's skipped:false is stale against
  // whatever a later op in this same batch leaves the row at.
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("button", { name: "Unskip" })).toBeVisible();
  await page.getByRole("button", { name: "Unskip" }).click();
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

  await page.getByLabel("kg").fill("100");
  await page.getByLabel("reps").fill("5");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();

  await page.getByLabel("kg").fill("102.5");
  await page.getByLabel("reps").fill("5");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("102.5 kg × 5", { exact: true })).toBeVisible();

  // A correction of the first set — a set EDIT trailing its own create,
  // both still queued in the same pending batch.
  await setRow(page, "100 kg × 5").getByRole("button", { name: "Edit" }).click();
  const editing = editingRow(page);
  await editing.locator("input").nth(0).fill("101");
  await editing.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("101 kg × 5", { exact: true })).toBeVisible();
  await expect(page.getByText("100 kg × 5", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add notes" }).click();
  await page.locator("textarea").fill("felt strong today");
  await page.locator("textarea").blur();

  let sabotaged = false;
  await page.route("**/api/sync", async (route) => {
    if (sabotaged) {
      await route.continue();
      return;
    }
    sabotaged = true;
    const response = await route.fetch();
    await response.body();
    // The client never sees this response — the whole pending batch stays
    // queued and gets resent, unchanged, on the next automatic retry.
    await route.abort("failed");
  });

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  // Not page.waitForURL() here: it listens for navigation-lifecycle events,
  // and offline this SPA transition can trip a spurious ERR_ABORTED on some
  // unrelated background request even though the app has already landed on
  // /today (a router.push, not a document fetch — same class of offline
  // navigation quirk documented in helpers.ts's TRANSIENT_READ_FAILURE).
  // expect(page).toHaveURL() polls the location instead of listening for a
  // navigation event, so it isn't fooled by that.
  await expect(page).toHaveURL(/\/today$/);

  // Reconnecting fires the first flush — the one the sabotage route
  // captures, applies for real, and then hides the reply of.
  await context.setOffline(false);

  // Must drain with ZERO dead letters via the client's own automatic
  // backoff retry — no manual "Retry" click anywhere in this test. Before
  // the fix, this converged to dead:2 (session-create + session-exercise)
  // and this poll would time out.
  await waitForOutboxDrained(page);
  await page.unroute("**/api/sync");

  await expect(page.getByText(/couldn't sync/)).toHaveCount(0);

  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as {
    session: {
      status: string;
      exercises: {
        skipped: boolean;
        notes: string | null;
        sets: { weightKg: number; reps: number }[];
      }[];
    };
  };
  // Exactly once, at the corrected/final values — not lost, not
  // duplicated, and not regressed back to a stale earlier op's snapshot.
  expect(detail.session.status).toBe("completed");
  const exercise = detail.session.exercises[0]!;
  expect(exercise.skipped).toBe(false);
  expect(exercise.notes).toBe("felt strong today");
  expect(exercise.sets).toHaveLength(2);
  expect(exercise.sets.find((s) => s.reps === 5 && s.weightKg === 101)).toBeDefined();
  expect(exercise.sets.find((s) => s.reps === 5 && s.weightKg === 102.5)).toBeDefined();
});

// docs/reviews/mvp-v1-remediation-verification.md V-1 — the review's own
// exact real-client reproduction of MEDIUM-1 surviving the first
// remediation: offline, log three sets, delete the middle one (a mis-logged
// set — the ordinary "I typo'd the weight, I'll just redo it" flow), then
// complete. The deleted set's own CREATE op is still sitting in the pending
// outbox alongside its delete (nothing ever removes an op from the outbox
// except a classified server response) — replaying that create against an
// already-deleted row is exactly the shape the first remediation's fix
// never exercised (no test in the repo combined a lost reply with a set
// deletion).
test("a lost reply to a reconnect batch that deletes one of its own sets converges automatically with zero dead letters", async ({
  page,
  context,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);

  await page.getByLabel("kg").fill("70");
  await page.getByLabel("reps").fill("5");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("70 kg × 5", { exact: true })).toBeVisible();

  await page.getByLabel("kg").fill("72.5");
  await page.getByLabel("reps").fill("5");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("72.5 kg × 5", { exact: true })).toBeVisible();

  await page.getByLabel("kg").fill("75");
  await page.getByLabel("reps").fill("5");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("75 kg × 5", { exact: true })).toBeVisible();

  // Delete the middle set — its create op and this delete op both still sit
  // in the pending outbox, offline, alongside the renumbering this triggers
  // for the survivor logged after it (75kg moves from set 3 to set 2).
  page.once("dialog", (d) => void d.accept());
  await setRow(page, "72.5 kg × 5").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("72.5 kg × 5", { exact: true })).toHaveCount(0);

  let sabotaged = false;
  await page.route("**/api/sync", async (route) => {
    if (sabotaged) {
      await route.continue();
      return;
    }
    sabotaged = true;
    const response = await route.fetch();
    await response.body();
    await route.abort("failed");
  });

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await expect(page).toHaveURL(/\/today$/);

  await context.setOffline(false);

  // Before the fix: {pending:0, dead:1}, dead letter
  // "setLog/upsert: session_locked" — the deleted set's own stale create,
  // permanently dead-lettered even though the server's data was exactly
  // right. This poll times out on that.
  await waitForOutboxDrained(page);
  await page.unroute("**/api/sync");

  await expect(page.getByText(/couldn't sync/)).toHaveCount(0);

  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as {
    session: {
      status: string;
      exercises: { sets: { setNumber: number; weightKg: number; reps: number }[] }[];
    };
  };
  expect(detail.session.status).toBe("completed");
  const sets = detail.session.exercises[0]!.sets;
  // Exactly the two survivors, contiguously renumbered — never the deleted
  // 72.5kg set resurrected, never duplicated.
  expect(sets).toHaveLength(2);
  expect(sets.find((s) => s.weightKg === 72.5)).toBeUndefined();
  expect(sets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ setNumber: 1, weightKg: 70 }),
      expect.objectContaining({ setNumber: 2, weightKg: 75 }),
    ]),
  );
});
