import { test, expect, type Page, type Locator } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Warm-up Set Classification remediation
// (docs/reviews/estimated-1rm-load-translation-architecture-review.md §9 /
// F-1) — end-to-end coverage for the new "Warm-up set" set-entry/history-edit
// control: toggle persistence within an exercise, reset for another
// exercise, mobile-viewport layout, the pre-existing "W ·" marker, and
// history-edit exposure through the real UI. None of the underlying
// filtering (progression/volume/carry-forward) is exercised here — that is
// proved against real SQL in
// tests/integration/warmupSetClassification.integration.test.ts; this file
// only proves the UI actually sets and displays the flag.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

function exerciseCard(page: Page, index: number): Locator {
  return page.locator("ul.flex.flex-col.gap-3 > li").nth(index);
}

async function logSet(card: Locator, kg: string, reps: string): Promise<void> {
  await card.getByLabel("kg").fill(kg);
  await card.getByLabel("reps").fill(reps);
  await card.getByRole("button", { name: "Log", exact: true }).click();
}

// SetRow's read-mode row, found by its own rendered label and walked up to
// its own <li> — same idiom as offline-set-edit-delete.spec.ts's `setRow`,
// redefined locally and scoped to one exercise card since this file can have
// two cards on screen at once.
function setRow(card: Locator, label: string): Locator {
  return card.getByText(label, { exact: true }).locator("xpath=ancestor::li[1]");
}

// After "Edit" is clicked the row's own text changes to input values, so it
// can no longer be found by label — same fallback offline-set-edit-
// delete.spec.ts uses: whichever leaf <li> in this card currently shows a
// "Save" button. Only one row is ever being edited at a time in these tests.
function editingRow(card: Locator): Locator {
  return card
    .locator("li:not(:has(li))")
    .filter({ has: card.page().getByRole("button", { name: "Save" }) });
}

async function addAdhocExercise(page: Page): Promise<void> {
  await page.getByRole("button", { name: "+ Add exercise" }).click();
  const firstResult = page.locator("ul.max-h-48 li button").first();
  await firstResult.waitFor();
  await firstResult.click();
}

async function discardWorkout(page: Page): Promise<void> {
  await waitForOutboxDrained(page);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Discard workout" }).click();
  await page.waitForURL(/\/today$/);
}

test.describe("warm-up set toggle — set entry", () => {
  test("stays on across consecutive logs within one exercise, and resets for another exercise", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await addAdhocExercise(page);
    const first = exerciseCard(page, 0);
    const second = exerciseCard(page, 1);

    // Default: off on both, for a freshly entered exercise.
    await expect(first.getByLabel("Warm-up set")).not.toBeChecked();
    await expect(second.getByLabel("Warm-up set")).not.toBeChecked();

    await first.getByLabel("Warm-up set").check();
    await logSet(first, "60", "5");
    await expect(first.getByText("W · 60 kg × 5", { exact: true })).toBeVisible();
    // Stays on for the next set of the SAME exercise, with no re-click.
    await expect(first.getByLabel("Warm-up set")).toBeChecked();
    await logSet(first, "80", "5");
    await expect(first.getByText("W · 80 kg × 5", { exact: true })).toBeVisible();

    // The other exercise's toggle was never touched by the first one's state.
    await expect(second.getByLabel("Warm-up set")).not.toBeChecked();
    await logSet(second, "40", "8");
    await expect(second.getByText("40 kg × 8", { exact: true })).toBeVisible();
    await expect(second.getByText("W · 40 kg × 8", { exact: true })).toHaveCount(0);

    // Turning it off on the first exercise makes its next set a work set.
    await first.getByLabel("Warm-up set").uncheck();
    await logSet(first, "110", "5");
    await expect(first.getByText("110 kg × 5", { exact: true })).toBeVisible();
    await expect(first.getByText("W · 110 kg × 5", { exact: true })).toHaveCount(0);

    await discardWorkout(page);
  });

  test("negative control: work-set logging is unchanged when the toggle is never touched", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    const card = exerciseCard(page, 0);
    await expect(card.getByLabel("Warm-up set")).not.toBeChecked();
    await logSet(card, "100", "5");
    await expect(card.getByText("100 kg × 5", { exact: true })).toBeVisible();
    await expect(card.getByText("W · 100 kg × 5", { exact: true })).toHaveCount(0);

    await discardWorkout(page);
  });
});

// V-1 remediation (docs/reviews/warmup-set-classification-remediation-
// verification.md) — a plain `useState(false)` reset the toggle to off on
// any remount of the same exercise (reload, PWA relaunch, takeover),
// silently turning the next ramp set into a work set mid-warm-up. The
// initial value now derives from the last logged set's own `isWarmup`
// instead.
test.describe("warm-up set toggle — remount/reload continuity (V-1)", () => {
  test("a reload mid-ramp restores the toggle from the last logged set, in either direction", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    const card = exerciseCard(page, 0);
    await card.getByLabel("Warm-up set").check();
    await logSet(card, "50", "5");
    await expect(card.getByText("W · 50 kg × 5", { exact: true })).toBeVisible();

    // Before this fix this assertion failed: the toggle came back unchecked.
    await page.reload();
    await expect(card.getByLabel("Warm-up set")).toBeChecked();
    await logSet(card, "70", "5");
    await expect(card.getByText("W · 70 kg × 5", { exact: true })).toBeVisible();

    // Negative control: the derivation must track the LAST set's own value,
    // not simply resolve to "checked" on every reload regardless of it.
    await card.getByLabel("Warm-up set").uncheck();
    await logSet(card, "110", "5");
    await expect(card.getByText("110 kg × 5", { exact: true })).toBeVisible();

    await page.reload();
    await expect(card.getByLabel("Warm-up set")).not.toBeChecked();
    await logSet(card, "110", "5");
    // Two consecutive 110kg work sets now exist; assert the count rather
    // than a single toBeVisible(), since the label alone can't tell them apart.
    await expect(card.getByText("110 kg × 5", { exact: true })).toHaveCount(2);
    await expect(card.getByText("W · 110 kg × 5", { exact: true })).toHaveCount(0);

    // A different exercise's fresh toggle is unaffected by the first
    // exercise's remembered state — reload or not.
    await addAdhocExercise(page);
    const second = exerciseCard(page, 1);
    await expect(second.getByLabel("Warm-up set")).not.toBeChecked();

    await discardWorkout(page);
  });
});

// V-2 remediation (docs/reviews/warmup-set-classification-remediation-
// verification.md) — ExerciseCard's own SetRow edit form (the in-session
// editor, distinct from the History screen) could not change `isWarmup`,
// even though the store's `EditSetPatch`/`editSet` already accepted it. A
// set mislogged during the workout was only fixable after completion.
test.describe("warm-up set — in-session reclassification (V-2)", () => {
  test("SetRow's own edit form flips isWarmup in either direction, without touching weight/reps", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    const card = exerciseCard(page, 0);
    await logSet(card, "90", "5");
    await expect(card.getByText("90 kg × 5", { exact: true })).toBeVisible();

    // Flip work -> warm-up through the in-session editor, not History.
    await setRow(card, "90 kg × 5").getByRole("button", { name: "Edit" }).click();
    const row1 = editingRow(card);
    const warmupCheckbox1 = row1.getByLabel("Warm-up set");
    await expect(warmupCheckbox1).not.toBeChecked();
    await warmupCheckbox1.check();
    await row1.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("W · 90 kg × 5", { exact: true })).toBeVisible();

    // W-1 remediation (docs/reviews/warmup-set-classification-remediation-
    // verification-2.md) — SetRow is keyed by set.id, so re-opening the
    // editor on the SAME set does not remount it: the local isWarmup state
    // survives from the previous Save regardless of what useState(...) was
    // seeded with, making the next assertion pass even against a
    // useState(false) seed. A reload forces a genuine remount so the
    // checkbox below can only be checked by actually reading set.isWarmup
    // (now true) from a fresh component instance.
    await page.reload();

    // Negative control: editing ONLY the weight on this now-warm-up set must
    // not fabricate or silently reset isWarmup back to false.
    await setRow(card, "W · 90 kg × 5").getByRole("button", { name: "Edit" }).click();
    const row2 = editingRow(card);
    await expect(row2.getByLabel("Warm-up set")).toBeChecked();
    await row2.locator("input").nth(0).fill("92.5");
    await row2.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("W · 92.5 kg × 5", { exact: true })).toBeVisible();

    // Flip back warm-up -> work.
    await setRow(card, "W · 92.5 kg × 5").getByRole("button", { name: "Edit" }).click();
    const row3 = editingRow(card);
    await expect(row3.getByLabel("Warm-up set")).toBeChecked();
    await row3.getByLabel("Warm-up set").uncheck();
    await row3.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("92.5 kg × 5", { exact: true })).toBeVisible();
    await expect(card.getByText("W · 92.5 kg × 5", { exact: true })).toHaveCount(0);

    await discardWorkout(page);
  });
});

test.describe("warm-up set toggle on a phone-sized viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone-sized

  test("no horizontal overflow, and rapid set entry stays unobstructed by the added control", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    const card = exerciseCard(page, 0);
    await expect(card.getByLabel("Warm-up set")).toBeVisible();
    await expect(card.getByLabel("kg")).toBeVisible();
    await expect(card.getByRole("button", { name: "Log", exact: true })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      )
      .toBe(false);

    // Rapid entry: toggle on, three quick warm-up logs, toggle off, one work
    // set — none of it obstructed by the added control.
    await card.getByLabel("Warm-up set").check();
    await logSet(card, "20", "8");
    await logSet(card, "40", "5");
    await logSet(card, "60", "3");
    await card.getByLabel("Warm-up set").uncheck();
    await logSet(card, "80", "5");
    await expect(card.getByText("W · 20 kg × 8", { exact: true })).toBeVisible();
    await expect(card.getByText("W · 40 kg × 5", { exact: true })).toBeVisible();
    await expect(card.getByText("W · 60 kg × 3", { exact: true })).toBeVisible();
    await expect(card.getByText("80 kg × 5", { exact: true })).toBeVisible();

    const stillNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(stillNoOverflow).toBe(false);

    await discardWorkout(page);
  });
});

test.describe("warm-up set — history editing", () => {
  test("exposes and can flip the stored value in either direction, persisting across reload", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    // Logged as a work set — the history editor must expose this as unchecked.
    const card = exerciseCard(page, 0);
    await logSet(card, "100", "5");
    await waitForOutboxDrained(page);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    // Queried via the API rather than the History list's text, for the same
    // reason offline-set-edit-delete.spec.ts does: this dev DB accumulates
    // sessions across every spec run, so "most recent" is only unambiguous
    // through the API's own ordering.
    const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
      sessions: { id: string }[];
    };
    const sessionId = historyList.sessions[0]!.id;
    await page.goto(`/history/${sessionId}`);
    await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();

    // Flip work → warm-up.
    await page.getByRole("button", { name: "Edit" }).click();
    const warmupCheckbox = page.getByLabel("Warm-up set");
    await expect(warmupCheckbox).not.toBeChecked();
    await warmupCheckbox.check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("W · 100 kg × 5", { exact: true })).toBeVisible();
    await waitForOutboxDrained(page);

    await page.reload();
    await expect(page.getByText("W · 100 kg × 5", { exact: true })).toBeVisible();

    // Flip back warm-up → work; weight/reps must survive untouched.
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Warm-up set")).toBeChecked();
    await page.getByLabel("Warm-up set").uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();
    await expect(page.getByText("W · 100 kg × 5", { exact: true })).toHaveCount(0);
    await waitForOutboxDrained(page);

    await page.reload();
    await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();
    await expect(page.getByText("W · 100 kg × 5", { exact: true })).toHaveCount(0);
  });
});
