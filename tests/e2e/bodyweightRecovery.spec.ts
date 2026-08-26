import { test, expect } from "@playwright/test";
import { login, ensureNoActiveSession, deleteAllRecoveryEntries } from "./helpers";

// implementation-plan.md Phase 7 — phone-sized E2E for the bodyweight
// quick-log embedded on Today (mvp-scope.md F10: "≤2 interactions"), the
// three-slider recovery check-in with its permanent dismiss, and the
// history lists' edit/delete flows. Local-only (needs a real Postgres via
// docker-compose), same convention as the other Phase 3+ specs — never run
// in CI.

test.describe("bodyweight & recovery (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("logs bodyweight from Today in two interactions, then edits and deletes it from the history list", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    // Interaction 1: fill the weight field embedded directly on Today.
    await page.getByLabel("Bodyweight (kg)").fill("83.5");
    // Interaction 2: Save.
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.goto("/bodyweight");
    await expect(page.getByRole("heading", { name: "Bodyweight" })).toBeVisible();
    await expect(page.getByText("83.5 kg")).toBeVisible();

    // Edit: correct the value and add a note. Scoped to the list item — the
    // page also has the (disabled, empty) quick-log Save button above it.
    await page.getByRole("button", { name: "Edit" }).first().click();
    const editRow = page.getByRole("listitem");
    await editRow.getByLabel("Edit bodyweight (kg)").fill("82.9");
    await editRow.getByPlaceholder("note (optional)").fill("corrected");
    await editRow.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("82.9 kg")).toBeVisible();
    await expect(page.getByText(/corrected/)).toBeVisible();

    // Delete: true removal, not archival.
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No entries yet.")).toBeVisible();
  });

  // uq_bodyweight_day (data-model.md §2.18) end-to-end through the same
  // quick-log widget the first test used.
  test("a second same-day quick-log updates today's entry instead of creating a duplicate", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    await page.getByLabel("Bodyweight (kg)").fill("90");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.getByLabel("Bodyweight (kg)").fill("90.5");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.goto("/bodyweight");
    await expect(page.getByText("90.5 kg")).toBeVisible();
    await expect(page.locator("li", { hasText: "kg" })).toHaveCount(1);

    // Clean up so later runs against the same dev DB start fresh.
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No entries yet.")).toBeVisible();
  });

  test("recovery check-in: three sliders + note save from Today, and dismiss-forever survives a reload", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    // Guarantees a genuinely fresh (no-entry-yet) check-in regardless of
    // what an earlier spec in the same run left behind for today.
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();

    const soreness = page.getByLabel("Soreness", { exact: true });
    await soreness.focus();
    await soreness.press("ArrowRight");
    await soreness.press("ArrowRight");

    await page.locator('input[placeholder="Note (optional)"]').fill("felt strong");
    await page.getByRole("button", { name: "Save check-in" }).click();
    // phase-7-review.md HIGH-1 remediation — the card now shows a summary of
    // the real stored values (with an explicit edit path) instead of a
    // terminal "Thanks" message with no way back in.
    await expect(page.getByText(/Logged today:.*Soreness 5\/5/)).toBeVisible();

    await page.goto("/recovery");
    await expect(page.getByRole("heading", { name: "Recovery" })).toBeVisible();
    // Scoped to the history list (a `<ul>`) — the RecoveryCheckIn summary
    // card above it renders an equivalent-looking, but separate, summary of
    // the same entry, and an unscoped text match would be ambiguous between
    // the two.
    const historyList = page.locator("ul");
    await expect(historyList.getByText(/Soreness 5\/5/)).toBeVisible();
    await expect(historyList.getByText("felt strong")).toBeVisible();

    // Clean up the entry so later reruns start clean.
    await historyList.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No entries yet.")).toBeVisible();
  });

  test("recovery check-in can be dismissed permanently from Today", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await page.getByRole("button", { name: "Don't ask again" }).click();
    await expect(page.getByText("How are you feeling today?")).not.toBeVisible();

    await page.reload();
    // mvp-scope.md F10 — "skipping recovery entry never blocks any flow":
    // Today itself (and Start workout, if scheduled) must still render fine
    // with the card gone.
    await expect(page.getByText("How are you feeling today?")).not.toBeVisible();
    await expect(page.getByText("Today")).toBeVisible();

    // The dedicated /recovery page always offers a check-in regardless of
    // the Today-card dismissal.
    await page.goto("/recovery");
    await expect(page.getByText("How are you feeling today?")).toBeVisible();
  });
});
