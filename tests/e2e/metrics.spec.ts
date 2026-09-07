import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  bodyweightEntries,
  dashboardEstimateSelections,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
} from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise, deleteExercise, updateExercise } from "@/server/exercises/service";
import { replaceSelection } from "@/server/metrics/selectionService";
import { runSeed } from "@/db/seed";
import { E2E_EMAIL, login } from "./helpers";

// Metrics dashboard v1 (docs/reviews/metrics-dashboard-architecture-evaluation.md)
// end to end, phone-sized, against the real app. Same direct-DB-access
// precondition as strengthPage.spec.ts / volume.spec.ts: DATABASE_URL must be
// set in the shell running `pnpm test:e2e`. Every fixture exercise is
// timestamp-suffixed and its selection is cleared in `finally`, so this spec
// is independent of whatever else the shared dev account has logged.

interface SetSpec {
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup?: boolean;
}

async function logSession(
  userId: string,
  exerciseId: string,
  daysAgo: number,
  sets: SetSpec[],
): Promise<void> {
  const db = getDb();
  const startedAt = new Date(Date.now() - daysAgo * 86_400_000);
  const sessionId = newId();
  const sessionExerciseId = newId();
  await db.insert(workoutSessions).values({
    id: sessionId,
    userId,
    templateName: "E2E Metrics",
    weekIndex: 1,
    isDeload: false,
    status: "completed",
    startedAt,
    completedAt: startedAt,
  });
  await db.insert(sessionExercises).values({
    id: sessionExerciseId,
    sessionId,
    exerciseId,
    position: 0,
    source: "adhoc",
  });
  if (sets.length > 0) {
    await db.insert(setLogs).values(
      sets.map((spec, index) => ({
        id: newId(),
        sessionExerciseId,
        setNumber: index + 1,
        isWarmup: spec.isWarmup ?? false,
        weightKg: spec.weightKg,
        reps: spec.reps,
        rir: spec.rir,
        loggedAt: startedAt,
      })),
    );
  }
}

async function getE2eUserId(): Promise<string> {
  const db = getDb();
  await runSeed(db);
  const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
  if (!user) throw new Error("expected the e2e user to exist — run tests/e2e/seed.ts first");
  return user.id;
}

async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe("metrics dashboard (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("A-17: empty selection shows its empty state, five cards render, and nothing overflows at 390x844 and 320x568", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    await replaceSelection(getDb(), userId, []);

    await login(page);
    await page.goto("/metrics");

    await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();
    const h2s = page.getByRole("heading", { level: 2 });
    await expect(h2s).toHaveCount(5);
    await expect(
      page.getByText("No exercises selected. Choose up to five compatible exercises."),
    ).toBeVisible();
    const chooseExercises = page.getByRole("link", { name: "Choose exercises", exact: true });
    await expect(chooseExercises).toBeVisible();

    // A-18: the empty-state link starts the selection flow.
    await chooseExercises.click();
    await page.waitForURL(/\/metrics\/exercises$/);
    await expect(page.getByRole("heading", { name: "Dashboard exercises" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

    expect(await scrollWidth(page)).toBeLessThanOrEqual(390);

    await page.setViewportSize({ width: 320, height: 568 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();
    expect(await scrollWidth(page)).toBeLessThanOrEqual(320);

    // Every link/button inside the cards clears the 44 px touch target — the
    // shared nav is exempted by design (§12.1) and lives outside this
    // container.
    const interactive = page.getByTestId("metrics-screen").locator("a, button");
    const count = await interactive.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await interactive.nth(i).boundingBox();
      if (!box) continue; // an offscreen/hidden control (e.g. sr-only status line) has none
      expect(box.height, `control #${i} is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
  });

  test("A-18 / L-6: a selected exercise WITH a current estimate renders the full '≈ … (likely …) est.' composition and links to the detail page", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const exercise = await createExercise(getDb(), userId, {
      name: `E2E Metrics Squat ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    // 100 kg x 5 @ RIR 2 -> RTF 7 -> e1RM 123.33, which is 122.5 on a 2.5 kg
    // grid with a ±10% band rounded outward to [110, 137.5].
    await logSession(userId, exercise.id, 5, [
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
    ]);
    await replaceSelection(getDb(), userId, [exercise.id]);

    try {
      await login(page);
      await page.goto("/metrics");
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

      const row = page.getByRole("link", { name: new RegExp(exercise.name) });
      await expect(row).toBeVisible();
      // L-6 — A-20's clause: "every estimate string on the page contains
      // '≈', '(likely', and 'est.'" — asserted on the actual rendered
      // page, not just the copy-module constants.
      await expect(row).toContainText("≈");
      await expect(row).toContainText("(likely");
      await expect(row).toContainText("est.");
      await expect(row).toContainText("≈ 122.5 kg (likely 110–137.5) est.");

      // L-6 — every required §15 sentence actually renders on the page.
      const body = await page.locator("body").innerText();
      for (const required of [
        "Based on the last 90 days of training.",
        "An estimate from your logged sets, not a measured value.",
        "The range is a ±10 % convention, not a measured error.",
        "In the numbers you log for each exercise",
        "Deload sessions are not counted.",
        "Estimates only — not tested maxes.",
        "e1rm-epley-rir v1",
      ]) {
        expect(body, `expected the page to contain: ${required}`).toContain(required);
      }

      await row.click();
      await expect(page.getByRole("heading", { name: "Strength estimate" })).toBeVisible();
      await expect(page.getByText(exercise.name)).toBeVisible();
    } finally {
      await replaceSelection(getDb(), userId, []);
      await deleteExercise(getDb(), userId, exercise.id).catch(() => undefined);
    }
  });

  test("M-5: all three non-estimate row states render in the DOM (no_current_estimate, not_available, turned_off)", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const suffix = Date.now();
    const noEstimate = await createExercise(getDb(), userId, {
      name: `E2E No Estimate ${suffix}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const notAvailable = await createExercise(getDb(), userId, {
      name: `E2E Not Available ${suffix}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    const turnedOff = await createExercise(getDb(), userId, {
      name: `E2E Turned Off ${suffix}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "back", role: "primary", weight: 1 }],
    });

    try {
      // All three must be selected WHILE still eligible; the "already
      // selected" exemption (§11.5) then keeps them after they degrade.
      await replaceSelection(getDb(), userId, [noEstimate.id, notAvailable.id, turnedOff.id]);
      await updateExercise(getDb(), userId, notAvailable.id, { equipment: "bodyweight" });
      await updateExercise(getDb(), userId, turnedOff.id, { strengthEstimate: "off" });

      await login(page);
      await page.goto("/metrics");
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

      const noEstimateRow = page.getByRole("link", { name: new RegExp(noEstimate.name) });
      const notAvailableRow = page.getByRole("link", { name: new RegExp(notAvailable.name) });
      const turnedOffRow = page.getByRole("link", { name: new RegExp(turnedOff.name) });
      await expect(noEstimateRow).toContainText("No current estimate");
      await expect(notAvailableRow).toContainText("Not available for this equipment type");
      await expect(turnedOffRow).toContainText("Strength estimate turned off for this exercise");
    } finally {
      await replaceSelection(getDb(), userId, []);
      await deleteExercise(getDb(), userId, noEstimate.id).catch(() => undefined);
      await deleteExercise(getDb(), userId, notAvailable.id).catch(() => undefined);
      await deleteExercise(getDb(), userId, turnedOff.id).catch(() => undefined);
    }
  });

  test("M-1: an in-progress deload session badges the CURRENT week's own Volume column, with the shared amber badge markup", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const exercise = await createExercise(getDb(), userId, {
      name: `E2E M1 Deload ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const db = getDb();
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const startedAt = new Date();
    await db.insert(workoutSessions).values({
      id: sessionId,
      userId,
      templateName: "E2E M1",
      weekIndex: 1,
      isDeload: true,
      status: "in_progress",
      startedAt,
    });
    await db.insert(sessionExercises).values({
      id: sessionExerciseId,
      sessionId,
      exerciseId: exercise.id,
      position: 0,
      source: "adhoc",
    });
    await db.insert(setLogs).values({
      id: setId,
      sessionExerciseId,
      setNumber: 1,
      isWarmup: false,
      weightKg: 100,
      reps: 5,
      rir: 2,
      loggedAt: startedAt,
    });

    try {
      await login(page);
      await page.goto("/metrics");
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

      // §8's divergence case (ii): an in-progress deload session badges
      // Volume's CURRENT week column (and counts its sets), not Training —
      // and the badge is the shared amber markup, not appended text.
      // Scoped by the card's own `h2` (not a substring of card text) — the
      // Current estimates card's reused freshness sentence ("...last 90
      // days of training.") would otherwise make a plain `hasText:
      // "Training"` filter match the WRONG, earlier card.
      const volumeCard = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Weekly volume", exact: true, level: 2 }),
      });
      const thisWeekHeader = volumeCard.locator("th").filter({ hasText: "This week" });
      await expect(thisWeekHeader.getByText("Deload")).toBeVisible();
    } finally {
      await db.delete(setLogs).where(eq(setLogs.id, setId));
      await db.delete(sessionExercises).where(eq(sessionExercises.id, sessionExerciseId));
      await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
      await deleteExercise(getDb(), userId, exercise.id).catch(() => undefined);
    }
  });

  test("L-7: the sparkline is aria-hidden with a following text line, and the volume/recovery tables carry column headers", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const exercise = await createExercise(getDb(), userId, {
      name: `E2E L7 Squat ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    await logSession(userId, exercise.id, 2, [
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
    ]);
    await replaceSelection(getDb(), userId, [exercise.id]);
    const db = getDb();
    await db.insert(bodyweightEntries).values([
      { id: newId(), userId, date: new Date().toISOString().slice(0, 10), weightKg: 82 },
      {
        id: newId(),
        userId,
        date: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
        weightKg: 81.5,
      },
    ]);

    try {
      await login(page);
      await page.goto("/metrics");
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

      // The bodyweight sparkline: aria-hidden, with a following text line.
      const svg = page.locator("svg[aria-hidden='true']");
      await expect(svg).toHaveCount(1);
      await expect(page.getByText(/90 days · \d+ entries/)).toBeVisible();

      // Volume and recovery tables both carry column headers.
      const colHeaders = page.locator("th[scope='col']");
      expect(await colHeaders.count()).toBeGreaterThanOrEqual(8);
      const rowHeaders = page.locator("th[scope='row']");
      expect(await rowHeaders.count()).toBeGreaterThanOrEqual(1);
    } finally {
      await replaceSelection(getDb(), userId, []);
      await db.delete(bodyweightEntries).where(eq(bodyweightEntries.userId, userId));
      await deleteExercise(getDb(), userId, exercise.id).catch(() => undefined);
    }
  });

  test("L-1: the sparkline's text alternative still renders with fewer than 2 bodyweight entries", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const db = getDb();
    await replaceSelection(getDb(), userId, []);
    await db.delete(bodyweightEntries).where(eq(bodyweightEntries.userId, userId));
    await db
      .insert(bodyweightEntries)
      .values([{ id: newId(), userId, date: new Date().toISOString().slice(0, 10), weightKg: 82 }]);

    try {
      await login(page);
      await page.goto("/metrics");
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

      // M-9: fewer than 2 entries -> no chart …
      await expect(page.locator("svg[aria-hidden='true']")).toHaveCount(0);
      // … but L-1: the text alternative it stands in for must still render.
      await expect(page.getByText(/90 days · 1 entr/)).toBeVisible();
    } finally {
      await db.delete(bodyweightEntries).where(eq(bodyweightEntries.userId, userId));
    }
  });

  test("A-19: warm page, no data yet — an in-app navigation while offline shows the no-connection line, not a broken screen", async ({
    page,
    context,
  }) => {
    const userId = await getE2eUserId();
    await replaceSelection(getDb(), userId, []);

    await login(page);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    // An IN-APP navigation (client-side, no new document fetch) — the cold-
    // navigation case (i) is the OfflineShell's route notice and is not this
    // component's concern at all.
    await context.setOffline(true);
    await page.getByRole("link", { name: "Metrics", exact: true }).click();
    await expect(page.getByText("Offline — metrics need a connection.")).toBeVisible();

    await context.setOffline(false);
  });

  test("A-19: warm page with data — going offline then tapping Refresh keeps the numbers under an 'as of' line", async ({
    page,
    context,
  }) => {
    const userId = await getE2eUserId();
    await replaceSelection(getDb(), userId, []);

    await login(page);
    await page.goto("/metrics");
    await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(/Offline — showing metrics as of/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

    await context.setOffline(false);
  });

  test("L-4: a non-network refetch failure (401, invalidated session) keeps the rendered dashboard and shows a refetch-error banner, not a blank error screen", async ({
    browser,
  }) => {
    // RV-1 remediation — `context.clearCookies()` alone was racy. This app's
    // rolling session (ADR-004, `touchSessionInMiddleware`) re-issues
    // `Set-Cookie` on EVERY request middleware sees as authenticated, and
    // `/metrics`'s own nav bar mounts `<Link>`s to every other route plus
    // "Choose exercises" (`/metrics/exercises`) — Next.js prefetches all of
    // them automatically on mount. Traced directly: `GET /metrics/exercises`
    // is still in flight when `clearCookies()` runs, and its `200` lands
    // afterward carrying a fresh `Set-Cookie` that restores a valid session
    // before the Refresh click's fetch ever goes out. SyncStatusBanner's own
    // polling is not the mechanism (`refreshDeadLetters`/`refreshSessionBlocked`
    // only read IndexedDB; `flushOutbox` returns before any fetch when the
    // outbox is empty) — every route on an authenticated page is a source,
    // not one component's timer.
    //
    // A first attempt relayed every non-essential response through
    // `route.fetch()` + `route.fulfill()`, stripping `Set-Cookie` before it
    // reached the page. That still raced: `route.fetch()` shares this
    // context's cookie jar and applies a response's `Set-Cookie` to it
    // immediately on receipt, as part of faithfully replaying the request —
    // independent of, and *before*, whatever the handler goes on to fulfil
    // the page with. Stripping the header from the fulfilled response only
    // hides it from the page; the jar was already updated. Traced directly:
    // `cookies()` read a *different* session value immediately after
    // `clearCookies()`, proving some response won the jar update regardless
    // of what this test's own route handler fulfilled.
    //
    // The fix doesn't relay confounding traffic at all: `route.continue()`
    // for the exact requests this test's own flow needs (auth, static
    // assets, the pages/APIs `login()` and this test visit), `route.abort()`
    // for everything else — chiefly the nav bar's prefetches of every other
    // route. An aborted request never receives a response, so nothing about
    // it can ever reach the cookie jar, by either the browser's native
    // handling or Playwright's own. `route.continue()` for the allowed
    // requests hands them to Chromium's ordinary network stack, unmodified,
    // and native cookie handling there is exactly what a normal browser
    // does — no double bookkeeping, no `route.fetch()` involved at all.
    //
    // This needs `serviceWorkers: "block"` to actually hold everywhere:
    // `waitForServiceWorkerControl`'s own comment documents `clientsClaim:
    // false` (`src/app/sw.ts`) — the document that installs the worker stays
    // uncontrolled, but this test's `page.goto("/metrics")` is a fresh
    // top-level navigation, which an already-active worker from an earlier
    // navigation in the same test (login → /today) DOES take over without a
    // reload. Traced directly: every request up to and including login is
    // visible to `page.route`, then a second, un-intercepted wave of the
    // same navigations follows once the worker takes control — `/api/metrics`
    // and `/metrics/exercises` land in that second wave, invisible to
    // `page.route` regardless of what it does with them. Blocking the worker
    // removes that blind spot; it changes nothing observable here, since
    // `/api/metrics`'s own runtime-caching entry is `NetworkOnly` (always hit
    // the network, cache nothing) either way. Blocking it does make an
    // unrelated PWA-update-check throw a harmless, already-swallowed
    // `TypeError: Cannot read properties of undefined (reading 'waiting')`
    // (confirmed via `page.on("pageerror")` not to affect login, navigation,
    // or rendering) — noted here so it isn't mistaken for a real regression
    // if seen in a trace.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    try {
      // Exactly the requests this test's own flow (login, then /metrics)
      // needs; everything else — chiefly the nav bar's prefetches of every
      // other route — is a potential source of a rolling-session refresh
      // and is aborted outright rather than relayed.
      const ALLOWED_PATHS = new Set([
        "/",
        "/login",
        "/today",
        "/metrics",
        "/api/metrics",
        "/api/active-session",
        "/api/today-bundle",
      ]);
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (
          url.pathname.startsWith("/api/auth/") ||
          url.pathname.startsWith("/_next/") ||
          url.pathname === "/sw.js" ||
          url.pathname === "/manifest.webmanifest" ||
          url.pathname === "/favicon.ico" ||
          ALLOWED_PATHS.has(url.pathname)
        ) {
          await route.continue();
          return;
        }
        await route.abort();
      });

      const userId = await getE2eUserId();
      await replaceSelection(getDb(), userId, []);

      await login(page);
      await page.goto("/metrics");
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();

      await context.clearCookies({ name: "gym_app_session" });

      // Prove the *real* request the click triggers is the one that 401s —
      // not merely inferred from the UI reacting to it.
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) =>
            new URL(res.url()).pathname === "/api/metrics" && res.request().method() === "GET",
        ),
        page.getByRole("button", { name: "Refresh" }).click(),
      ]);
      expect(response.status()).toBe(401);

      await expect(
        page.getByText("Couldn't refresh — showing the last loaded numbers."),
      ).toBeVisible();
      // The dashboard itself is still there — a refetch error must not
      // replace a fully rendered screen with a one-line error (L-4).
      await expect(page.getByRole("heading", { name: "Metrics", level: 1 })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("A-33: the editor adds, reorders, removes, saves, and Cancel writes nothing", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const a = await createExercise(getDb(), userId, {
      name: `E2E Editor A ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const b = await createExercise(getDb(), userId, {
      name: `E2E Editor B ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    await replaceSelection(getDb(), userId, []);

    try {
      await login(page);
      await page.goto("/metrics/exercises");
      await expect(page.getByRole("heading", { name: "Dashboard exercises" })).toBeVisible();

      // Add both candidates, in order A then B.
      await page.getByLabel("Add an exercise").selectOption({ label: a.name });
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByLabel("Add an exercise").selectOption({ label: b.name });
      await page.getByRole("button", { name: "Add", exact: true }).click();

      const list = page.getByRole("list").last();
      await expect(list.getByRole("listitem")).toHaveCount(2);

      // Move B up so it becomes first.
      await page.getByRole("button", { name: `Move ${b.name} up` }).click();
      const items = page.getByRole("listitem");
      await expect(items.first()).toContainText(b.name);

      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForURL(/\/metrics$/);

      const firstRow = page.getByRole("link").filter({ hasText: b.name }).first();
      await expect(firstRow).toBeVisible();

      // Cancel writes nothing: remove one via the editor without saving.
      await page.goto("/metrics/exercises");
      await page.getByRole("button", { name: `Remove ${a.name}` }).click();
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await page.getByRole("link", { name: "Cancel", exact: true }).click();
      await page.waitForURL(/\/metrics$/);

      const dbSelection = await getDb()
        .select()
        .from(dashboardEstimateSelections)
        .where(eq(dashboardEstimateSelections.userId, userId));
      expect(dbSelection.map((row) => row.exerciseId).sort()).toEqual([a.id, b.id].sort());
    } finally {
      await replaceSelection(getDb(), userId, []);
      await deleteExercise(getDb(), userId, a.id).catch(() => undefined);
      await deleteExercise(getDb(), userId, b.id).catch(() => undefined);
    }
  });

  test("H-1 / M-6: editor geometry, controls and announcements hold at both 320x568 and 390x844, including a candidate with a ≥50-character name", async ({
    page,
  }) => {
    const userId = await getE2eUserId();
    const suffix = Date.now();
    const longName = `E2E Overflow Candidate With A Genuinely Very Long Exercise Name ${suffix}`;
    expect(longName.length).toBeGreaterThanOrEqual(50);

    const shortExercises = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        createExercise(getDb(), userId, {
          name: `E2E Geometry ${i} ${suffix}`,
          equipment: "barbell",
          mechanics: "compound",
          laterality: "bilateral",
          loadStepKg: 2.5,
          contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
        }),
      ),
    );
    const longExercise = await createExercise(getDb(), userId, {
      name: longName,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    const allIds = [...shortExercises.map((e) => e.id), longExercise.id];
    const allExercises = [...shortExercises, longExercise];

    try {
      await login(page);

      for (const viewport of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
      ]) {
        await replaceSelection(getDb(), userId, []);
        await page.setViewportSize(viewport);
        await page.goto("/metrics/exercises");
        await expect(page.getByRole("heading", { name: "Dashboard exercises" })).toBeVisible();
        expect(await scrollWidth(page)).toBeLessThanOrEqual(viewport.width);

        // H-1 — add all five, including the long-named one, checking
        // overflow after each add: the review found the overflow grows
        // with each additional long candidate/selected row.
        for (const exercise of allExercises) {
          await page.getByLabel("Add an exercise").selectOption({ label: exercise.name });
          await page.getByRole("button", { name: "Add", exact: true }).click();
          expect(
            await scrollWidth(page),
            `overflow after adding "${exercise.name}" at ${viewport.width}px`,
          ).toBeLessThanOrEqual(viewport.width);
        }

        // M-6 — the limit message replaces the candidate <select> once five
        // rows are listed, regardless of whether other candidates remain.
        await expect(page.getByRole("listitem")).toHaveCount(5);
        await expect(page.getByText("Five exercises is the limit.")).toBeVisible();
        await expect(page.getByLabel("Add an exercise")).toHaveCount(0);

        // M-6 — Up disabled on the first row, Down disabled on the last.
        const firstRowName = shortExercises[0]!.name;
        await expect(page.getByRole("button", { name: `Move ${firstRowName} up` })).toBeDisabled();
        await expect(page.getByRole("button", { name: `Move ${longName} down` })).toBeDisabled();

        // M-6 — every row control, and Save, clears 44 px at both viewports.
        const rowControls = page.locator("ol button");
        const rowControlCount = await rowControls.count();
        expect(rowControlCount).toBeGreaterThan(0);
        for (let i = 0; i < rowControlCount; i++) {
          const box = await rowControls.nth(i).boundingBox();
          expect(box, `control #${i} has no layout box at ${viewport.width}px`).not.toBeNull();
          expect(
            box!.height,
            `control #${i} is shorter than 44px at ${viewport.width}px`,
          ).toBeGreaterThanOrEqual(44);
        }
        const saveBox = await page.getByRole("button", { name: "Save", exact: true }).boundingBox();
        expect(saveBox!.height).toBeGreaterThanOrEqual(44);

        // M-6 — the role="status" position announcement after a move.
        await page.getByRole("button", { name: `Move ${firstRowName} down` }).click();
        await expect(page.getByText(`${firstRowName} is now 2 of 5`)).toBeVisible();

        expect(
          await scrollWidth(page),
          `overflow after reordering at ${viewport.width}px`,
        ).toBeLessThanOrEqual(viewport.width);
      }
    } finally {
      await replaceSelection(getDb(), userId, []);
      for (const id of allIds) {
        await deleteExercise(getDb(), userId, id).catch(() => undefined);
      }
    }
  });

  test("A-33: going offline before Save shows the offline error and keeps the unsaved list intact", async ({
    page,
    context,
  }) => {
    const userId = await getE2eUserId();
    const exercise = await createExercise(getDb(), userId, {
      name: `E2E Editor Offline ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    await replaceSelection(getDb(), userId, []);

    try {
      await login(page);
      await page.goto("/metrics/exercises");
      await page.getByLabel("Add an exercise").selectOption({ label: exercise.name });
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("listitem")).toHaveCount(1);

      await context.setOffline(true);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Couldn't save — you're offline.")).toBeVisible();
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await context.setOffline(false);
    } finally {
      await replaceSelection(getDb(), userId, []);
      await deleteExercise(getDb(), userId, exercise.id).catch(() => undefined);
    }
  });
});

test.describe("metrics API route (§11.1)", () => {
  test("A-10: an unauthenticated GET is 401; an authenticated GET is 200 with metrics present", async ({
    page,
  }) => {
    const unauth = await page.request.get("/api/metrics");
    expect(unauth.status()).toBe(401);

    await login(page);
    const authed = await page.request.get("/api/metrics");
    expect(authed.ok()).toBe(true);
    const body = (await authed.json()) as { metrics?: unknown };
    expect(body.metrics).toBeTruthy();
  });
});
