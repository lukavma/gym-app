import { test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerReady,
} from "./helpers";

// Phase 8 — required scenario: "start workout online, lose connectivity,
// log/edit/delete sets, refresh and resume". offline-sync.spec.ts already
// covers offline logging + kill/relaunch + offline completion; this spec is
// the missing piece — editing and deleting a set while offline, not just
// adding one, surviving a refresh before ever reconnecting.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}

// Set rows (src/ui/workout/ExerciseCard.tsx's SetRow, one <li> per set) are
// nested inside the exercise's own <li>, so a plain `page.locator("li")
// .filter({hasText})` also matches that outer element (whose combined text
// includes every set) and its every descendant button. Anchor on the exact
// set-label text itself and walk up to its OWN immediate <li>, which is
// unambiguous, and address its "Edit"/"Delete"/inputs from there.
function setRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=ancestor::li[1]");
}

// The edit-mode inputs have no aria-labels — address them positionally
// (weight, reps, rir) within the row currently showing "Save". `:not(:has(li))`
// restricts to leaf <li>s (the individual set rows), excluding the
// exercise's own outer <li> which also (transitively) "has" a Save button
// while any set is being edited.
function editingRow(page: Page) {
  return page
    .locator("li:not(:has(li))")
    .filter({ has: page.getByRole("button", { name: "Save" }) });
}

test("editing and deleting a set while offline survive a refresh and converge exactly on reconnect", async ({
  page,
  context,
}) => {
  await login(page);
  await waitForServiceWorkerReady(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  // One reload while still online lets the already-active service worker
  // (clientsClaim: false, sw.ts) actually take control of THIS page — only
  // a controlled page's subsequent navigation can be served offline from
  // its precache (same requirement offline-sync.spec.ts documents).
  await page.reload();
  await expect(page.getByRole("button", { name: "Log" })).toBeVisible();

  await context.setOffline(true);

  // Log three sets, then edit the second and delete the third — all while
  // offline. Each mutation must be visible immediately (IndexedDB is the
  // UI's source of truth) with zero network round trip.
  await logSet(page, "100", "5");
  await logSet(page, "102.5", "5");
  await logSet(page, "105", "5");
  await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();
  await expect(page.getByText("102.5 kg × 5", { exact: true })).toBeVisible();
  await expect(page.getByText("105 kg × 5", { exact: true })).toBeVisible();

  await setRow(page, "102.5 kg × 5").getByRole("button", { name: "Edit" }).click();
  const row = editingRow(page);
  await row.locator("input").nth(0).fill("103");
  await row.locator("input").nth(1).fill("6");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("103 kg × 6", { exact: true })).toBeVisible();
  await expect(page.getByText("102.5 kg × 5", { exact: true })).toHaveCount(0);

  // The edit above must have fully committed (its own IndexedDB
  // transaction — commitSessionMutation, src/sync/db.ts) before the delete
  // below reads and rewrites the exercise's set list; both mutate the same
  // in-memory `activeSession` aggregate via requireLocalSession(), and nothing
  // here otherwise guarantees the edit's own promise has resolved before the
  // next click fires.
  await row.waitFor({ state: "detached" });

  page.once("dialog", (d) => void d.accept());
  await setRow(page, "105 kg × 5").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("105 kg × 5", { exact: true })).toHaveCount(0);

  // Refresh while STILL offline, before anything has synced — the edit and
  // delete must have already committed to IndexedDB, not merely to
  // in-memory React state.
  await page.reload();
  await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();
  await expect(page.getByText("103 kg × 6", { exact: true })).toBeVisible();
  await expect(page.getByText("102.5 kg × 5", { exact: true })).toHaveCount(0);
  await expect(page.getByText("105 kg × 5", { exact: true })).toHaveCount(0);

  await context.setOffline(false);
  await waitForOutboxDrained(page);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  // Server convergence: exactly the two surviving sets, at their edited
  // values, ordered/renumbered correctly — never the deleted 105kg set,
  // never the pre-edit 102.5kg value. Queried directly rather than via the
  // /history UI list: this dev DB accumulates real sessions across every
  // phase's work, so "most recent" is only unambiguous through the API's
  // own ordering, not a text-matching heuristic over however many past
  // sessions also happen to read "2 sets".
  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as { session: { exercises: { sets: { weightKg: number; reps: number }[] }[] } };
  const sets = detail.session.exercises[0]!.sets;
  expect(sets).toEqual([
    expect.objectContaining({ weightKg: 100, reps: 5 }),
    expect.objectContaining({ weightKg: 103, reps: 6 }),
  ]);
});
