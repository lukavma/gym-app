import { test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  getActiveProgramInfo,
  applyScheduleOverride,
  restoreSchedule,
  type ActiveProgramInfo,
} from "./helpers";

// set-groups-architecture-evaluation.md §5/§5.3 — the offline half of the
// Stage A E2E coverage disclosed as missing (A-17) in the initial
// implementation pass: completing a GROUPED workout fully offline, which
// exercises `buildClientRecommendationOps`'s per-group evaluation fallback
// (src/sync/activeSession.ts) end to end through a real browser and a real
// service worker — the exact path where this remediation pass found and
// fixed two real bugs (`toPerformedSets` silently dropping `groupKey`, and
// the emitted `recommendation` op omitting it entirely), following
// offline-recommendation.spec.ts's established `context.setOffline(true)`
// pattern (no persistent-context/host-resolver harness needed — a plain
// `context.setOffline(true)` already works against a service-worker-
// controlled page, per that spec's own header comment).
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function createEmptyTemplate(page: Page, programId: string, name: string): Promise<string> {
  const res = await page.request.post(`/api/programs/${programId}/templates`, { data: { name } });
  expect(res.ok(), await res.text()).toBe(true);
  const { template } = (await res.json()) as { template: { id: string } };
  return template.id;
}

async function logSet(page: Page, kg: string, reps: string, rir: string): Promise<void> {
  await page.getByLabel("Weight in kilograms").fill(kg);
  await page.getByLabel("Repetitions").fill(reps);
  await page.getByLabel("Reps in reserve").fill(rir);
  await page.getByRole("button", { name: "Log", exact: true }).click();
}

// Independent review L-9 — the schedule-restore/template-archive cleanup
// below used to run inside the test body's own `finally` block, sharing the
// same timeout clock as the test itself: a Playwright test-level timeout
// firing mid-`finally` (exactly what the §6.5 contamination disclosure in
// set-groups-stage-a-implementation.md was) aborts that cleanup along with
// the test. `afterEach` gets its own timeout budget, separate from the test
// body's, so cleanup still runs after a body timeout. `owned` is resource-
// ownership tracking: the test records exactly the resources it created as
// it runs, so this hook only ever touches what that run actually owns.
interface OwnedResources {
  templateId?: string;
  programInfo?: ActiveProgramInfo;
}
let owned: OwnedResources = {};

test.beforeEach(() => {
  owned = {};
});

test.afterEach(async ({ page }) => {
  await page.goto("/today/workout").catch(() => undefined);
  const discardButton = page.getByRole("button", { name: "Discard workout" });
  if (await discardButton.isVisible().catch(() => false)) {
    page.once("dialog", (d) => void d.accept());
    await discardButton.click();
    await page.waitForURL(/\/today$/).catch(() => undefined);
  }
  if (owned.programInfo) {
    await restoreSchedule(
      page,
      owned.programInfo.blockId,
      owned.programInfo.originalSchedulePayload,
    ).catch(() => undefined);
  }
  if (owned.templateId) {
    await page.request
      .post(`/api/templates/${owned.templateId}/archive`, { data: { action: "archive" } })
      .catch(() => undefined);
  }
});

test("completing a GROUPED workout fully offline evaluates each group independently once reconnected", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await ensureNoActiveSession(page);

  const programInfo = await getActiveProgramInfo(page);
  owned.programInfo = programInfo;
  const unique = `E2E SG Offline ${Date.now()}`;
  const exerciseRes = await page.request.post("/api/exercises", {
    data: {
      name: unique,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    },
  });
  expect(exerciseRes.status(), await exerciseRes.text()).toBe(201);
  const { exercise } = (await exerciseRes.json()) as { exercise: { id: string } };

  const templateId = await createEmptyTemplate(page, programInfo.programId, `${unique} Template`);
  owned.templateId = templateId;
  const prescriptionRes = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
    data: {
      exerciseId: exercise.id,
      scheme: {
        v: 1,
        scheme: {
          type: "groups",
          groups: [
            {
              label: "Top",
              sets: { min: 1, max: 1 },
              reps: { min: 2, max: 2 },
              baselineLoadKg: 140,
            },
            {
              label: "Back-off",
              sets: { min: 2, max: 2 },
              reps: { min: 6, max: 8 },
              baselineLoadKg: 110,
            },
          ],
        },
      },
      progression: { strategyId: "load-progression" },
    },
  });
  expect(prescriptionRes.ok(), await prescriptionRes.text()).toBe(true);

  await applyScheduleOverride(page, programInfo.blockId, templateId);

  await page.goto("/today");
  await ensureNoActiveSession(page);
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await expect(page.getByRole("button", { name: "Log", exact: true })).toBeVisible();
  await waitForOutboxDrained(page);

  // One reload while still online claims SW control of this page
  // (clientsClaim: false) — required before the offline completion below
  // can be served from precache.
  await page.reload();
  await expect(page.getByRole("button", { name: "Log", exact: true })).toBeVisible();

  await context.setOffline(true);

  const chipRow = page.getByRole("group", { name: "Select group" });
  await expect(chipRow.getByRole("button", { name: "Top 0/1" })).toBeVisible();
  const weightInput = page.getByLabel("Weight in kilograms");
  const repsInput = page.getByLabel("Repetitions");
  await expect(weightInput).toHaveValue("140");
  await expect(repsInput).toHaveValue("2");

  // Top's required set — auto-advances to Back-off, all purely local.
  await logSet(page, "140", "2", "2");
  await expect(chipRow.getByRole("button", { name: "Top 1/1" })).toBeVisible();
  await expect(weightInput).toHaveValue("110");

  // Back-off's two required sets.
  await repsInput.fill("7");
  await logSet(page, "110", "7", "2");
  await repsInput.fill("7");
  await logSet(page, "110", "7", "2");
  await expect(chipRow.getByRole("button", { name: "Back-off 2/2" })).toBeVisible();

  // Offline completion: `buildClientRecommendationOps` evaluates BOTH
  // groups locally and queues one `recommendation` op per group, ahead of
  // the completion op — zero network so far.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);

  await context.setOffline(false);
  await waitForOutboxDrained(page);

  // Server convergence: both groups produced their OWN pending
  // recommendation, each `computedBy: 'client'` (the one fact only the
  // offline fallback can produce — an online completion is always
  // `computedBy: 'server'`), with the CORRECT per-group target — the
  // decisive proof that `toPerformedSets` correctly threaded `groupKey`
  // through to the offline evaluator (the exact bug this pass found and
  // fixed: before it, both groups' partitioned windows came back empty).
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/today-bundle");
        const b = (await res.json()) as {
          today?: { exercises?: { pendingRecommendations?: unknown[] }[] };
        };
        return (b.today?.exercises?.[0]?.pendingRecommendations ?? []).length;
      },
      { timeout: 20_000 },
    )
    .toBe(2);

  const bundleAfter = (await (await page.request.get("/api/today-bundle")).json()) as {
    today: {
      exercises: {
        pendingRecommendations: {
          groupKey: string;
          computedBy: string;
          target: { loadKg: number } | null;
        }[];
      }[];
    };
  };
  const recs = bundleAfter.today.exercises[0]!.pendingRecommendations;
  expect(recs.every((r) => r.computedBy === "client")).toBe(true);
  const byGroup = new Map(recs.map((r) => [r.groupKey, r]));
  expect(byGroup.size).toBe(2);
  for (const rec of byGroup.values()) {
    expect(rec.target?.loadKg).toBeGreaterThan(0);
  }

  // History: exactly the three logged sets, correctly attributed, synced
  // from the offline-drained outbox.
  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as {
    session: {
      exercises: { sets: { weightKg: number; reps: number; groupKey: string | null }[] }[];
    };
  };
  const sets = detail.session.exercises[0]!.sets;
  expect(sets).toHaveLength(3);
  expect(sets.filter((s) => s.groupKey !== null)).toHaveLength(3);
});
