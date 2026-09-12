import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, test, expect, type Page, type Locator } from "@playwright/test";
import { formatRestSeconds } from "@/domain/measurement/format";
import {
  OFFLINE_RESOLVER_ARG,
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerControl,
  createMeasurementExercise,
  createTemplateWithScheme,
  getActiveProgramInfo,
  applyScheduleOverride,
  restoreSchedule,
} from "./helpers";

// PI-018 Workout prescription context —
// docs/reviews/workout-prescription-context-architecture-evaluation.md
// §5/§7/§10 (E-1…E-6). End-to-end coverage of the two things the frozen
// snapshot now has to carry all the way to the card: the PRESCRIBED REST on
// the existing subtitle, and the read-only "Program note:" block.
//
// The change is honestly a SYNC-CONTRACT change (§10) — `src/sync/types.ts`
// and `src/sync/activeSession.ts` both change — so this spec is added to
// `package.json`'s `test:e2e:offline` list and an offline start from a
// genuinely cached bundle is part of acceptance, not an optional extra.
//
// Needs a PRODUCTION build (the service worker is disabled when
// NODE_ENV=development) and a seeded dev Postgres — see
// playwright.config.ts's `webServer`, which builds and starts one, and
// offline-sync.spec.ts's header.
//
// Isolation: the shared seeded prescription is never mutated. Each test
// builds its own temporary template, points the shared block's schedule at
// it for the duration, and restores the schedule in `finally`. Playwright is
// pinned to `workers: 1, fullyParallel: false`, so no sibling spec ever
// observes the intermediate schedule state — the discipline
// `applyScheduleOverride`'s own comment records. There is no template DELETE
// route, so the temporary template is ARCHIVED and declared as residue.

const BASE_URL = "http://localhost:3000";

test.use({ viewport: { width: 390, height: 844 } });

const FIXED_3X5 = { v: 1, scheme: { type: "fixed" as const, sets: 3, reps: 5 } };
const SCHEME_TEXT = "3 × 5";

// Deliberately multiline, and carrying a long unbroken token: §5.2 specifies
// `whitespace-pre-wrap break-words`, and the second half of that is what
// keeps the page from growing a horizontal scrollbar.
const TOP_NOTE =
  "Top set: pause 1 s on the chest.\nElbows ~45°. Cue: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BACKOFF_NOTE = "Back-off: same bar speed, no grinders.";
const TOP_REST = 150; // -> "2:30"
const BACKOFF_REST = 45; // -> "45 s"

// An exercise card is the one `<li>` carrying a Skip/Unskip button; a set
// row (a nested `<li>`) never has one. Same "find the row by what it
// actually renders" idiom measurementProfiles.spec.ts uses.
function exerciseCards(page: Page): Locator {
  return page.locator("li").filter({ has: page.getByRole("button", { name: /^(Skip|Unskip)$/ }) });
}

// §5.1 — the prescription subtitle is the `<p>` carrying the formatted
// scheme. Every "no stray separator" assertion below is scoped to THIS
// element rather than the whole page, because `·` is also emitted by
// `formatSetLine` and by the duration `m:ss` label (the architecture
// review's §5 caution).
function subtitle(card: Locator): Locator {
  return card.locator("p").filter({ hasText: SCHEME_TEXT }).first();
}

function programNote(card: Locator): Locator {
  return card.locator("p").filter({ hasText: "Program note:" }).first();
}

interface Fixture {
  blockId: string;
  programId: string;
  originalSchedulePayload: { templateId: string; weekdays?: number[] }[];
  templateId: string;
  prescriptionIds: string[];
  benchName: string;
  accessoryName: string;
}

// Builds a template with THREE slots:
//   0 — bench, rest 2:30, multiline program note   (E-1)
//   1 — THE SAME bench exercise again, rest 45 s, a different note (E-1, C-6)
//   2 — a different exercise, no rest and no note  (E-6)
async function buildFixture(page: Page, label: string): Promise<Fixture> {
  const unique = `${label} ${Date.now()}`;
  const info = await getActiveProgramInfo(page);

  const bench = await createMeasurementExercise(page, {
    name: `${unique} Bench`,
    equipment: "barbell",
    measurementProfile: "load_reps",
  });
  const accessory = await createMeasurementExercise(page, {
    name: `${unique} Accessory`,
    equipment: "barbell",
    measurementProfile: "load_reps",
  });

  // Slot 0 (created without instructions by the shared helper, then given
  // its own via the real PATCH route).
  const templateId = await createTemplateWithScheme(
    page,
    info.programId,
    bench.id,
    `${unique} Template`,
    FIXED_3X5,
  );

  // Slot 1 — the SAME exerciseId a second time. `exercise_prescriptions` is
  // unique on (template_id, position) only, so this is a supported shape and
  // exactly what C-6 is about.
  const backoffRes = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
    data: {
      exerciseId: bench.id,
      scheme: FIXED_3X5,
      progression: { strategyId: "manual" },
      restSeconds: BACKOFF_REST,
      notes: BACKOFF_NOTE,
    },
  });
  expect(backoffRes.status(), await backoffRes.text()).toBe(201);

  // Slot 2 — no rest, no note.
  const bareRes = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
    data: {
      exerciseId: accessory.id,
      scheme: FIXED_3X5,
      progression: { strategyId: "manual" },
    },
  });
  expect(bareRes.status(), await bareRes.text()).toBe(201);

  const listRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
  expect(listRes.ok(), await listRes.text()).toBe(true);
  const { prescriptions } = (await listRes.json()) as {
    prescriptions: { id: string; position: number }[];
  };
  const ordered = prescriptions.slice().sort((a, b) => a.position - b.position);
  expect(ordered).toHaveLength(3);

  const topRes = await page.request.patch(`/api/prescriptions/${ordered[0]!.id}`, {
    data: { restSeconds: TOP_REST, notes: TOP_NOTE },
  });
  expect(topRes.ok(), await topRes.text()).toBe(true);

  return {
    ...info,
    templateId,
    prescriptionIds: ordered.map((p) => p.id),
    benchName: bench.name,
    accessoryName: accessory.name,
  };
}

async function teardown(page: Page, fixture: Fixture | undefined): Promise<void> {
  if (!fixture) return;
  await page.goto("/today/workout").catch(() => undefined);
  const discard = page.getByRole("button", { name: "Discard workout" });
  if (await discard.isVisible().catch(() => false)) {
    page.once("dialog", (d) => void d.accept());
    await discard.click();
    await page.waitForURL(/\/today$/).catch(() => undefined);
  }
  await restoreSchedule(page, fixture.blockId, fixture.originalSchedulePayload);
  // No template DELETE route exists — archiving is the available disposal,
  // and the archived template is declared as residue in the report.
  await page.request
    .post(`/api/templates/${fixture.templateId}/archive`, { data: { action: "archive" } })
    .catch(() => undefined);
}

test.describe("PI-018 — prescribed rest and program notes on the workout card", () => {
  test("E-1/E-4/E-5/E-6: duplicate slots keep their own instructions, survive a program edit, and stay independent of session notes", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    let fixture: Fixture | undefined;
    try {
      fixture = await buildFixture(page, "PI018 Online");
      await applyScheduleOverride(page, fixture.blockId, fixture.templateId);

      await page.goto("/today");
      await ensureNoActiveSession(page);
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);

      const cards = exerciseCards(page);
      await expect(cards).toHaveCount(3);

      // ---- E-1: both bench slots render, each with ITS OWN instructions.
      const top = cards.nth(0);
      const backoff = cards.nth(1);

      await expect(subtitle(top)).toContainText(`· Rest ${formatRestSeconds(TOP_REST)}`);
      await expect(subtitle(top)).toContainText("· Rest 2:30");
      await expect(programNote(top)).toContainText("Top set: pause 1 s on the chest.");
      await expect(programNote(top)).toContainText("Elbows ~45°.");

      await expect(subtitle(backoff)).toContainText(`· Rest ${formatRestSeconds(BACKOFF_REST)}`);
      await expect(subtitle(backoff)).toContainText("· Rest 45 s");
      await expect(programNote(backoff)).toContainText(BACKOFF_NOTE);

      // Independent, not collapsed by exerciseId: neither card shows the
      // other's note or the other's rest.
      await expect(programNote(top)).not.toContainText(BACKOFF_NOTE);
      await expect(programNote(backoff)).not.toContainText("Top set:");
      await expect(subtitle(top)).not.toContainText("45 s");
      await expect(subtitle(backoff)).not.toContainText("2:30");

      // ---- E-6: a slot with neither value shows neither line, and NO stray
      // separator. Scoped to the subtitle element (see `subtitle`'s comment).
      const bare = cards.nth(2);
      await expect(bare).toContainText(fixture.accessoryName);
      await expect(subtitle(bare)).toHaveText(SCHEME_TEXT);
      await expect(programNote(bare)).toHaveCount(0);

      // The long unbroken token in TOP_NOTE must not widen the page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );

      // ---- E-5: the editable session note is a different field entirely.
      await top.getByRole("button", { name: "Add notes" }).click();
      const textarea = top.locator("textarea");
      await textarea.fill("session text, typed during the workout");
      await textarea.blur();
      await waitForOutboxDrained(page);

      await expect(programNote(top)).toContainText("Top set: pause 1 s on the chest.");
      await expect(textarea).toHaveValue("session text, typed during the workout");
      await expect(textarea).not.toHaveValue(/Top set/);

      // ---- E-4: the program definition changes WHILE the session runs.
      const patch = await page.request.patch(`/api/prescriptions/${fixture.prescriptionIds[0]!}`, {
        data: { restSeconds: 30, notes: "REWRITTEN AFTER START" },
      });
      expect(patch.ok(), await patch.text()).toBe(true);

      // Positive witness: the PROGRAM really did change. Without this, E-4
      // could pass for the wrong reason — a silently rejected PATCH would
      // leave the card showing the original values and look like a working
      // freeze. Read it back off the real route.
      const afterPatch = await page.request.get(
        `/api/templates/${fixture.templateId}/prescriptions`,
      );
      expect(afterPatch.ok()).toBe(true);
      const { prescriptions: current } = (await afterPatch.json()) as {
        prescriptions: { id: string; notes: string | null; restSeconds: number | null }[];
      };
      const edited = current.find((p) => p.id === fixture!.prescriptionIds[0]!);
      expect(edited?.notes).toBe("REWRITTEN AFTER START");
      expect(edited?.restSeconds).toBe(30);

      // A full reload re-hydrates the card from the IndexedDB aggregate — the
      // frozen snapshot, never the live bundle.
      await page.reload();
      const topAfter = exerciseCards(page).nth(0);
      await expect(subtitle(topAfter)).toContainText("· Rest 2:30");
      await expect(programNote(topAfter)).toContainText("Top set: pause 1 s on the chest.");
      await expect(programNote(topAfter)).not.toContainText("REWRITTEN AFTER START");
      await expect(subtitle(topAfter)).not.toContainText("Rest 30 s");

      // …and both notes survive the reload, still independent of each other.
      await expect(topAfter.locator("textarea")).toHaveValue(
        "session text, typed during the workout",
      );

      // The instructions stay visible on a SKIPPED slot (§5.3) — the slot is
      // one tap from being unskipped and the context informs that tap.
      await topAfter.getByRole("button", { name: "Skip" }).click();
      await expect(topAfter.getByRole("button", { name: "Unskip" })).toBeVisible();
      await expect(subtitle(topAfter)).toContainText("· Rest 2:30");
      await expect(programNote(topAfter)).toContainText("Top set: pause 1 s on the chest.");

      await waitForOutboxDrained(page);
      await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);
    } finally {
      await teardown(page, fixture);
    }
  });

  // E-2/E-3 — the offline half of acceptance for a sync-contract change: the
  // workout is STARTED offline, from a bundle that was cached before the
  // network went away, in a genuinely separate browser process. The
  // instructions must render (C-2's tolerance path is what makes this not
  // throw), survive an offline reload out of IndexedDB, and the ops must
  // apply cleanly once the network comes back.
  //
  // "Offline" is enforced by OFFLINE_RESOLVER_ARG, not by the `offline: true`
  // launch option, which helpers.ts records as inert.
  test("E-2/E-3: starting offline from a cached bundle renders both slots' instructions, and they survive an offline reload", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gym-app-e2e-pi018-"));
    let fixture: Fixture | undefined;

    try {
      // Launch 1 (online): build the fixture, get the service worker in
      // control, and warm both the SW `today-bundle` cache and the IndexedDB
      // `bundleCache` with a real, controlled visit to /today.
      let context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
      try {
        const page = await context.newPage();
        await login(page);
        await waitForServiceWorkerControl(page);
        await ensureNoActiveSession(page);

        fixture = await buildFixture(page, "PI018 Offline");
        await applyScheduleOverride(page, fixture.blockId, fixture.templateId);

        await page.goto("/today");
        await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
        // The bundle for THIS schedule must be the cached one, so assert the
        // overridden template's own exercise is what Today is showing.
        await expect(page.getByText(fixture.benchName).first()).toBeVisible();
      } finally {
        await context.close();
      }

      // Launch 2: a genuine new browser process, offline from its very first
      // navigation. Starting here proves the instructions come off the cached
      // bundle and the local aggregate, not the network.
      context = await chromium.launchPersistentContext(userDataDir, {
        baseURL: BASE_URL,
        args: [OFFLINE_RESOLVER_ARG],
      });
      try {
        const page = await context.newPage();
        await page.goto("/today");

        // Prove this launch really IS offline before asserting anything that
        // depends on it — otherwise the whole test could pass vacuously by
        // being served live. `/api/history` is NetworkOnly, so it can only
        // resolve if the network is genuinely reachable.
        const reachedNetwork = await page.evaluate(() =>
          fetch("/api/history?limit=1")
            .then((r) => r.ok)
            .catch(() => false),
        );
        expect(reachedNetwork, "expected the host-resolver rule to sever the network").toBe(false);

        await page.getByRole("button", { name: "Start workout" }).click();
        await page.waitForURL(/\/today\/workout$/);

        const cards = exerciseCards(page);
        await expect(cards).toHaveCount(3);
        await expect(subtitle(cards.nth(0))).toContainText("· Rest 2:30");
        await expect(programNote(cards.nth(0))).toContainText("Top set: pause 1 s on the chest.");
        await expect(subtitle(cards.nth(1))).toContainText("· Rest 45 s");
        await expect(programNote(cards.nth(1))).toContainText(BACKOFF_NOTE);
        await expect(subtitle(cards.nth(2))).toHaveText(SCHEME_TEXT);
        await expect(programNote(cards.nth(2))).toHaveCount(0);

        // E-3 — an offline reload, served by the SW, re-hydrating from
        // IndexedDB. The frozen instructions must still be there.
        await page.reload();
        const reloaded = exerciseCards(page);
        await expect(reloaded).toHaveCount(3);
        await expect(subtitle(reloaded.nth(0))).toContainText("· Rest 2:30");
        await expect(programNote(reloaded.nth(0))).toContainText(
          "Top set: pause 1 s on the chest.",
        );
        await expect(subtitle(reloaded.nth(1))).toContainText("· Rest 45 s");
        await expect(programNote(reloaded.nth(1))).toContainText(BACKOFF_NOTE);
      } finally {
        await context.close();
      }

      // Launch 3 (online again): the ops queued offline must apply cleanly —
      // no dead letters — and the frozen instructions must still render after
      // the session has round-tripped through the server.
      context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
      try {
        const page = await context.newPage();
        await page.goto("/today/workout");
        await waitForOutboxDrained(page);
        await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

        const cards = exerciseCards(page);
        await expect(subtitle(cards.nth(0))).toContainText("· Rest 2:30");
        await expect(programNote(cards.nth(0))).toContainText("Top set: pause 1 s on the chest.");

        await teardown(page, fixture);
        fixture = undefined;
      } finally {
        await context.close();
      }
    } finally {
      if (fixture) {
        // Launch 1/2 failed before teardown could run online — clean up in a
        // last online process rather than leaving the schedule overridden.
        const context = await chromium.launchPersistentContext(userDataDir, { baseURL: BASE_URL });
        try {
          const page = await context.newPage();
          await login(page).catch(() => undefined);
          await teardown(page, fixture);
        } finally {
          await context.close();
        }
      }
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
