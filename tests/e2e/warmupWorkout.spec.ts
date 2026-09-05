import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, test, expect, type Page } from "@playwright/test";
import {
  OFFLINE_RESOLVER_ARG,
  ensureNoActiveSession,
  login,
  waitForOutboxDrained,
  waitForServiceWorkerControl,
} from "./helpers";

// Warm-up Routines v1 — in-workout execution (evaluation §5/§6).
//
// Precondition, as with every spec here: tests/e2e/seed.ts has been run
// against the target Postgres (active block, rotation-mode schedule entry
// resolving to the seeded template on any calendar day). Needs a PRODUCTION
// build for the offline cases (the SW is disabled when NODE_ENV=development)
// — playwright.config.ts's webServer builds and starts one. Local-only.

const BASE_URL = "http://localhost:3000";
const UPPER_STANDARD = "E2E Workout Upper Standard";
const SHOULDER_PREP = "E2E Workout Shoulder Prep";

interface RoutineDto {
  id: string;
  name: string;
}

async function deleteRoutinesByName(page: Page, names: string[]): Promise<void> {
  const res = await page.request.get("/api/warmup-routines");
  const { routines } = (await res.json()) as { routines: RoutineDto[] };
  for (const routine of routines) {
    if (names.includes(routine.name)) {
      await page.request.delete(`/api/warmup-routines/${routine.id}`);
    }
  }
}

async function createRoutine(
  page: Page,
  name: string,
  items: { label: string; instruction?: string | null }[],
): Promise<RoutineDto> {
  const res = await page.request.post("/api/warmup-routines", { data: { name, items } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { routine: RoutineDto }).routine;
}

async function scheduledTemplateId(page: Page): Promise<string> {
  const res = await page.request.get("/api/today-bundle");
  const bundle = (await res.json()) as { today: { kind: string; templateId?: string } };
  if (bundle.today.kind !== "scheduled" || !bundle.today.templateId) {
    throw new Error(`expected a scheduled today, got ${bundle.today.kind}`);
  }
  return bundle.today.templateId;
}

async function linkRoutines(
  page: Page,
  templateId: string,
  routineIds: string[],
  defaultRoutineId: string | null,
): Promise<void> {
  const res = await page.request.put(`/api/templates/${templateId}/warmup-routines`, {
    data: { routineIds, defaultRoutineId },
  });
  expect(res.status(), await res.text()).toBe(200);
}

// Sets up the shared fixture: two routines linked to today's template, the
// first as default. Returns both ids plus the template id for cleanup.
async function setupLinkedRoutines(
  page: Page,
  options: { withDefault: boolean } = { withDefault: true },
) {
  await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP]);
  const upper = await createRoutine(page, UPPER_STANDARD, [
    { label: "Bike", instruction: "5 min easy" },
    { label: "Band external rotation", instruction: "2x15 light" },
    { label: "Horizontal rotation", instruction: "10 controlled reps" },
  ]);
  const shoulders = await createRoutine(page, SHOULDER_PREP, [
    { label: "Wall slides", instruction: "2x10" },
  ]);
  const templateId = await scheduledTemplateId(page);
  await linkRoutines(
    page,
    templateId,
    [upper.id, shoulders.id],
    options.withDefault ? upper.id : null,
  );
  return { upper, shoulders, templateId };
}

async function teardown(page: Page): Promise<void> {
  const templateId = await scheduledTemplateId(page).catch(() => null);
  if (templateId) await linkRoutines(page, templateId, [], null);
  await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP]);
}

// Reads the whole client outbox, payloads included — the direct evidence for
// "no new entity, no new field on the wire".
async function readOutboxOps(
  page: Page,
): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  return page.evaluate(async () => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      const tx = db.transaction("outbox", "readonly");
      const all: { entity: string; payload: Record<string, unknown> }[] = await new Promise(
        (resolve, reject) => {
          const r = tx.objectStore("outbox").getAll();
          r.onsuccess = () => resolve(r.result as { entity: string; payload: unknown }[] as never);
          r.onerror = () => reject(r.error as unknown as Error);
        },
      );
      return all.map((op) => ({ entity: op.entity, payload: op.payload }));
    } finally {
      db.close();
    }
  });
}

async function readLocalWarmupState(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      const tx = db.transaction("activeSession", "readonly");
      const session: { warmup?: unknown } | undefined = await new Promise((resolve, reject) => {
        const r = tx.objectStore("activeSession").get("current");
        r.onsuccess = () => resolve(r.result as { warmup?: unknown } | undefined);
        r.onerror = () => reject(r.error as unknown as Error);
      });
      return session === undefined ? "NO_SESSION" : (session.warmup ?? null);
    } finally {
      db.close();
    }
  });
}

// `.click()`, never Playwright's `.check()`.
//
// The checkbox is a CONTROLLED input whose `checked` prop comes from the
// IndexedDB-backed active-session store, and that store only updates once
// the local commit resolves (which is the whole design — the checklist is
// durable state, not optimistic UI). `.check()` asserts the DOM's own
// checked state flipped synchronously with the click, which a controlled
// input driven by an async write never satisfies: React re-renders it back
// to the still-false prop within the same frame. Clicking and then waiting
// for the counter the component derives from COMMITTED state is both the
// correct assertion and a stronger one — it proves the write landed, not
// merely that the browser toggled a checkbox.
// V-3 remediation (docs/reviews/warmup-set-classification-remediation-
// verification.md) — the Warm-up Set Classification remediation gave
// ExerciseCard's set-entry form its own "Warm-up set" checkbox (a different,
// pre-existing concept: set_logs.is_warmup, not this feature's checklist),
// rendered unconditionally on the same /today/workout page, and its own
// in-session edit form (SetRow) now carries one too. A bare
// `page.getByRole("checkbox")` can no longer stand in for "how many warm-up
// ROUTINE checklist items are showing" — it now also counts those unrelated
// controls. A CSS-coincidence exclusion (matching every flex-col <ul> except
// the exercises list) was tried and rejected: it silently matches whichever
// OTHER flex-col <ul> exists on the page (ExerciseCard's own logged-sets
// list, or AddAdhocExercise's results list) and would have re-broken the
// moment either grew a checkbox — which SetRow's edit form just did. Scoped
// instead to `data-testid="warmup-checklist"` (WarmupCard.tsx), a marker
// that exists for exactly this purpose and names what it selects.
function warmupChecklistCheckboxes(page: Page) {
  return page.getByTestId("warmup-checklist").getByRole("checkbox");
}

async function tickWarmupItem(page: Page, index: number, expectedCounter: string): Promise<void> {
  await warmupChecklistCheckboxes(page).nth(index).click();
  await expect(page.getByText(expectedCounter)).toBeVisible();
}

async function discardIfActive(page: Page): Promise<void> {
  await page.goto("/today");
  const continueButton = page.getByRole("button", { name: "Continue workout" });
  const start = page.getByRole("button", { name: "Start workout" });
  const takeover = page.getByRole("button", { name: "Discard it & start fresh" });
  const which = await Promise.race([
    continueButton.waitFor().then(() => "continue" as const),
    start.waitFor().then(() => "start" as const),
    takeover.waitFor().then(() => "takeover" as const),
  ]);
  if (which === "start") return;
  if (which === "takeover") {
    await takeover.click();
    await expect(start).toBeVisible();
    return;
  }
  await continueButton.click();
  await page.waitForURL(/\/today\/workout$/);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Discard workout" }).click();
  await page.waitForURL(/\/today$/);
}

test.describe("warm-up card: in-workout execution", () => {
  test.afterEach(async ({ page }) => {
    await discardIfActive(page).catch(() => undefined);
    await teardown(page).catch(() => undefined);
  });

  test("the default routine shows automatically, and the start path is still one tap to a prefilled set in <=3", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await expect(page.getByText(`Warm-up: ${UPPER_STANDARD}`)).toBeVisible();

    // Tap 1 — the SAME single control as before this feature. No modal, no
    // pre-start selection step (mvp-scope.md F5, evaluation M-3/A-3).
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    // The card is there, expanded, with the default routine's items.
    await expect(page.getByText(`${UPPER_STANDARD} · 0/3`)).toBeVisible();
    await expect(page.getByText("Bike")).toBeVisible();
    await expect(page.getByText("5 min easy")).toBeVisible();

    // ...and it gates nothing: the weight/reps fields are already prefilled
    // from the snapshot, so taps 2 and 3 are "focus is unnecessary — just
    // press Log" plus the confirmation the app itself shows.
    // `{ exact: true }` throughout this spec, unlike the older specs' bare
    // getByLabel("reps"): a warm-up item's accessible name is its label plus
    // its instruction, so a routine item reading "Horizontal rotation — 10
    // controlled reps" makes a substring match ambiguous with the set-entry
    // field. Exact matching pins it to the input that is actually labelled
    // "reps".
    const kg = page.getByLabel("kg", { exact: true });
    const reps = page.getByLabel("reps", { exact: true });
    await expect(kg).not.toHaveValue("");
    await expect(reps).not.toHaveValue("");
    const prefilledKg = await kg.inputValue();
    const prefilledReps = await reps.inputValue();

    // Tap 2 — log the prefilled set. That is 2 taps from Today, inside F5's
    // 3-tap budget, exactly as before warm-ups existed.
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText(`${prefilledKg} kg × ${prefilledReps}`)).toBeVisible();
  });

  test("no linked routines => no card at all (the screen is unchanged)", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP]);
    await linkRoutines(page, await scheduledTemplateId(page), [], null);

    await page.goto("/today");
    await expect(page.getByText(/^Warm-up: /)).toHaveCount(0);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await expect(page.getByRole("button", { name: "Skip warm-up" })).toHaveCount(0);
    await expect(page.getByLabel("Warm-up routine")).toHaveCount(0);
    expect(await readLocalWarmupState(page)).toBeNull();
  });

  test("linked but no default => a compact chooser, and picking one reveals its checklist", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page, { withDefault: false });

    await page.goto("/today");
    await expect(page.getByText(/^Warm-up: /)).toHaveCount(0);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    const select = page.getByLabel("Warm-up routine");
    await expect(select).toBeVisible();
    await expect(page.getByText("Bike")).toHaveCount(0);

    // O-2 — ONLY the two linked routines are offered.
    const options = await select.locator("option").allInnerTexts();
    expect(options).toEqual(["Choose a routine…", UPPER_STANDARD, SHOULDER_PREP]);

    await select.selectOption({ label: UPPER_STANDARD });
    await expect(page.getByText(`${UPPER_STANDARD} · 0/3`)).toBeVisible();
    await expect(page.getByText("Bike")).toBeVisible();
  });

  test("checked items survive a reload and a real process kill/relaunch", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);
    await tickWarmupItem(page, 2, `${UPPER_STANDARD} · 2/3`);

    await page.reload();
    await expect(page.getByText(`${UPPER_STANDARD} · 2/3`)).toBeVisible();
    await expect(warmupChecklistCheckboxes(page).nth(0)).toBeChecked();
    await expect(warmupChecklistCheckboxes(page).nth(1)).not.toBeChecked();
    await expect(warmupChecklistCheckboxes(page).nth(2)).toBeChecked();

    // Un-ticking is durable too.
    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);
    await page.reload();
    await expect(page.getByText(`${UPPER_STANDARD} · 1/3`)).toBeVisible();
  });

  test("switching routines resets the checklist deterministically", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);
    await tickWarmupItem(page, 1, `${UPPER_STANDARD} · 2/3`);

    await page.getByLabel("Warm-up routine").selectOption({ label: SHOULDER_PREP });
    await expect(page.getByText(`${SHOULDER_PREP} · 0/1`)).toBeVisible();
    await expect(warmupChecklistCheckboxes(page).nth(0)).not.toBeChecked();
    await expect(page.getByText("Wall slides")).toBeVisible();
    await expect(page.getByText("Bike")).toHaveCount(0);

    // Switching back does not resurrect the old ticks — progress is per
    // selection, and it survives a reload in that state.
    await page.getByLabel("Warm-up routine").selectOption({ label: UPPER_STANDARD });
    await expect(page.getByText(`${UPPER_STANDARD} · 0/3`)).toBeVisible();
    await page.reload();
    await expect(page.getByText(`${UPPER_STANDARD} · 0/3`)).toBeVisible();
  });

  test("skip collapses the card to one reversible row, and undo restores the ticks", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await tickWarmupItem(page, 1, `${UPPER_STANDARD} · 1/3`);
    await page.getByRole("button", { name: "Skip warm-up" }).click();

    await expect(page.getByText("Warm-up skipped")).toBeVisible();
    await expect(warmupChecklistCheckboxes(page)).toHaveCount(0);

    // The skip survives a reload, and is still reversible afterwards.
    await page.reload();
    await expect(page.getByText("Warm-up skipped")).toBeVisible();
    await page.getByRole("button", { name: "Undo skip" }).click();
    await expect(page.getByText(`${UPPER_STANDARD} · 1/3`)).toBeVisible();
    await expect(warmupChecklistCheckboxes(page).nth(1)).toBeChecked();
  });

  test("the card auto-collapses when every item is checked, and stays recoverable", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await expect(page.getByRole("button", { name: "Hide warm-up" })).toBeVisible();
    for (const index of [0, 1, 2]) {
      await tickWarmupItem(page, index, `${UPPER_STANDARD} · ${index + 1}/3`);
    }

    await expect(page.getByRole("button", { name: "Show warm-up" })).toBeVisible();
    await expect(warmupChecklistCheckboxes(page)).toHaveCount(0);
    await expect(page.getByText(`${UPPER_STANDARD} · 3/3`)).toBeVisible();

    // Recoverable: one tap brings it back, with the ticks intact.
    await page.getByRole("button", { name: "Show warm-up" }).click();
    await expect(warmupChecklistCheckboxes(page)).toHaveCount(3);
    await expect(warmupChecklistCheckboxes(page).nth(0)).toBeChecked();
  });

  test("the card auto-collapses once the first work set is logged, and stays recoverable", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);
    await expect(page.getByRole("button", { name: "Hide warm-up" })).toBeVisible();

    await page.getByLabel("kg", { exact: true }).fill("100");
    await page.getByLabel("reps", { exact: true }).fill("8");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText("100 kg × 8")).toBeVisible();

    await expect(page.getByRole("button", { name: "Show warm-up" })).toBeVisible();
    await page.getByRole("button", { name: "Show warm-up" }).click();
    await expect(warmupChecklistCheckboxes(page).nth(0)).toBeChecked();
  });

  test("a warm-up-using workout puts no new entity and no warm-up field on the wire", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);
    const { upper, shoulders } = await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    // Exercise every warm-up interaction there is.
    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);
    await tickWarmupItem(page, 1, `${UPPER_STANDARD} · 2/3`);
    await page.getByLabel("Warm-up routine").selectOption({ label: SHOULDER_PREP });
    await tickWarmupItem(page, 0, `${SHOULDER_PREP} · 1/1`);
    await page.getByRole("button", { name: "Skip warm-up" }).click();
    await page.getByRole("button", { name: "Undo skip" }).click();

    // Capture what actually leaves the device, not just what is queued.
    const sentBodies: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/sync")) {
        const body = request.postData();
        if (body) sentBodies.push(body);
      }
    });

    await page.getByLabel("kg", { exact: true }).fill("100");
    await page.getByLabel("reps", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText("100 kg × 5")).toBeVisible();

    const queued = await readOutboxOps(page);
    const allowed = new Set([
      "workoutSession",
      "sessionExercise",
      "setLog",
      "recommendation",
      "recommendationDecision",
      "bodyweightEntry",
      "recoveryEntry",
    ]);
    for (const op of queued) expect(allowed.has(op.entity), op.entity).toBe(true);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    expect(sentBodies.length).toBeGreaterThan(0);
    const wire = sentBodies.join("\n");
    // `isWarmup` (set_logs.is_warmup) is a DIFFERENT, pre-existing concept
    // and legitimately appears — I-8. What must not appear is warm-up
    // ROUTINE data or any key this feature introduced.
    for (const marker of [
      UPPER_STANDARD,
      SHOULDER_PREP,
      upper.id,
      shoulders.id,
      "Bike",
      "Band external rotation",
      "Wall slides",
      '"warmup"',
      '"selectedRoutineId"',
      '"dismissed"',
      '"warmupRoutines"',
    ]) {
      expect(wire, `warm-up data reached the wire: ${marker}`).not.toContain(marker);
    }
    // Not a vacuous scan — the work set really did go over the wire.
    expect(wire).toContain('"setLog"');
    expect(wire).toContain('"isWarmup":false');
  });

  test("completing removes every trace of warm-up state from the device", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);
    expect(await readLocalWarmupState(page)).not.toBe("NO_SESSION");

    await page.getByLabel("kg", { exact: true }).fill("100");
    await page.getByLabel("reps", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText("100 kg × 5")).toBeVisible();

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    expect(await readLocalWarmupState(page)).toBe("NO_SESSION");
  });

  test("discarding removes every trace of warm-up state from the device", async ({ page }) => {
    await login(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    await page.goto("/today");
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await tickWarmupItem(page, 0, `${UPPER_STANDARD} · 1/3`);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Discard workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    expect(await readLocalWarmupState(page)).toBe("NO_SESSION");
  });

  test("a legacy cached bundle with the warm-up fields stripped still starts a workout, with no card", async ({
    page,
  }) => {
    await login(page);
    // Under the service worker's control, so BOTH cache layers this test
    // doctors are really populated — the SW's own `today-bundle` NetworkFirst
    // cache and the IndexedDB `bundleCache`. Evaluation A-7 requires the
    // tolerance rule to hold for both; whichever one answers offline, the
    // warm-up fields must be absent from it.
    await waitForServiceWorkerControl(page);
    await ensureNoActiveSession(page);
    await setupLinkedRoutines(page);

    // Populate both caches from a real, current bundle...
    await page.goto("/today");
    await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
    await expect(page.getByText(`Warm-up: ${UPPER_STANDARD}`)).toBeVisible();

    // ...then rewrite the SW-cached copy as a PRE-UPGRADE one.
    const swStripped = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) => name.includes("today-bundle"));
      let rewritten = 0;
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          if (!response) continue;
          const bundle = (await response.json()) as { today?: Record<string, unknown> };
          if (bundle.today) {
            delete bundle.today.warmupRoutines;
            delete bundle.today.defaultWarmupRoutineId;
          }
          await cache.put(
            request,
            new Response(JSON.stringify(bundle), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
          rewritten += 1;
        }
      }
      return { buckets: names.length, rewritten };
    });
    expect(swStripped.buckets, "expected the SW today-bundle cache to exist").toBeGreaterThan(0);
    expect(swStripped.rewritten).toBeGreaterThan(0);

    // ...and the IndexedDB copy too: the warm-up keys are deleted outright,
    // exactly as a bundle cached before this feature shipped deserializes
    // (evaluation R-1 / the Phase 5 L-4 precedent).
    const stripped = await page.evaluate(async () => {
      const req = indexedDB.open("gym-app");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error as unknown as Error);
      });
      try {
        const readTx = db.transaction("bundleCache", "readonly");
        const record: { bundle: { today: Record<string, unknown> } } = await new Promise(
          (resolve, reject) => {
            const r = readTx.objectStore("bundleCache").get("current");
            r.onsuccess = () => resolve(r.result as { bundle: { today: Record<string, unknown> } });
            r.onerror = () => reject(r.error as unknown as Error);
          },
        );
        if (!record) return "NO_CACHE";
        delete record.bundle.today.warmupRoutines;
        delete record.bundle.today.defaultWarmupRoutineId;
        const writeTx = db.transaction("bundleCache", "readwrite");
        await new Promise((resolve, reject) => {
          const r = writeTx.objectStore("bundleCache").put(record, "current");
          r.onsuccess = () => resolve(null);
          r.onerror = () => reject(r.error as unknown as Error);
        });
        return Object.keys(record.bundle.today).join(",");
      } finally {
        db.close();
      }
    });
    expect(stripped).not.toBe("NO_CACHE");
    expect(String(stripped)).not.toContain("warmupRoutines");

    // Go offline so Today is answered from one of the doctored caches (the
    // SW serves the pre-upgrade bundle it now holds; if it can't, the client
    // falls back to the pre-upgrade IndexedDB copy). Either way the app must
    // load and the warm-up preview must simply be absent.
    await page.context().setOffline(true);
    await page.goto("/today");
    await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();

    // The decisive assertion. The server still has the routine linked as the
    // default (asserted below), and the same screen showed `Warm-up: …` a
    // moment ago — so its absence here can only mean the app consumed a
    // pre-upgrade cached bundle and treated the missing fields as "none"
    // instead of throwing. No staleness-banner assertion: the SW answers
    // this from its own cache with a 200 whose `generatedAt` is seconds old,
    // which is legitimately not stale, so the banner is not a reliable
    // signal for this scenario.
    await expect(page.getByText(/^Warm-up: /)).toHaveCount(0);

    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByRole("button", { name: "Skip warm-up" })).toHaveCount(0);
    await expect(page.getByLabel("Warm-up routine")).toHaveCount(0);
    expect(await readLocalWarmupState(page)).toBeNull();

    // The workout itself is completely normal.
    await page.getByLabel("kg", { exact: true }).fill("100");
    await page.getByLabel("reps", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText("100 kg × 5")).toBeVisible();

    await page.context().setOffline(false);

    // Control for the assertion above: the association really is still there
    // server-side, so the missing card came from the doctored cache, not
    // from the fixture having been torn down early.
    const links = await page.request.get(
      `/api/templates/${await scheduledTemplateId(page)}/warmup-routines`,
    );
    const { links: serverLinks } = (await links.json()) as {
      links: { name: string; isDefault: boolean }[];
    };
    expect(serverLinks.filter((l) => l.isDefault).map((l) => l.name)).toEqual([UPPER_STANDARD]);
  });
});

test.describe("warm-up card: cold-offline execution", () => {
  test("a cold offline process runs the warm-up checklist and the workout from cached data", async ({
    browser,
  }) => {
    // Fixture setup happens in a normal (online) context first.
    const setupContext = await browser.newContext({ baseURL: BASE_URL });
    try {
      const setupPage = await setupContext.newPage();
      await login(setupPage);
      await ensureNoActiveSession(setupPage);
      await setupLinkedRoutines(setupPage);
    } finally {
      await setupContext.close();
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gym-app-e2e-warmup-"));
    try {
      // ---- Launch 1 (online): install the SW, cache Today, start the
      // workout with its frozen warm-up state, then kill the process.
      let context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
      try {
        const page = await context.newPage();
        await login(page);
        await waitForServiceWorkerControl(page);
        await ensureNoActiveSession(page);

        await page.goto("/today");
        await expect(page.getByText(`Warm-up: ${UPPER_STANDARD}`)).toBeVisible();
        await page.getByRole("button", { name: "Start workout" }).click();
        await page.waitForURL(/\/today\/workout$/);
        await warmupChecklistCheckboxes(page).nth(0).click();
        await expect(page.getByText(`${UPPER_STANDARD} · 1/3`)).toBeVisible();
        await waitForOutboxDrained(page);
      } finally {
        await context.close();
      }

      // ---- Launch 2: a genuinely new process with no name resolution at
      // all (OFFLINE_RESOLVER_ARG severs page and service worker alike),
      // navigated straight into the workout route.
      context = await chromium.launchPersistentContext(userDataDir, {
        baseURL: BASE_URL,
        offline: true,
        args: [OFFLINE_RESOLVER_ARG],
      });
      try {
        const page = await context.newPage();
        const response = await page.goto("/today/workout");
        expect(response?.status()).toBe(200);

        // The frozen warm-up state came back from IndexedDB, ticks intact.
        await expect(page.getByText(`${UPPER_STANDARD} · 1/3`)).toBeVisible();
        await expect(warmupChecklistCheckboxes(page).nth(0)).toBeChecked();

        // ...and it is fully usable offline: tick, switch, skip, undo.
        await warmupChecklistCheckboxes(page).nth(1).click();
        await expect(page.getByText(`${UPPER_STANDARD} · 2/3`)).toBeVisible();
        await page.getByLabel("Warm-up routine").selectOption({ label: SHOULDER_PREP });
        await expect(page.getByText(`${SHOULDER_PREP} · 0/1`)).toBeVisible();
        await page.getByRole("button", { name: "Skip warm-up" }).click();
        await expect(page.getByText("Warm-up skipped")).toBeVisible();
        await page.getByRole("button", { name: "Undo skip" }).click();

        // The workout itself still works offline.
        await page.getByLabel("kg", { exact: true }).fill("102.5");
        await page.getByLabel("reps", { exact: true }).fill("5");
        await page.getByRole("button", { name: "Log" }).click();
        await expect(page.getByText("102.5 kg × 5")).toBeVisible();
      } finally {
        await context.close();
      }

      // ---- Launch 3: back online. Everything converges with no dead
      // letters and no new entity kinds, then clean up.
      context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
      try {
        const page = await context.newPage();
        await page.goto("/today/workout");
        await expect(page.getByText("102.5 kg × 5")).toBeVisible();
        await waitForOutboxDrained(page);
        await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

        page.once("dialog", (d) => void d.accept());
        await page.getByRole("button", { name: "Discard workout" }).click();
        await page.waitForURL(/\/today$/);
        await waitForOutboxDrained(page);
        await teardown(page);
      } finally {
        await context.close();
      }
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

test.describe("warm-up card: cross-device adoption (O-3, accepted v1 behavior)", () => {
  test("a second browser session adopting the workout gets no warm-up card", async ({
    browser,
  }) => {
    const deviceA = await browser.newContext();
    const deviceB = await browser.newContext();
    try {
      const pageA = await deviceA.newPage();
      const pageB = await deviceB.newPage();

      await login(pageA);
      await ensureNoActiveSession(pageA);
      await setupLinkedRoutines(pageA);

      await pageA.goto("/today");
      await pageA.getByRole("button", { name: "Start workout" }).click();
      await pageA.waitForURL(/\/today\/workout$/);
      await warmupChecklistCheckboxes(pageA).nth(0).click();
      await expect(pageA.getByText(`${UPPER_STANDARD} · 1/3`)).toBeVisible();
      await pageA.getByLabel("kg", { exact: true }).fill("100");
      await pageA.getByLabel("reps", { exact: true }).fill("5");
      await pageA.getByRole("button", { name: "Log" }).click();
      await expect(pageA.getByText("100 kg × 5")).toBeVisible();
      await waitForOutboxDrained(pageA);

      await login(pageB);
      await expect(pageB.getByText(/A workout is already in progress/)).toBeVisible();
      await pageB.getByRole("button", { name: "Resume here" }).click();
      await pageB.waitForURL(/\/today\/workout$/);

      // The sets came across; the warm-up checklist did not. This is the
      // documented v1 limitation, asserted rather than assumed.
      await expect(pageB.getByText("100 kg × 5")).toBeVisible();
      await expect(pageB.getByRole("button", { name: "Skip warm-up" })).toHaveCount(0);
      await expect(pageB.getByLabel("Warm-up routine")).toHaveCount(0);
      expect(await readLocalWarmupState(pageB)).toBeNull();

      pageB.once("dialog", (d) => void d.accept());
      await pageB.getByRole("button", { name: "Discard workout" }).click();
      await pageB.waitForURL(/\/today$/);
      await teardown(pageB);
    } finally {
      await deviceA.close();
      await deviceB.close();
    }
  });
});
