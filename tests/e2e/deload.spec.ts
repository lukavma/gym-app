import { test, expect } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";
import { roundToStepKg } from "@/domain/progression/loadHelpers";

// Phase 5 e2e — mvp-scope.md F4's acceptance: "a deload week visibly
// modifies Today's targets (sets/load/RIR per the block's deload config)."
//
// Precondition: tests/e2e/seed.ts has been run (same as the Phase 3/4
// specs). The seed's block never has a deload/override configured, so this
// spec creates one manual week override for the block's *current* week via
// the real REST API, asserts Today reflects it, then removes it in
// `finally` — same restore-after-run convention progression.spec.ts uses
// for the seed's strategy flip (playwright.config.ts pins workers: 1).

test.describe("deload week overrides (F4)", () => {
  test("a manual deload override for the current week visibly modifies Today's targets", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    const bundleRes = await page.request.get("/api/today-bundle");
    expect(bundleRes.ok()).toBe(true);
    const bundle = (await bundleRes.json()) as {
      today: {
        kind: string;
        blockId: string;
        weekIndex: number;
        exercises: { scheme: { type: string; sets: number } }[];
      };
    };
    expect(bundle.today.kind).toBe("scheduled");
    const { blockId, weekIndex } = bundle.today;
    const originalSets = bundle.today.exercises[0]!.scheme.sets;

    const createRes = await page.request.post(`/api/blocks/${blockId}/week-overrides`, {
      data: {
        weekIndex,
        type: "deload",
        modifiers: { setMultiplier: 0.5 },
      },
    });
    expect(createRes.ok()).toBe(true);
    const { override } = (await createRes.json()) as { override: { id: string } };

    try {
      await page.reload();
      await expect(page.getByText(`Week ${weekIndex} · deload`)).toBeVisible();

      const modifiedRes = await page.request.get("/api/today-bundle");
      const modifiedBundle = (await modifiedRes.json()) as {
        today: {
          isDeload: boolean;
          exercises: { scheme: { sets: number }; appliedModifiers: unknown }[];
        };
      };
      expect(modifiedBundle.today.isDeload).toBe(true);
      const modifiedEntry = modifiedBundle.today.exercises[0]!;
      expect(modifiedEntry.scheme.sets).toBe(Math.max(1, Math.floor(originalSets * 0.5)));
      expect(modifiedEntry.appliedModifiers).toEqual({ setMultiplier: 0.5 });

      // Starting the workout freezes exactly what Today showed — no second
      // modifier computation.
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      await expect(page.getByText(`Week ${weekIndex} · deload`)).toBeVisible();

      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Discard workout" }).click();
      await page.waitForURL(/\/today$/);
    } finally {
      await page.request.delete(`/api/blocks/${blockId}/week-overrides/${override.id}`);
    }
  });

  // H-1 e2e (docs/reviews/phase-5-review.md) — the shipped Phase 5 e2e only
  // ever ran against a `manual` prescription, so it could never reproduce
  // the defect: a pending recommendation only exists for a non-manual
  // strategy. This spec primes a real load-progression recommendation first
  // (same technique as progression.spec.ts), then resolves a deload for the
  // current week and proves the recommendation is neither shown nor acted on.
  test("a pending recommendation from a load-progression exercise is hidden and inert during a deload week", async ({
    page,
  }) => {
    async function logOneSet(kg: string, reps: string, rir: string): Promise<void> {
      await page.getByLabel("kg").fill(kg);
      await page.getByLabel("reps").fill(reps);
      await page.getByLabel("RIR").fill(rir);
      await page.getByRole("button", { name: "Log", exact: true }).click();
    }

    async function pendingTargetLoadKg(): Promise<number | null> {
      const res = await page.request.get("/api/today-bundle");
      const b = (await res.json()) as {
        today?: {
          exercises?: { pendingRecommendation?: { target?: { loadKg?: number } } | null }[];
        };
      };
      return b.today?.exercises?.[0]?.pendingRecommendation?.target?.loadKg ?? null;
    }

    await login(page);
    await ensureNoActiveSession(page);

    const bundleRes = await page.request.get("/api/today-bundle");
    expect(bundleRes.ok()).toBe(true);
    const bundle = (await bundleRes.json()) as {
      today: {
        kind: string;
        blockId: string;
        weekIndex: number;
        exercises: { prescriptionId: string; loadStepKg: number }[];
      };
    };
    expect(bundle.today.kind).toBe("scheduled");
    const { blockId, weekIndex } = bundle.today;
    const entry = bundle.today.exercises[0]!;
    const step = entry.loadStepKg;
    const expectedTarget = 60 + step;

    const flip = await page.request.patch(`/api/prescriptions/${entry.prescriptionId}`, {
      data: { progression: { strategyId: "load-progression" } },
    });
    expect(flip.ok()).toBe(true);

    try {
      // Priming workout: 3×5 @ 60 kg, RIR 2 — completed in the progress
      // zone, so evaluation recommends 60 + step (same fixture as
      // progression.spec.ts, rerun-safe by construction).
      await page.reload();
      await ensureNoActiveSession(page);
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);
      await logOneSet("60", "5", "2");
      await logOneSet("60", "5", "2");
      await logOneSet("60", "5", "2");
      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Complete workout" }).click();
      await page.waitForURL(/\/today$/);
      await waitForOutboxDrained(page);

      await expect.poll(pendingTargetLoadKg, { timeout: 20_000 }).toBe(expectedTarget);

      // The pre-deload prefill: NOT assumed to be the 60 kg just logged — the
      // shared e2e fixture's exercise may already carry an older accepted
      // decision that outranks a fresh completed session in the carry-
      // forward chain (prescription-model.md §4 step 1), so this reads
      // whatever the app currently resolves rather than hardcoding it. The
      // invariant under test is narrower and robust to that: a deload must
      // leave this value — whatever it is — completely unaffected.
      const preDeloadRes = await page.request.get("/api/today-bundle");
      const preDeloadBundle = (await preDeloadRes.json()) as {
        today: { exercises: { prefill: { loadKg: number | null } }[] };
      };
      const preDeloadLoadKg = preDeloadBundle.today.exercises[0]!.prefill.loadKg;
      expect(preDeloadLoadKg).not.toBeNull();

      // Resolve a deload for the current week (same week the pending rec now
      // lives in) with a load multiplier only.
      const createRes = await page.request.post(`/api/blocks/${blockId}/week-overrides`, {
        data: { weekIndex, type: "deload", modifiers: { loadMultiplier: 0.9 } },
      });
      expect(createRes.ok()).toBe(true);
      const { override } = (await createRes.json()) as { override: { id: string } };
      const expectedDeloadTarget = roundToStepKg(preDeloadLoadKg! * 0.9, step);

      try {
        await page.reload();
        await expect(page.getByText(`Week ${weekIndex} · deload`)).toBeVisible();

        // Today's preview shows the deload-modified scheme but no
        // recommendation text.
        await expect(page.getByText("Increase load")).not.toBeVisible();

        const deloadBundleRes = await page.request.get("/api/today-bundle");
        const deloadBundle = (await deloadBundleRes.json()) as {
          today: {
            isDeload: boolean;
            exercises: {
              pendingRecommendation: unknown;
              prefill: { loadKg: number | null };
            }[];
          };
        };
        expect(deloadBundle.today.isDeload).toBe(true);
        const deloadEntry = deloadBundle.today.exercises[0]!;
        expect(deloadEntry.pendingRecommendation).toBeNull();
        expect(deloadEntry.prefill.loadKg).toBe(expectedDeloadTarget);

        await page.getByRole("button", { name: "Start workout" }).click();
        await page.waitForURL(/\/today\/workout$/);
        await expect(page.getByText(`Week ${weekIndex} · deload`)).toBeVisible();

        // No recommendation card on the workout screen: no Accept button,
        // no proposed-target text — and the kg input is prefilled with the
        // deload target, not the raw (pre-deload) recommended target.
        await expect(page.getByRole("button", { name: /^Accept/ })).not.toBeVisible();
        await expect(page.getByText(`Increase load: ${expectedTarget} kg`)).not.toBeVisible();
        await expect(page.getByLabel("kg")).toHaveValue(String(expectedDeloadTarget));

        // Logging the deload's first work set must not implicitly decide the
        // pending recommendation.
        await logOneSet(String(expectedDeloadTarget), "5", "2");
        await expect(page.getByText(/^Accepted /)).not.toBeVisible();
        await expect(page.getByText(/^Changed to /)).not.toBeVisible();

        page.once("dialog", (d) => void d.accept());
        await page.getByRole("button", { name: "Discard workout" }).click();
        await page.waitForURL(/\/today$/);
        await waitForOutboxDrained(page);
      } finally {
        await page.request.delete(`/api/blocks/${blockId}/week-overrides/${override.id}`);
      }

      // Back to non-deload: the original pending rec survived untouched, and
      // the prefill is exactly what it was before the deload — proof the
      // deload session's logged set never became a decision.
      await expect.poll(pendingTargetLoadKg, { timeout: 20_000 }).toBe(expectedTarget);
      const finalRes = await page.request.get("/api/today-bundle");
      const finalBundle = (await finalRes.json()) as {
        today: { exercises: { prefill: { loadKg: number | null } }[] };
      };
      expect(finalBundle.today.exercises[0]!.prefill.loadKg).toBe(preDeloadLoadKg);
    } finally {
      await page.request.patch(`/api/prescriptions/${entry.prescriptionId}`, {
        data: { progression: { strategyId: "manual" } },
      });
    }
  });
});
