import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, deleteAllRecoveryEntries } from "./helpers";

// phase-7-review.md remediation — regression coverage for BLOCKER-1,
// HIGH-1, HIGH-2, and MEDIUM-2, each reproduced independently by the review
// against the pre-remediation tree. Local-only (needs a real Postgres via
// docker-compose), never run in CI, same convention as every other Phase 3+
// spec.

const VIEWPORTS = [
  { name: "375x667 (iPhone SE)", width: 375, height: 667 },
  { name: "390x664 (Safari usable height)", width: 390, height: 664 },
  { name: "390x844 (iPhone 12-15)", width: 390, height: 844 },
  { name: "430x844 (15 Pro Max)", width: 430, height: 844 },
];

async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe("BLOCKER-1 remediation: nav fits every reviewed iPhone width with no document-level horizontal overflow", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: no horizontal overflow and every nav link (incl. Recovery) is fully on-screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);

      const width = await scrollWidth(page);
      expect(
        width,
        "document.documentElement.scrollWidth must not exceed the viewport width",
      ).toBeLessThanOrEqual(viewport.width);

      for (const linkName of [
        "Today",
        "History",
        "Exercises",
        "Programs",
        "Volume",
        "Bodyweight",
        "Recovery",
      ]) {
        const link = page.getByRole("link", { name: linkName, exact: true });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        if (!box) throw new Error(`no bounding box for nav link "${linkName}"`);
        expect(box.x, `"${linkName}" left edge must be within the viewport`).toBeGreaterThanOrEqual(
          0,
        );
        expect(
          box.x + box.width,
          `"${linkName}" right edge must be within the viewport (fully on-screen, not clipped)`,
        ).toBeLessThanOrEqual(viewport.width);
      }
    });
  }

  // The regression must not be specific to /today — the review found it
  // propagated to every screen via the shared (app) layout's nav.
  for (const path of [
    "/bodyweight",
    "/recovery",
    "/volume",
    "/exercises",
    "/history",
    "/programs",
  ]) {
    test(`no horizontal overflow on ${path} at 375x667`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await login(page);
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Recovery", exact: true })).toBeVisible();
      expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
    });
  }
});

test.describe("HIGH-2 remediation: Today's primary CTA stays above the fold with the recovery card visible", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: Start workout (or Continue workout / takeover banner) renders within the initial viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);
      await ensureNoActiveSession(page);

      // The recovery card must actually be visible (not dismissed) for this
      // to be a meaningful check — this is a fresh browser context, so the
      // per-device dismissal preference starts unset.
      await expect(page.getByText("How are you feeling today?")).toBeVisible();

      const cta = page.getByRole("button", { name: "Start workout" });
      await expect(cta).toBeVisible();
      const box = await cta.boundingBox();
      if (!box) throw new Error("no bounding box for the Start workout button");
      expect(
        box.y + box.height,
        "Start workout must be reachable without scrolling on this viewport",
      ).toBeLessThanOrEqual(viewport.height);
    });
  }
});

test.describe("HIGH-1 remediation: an already-logged recovery day never re-prompts with synthetic defaults", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a reload after a deliberate check-in shows the real stored values, not a blank 3/3/3 form, and editing without changes preserves them", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    // Guarantees a genuinely fresh (no-entry-yet) check-in regardless of
    // what an earlier spec in the same run left behind for today — the
    // same class of cross-test leak ensureNoActiveSession neutralizes for
    // workout sessions.
    await deleteAllRecoveryEntries(page);
    await page.reload();

    // Deliberate, non-neutral check-in.
    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    const sleepQuality = page.getByLabel("Sleep quality", { exact: true });
    await sleepQuality.focus();
    await sleepQuality.press("ArrowRight");
    await sleepQuality.press("ArrowRight"); // 3 -> 5
    const readiness = page.getByLabel("Readiness", { exact: true });
    await readiness.focus();
    await readiness.press("ArrowLeft"); // 3 -> 2
    await page.locator('input[placeholder="Note (optional)"]').fill("deliberate entry");
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText(/Logged today:.*Sleep quality 5\/5.*Readiness 2\/5/)).toBeVisible();

    // Reload — the old bug re-prompted with a blank 3/3/3 form here.
    await page.reload();
    await expect(
      page.getByText(/Logged today:.*Sleep quality 5\/5.*Readiness 2\/5.*Soreness 3\/5/),
    ).toBeVisible();
    await expect(page.getByText("deliberate entry")).toBeVisible();
    // The blank check-in form must NOT be showing at all.
    await expect(page.getByRole("button", { name: "Save check-in" })).not.toBeVisible();

    // Explicit edit path: sliders must pre-fill from the real stored
    // values, never from a neutral default.
    await page.getByRole("button", { name: "Edit today's check-in" }).click();
    await expect(page.getByLabel("Sleep quality", { exact: true })).toHaveValue("5");
    await expect(page.getByLabel("Readiness", { exact: true })).toHaveValue("2");
    await expect(page.getByLabel("Soreness", { exact: true })).toHaveValue("3");
    await expect(page.locator('input[placeholder="Note (optional)"]')).toHaveValue(
      "deliberate entry",
    );

    // Saving without touching anything must not destroy the observation.
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText(/Logged today:.*Sleep quality 5\/5.*Readiness 2\/5.*Soreness 3\/5/),
    ).toBeVisible();
    await expect(page.getByText("deliberate entry")).toBeVisible();

    // Clean up so later reruns start fresh — scoped to this test's own row
    // by its distinctive note, so an unrelated pre-existing row (e.g. from
    // another spec in the same run) can never make this locator ambiguous.
    await page.goto("/recovery");
    const ownRow = page.locator("li").filter({ hasText: "deliberate entry" });
    await ownRow.getByRole("button", { name: "Delete" }).click();
    await expect(ownRow).not.toBeVisible();
  });
});

test.describe("MEDIUM-2 remediation: the recovery history editor never fabricates values for null metrics", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("editing an entry with null metrics shows 'Not set', supports sleepHours, and enforces at-least-one-metric before submit", async ({
    page,
  }) => {
    await login(page);
    // Clean slate — an unrelated leftover entry from another spec in the
    // same run (e.g. still holding "today") would otherwise sit in the same
    // history list as this test's own fixture.
    await deleteAllRecoveryEntries(page);

    // Log an entry via the API directly with sleepHours as the only
    // metric — sleepQuality/readiness/soreness genuinely null, a shape the
    // schema/DB explicitly allow.
    await page.request.post("/api/recovery", {
      data: { date: "2026-01-05", sleepHours: 8 },
    });

    await page.goto("/recovery");
    // Scoped to this test's own row by its distinctive value — both to
    // disambiguate from RecoveryCheckIn's own "Edit today's check-in"
    // button and from any unrelated pre-existing history row.
    const ownRow = page.locator("li").filter({ hasText: "Sleep 8h" });
    await expect(ownRow).toBeVisible();

    await ownRow.getByRole("button", { name: "Edit", exact: true }).click();
    // The old bug seeded every slider with `?? 3`; it must now show
    // "Not set" for every metric this entry never had.
    await expect(page.getByText("Sleep quality: not set")).toBeVisible();
    await expect(page.getByText("Readiness: not set")).toBeVisible();
    await expect(page.getByText("Soreness: not set")).toBeVisible();
    await expect(page.getByLabel("Edit sleep hours")).toHaveValue("8");

    // Clear the one metric this entry has, with nothing else set — the
    // client must block the save with an explicit error, never silently
    // fabricate a replacement value.
    await page.getByRole("button", { name: "Clear Sleep hours" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText(
        /At least one of sleep hours, sleep quality, readiness, or soreness is required/,
      ),
    ).toBeVisible();

    // Set a different metric via its own explicit "Set" affordance, then
    // save successfully — the untouched metrics must remain null, not 3.
    await page.getByRole("button", { name: "Set Sleep quality" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Re-locate this test's own row by its new (post-edit) content — never
    // fabricated to 3 for the metrics that were never set.
    const editedRow = page.locator("li").filter({ hasText: "Sleep quality 3/5" });
    await expect(editedRow).toBeVisible();
    await expect(editedRow.getByText(/Readiness \d\/5/)).toHaveCount(0);
    await expect(editedRow.getByText(/Soreness \d\/5/)).toHaveCount(0);
    await expect(editedRow.getByText(/Sleep \d+h/)).toHaveCount(0);

    // Clean up.
    await editedRow.getByRole("button", { name: "Delete" }).click();
    await expect(editedRow).not.toBeVisible();
  });
});

// phase-7-remediation-verification.md — the remediation's own MEDIUM-2 fix
// (the "Clear" affordance in the history editor) combined with its HIGH-1
// fix (a second, newly-written editing surface on Today) reintroduced the
// exact defect MEDIUM-2 was raised about: RecoveryCheckInForm seeded every
// slider with `entry?.x ?? NEUTRAL`, so a metric the user had just cleared
// via the history editor silently reappeared as 3 the moment they opened
// "Edit today's check-in," and an unchanged Save wrote the fabricated value
// back. This reproduces the verifier's exact chain end to end.
test.describe("MEDIUM-2 recurrence remediation: Today's edit path honors metrics cleared in the history editor", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("history clears metrics -> Today edit -> unchanged save -> metrics remain null", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    // Step 1 (verifier): log today's check-in from the Today card with the
    // defaults untouched -> sleepQuality 3, readiness 3, soreness 3.
    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Logged today: Sleep quality 3/5 · Readiness 3/5 · Soreness 3/5", {
        exact: true,
      }),
    ).toBeVisible();

    // Step 2 (verifier): on /recovery, use the history editor's own "Clear"
    // affordance to clear Sleep quality and Soreness -> {sq: null, rd: 3,
    // so: null}. The Today summary must correctly omit them immediately.
    // `deleteAllRecoveryEntries` + this test's own single Save above
    // guarantee exactly one row, so `.first()` (not a text filter) is used
    // here — the row's own text changes shape once it enters edit mode
    // (the slider's label and value are separate elements, not the
    // concatenated "Sleep quality 3/5" the read-only summary renders), so a
    // locator built from that text would stop matching the instant Edit is
    // clicked.
    await page.goto("/recovery");
    const historyRow = page.locator("ul").locator("li").first();
    await historyRow.getByRole("button", { name: "Edit", exact: true }).click();
    await historyRow.getByRole("button", { name: "Clear Sleep quality" }).click();
    await historyRow.getByRole("button", { name: "Clear Soreness" }).click();
    await historyRow.getByRole("button", { name: "Save", exact: true }).click();
    // The history row itself (not the RecoveryCheckIn summary above it,
    // which only fetches once on mount and isn't expected to live-refresh
    // from an unrelated sibling component's save) reflects the edit
    // immediately: only Readiness remains.
    await expect(historyRow.getByText("· Readiness 3/5", { exact: true })).toBeVisible();
    await expect(historyRow.getByText(/Sleep quality \d\/5/)).toHaveCount(0);
    await expect(historyRow.getByText(/Soreness \d\/5/)).toHaveCount(0);

    // Step 3 (verifier): back on Today, tap "Edit today's check-in" — the
    // two cleared metrics must render "not set", never a fabricated 3.
    await page.goto("/today");
    await page.getByRole("button", { name: "Edit today's check-in" }).click();
    await expect(page.getByText("Sleep quality: not set")).toBeVisible();
    await expect(page.getByText("Soreness: not set")).toBeVisible();
    await expect(page.getByLabel("Readiness", { exact: true })).toHaveValue("3");

    // Step 4 (verifier): tap Save without changing anything — the cleared
    // metrics must still be null afterward, not written back as 3.
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText("Logged today: Readiness 3/5", { exact: true })).toBeVisible();

    // Clean up.
    await page.goto("/recovery");
    const ownRow = page.locator("li").filter({ hasText: "Readiness 3/5" });
    await ownRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No entries yet.")).toBeVisible();
  });

  test("a sleepHours-only entry: Today's edit path shows every 1-5 metric as not set and preserves sleepHours on an unchanged save", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);

    await page.request.post("/api/recovery", { data: { sleepHours: 7.5 } });
    await page.reload();

    await expect(page.getByText("Logged today: Sleep 7.5h", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit today's check-in" }).click();
    await expect(page.getByText("Sleep quality: not set")).toBeVisible();
    await expect(page.getByText("Readiness: not set")).toBeVisible();
    await expect(page.getByText("Soreness: not set")).toBeVisible();

    // Unchanged save — sleepHours is never shown or edited by this card, so
    // it must survive exactly, and no 1-5 metric may be fabricated.
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText("Logged today: Sleep 7.5h", { exact: true })).toBeVisible();

    // Clean up.
    await page.goto("/recovery");
    const ownRow = page.locator("li").filter({ hasText: "Sleep 7.5h" });
    await ownRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No entries yet.")).toBeVisible();
  });
});

// phase-7-remediation-verification.md "New LOW" — clearing the sleep-hours
// text box left the previous number in component state (the `if (parsed
// !== null)` guard only ever moved forward, never back to null), so the
// field displayed blank while Save silently kept the old value.
test.describe("sleep-hours textbox remediation: emptying the field clears the value, not just the display", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("clearing the sleep-hours textbox (not the Clear button) saves null, not the previous number", async ({
    page,
  }) => {
    await login(page);
    await deleteAllRecoveryEntries(page);

    // soreness is set alongside sleepHours so clearing sleepHours alone
    // never trips the at-least-one-metric guard — isolates the textbox bug.
    await page.request.post("/api/recovery", {
      data: { date: "2026-01-06", sleepHours: 8, soreness: 2 },
    });

    await page.goto("/recovery");
    const row = page.locator("li").filter({ hasText: "Sleep 8h" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit", exact: true }).click();

    const sleepHoursInput = page.getByLabel("Edit sleep hours");
    await expect(sleepHoursInput).toHaveValue("8");
    await sleepHoursInput.fill("");
    // Emptying the field clears the underlying value immediately (not just
    // the display) — the component reflects that consistently by switching
    // to the same "not set" representation a "Clear" tap produces, rather
    // than leaving a blank text box that still holds 8 internally.
    await expect(page.getByText("Sleep hours: not set")).toBeVisible();
    await expect(sleepHoursInput).not.toBeVisible();

    await page.getByRole("button", { name: "Save", exact: true }).click();

    const savedRow = page.locator("li").filter({ hasText: "Soreness 2/5" });
    await expect(savedRow).toBeVisible();
    await expect(savedRow.getByText(/Sleep \d+(\.\d+)?h/)).toHaveCount(0);

    // Clean up.
    await savedRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No entries yet.")).toBeVisible();
  });
});
