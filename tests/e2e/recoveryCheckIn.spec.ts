import { test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  deleteAllRecoveryEntries,
  waitForOutboxDrained,
} from "./helpers";

// PI-007 — recovery check-in completeness and scale clarity: optional sleep
// hours entered/edited/cleared directly on Today's new-entry, edit and
// unknown-offline forms; "Muscle soreness" terminology; visible anchors on
// that control. Coverage here follows the architecture evaluation's §7
// acceptance criteria (A, B, D, E letter groups) — C-1/C-2/C-5/C-6 (true
// offline scenarios needing the same cache-manipulation helpers) live in
// offline-bodyweight-recovery.spec.ts instead, alongside the infrastructure
// they need. C-3/C-4 are integration-level, in
// syncDailyLogs.integration.test.ts. Local-only (needs a real Postgres via
// docker-compose), never run in CI, same convention as every other Phase 3+
// spec.

test.describe("A — new entry and the stale-read race", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("A-1: no entry today shows three sliders at 3 and Sleep hours: not set; saving untouched stores sleep_hours null", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await expect(page.getByText("Sleep hours: not set")).toBeVisible();
    await expect(page.getByLabel("Sleep quality", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Readiness", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Muscle soreness", { exact: true })).toHaveValue("3");

    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Logged today: Sleep quality 3/5 · Readiness 3/5 · Muscle soreness 3/5", {
        exact: true,
      }),
    ).toBeVisible();

    // The optimistic UI update runs before the outbox flush is confirmed
    // server-side — wait for it to drain before reading server state back.
    await waitForOutboxDrained(page);
    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as {
      entry: {
        sleepHours: number | null;
        sleepQuality: number | null;
        readiness: number | null;
        soreness: number | null;
      } | null;
    };
    expect(entry?.sleepHours).toBeNull();
    expect(entry?.sleepQuality).toBe(3);
    expect(entry?.readiness).toBe(3);
    expect(entry?.soreness).toBe(3);

    await deleteAllRecoveryEntries(page);
  });

  test("A-2: Set Sleep hours, enter 7.5, save -> stored and summarized", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await page.getByRole("button", { name: "Set Sleep hours" }).click();
    await page.getByLabel("Sleep hours", { exact: true }).fill("7.5");
    await page.getByRole("button", { name: "Save check-in" }).click();

    await expect(page.getByText(/Logged today: Sleep 7\.5h/)).toBeVisible();
    await waitForOutboxDrained(page);
    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as { entry: { sleepHours: number | null } | null };
    expect(entry?.sleepHours).toBe(7.5);

    await deleteAllRecoveryEntries(page);
  });

  // A-4 [NC] — the stale-read race: the actual control for §5's state-A
  // omit rule. A-3 (a unit test pinning the transport helper alone) cannot
  // detect this — only an end-to-end save against a row created behind the
  // card's back can.
  test("A-4 [NC]: an untouched save in state A never clears a same-day row created out of band", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    // The card is rendered from a confirmed "no entry" read. Create today's
    // row out of band, behind the card's back, before saving.
    await page.request.post("/api/recovery", { data: { sleepHours: 6 } });

    // Save without touching any field. The optimistic summary reflects
    // this component's own (stale) local state — it still thinks
    // sleepHours is null — which is causally after the outbox enqueue
    // completes, so waiting for it first (rather than polling the outbox
    // immediately after the click) avoids a false-early "drained" read.
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Logged today: Sleep quality 3/5 · Readiness 3/5 · Muscle soreness 3/5", {
        exact: true,
      }),
    ).toBeVisible();
    await waitForOutboxDrained(page);

    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as {
      entry: {
        sleepHours: number | null;
        sleepQuality: number | null;
        readiness: number | null;
        soreness: number | null;
      } | null;
    };
    expect(entry?.sleepHours).toBe(6);
    expect(entry?.sleepQuality).toBe(3);
    expect(entry?.readiness).toBe(3);
    expect(entry?.soreness).toBe(3);

    await deleteAllRecoveryEntries(page);
  });
});

test.describe("B — existing-entry edit and clear", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function seedEntryAndOpenEdit(page: Page): Promise<void> {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.request.post("/api/recovery", { data: { sleepHours: 8, soreness: 2 } });
    await page.reload();
    await expect(
      page.getByText("Logged today: Sleep 8h · Muscle soreness 2/5", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit today's check-in" }).click();
  }

  test("B-1 [NC]: unchanged save preserves sleep hours and soreness", async ({ page }) => {
    await seedEntryAndOpenEdit(page);
    await expect(page.getByLabel("Sleep hours", { exact: true })).toHaveValue("8");

    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText(/Logged today:.*Sleep 8h.*Muscle soreness 2\/5/)).toBeVisible();

    await deleteAllRecoveryEntries(page);
  });

  test("B-2: changing sleep hours to 6.75 stores it and leaves the 1-5 metrics unchanged", async ({
    page,
  }) => {
    await seedEntryAndOpenEdit(page);
    await page.getByLabel("Sleep hours", { exact: true }).fill("6.75");
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText(/Logged today:.*Sleep 6\.75h.*Muscle soreness 2\/5/)).toBeVisible();

    await deleteAllRecoveryEntries(page);
  });

  test("B-3: clearing sleep hours saves null while soreness survives", async ({ page }) => {
    await seedEntryAndOpenEdit(page);
    await page.getByRole("button", { name: "Clear Sleep hours" }).click();
    await expect(page.getByText("Sleep hours: not set")).toBeVisible();

    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Logged today: Muscle soreness 2/5", { exact: true }),
    ).toBeVisible();

    await waitForOutboxDrained(page);
    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as {
      entry: { sleepHours: number | null; soreness: number | null } | null;
    };
    expect(entry?.sleepHours).toBeNull();
    expect(entry?.soreness).toBe(2);

    await deleteAllRecoveryEntries(page);
  });

  test("B-4: emptying the sleep-hours textbox behaves identically to Clear", async ({ page }) => {
    await seedEntryAndOpenEdit(page);
    const sleepHoursInput = page.getByLabel("Sleep hours", { exact: true });
    await sleepHoursInput.fill("");
    await expect(page.getByText("Sleep hours: not set")).toBeVisible();
    await expect(sleepHoursInput).not.toBeVisible();
    // Scoped to <main> — Next.js's App Router mounts its own always-present,
    // visually-hidden role="alert" route announcer (app-router-announcer.js)
    // outside <main> for screen-reader navigation announcements, unrelated
    // to this form's validation. An unscoped getByRole("alert") would always
    // find that one regardless of this feature.
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Logged today: Muscle soreness 2/5", { exact: true }),
    ).toBeVisible();

    await deleteAllRecoveryEntries(page);
  });

  // B-5 [NC] — the G-5 guard fix: before it, this check read the immutable
  // `entry.sleepHours` (still 8) instead of the live editable state, so
  // clearing the entry's only metric would never have tripped the guard.
  test("B-5 [NC]: clearing the only metric while every slider is not set blocks the save with an explicit error", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.request.post("/api/recovery", { data: { sleepHours: 8 } });
    await page.reload();
    await expect(page.getByText("Logged today: Sleep 8h", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit today's check-in" }).click();
    await expect(page.getByText("Sleep quality: not set")).toBeVisible();
    await expect(page.getByText("Readiness: not set")).toBeVisible();
    await expect(page.getByText("Muscle soreness: not set")).toBeVisible();

    await page.getByRole("button", { name: "Clear Sleep hours" }).click();
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText(
        "At least one of sleep hours, sleep quality, readiness, or muscle soreness is required.",
      ),
    ).toBeVisible();

    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as { entry: { sleepHours: number | null } | null };
    expect(entry?.sleepHours).toBe(8);

    await deleteAllRecoveryEntries(page);
  });
});

test.describe("D — terminology without rescale", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("D-1: Today and Recovery history render 'Muscle soreness' by exact match; Metrics keeps the compact 'Soreness' header with the caption naming the term", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await expect(page.getByLabel("Muscle soreness", { exact: true })).toBeVisible();

    await page.request.post("/api/recovery", { data: { soreness: 4 } });
    await page.goto("/recovery");
    // Scoped to the history list — the check-in card above it also renders
    // its own "Muscle soreness 4/5" summary for the same entry.
    const historyList = page.locator("ul");
    await expect(historyList.getByText("Muscle soreness 4/5", { exact: false })).toBeVisible();

    await page.goto("/metrics");
    await expect(page.getByText("Soreness", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        /The Soreness column is muscle soreness: 1 = none, 3 = moderate, 5 = very high\./,
      ),
    ).toBeVisible();

    await deleteAllRecoveryEntries(page);
  });

  test("D-2: soreness anchors are always visible on the new-entry form and appear only after Set on the edit form", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    // New-entry form: the non-nullable SliderField renders the legend
    // unconditionally.
    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await expect(page.getByText("1 · None")).toBeVisible();
    await expect(page.getByText("3 · Moderate")).toBeVisible();
    await expect(page.getByText("5 · Very high")).toBeVisible();

    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText(/Logged today:/)).toBeVisible();

    // Edit form: soreness was just saved at 3 (not null), so the legend is
    // already visible; clearing it must hide the legend (UnsetField renders
    // no track, A-3), and Set must bring it back. Stays on /today
    // throughout (R-3) so "Set/Clear Muscle soreness" can't collide with
    // History's own controls.
    await page.getByRole("button", { name: "Edit today's check-in" }).click();
    await expect(page.getByText("1 · None")).toBeVisible();

    await page.getByRole("button", { name: "Clear Muscle soreness" }).click();
    await expect(page.getByText("1 · None")).toHaveCount(0);
    await page.getByRole("button", { name: "Set Muscle soreness" }).click();
    await expect(page.getByText("1 · None")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await deleteAllRecoveryEntries(page);
  });

  // D-3/D-4 [NC] — labels changed, the stored 1-5 scale did not: the
  // slider's own range/step attributes are unchanged, and a stored value
  // reads back identically through both GET endpoints (D-4's third named
  // channel, the Metrics summary, reads through the same
  // RecoveryEntryRecord/DTO plumbing with no separate transformation —
  // verified by reading src/server/recovery/service.ts and
  // src/ui/metrics/RecoveryCard.tsx rather than a fragile dashboard-page
  // render assertion).
  test("D-3 [NC] / D-4 [NC]: soreness keeps its 1-5 range/step and reads back with no rescale through both GET endpoints", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.request.post("/api/recovery", { data: { soreness: 1 } });
    await page.reload();

    const soreness = page.getByLabel("Muscle soreness", { exact: true });
    await page.getByRole("button", { name: "Edit today's check-in" }).click();
    await expect(soreness).toHaveValue("1");
    await expect(soreness).toHaveAttribute("min", "1");
    await expect(soreness).toHaveAttribute("max", "5");
    await expect(soreness).toHaveAttribute("step", "1");
    await page.getByRole("button", { name: "Cancel" }).click();

    const todayRes = await page.request.get("/api/recovery/today");
    const { entry: todayEntry } = (await todayRes.json()) as {
      entry: { soreness: number | null } | null;
    };
    expect(todayEntry?.soreness).toBe(1);

    const listRes = await page.request.get("/api/recovery");
    const { entries } = (await listRes.json()) as { entries: { soreness: number | null }[] };
    expect(entries.some((e) => e.soreness === 1)).toBe(true);

    await deleteAllRecoveryEntries(page);
  });
});

test.describe("E-1: layout at 320px and 390px", () => {
  test("no horizontal overflow at 320x568 and 390x844 on /today, /recovery and /metrics; the metrics recovery table keeps five columns", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await page.request.post("/api/recovery", { data: { soreness: 3 } });

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const path of ["/today", "/recovery", "/metrics"]) {
        await page.goto(path);
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width, `${path} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
          viewport.width,
        );
      }
      // Scoped to the Recovery card's own table — Metrics also has a
      // Volume table on the same page, which an unscoped `table thead th`
      // count would also pick up.
      const recoveryTable = page
        .locator("section", { has: page.getByRole("heading", { name: "Recovery" }) })
        .locator("table");
      await expect(recoveryTable.locator("thead th")).toHaveCount(5);
    }

    await deleteAllRecoveryEntries(page);
  });
});

test.describe("E — validation and regression", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("E-2: sleep hours has inputMode=decimal, and typing 7,5 stores 7.5", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await page.getByRole("button", { name: "Set Sleep hours" }).click();
    const input = page.getByLabel("Sleep hours", { exact: true });
    await expect(input).toHaveAttribute("inputmode", "decimal");
    await input.fill("7,5");
    await page.getByRole("button", { name: "Save check-in" }).click();

    await expect(page.getByText(/Logged today: Sleep 7\.5h/)).toBeVisible();
    await deleteAllRecoveryEntries(page);
  });

  test("E-3 [NC]: both reachable guard cases show the range error and enqueue nothing, keeping the input rendered", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();

    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await page.getByRole("button", { name: "Set Sleep hours" }).click();
    const input = page.getByLabel("Sleep hours", { exact: true });

    await input.fill("25");
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Enter sleep hours between 0 and 24, to at most 2 decimals."),
    ).toBeVisible();
    await expect(input).toBeVisible();

    await input.fill("7.333");
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(
      page.getByText("Enter sleep hours between 0 and 24, to at most 2 decimals."),
    ).toBeVisible();
    await expect(input).toBeVisible();

    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as { entry: unknown };
    expect(entry).toBeNull();
  });

  // E-4 [NC] — History's own boundary (§1): its PATCH already gets a
  // synchronous 400 from the server, so it needs (and gets) no client-side
  // guard of its own; this stays exactly the pre-existing generic message.
  test("E-4 [NC]: Recovery History's out-of-range save still produces the generic 'Save failed.' message, not the inline guard", async ({
    page,
  }) => {
    await login(page);
    await deleteAllRecoveryEntries(page);
    await page.request.post("/api/recovery", { data: { date: "2026-01-07", sleepHours: 8 } });

    await page.goto("/recovery");
    const row = page.locator("ul").locator("li").first();
    await expect(row.getByText("Sleep 8h")).toBeVisible();
    await row.getByRole("button", { name: "Edit", exact: true }).click();

    await page.getByLabel("Edit sleep hours").fill("25");
    await row.getByRole("button", { name: "Save", exact: true }).click();

    await expect(row.getByText("Save failed.")).toBeVisible();
    await expect(
      row.getByText("Enter sleep hours between 0 and 24, to at most 2 decimals."),
    ).toHaveCount(0);

    await deleteAllRecoveryEntries(page);
  });
});
