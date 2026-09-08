import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  dimensionsOf,
  type MeasurementProfile,
  type LoadBasis,
} from "@/domain/measurement/profile";
import { formatSetLine } from "@/domain/measurement/format";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  createMeasurementExercise,
  createTemplateWithScheme,
  getActiveProgramInfo,
  applyScheduleOverride,
  restoreSchedule,
  addAdhocExerciseByName,
} from "./helpers";

// Athletic Measurement Profiles Release 2 —
// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.3/§15.4, A-21..A-24. Every prior implementation stage of this feature
// is already in the working tree (ExerciseCard/HistoryDetail render every
// profile through the shared `formatSetLine`/`dimensionsOf`, and
// `POST /api/exercises` + `POST /api/templates/:id/prescriptions` already
// accept the widened shapes) — this spec is the missing end-to-end coverage:
// create -> prescribe -> start -> log -> edit -> delete/renumber -> complete
// -> History, driven through the real browser UI, for all six profiles.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`. Runs
// at 390x844 by default (E2E acceptance criteria call for 390x844 AND
// 320x568 — the 320 check is applied where §15.3's row-width claim is most
// at risk: the sprint/plank profiles, A-22).

test.use({ viewport: { width: 390, height: 844 } });

// Same idiom as offline-set-edit-delete.spec.ts / transient-failure-fifo.spec.ts
// / warmupSetClassification.spec.ts: a set row is found by its own rendered
// text and walked up to its own <li>; "currently editing" is whichever leaf
// <li> shows a Save button (only one row is ever being edited at a time in
// this spec).
function setRow(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=ancestor::li[1]");
}

function editingRow(page: Page): Locator {
  return page
    .locator("li:not(:has(li))")
    .filter({ has: page.getByRole("button", { name: "Save" }) });
}

interface RoundInput {
  weightKg?: number;
  reps?: number;
  distanceM?: number;
  durationS?: number;
  rir?: number;
}

// Fills whichever of the entry-form's or an editing row's inputs the
// profile's own `dimensionsOf` says are not forbidden — mirrors
// ExerciseCard.tsx's own `dims.* !== "forbidden"` gating, so this spec can
// never fill (or expect) a field the card itself would not render.
async function fillRoundFields(
  target: Page | Locator,
  profile: MeasurementProfile,
  round: RoundInput,
): Promise<void> {
  const dims = dimensionsOf(profile);
  if (dims.weight !== "forbidden" && round.weightKg !== undefined) {
    await target.getByLabel("Weight in kilograms").fill(String(round.weightKg));
  }
  if (dims.reps !== "forbidden" && round.reps !== undefined) {
    await target.getByLabel("Repetitions").fill(String(round.reps));
  }
  if (dims.distance !== "forbidden" && round.distanceM !== undefined) {
    await target.getByLabel("Distance in metres").fill(String(round.distanceM));
  }
  if (dims.duration !== "forbidden" && round.durationS !== undefined) {
    await target.getByLabel("Time in seconds").fill(String(round.durationS));
  }
  if (dims.rir !== "forbidden" && round.rir !== undefined) {
    await target.getByLabel("Reps in reserve").fill(String(round.rir));
  }
}

async function logRound(page: Page, profile: MeasurementProfile, round: RoundInput): Promise<void> {
  await fillRoundFields(page, profile, round);
  await page.getByRole("button", { name: "Log" }).click();
}

// §15.4's shared formatter, applied the same way ExerciseCard/HistoryDetail
// do — the expected line is DERIVED, never hand-typed, so this spec can't
// silently drift from what §15.4 actually specifies.
function expectedLine(
  profile: MeasurementProfile,
  loadBasis: LoadBasis | null,
  round: RoundInput,
): string {
  return formatSetLine(profile, loadBasis, {
    weightKg: round.weightKg ?? null,
    reps: round.reps ?? null,
    rir: round.rir ?? null,
    distanceM: round.distanceM ?? null,
    durationS: round.durationS ?? null,
  });
}

interface ProfileFixture {
  profile: MeasurementProfile;
  displayName: string;
  equipment: string;
  loadBasis?: LoadBasis;
  scheme: unknown;
  // Exactly three rounds, in logging order. For `load_distance` the second
  // round deliberately omits `durationS` (A-21: "one WITHOUT a time value" —
  // `s` is the one optional field in the whole matrix, §6.2).
  rounds: [RoundInput, RoundInput, RoundInput];
  // Replacement values for round index 1 (the middle one) — exercised by
  // the "edit" step.
  editedRound: RoundInput;
}

const FIXTURES: ProfileFixture[] = [
  {
    profile: "load_reps",
    displayName: "E2E MP Load Reps",
    equipment: "barbell",
    scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
    rounds: [
      { weightKg: 100, reps: 5 },
      { weightKg: 102.5, reps: 5 },
      { weightKg: 105, reps: 5 },
    ],
    editedRound: { weightKg: 103, reps: 6 },
  },
  {
    profile: "reps",
    displayName: "E2E MP Reps Only",
    equipment: "bodyweight",
    scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 12 } },
    rounds: [{ reps: 10 }, { reps: 12 }, { reps: 15 }],
    editedRound: { reps: 14 },
  },
  {
    // A-21 — sled push, load_distance/total, prescribed "4 × 20 m".
    profile: "load_distance",
    displayName: "E2E MP Sled Push",
    equipment: "other",
    loadBasis: "total",
    scheme: { v: 1, scheme: { type: "distanceRounds", sets: 4, distanceM: 20 } },
    rounds: [
      { weightKg: 60, distanceM: 20, durationS: 12.4 },
      { weightKg: 60, distanceM: 20 }, // no time value
      { weightKg: 62.5, distanceM: 20, durationS: 13.1 },
    ],
    editedRound: { weightKg: 65, distanceM: 20, durationS: 12.8 },
  },
  {
    // A-22 — sprint, distance_time.
    profile: "distance_time",
    displayName: "E2E MP Sprint",
    equipment: "bodyweight",
    scheme: { v: 1, scheme: { type: "distanceRounds", sets: 3, distanceM: 40 } },
    rounds: [
      { distanceM: 40, durationS: 5.9 },
      { distanceM: 40, durationS: 5.62 },
      { distanceM: 40, durationS: 5.7 },
    ],
    editedRound: { distanceM: 40, durationS: 5.55 },
  },
  {
    // A-22 — plank, duration.
    profile: "duration",
    displayName: "E2E MP Plank",
    equipment: "bodyweight",
    scheme: { v: 1, scheme: { type: "durationRounds", sets: 3, durationS: 45 } },
    rounds: [{ durationS: 30 }, { durationS: 45 }, { durationS: 60 }],
    editedRound: { durationS: 50 },
  },
  {
    profile: "load_duration",
    displayName: "E2E MP Weighted Plank",
    equipment: "other",
    loadBasis: "total",
    scheme: { v: 1, scheme: { type: "durationRounds", sets: 3, durationS: 45 } },
    rounds: [
      { weightKg: 10, durationS: 30 },
      { weightKg: 10, durationS: 45 },
      { weightKg: 15, durationS: 45 },
    ],
    editedRound: { weightKg: 15, durationS: 50 },
  },
];

test.describe("Athletic Measurement Profiles Release 2 — full workout flow, all six profiles", () => {
  for (const fixture of FIXTURES) {
    test(`${fixture.profile}: create -> prescribe -> start -> log -> edit -> delete/renumber -> complete -> History`, async ({
      page,
    }) => {
      await login(page);
      await ensureNoActiveSession(page);

      const unique = `${fixture.displayName} ${Date.now()}`;
      const programInfo = await getActiveProgramInfo(page);
      const exercise = await createMeasurementExercise(page, {
        name: unique,
        equipment: fixture.equipment,
        measurementProfile: fixture.profile,
        loadBasis: fixture.loadBasis,
      });
      const templateId = await createTemplateWithScheme(
        page,
        programInfo.programId,
        exercise.id,
        `${unique} Template`,
        fixture.scheme,
      );

      try {
        await applyScheduleOverride(page, programInfo.blockId, templateId);

        await page.goto("/today");
        await ensureNoActiveSession(page);
        await page.getByRole("button", { name: "Start workout" }).click();
        await page.waitForURL(/\/today\/workout$/);
        await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();

        // §15.3 — RIR is rendered only where the profile allows it
        // (`load_reps`/`reps`, O-11); every distance/duration profile must
        // show no fourth-column RIR input at all (A-22).
        const dims = dimensionsOf(fixture.profile);
        const rirInput = page.getByLabel("Reps in reserve");
        if (dims.rir === "forbidden") {
          await expect(rirInput).toHaveCount(0);
        } else {
          await expect(rirInput).toBeVisible();
        }

        // A-22 — sprint and plank specifically: no horizontal overflow at
        // 390x844 or 320x568 (metrics.spec.ts's exact narrow-viewport
        // convention), confirming the RIR-less row never grows a fourth
        // column that would force a scrollbar.
        const checkNarrowViewport =
          fixture.profile === "distance_time" || fixture.profile === "duration";
        if (checkNarrowViewport) {
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(390);
          await page.setViewportSize({ width: 320, height: 568 });
          await page.reload();
          await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(320);
          await page.setViewportSize({ width: 390, height: 844 });
          await page.reload();
          await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();
        }

        // Log three rounds.
        const lines = fixture.rounds.map((round) =>
          expectedLine(fixture.profile, fixture.loadBasis ?? null, round),
        );
        for (let i = 0; i < fixture.rounds.length; i++) {
          await logRound(page, fixture.profile, fixture.rounds[i]!);
          await expect(page.getByText(lines[i]!, { exact: true })).toBeVisible();
        }
        await waitForOutboxDrained(page);

        // Edit the SECOND round.
        const editedLine = expectedLine(
          fixture.profile,
          fixture.loadBasis ?? null,
          fixture.editedRound,
        );
        await setRow(page, lines[1]!).getByRole("button", { name: "Edit" }).click();
        const editing = editingRow(page);
        await fillRoundFields(editing, fixture.profile, fixture.editedRound);

        // M-1 (docs/reviews/athletic-measurement-profiles-release-2-review.md
        // §5.3) — `load_distance`'s edit row is the widest in the whole
        // matrix (three `w-16` inputs — weight, distance, duration — plus
        // Save/Cancel), and the review found the shipped A-22 check missed
        // it entirely: it covered only `distance_time`/`duration`, and
        // only in read mode before any round existed. Assert it here,
        // genuinely in edit mode, with all three fields filled
        // (`editedRound` for this fixture).
        if (fixture.profile === "load_distance") {
          await page.setViewportSize({ width: 320, height: 568 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(320);
          await page.setViewportSize({ width: 390, height: 844 });
        }

        await editing.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText(editedLine, { exact: true })).toBeVisible();
        await expect(page.getByText(lines[1]!, { exact: true })).toHaveCount(0);
        await editing.waitFor({ state: "detached" });
        await waitForOutboxDrained(page);

        // Delete the FIRST round — forces a renumber of the two survivors.
        page.once("dialog", (d) => void d.accept());
        await setRow(page, lines[0]!).getByRole("button", { name: "Delete" }).click();
        await expect(page.getByText(lines[0]!, { exact: true })).toHaveCount(0);
        await expect(page.getByText(editedLine, { exact: true })).toBeVisible();
        await expect(page.getByText(lines[2]!, { exact: true })).toBeVisible();
        await waitForOutboxDrained(page);
        await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

        // Complete.
        page.once("dialog", (d) => void d.accept());
        await page.getByRole("button", { name: "Complete workout" }).click();
        await page.waitForURL(/\/today$/);
        await waitForOutboxDrained(page);

        // View it in History — exactly the two survivors, at their §15.4
        // lines, and nothing from the deleted/pre-edit rounds.
        const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
          sessions: { id: string }[];
        };
        await page.goto(`/history/${historyList.sessions[0]!.id}`);
        await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();
        await expect(page.getByText(editedLine, { exact: true })).toBeVisible();
        await expect(page.getByText(lines[2]!, { exact: true })).toBeVisible();
        await expect(page.getByText(lines[0]!, { exact: true })).toHaveCount(0);
        await expect(page.getByText(lines[1]!, { exact: true })).toHaveCount(0);

        // M-1 — same check as above, on HistoryDetail's structurally
        // identical `HistorySetRow` edit branch (§5.3 of the review flags
        // both files: "`HistoryDetail`'s edit row has the same element set
        // and should be measured too").
        if (fixture.profile === "load_distance") {
          await setRow(page, editedLine).getByRole("button", { name: "Edit" }).click();
          const historyEditing = editingRow(page);
          await page.setViewportSize({ width: 320, height: 568 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(320);
          await page.setViewportSize({ width: 390, height: 844 });
          await historyEditing.getByRole("button", { name: "Cancel" }).click();
          await historyEditing.waitFor({ state: "detached" });
        }
      } finally {
        // Discard an in-progress session left over from a failed assertion,
        // then restore the shared block's schedule and archive the
        // temporary template — same cleanup shape as
        // active-schedule-edit.spec.ts, so no later spec observes this
        // test's fixture.
        await page.goto("/today/workout").catch(() => undefined);
        const discardButton = page.getByRole("button", { name: "Discard workout" });
        if (await discardButton.isVisible().catch(() => false)) {
          page.once("dialog", (d) => void d.accept());
          await discardButton.click();
          await page.waitForURL(/\/today$/).catch(() => undefined);
        }
        await restoreSchedule(page, programInfo.blockId, programInfo.originalSchedulePayload);
        await page.request
          .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
          .catch(() => undefined);
      }
    });
  }
});

// H-1 regression (docs/reviews/athletic-measurement-profiles-release-2-review.md
// §5.1) — the server's ActiveSessionExerciseDto never carried the slot's
// frozen `measurement`, so a cross-device adopt / post-eviction resume of a
// non-`load_reps` session fell back to the client's pre-upgrade default
// (`load_reps`/`unspecified`): a plank rendered "null kg × null", the card
// showed the wrong (weight/reps) inputs, and any set logged there
// dead-lettered `invalid_measurement`.
//
// Follows today.spec.ts's own "a second browser session can resume into an
// in-progress workout" (line 43) pattern — two real browser contexts of the
// same account standing in for two devices (ADR-004: single-account, not
// single-session) — driven against the `duration` fixture already defined
// above (FIXTURES), so this can't drift from what the six-profile matrix
// itself asserts a `duration` round looks like.
test.describe("H-1 regression — cross-device resume preserves a non-load_reps frozen profile", () => {
  test("device B resuming a duration-profile session renders the frozen profile's own input and previous round, never null kg × null or a kg/reps pair", async ({
    browser,
  }) => {
    const fixture = FIXTURES.find((f) => f.profile === "duration");
    if (!fixture) throw new Error("expected a duration fixture in FIXTURES");

    const deviceA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const deviceB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    let programInfo: Awaited<ReturnType<typeof getActiveProgramInfo>> | undefined;
    let templateId: string | undefined;

    try {
      await login(pageA);
      await ensureNoActiveSession(pageA);

      const unique = `${fixture.displayName} H1 ${Date.now()}`;
      programInfo = await getActiveProgramInfo(pageA);
      const exercise = await createMeasurementExercise(pageA, {
        name: unique,
        equipment: fixture.equipment,
        measurementProfile: fixture.profile,
        loadBasis: fixture.loadBasis,
      });
      templateId = await createTemplateWithScheme(
        pageA,
        programInfo.programId,
        exercise.id,
        `${unique} Template`,
        fixture.scheme,
      );
      await applyScheduleOverride(pageA, programInfo.blockId, templateId);

      // Device A starts the workout and logs a `duration` round — the third
      // fixture round (60 s) so the resumed line also proves the O-8 `m:ss`
      // formatting survives adopt, not just the plain-seconds figure.
      await pageA.goto("/today");
      await ensureNoActiveSession(pageA);
      await pageA.getByRole("button", { name: "Start workout" }).click();
      await pageA.waitForURL(/\/today\/workout$/);
      await expect(pageA.getByText(exercise.name, { exact: true })).toBeVisible();

      const round = fixture.rounds[2]!;
      const line = expectedLine(fixture.profile, fixture.loadBasis ?? null, round);
      await logRound(pageA, fixture.profile, round);
      await expect(pageA.getByText(line, { exact: true })).toBeVisible();
      // Device B must resume against what the server has, not a client-side
      // guess — wait for A's set to actually reach it first.
      await waitForOutboxDrained(pageA);

      // Device B — never held this session locally — resumes into it.
      await login(pageB);
      await expect(pageB.getByText(/A workout is already in progress/)).toBeVisible();
      await pageB.getByRole("button", { name: "Resume here" }).click();
      await pageB.waitForURL(/\/today\/workout$/);

      // The regression itself: the frozen `duration` profile must render its
      // own "Time in seconds" input and the exact previous-round line —
      // never the `load_reps` default's weight/reps pair, and never a
      // "null" anywhere (the literal defect signature: "null kg × null").
      await expect(pageB.getByText(exercise.name, { exact: true })).toBeVisible();
      await expect(pageB.getByLabel("Time in seconds")).toBeVisible();
      await expect(pageB.getByLabel("Weight in kilograms")).toHaveCount(0);
      await expect(pageB.getByLabel("Repetitions")).toHaveCount(0);
      await expect(pageB.getByText(line, { exact: true })).toBeVisible();
      await expect(pageB.getByText("null kg × null")).toHaveCount(0);
      await expect(pageB.getByText(/null/)).toHaveCount(0);

      // Logging a further round from device B must not dead-letter
      // `invalid_measurement` (the exact downstream symptom H-1 also names).
      await logRound(pageB, fixture.profile, fixture.rounds[0]!);
      await waitForOutboxDrained(pageB);
      await expect(pageB.getByText(/The server rejected this workout's changes/)).toHaveCount(0);

      // Clean up via device B (it now holds the same session locally too).
      pageB.once("dialog", (d) => void d.accept());
      await pageB.getByRole("button", { name: "Discard workout" }).click();
      await pageB.waitForURL(/\/today$/);
    } finally {
      // Same shape as the FIXTURES loop's own cleanup: discard any
      // leftover in-progress session (via device A, whose cookies are the
      // same account), then restore the shared block's schedule and archive
      // the temporary template.
      await pageA.goto("/today/workout").catch(() => undefined);
      const discardButton = pageA.getByRole("button", { name: "Discard workout" });
      if (await discardButton.isVisible().catch(() => false)) {
        pageA.once("dialog", (d) => void d.accept());
        await discardButton.click();
        await pageA.waitForURL(/\/today$/).catch(() => undefined);
      }
      if (programInfo) {
        await restoreSchedule(pageA, programInfo.blockId, programInfo.originalSchedulePayload);
      }
      if (templateId) {
        await pageA.request
          .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
          .catch(() => undefined);
      }
      await deviceA.close();
      await deviceB.close();
    }
  });
});

// H-2 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md)
// — "addAdhocExercise hardcodes {profile: 'load_reps', loadBasis:
// 'unspecified'} regardless of what the athlete picked, so ad-hoc adding any
// of the five new profiles is rejected measurement_profile_mismatch and the
// slot is unusable." Unlike the FIXTURES loop above (which prescribes every
// exercise onto a template beforehand, via createTemplateWithScheme), this
// spec adds the exercise the same way the athlete actually hits the bug:
// "+ Add exercise" mid-workout, never prescribed anywhere. Runs the
// `duration` fixture (a plank) — same profile the H-1 regression block above
// already uses, so this can't drift from what a `duration` round is
// expected to look like.
test.describe("H-2 regression — ad-hoc-adding a non-load_reps exercise mid-workout", () => {
  test("ad-hoc-adding a duration-profile exercise, logging a round, drains the outbox with zero dead letters", async ({
    page,
  }) => {
    const fixture = FIXTURES.find((f) => f.profile === "duration");
    if (!fixture) throw new Error("expected a duration fixture in FIXTURES");

    await login(page);
    await ensureNoActiveSession(page);

    const unique = `${fixture.displayName} AdHoc ${Date.now()}`;
    const exercise = await createMeasurementExercise(page, {
      name: unique,
      equipment: fixture.equipment,
      measurementProfile: fixture.profile,
      loadBasis: fixture.loadBasis,
    });

    try {
      await page.goto("/today");
      await ensureNoActiveSession(page);
      await page.getByRole("button", { name: "Start workout" }).click();
      await page.waitForURL(/\/today\/workout$/);

      // Today's own scheduled workout (whatever the persistent e2e account
      // has today) can already carry its own load_reps exercise on screen —
      // this test only cares about the ad-hoc slot it adds, so every check
      // below is scoped to THIS exercise's own card (same `<li>`-ancestor
      // idiom as this file's own `setRow`/`editingRow`, and
      // warmupSetClassification.spec.ts's card-scoped `logSet`), never a
      // bare page-wide locator that a second, unrelated card could also
      // match.
      await addAdhocExerciseByName(page, exercise.name);
      const card = setRow(page, exercise.name);
      await expect(card).toBeVisible();

      // The regression's own signature (same shape as the H-1 block above):
      // before the fix, this slot was silently frozen load_reps/unspecified,
      // so the card would have rendered a weight/reps pair instead of the
      // `duration` profile's own "Time in seconds" input.
      await expect(card.getByLabel("Time in seconds")).toBeVisible();
      await expect(card.getByLabel("Weight in kilograms")).toHaveCount(0);
      await expect(card.getByLabel("Repetitions")).toHaveCount(0);

      const round = fixture.rounds[0]!;
      await fillRoundFields(card, fixture.profile, round);
      await card.getByRole("button", { name: "Log" }).click();
      const line = expectedLine(fixture.profile, fixture.loadBasis ?? null, round);
      await expect(card.getByText(line, { exact: true })).toBeVisible();

      // The binding assertion: the outbox drains with ZERO dead letters.
      // Before the fix, the sessionExercise op this slot enqueued carried
      // the wrong (load_reps/unspecified) profile, so the server rejected it
      // measurement_profile_mismatch — a dead letter, not merely a pending
      // retry — which is exactly what made the slot "unusable".
      await waitForOutboxDrained(page);
      await expect(page.getByText(/The server rejected this workout's changes/)).toHaveCount(0);
    } finally {
      await page.goto("/today/workout").catch(() => undefined);
      const discardButton = page.getByRole("button", { name: "Discard workout" });
      if (await discardButton.isVisible().catch(() => false)) {
        page.once("dialog", (d) => void d.accept());
        await discardButton.click();
        await page.waitForURL(/\/today$/).catch(() => undefined);
      }
    }
  });
});
