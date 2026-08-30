import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Active-schedule remediation e2e — implementation-plan.md Phase 5's block
// lifecycle was wrong: a real-iPhone acceptance pass found that once a
// block is active its schedule could not be edited at all, contradicting
// domain-model.md §9 ("Block config, schedule, deload | yes (future
// weeks)"). This spec drives the real browser UI end to end:
//
//   1. Build a four-day Upper A / Lower A / Upper B / Lower B fixed-weekday
//      schedule on the shared seed block (already active).
//   2. Open the block editor, move a weekday from one entry to another,
//      save, reload — the change persists and is visible.
//   3. Today resolves the newly assigned template for the tested day.
//   4. A workout already in progress when the edit happened is unaffected.
//   5. An invalid (overlapping) edit is rejected with a visible error and
//      never persisted.
//
// The app enforces at most one active program/block per (single) user
// (ADR-004), so this spec cannot spin up an independent active block —
// like deload.spec.ts's week-override dance, it temporarily reshapes the
// shared seed block's schedule and restores the original in `finally`.
// Playwright is pinned to `workers: 1` (serial), so no other spec can
// observe the intermediate state.

const WEEKDAY_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// Matches the server's own conversion (src/server/time/userLocalDate.ts)
// for the account's timezone (users.timezone defaults to "Europe/Ljubljana"
// and nothing in the app ever overrides it — single-account, ADR-004).
function todayIsoWeekdayInAccountTimezone(): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Ljubljana",
    weekday: "short",
  }).format(new Date());
  const day = WEEKDAY_ISO[label];
  if (!day) throw new Error(`unrecognized weekday label: ${label}`);
  return day;
}

interface ScheduleEntryDto {
  templateId: string;
  position: number;
  weekdays: number[] | null;
}
interface BlockDto {
  id: string;
  programId: string;
  status: string;
  schedule: ScheduleEntryDto[];
}
interface TodayBundleDto {
  today: { kind: string; blockId?: string; templateId?: string };
}
interface ActiveSessionDto {
  activeSession: {
    id: string;
    templateId: string | null;
    templateName: string | null;
    weekIndex: number | null;
    isDeload: boolean;
    exercises: { exerciseId: string; prescription: unknown }[];
  } | null;
}

async function createTemplateWithPrescription(
  page: Page,
  programId: string,
  exerciseId: string,
  name: string,
): Promise<string> {
  const templateRes = await page.request.post(`/api/programs/${programId}/templates`, {
    data: { name },
  });
  expect(templateRes.ok(), `create template ${name}`).toBe(true);
  const { template } = (await templateRes.json()) as { template: { id: string } };

  const prescriptionRes = await page.request.post(`/api/templates/${template.id}/prescriptions`, {
    data: {
      exerciseId,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    },
  });
  expect(prescriptionRes.ok(), `create prescription for ${name}`).toBe(true);
  return template.id;
}

test.describe("active-block schedule editing (active-schedule remediation)", () => {
  test("a four-day Upper/Lower schedule can be edited on an active block, Today follows it, an in-progress workout is unaffected, and an overlapping edit is rejected", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    const bundleRes = await page.request.get("/api/today-bundle");
    expect(bundleRes.ok()).toBe(true);
    const bundle = (await bundleRes.json()) as TodayBundleDto;
    expect(bundle.today.kind).toBe("scheduled");
    const blockId = bundle.today.blockId!;

    const originalBlockRes = await page.request.get(`/api/blocks/${blockId}`);
    expect(originalBlockRes.ok()).toBe(true);
    const { block: originalBlock } = (await originalBlockRes.json()) as { block: BlockDto };
    const programId = originalBlock.programId;
    const originalSchedulePayload = originalBlock.schedule
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ templateId: e.templateId, weekdays: e.weekdays ?? undefined }));

    const exercisesRes = await page.request.get("/api/exercises");
    expect(exercisesRes.ok()).toBe(true);
    const { exercises } = (await exercisesRes.json()) as { exercises: { id: string }[] };
    const exerciseId = exercises[0]!.id;

    const today = todayIsoWeekdayInAccountTimezone();
    const restOfWeek = Array.from({ length: 6 }, (_, i) => ((today - 1 + i + 1) % 7) + 1);

    const upperAId = await createTemplateWithPrescription(page, programId, exerciseId, "Upper A");
    const lowerAId = await createTemplateWithPrescription(page, programId, exerciseId, "Lower A");
    const upperBId = await createTemplateWithPrescription(page, programId, exerciseId, "Upper B");
    const lowerBId = await createTemplateWithPrescription(page, programId, exerciseId, "Lower B");
    const tempTemplateIds = [upperAId, lowerAId, upperBId, lowerBId];

    try {
      // Step 1 — build the four-day fixed-weekday schedule on the
      // already-active shared block. Today and one later day both belong to
      // Upper A (so that removing "today" from it below leaves it with a
      // remaining fixed weekday, not an empty/rotation-looking entry); the
      // rest of the week is spread across the other three (Lower B keeps
      // three, demonstrating one template owning multiple distinct
      // weekdays).
      const fourDayRes = await page.request.patch(`/api/blocks/${blockId}`, {
        data: {
          schedule: [
            { templateId: upperAId, weekdays: [today, restOfWeek[5]] },
            { templateId: lowerAId, weekdays: [restOfWeek[0]] },
            { templateId: upperBId, weekdays: [restOfWeek[1]] },
            { templateId: lowerBId, weekdays: restOfWeek.slice(2, 5) },
          ],
        },
      });
      expect(fourDayRes.ok(), await fourDayRes.text()).toBe(true);

      const beforeEditBundleRes = await page.request.get("/api/today-bundle");
      const beforeEditBundle = (await beforeEditBundleRes.json()) as TodayBundleDto;
      expect(beforeEditBundle.today.templateId).toBe(upperAId);

      // Start a workout against today's (Upper A) resolution — this is the
      // "workout already in progress" the later edit must not touch.
      await page.goto("/today");
      await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      // phase-8-review.md HIGH-3 remediation — pre-existing race, unrelated
      // to Phase 8: `startSession` commits locally to IndexedDB immediately,
      // but this spec queries the SERVER's view of the session
      // (`/api/active-session`) right after, before the outbox has actually
      // flushed the session/session-exercise create ops. Without waiting,
      // the server can still show `exercises: []` here — reproduced on a
      // freshly migrated+seeded database in complete isolation, not a
      // cross-spec contamination artifact.
      await waitForOutboxDrained(page);

      const beforeEditSessionRes = await page.request.get("/api/active-session");
      const beforeEditSession = ((await beforeEditSessionRes.json()) as ActiveSessionDto)
        .activeSession;
      expect(beforeEditSession?.templateId).toBe(upperAId);

      // Steps 3-4 — open the block editor and move today's weekday from
      // Upper A to Lower A.
      await page.goto(`/blocks/${blockId}`);
      await expect(page.getByRole("heading", { name: "Edit block" })).toBeVisible();
      await expect(page.getByTestId("schedule-mode-fixed")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId(`schedule-row-0-day-${today}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await page.getByTestId(`schedule-row-0-day-${today}`).click(); // Upper A: remove today
      await page.getByTestId(`schedule-row-1-day-${today}`).click(); // Lower A: add today
      await page.getByRole("button", { name: "Save changes" }).click();
      // Next.js's own route announcer also carries role="alert" (always
      // present, empty) — scope to BlockForm's own error paragraph.
      await expect(page.locator('p[role="alert"]')).not.toBeVisible();

      // Steps 5-6 — reload; the changed assignment persisted and is visible.
      await page.reload();
      await expect(page.getByRole("heading", { name: "Edit block" })).toBeVisible();
      await expect(page.getByTestId(`schedule-row-0-day-${today}`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(page.getByTestId(`schedule-row-1-day-${today}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Step 7 — Today now resolves Lower A for the tested (today's) day.
      const afterEditBundleRes = await page.request.get("/api/today-bundle");
      const afterEditBundle = (await afterEditBundleRes.json()) as TodayBundleDto;
      expect(afterEditBundle.today.templateId).toBe(lowerAId);

      // Step 8 — the workout started before the edit is untouched: same
      // template, same frozen prescription snapshot.
      const afterEditSessionRes = await page.request.get("/api/active-session");
      const afterEditSession = ((await afterEditSessionRes.json()) as ActiveSessionDto)
        .activeSession;
      expect(afterEditSession).toEqual(beforeEditSession);

      // Step 9 — exercise a validation error: assign today to Upper B too,
      // overlapping with Lower A. Save must fail visibly and persist
      // nothing.
      await page.getByTestId(`schedule-row-2-day-${today}`).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.locator('p[role="alert"]')).toBeVisible();
      await expect(page.locator('p[role="alert"]')).toContainText(/more than one workout/i);

      const stillLowerARes = await page.request.get("/api/today-bundle");
      const stillLowerA = (await stillLowerARes.json()) as TodayBundleDto;
      expect(stillLowerA.today.templateId).toBe(lowerAId);
    } finally {
      // Discard the in-progress workout, then restore the shared block's
      // original schedule and archive the temporary templates so no other
      // spec observes this test's fixture changes.
      await page.goto("/today/workout").catch(() => undefined);
      const discardButton = page.getByRole("button", { name: "Discard workout" });
      if (await discardButton.isVisible().catch(() => false)) {
        page.once("dialog", (d) => void d.accept());
        await discardButton.click();
        await page.waitForURL(/\/today$/).catch(() => undefined);
      }

      await page.request.patch(`/api/blocks/${blockId}`, {
        data: { schedule: originalSchedulePayload },
      });

      for (const templateId of tempTemplateIds) {
        await page.request
          .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
          .catch(() => undefined);
      }
    }
  });
});
