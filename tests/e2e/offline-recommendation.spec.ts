import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Phase 8 — required scenario: "complete offline, reconnect, and prove
// exact server convergence plus recommendations". offline-sync.spec.ts
// already proves set-row convergence for an offline completion; this spec
// is the missing "plus recommendations" half — a client-computed
// recommendation (progression-engine.md §5's offline fallback,
// `computedBy: 'client'`) enqueued alongside the completion op and applied
// by the same sync batch.
//
// Same real-REST strategy-flip pattern as progression.spec.ts (the seed's
// prescription is `manual`, which the progression engine explicitly skips —
// src/domain/progression/evaluateSession.ts — so it can never produce a
// recommendation on its own): flips to load-progression for this run only,
// restores it in `finally`. Safe under playwright.config.ts's `workers: 1`.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function logSet(page: Page, kg: string, reps: string, rir: string): Promise<void> {
  await page.getByLabel("kg").fill(kg);
  await page.getByLabel("reps").fill(reps);
  await page.getByLabel("RIR").fill(rir);
  await page.getByRole("button", { name: "Log", exact: true }).click();
}

test("completing a workout fully offline produces a client-computed recommendation once reconnected", async ({
  page,
  context,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  const bundleRes = await page.request.get("/api/today-bundle");
  expect(bundleRes.ok()).toBe(true);
  const bundle = (await bundleRes.json()) as {
    today: { exercises: { prescriptionId: string; loadStepKg: number }[] };
  };
  const entry = bundle.today.exercises[0]!;

  const flip = await page.request.patch(`/api/prescriptions/${entry.prescriptionId}`, {
    data: { progression: { strategyId: "load-progression" } },
  });
  expect(flip.ok()).toBe(true);

  try {
    // The already-loaded Today page fetched its bundle before the flip —
    // reload so the session snapshot that's about to be frozen carries
    // load-progression, not manual (same requirement as progression.spec.ts).
    await page.reload();
    await ensureNoActiveSession(page);

    // Started online — this scenario is specifically about COMPLETING
    // offline (pwa-offline-strategy.md §12), not starting offline (that's
    // offline-cold-launch.spec.ts's concern, via a hard navigation rather
    // than this button's client-side router.push).
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByRole("button", { name: "Log", exact: true })).toBeVisible();
    await waitForOutboxDrained(page);

    // One reload while still online claims SW control of this page
    // (clientsClaim: false) — required before the offline "Complete
    // workout" navigation below can be served from precache.
    await page.reload();
    await expect(page.getByRole("button", { name: "Log", exact: true })).toBeVisible();

    await context.setOffline(true);

    // Progress-zone completion: 3x5 @ 60kg, RIR 2 — the same fixture
    // progression.spec.ts uses to deterministically earn a load increase.
    await logSet(page, "60", "5", "2");
    await logSet(page, "60", "5", "2");
    await logSet(page, "60", "5", "2");

    // Offline completion: the client evaluates locally
    // (buildClientRecommendationOps, src/sync/activeSession.ts) and queues
    // the recommendation op ahead of the completion op — both still purely
    // local at this point, zero network.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);

    await context.setOffline(false);
    await waitForOutboxDrained(page);

    // Server convergence: the set rows AND a recommendation both landed —
    // asserting existence + provenance rather than a specific action/target.
    // load-progression's exact verdict (increase vs. hold) depends on
    // evaluation-history state this spec doesn't control (this dev DB
    // accumulates real history across every phase's work) — that judgment
    // call belongs to progression.spec.ts (Phase 4), not here. What Phase 8
    // owns is proving the offline fallback path actually ran and its output
    // synced: `computedBy: 'client'` is the one fact only the offline path
    // can produce (an online completion is always `computedBy: 'server'`).
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/today-bundle");
          const b = (await res.json()) as {
            today?: {
              exercises?: { pendingRecommendation?: { computedBy?: string } | null }[];
            };
          };
          return b.today?.exercises?.[0]?.pendingRecommendation ?? null;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();

    const bundleAfter = (await (await page.request.get("/api/today-bundle")).json()) as {
      today: { exercises: { pendingRecommendation: { computedBy: string } | null }[] };
    };
    expect(bundleAfter.today.exercises[0]?.pendingRecommendation?.computedBy).toBe("client");

    // Queried directly rather than through the /history UI list: this dev
    // DB accumulates real sessions across every phase's work, so "most
    // recent" is unambiguous only via the API's own ordering, not a
    // text-matching heuristic over however many past sessions happen to
    // also read "3 sets".
    const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
      sessions: { id: string }[];
    };
    const latestSessionId = historyList.sessions[0]!.id;
    const detail = (await (await page.request.get(`/api/history/${latestSessionId}`)).json()) as {
      session: { exercises: { sets: { weightKg: number; reps: number }[] }[] };
    };
    const sets = detail.session.exercises[0]!.sets;
    expect(sets).toHaveLength(3);
    for (const set of sets) {
      expect(set.weightKg).toBe(60);
      expect(set.reps).toBe(5);
    }
  } finally {
    await page.request.patch(`/api/prescriptions/${entry.prescriptionId}`, {
      data: { progression: { strategyId: "manual" } },
    });
  }
});
