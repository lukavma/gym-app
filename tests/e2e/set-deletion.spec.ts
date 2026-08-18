import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Finding D regression, at the UI/History layer — deleting a set left the
// remaining sets numbered non-contiguously (delete set 2 of 4 → 1, 3, 4
// forever, on the device and in PostgreSQL).
//
// The numbering itself is asserted where it is visible: exhaustively over
// first/middle/last in tests/unit/setDeletion.test.ts, and against real SQL
// (including that the delete-then-ascending-upsert ORDER is load-bearing) in
// tests/integration/sync.integration.test.ts. What only an e2e can show is the
// end-to-end consequence: the renumber ops really drain through the outbox
// without a single rejection, and History afterwards holds exactly the
// surviving sets — none missing, none duplicated.
//
// Deleting the FIRST of four sets is the case chosen here because it renumbers
// every survivor (3→2 and 4→3 as well as 2→1), so it is the case that would
// collide on `uq_set_number` if the op order regressed. `waitForOutboxDrained`
// fails on any dead-lettered op, so a `set_number_conflict` rejection cannot
// pass silently.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

const SETS: { kg: string; reps: string; label: string }[] = [
  { kg: "100", reps: "5", label: "100 kg × 5" },
  { kg: "102.5", reps: "5", label: "102.5 kg × 5" },
  { kg: "105", reps: "5", label: "105 kg × 5" },
  { kg: "107.5", reps: "5", label: "107.5 kg × 5" },
];

async function logSet(page: Page, kg: string, reps: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByRole("button", { name: "Log" }).click();
}

test("deleting a set renumbers the rest and History shows exactly the survivors", async ({
  page,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);

  for (const set of SETS) {
    await logSet(page, set.kg, set.reps);
    await expect(page.getByText(set.label, { exact: true })).toBeVisible();
  }
  await waitForOutboxDrained(page);

  // Delete the first set. Its row is the first in the list, so the first
  // "Delete" button belongs to it.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete" }).first().click();

  await expect(page.getByText(SETS[0]!.label, { exact: true })).toHaveCount(0);
  for (const set of SETS.slice(1)) {
    await expect(page.getByText(set.label, { exact: true })).toHaveCount(1);
  }

  // The delete op and all three renumber upserts must be accepted. A rejected
  // renumber op would dead-letter here and leave PostgreSQL non-contiguous
  // while the screen above already showed the survivors.
  await waitForOutboxDrained(page);
  await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  // History is served straight from PostgreSQL, ordered by set_number
  // (`/api/history/[id]`), so what it renders is the stored numbering.
  await page.goto("/history");
  const entry = page.getByRole("link").filter({ hasText: "3 sets" }).first();
  await expect(entry).toBeVisible();
  await entry.click();

  for (const set of SETS.slice(1)) {
    await expect(page.getByText(set.label, { exact: true })).toHaveCount(1);
  }
  await expect(page.getByText(SETS[0]!.label, { exact: true })).toHaveCount(0);
  // Exactly three set rows — no duplicate row smuggled in by a renumber
  // upsert, and none of the survivors lost. One Delete button per set row.
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(3);

  // Post-completion (History) deletion renumbers too, over the same op
  // builder — the last surviving path from the brief.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(2);
  await waitForOutboxDrained(page);

  await page.reload();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(2);
  await expect(page.getByText(SETS[1]!.label, { exact: true })).toHaveCount(0);
  for (const set of SETS.slice(2)) {
    await expect(page.getByText(set.label, { exact: true })).toHaveCount(1);
  }
});
