import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Phase 4 e2e — the F7 loop end-to-end: complete a workout → server
// evaluates → the recommendation (with plain-language reasons) rides the
// bundle onto Today and the next workout → the first logged work set at the
// recommended load implicitly accepts it → the accepted target becomes the
// next carry-forward baseline (implementation-plan.md §1.5's bold
// "implicit-accept via first set" scenario).
//
// Precondition: tests/e2e/seed.ts has been run (same as the Phase 3 specs).
// The seed's prescription is `manual`; this spec flips it to
// load-progression through the real REST API for its own run and restores
// it afterwards — safe because playwright.config.ts pins workers: 1.
//
// Rerun-safe by construction: the priming workout logs a fixed 60 kg, which
// implicitly decides any stale pending recommendation a previous run left
// behind, and its completion leaves exactly one fresh pending rec targeting
// 60 + loadStepKg.

async function logOneSet(page: Page, kg: string, reps: string, rir: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByLabel("RIR").fill(rir);
  await page.getByRole("button", { name: "Log", exact: true }).click();
}

async function completeWorkout(page: Page): Promise<void> {
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);
}

test.describe("progression recommendations (F7)", () => {
  test("completion → recommendation → implicit accept via first set → carry-forward", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    const bundleRes = await page.request.get("/api/today-bundle");
    expect(bundleRes.ok()).toBe(true);
    const bundle = (await bundleRes.json()) as {
      today: {
        kind: string;
        exercises: { prescriptionId: string; loadStepKg: number }[];
      };
    };
    expect(bundle.today.kind).toBe("scheduled");
    const entry = bundle.today.exercises[0]!;
    const step = entry.loadStepKg;
    const expectedTarget = 60 + step;

    const flip = await page.request.patch(`/api/prescriptions/${entry.prescriptionId}`, {
      data: { progression: { strategyId: "load-progression" } },
    });
    expect(flip.ok()).toBe(true);

    try {
      // The Today page fetched its bundle before the strategy flip — reload
      // so the session snapshot freezes load-progression, not manual.
      await page.reload();
      await ensureNoActiveSession(page);

      // Priming workout: 3×5 @ 60 kg, RIR 2 — completed in the progress
      // zone, so evaluation must recommend 60 + step.
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      await logOneSet(page, "60", "5", "2");
      await logOneSet(page, "60", "5", "2");
      await logOneSet(page, "60", "5", "2");
      await completeWorkout(page);

      // Server-side evaluation ran inside the completion transaction — the
      // pending recommendation is in the bundle as soon as the op drained.
      await expect
        .poll(
          async () => {
            const res = await page.request.get("/api/today-bundle");
            const b = (await res.json()) as {
              today?: {
                exercises?: { pendingRecommendation?: { target?: { loadKg?: number } } | null }[];
              };
            };
            return b.today?.exercises?.[0]?.pendingRecommendation?.target?.loadKg ?? null;
          },
          { timeout: 20_000 },
        )
        .toBe(expectedTarget);

      // Fresh bundle on Today: the preview shows the pending recommendation.
      await page.reload();
      await expect(page.getByText(`Increase load: ${expectedTarget} kg`).first()).toBeVisible();

      // Next workout: the card renders target, plain-language reason, and
      // the input prefill IS the recommended target (zero extra taps).
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      await expect(page.getByText("All prescribed reps completed")).toBeVisible();
      await expect(page.getByLabel("kg")).toHaveValue(String(expectedTarget));

      // Implicit accept: just log the first work set at the prefilled load.
      await page.getByLabel("RIR").fill("2");
      await page.getByRole("button", { name: "Log", exact: true }).click();
      await expect(page.getByText(`Accepted ${expectedTarget} kg`)).toBeVisible();

      await logOneSet(page, String(expectedTarget), "5", "2");
      await logOneSet(page, String(expectedTarget), "5", "2");
      await completeWorkout(page);

      // The accepted decision is the next carry-forward baseline
      // (prescription-model.md §4 step 1).
      await expect
        .poll(
          async () => {
            const res = await page.request.get("/api/today-bundle");
            const b = (await res.json()) as {
              today?: { exercises?: { prefill?: { loadKg?: number | null } }[] };
            };
            return b.today?.exercises?.[0]?.prefill?.loadKg ?? null;
          },
          { timeout: 20_000 },
        )
        .toBe(expectedTarget);
    } finally {
      // Restore the seed's manual strategy so the Phase 3 specs see the
      // exact fixture they were written against.
      await page.request.patch(`/api/prescriptions/${entry.prescriptionId}`, {
        data: { progression: { strategyId: "manual" } },
      });
    }
  });
});
