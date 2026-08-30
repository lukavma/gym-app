import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// phase-8-review.md B-1 — "restore strict FIFO after failures." Before the
// fix, the outbox filtered "pending" per-op against an independently
// jittered `nextAttemptAt` (src/sync/outbox.ts's old listPendingOps): after
// any failed flush, a freshly-enqueued op (no attempt yet, so no delay at
// all) could become eligible and get sent WHILE an earlier op that had
// already failed once was still serving its own backoff — sending a later
// op before an earlier one that hasn't landed yet is never safe here, since
// every op is a full-row upsert or an idempotent-by-absence delete: an edit
// arriving before its own insert has a `sessionExerciseId`-owning row that
// doesn't exist yet server-side and gets rejected as `missing_required_fields`
// (edit payloads only carry the changed fields); a delete arriving before its
// insert quietly no-ops against a still-absent row rather than actually
// removing anything once the insert eventually lands.
//
// Backoff is now a property of the whole queue (flush.ts's
// `nextFlushAllowedAt`), checked once before `listPendingOps` is even
// called, so no op can ever become independently eligible while an earlier
// one is still delayed — this spec proves that holds under a genuinely
// injected transient failure, not incidental CI timing.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}

function setRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=ancestor::li[1]");
}

function editingRow(page: Page) {
  return page
    .locator("li:not(:has(li))")
    .filter({ has: page.getByRole("button", { name: "Save" }) });
}

test("FIFO holds after an injected transient sync failure — an edit and a delete enqueued during the failure never bypass their own earlier insert", async ({
  page,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  // The next two /api/sync attempts fail transiently (a real 500, not a
  // network drop) — everything after that goes through normally.
  let failuresRemaining = 2;
  await page.route("**/api/sync", async (route) => {
    if (failuresRemaining > 0) {
      failuresRemaining--;
      await route.fulfill({ status: 500, body: "injected transient failure" });
      return;
    }
    await route.continue();
  });

  // Insert set A. Its flush attempt(s) fail — the whole batch (just this
  // insert, at this point) backs off together.
  await logSet(page, "60", "10");
  await expect(page.getByText("60 kg × 10", { exact: true })).toBeVisible();

  // While A's insert is still failing/backing off, enqueue an edit to A
  // (same set id) and a full insert+delete of a second set B — all
  // committed to IndexedDB immediately (local-first), before A's own insert
  // has ever reached the server.
  await setRow(page, "60 kg × 10").getByRole("button", { name: "Edit" }).click();
  const row = editingRow(page);
  await row.locator("input").nth(0).fill("65");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("65 kg × 10", { exact: true })).toBeVisible();
  await row.waitFor({ state: "detached" });

  await logSet(page, "70", "8");
  await expect(page.getByText("70 kg × 8", { exact: true })).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await setRow(page, "70 kg × 8").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("70 kg × 8", { exact: true })).toHaveCount(0);

  // Must drain with ZERO dead letters: under the old per-op scheme, the
  // edit or delete could have been rejected as an out-of-order op against a
  // not-yet-existing row.
  await waitForOutboxDrained(page);
  await page.unroute("**/api/sync");

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as { session: { exercises: { sets: { weightKg: number; reps: number }[] }[] } };
  const sets = detail.session.exercises[0]!.sets;
  // Exactly A's EDITED value survives — never the pre-edit value (edit
  // reverted by an out-of-order insert), never B (delete lost to an
  // out-of-order insert resurrecting it).
  expect(sets).toEqual([expect.objectContaining({ weightKg: 65, reps: 10 })]);
});
