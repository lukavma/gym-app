import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  login,
  createMeasurementExercise,
  createTemplateWithScheme,
  getActiveProgramInfo,
} from "./helpers";

// M-3 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md)
// — tests/e2e/measurementProfiles.spec.ts creates every fixture exercise
// through `page.request.post("/api/exercises")` and never opens
// `ExerciseForm.tsx` in a real browser. This spec is the missing coverage:
// it navigates to the actual `/exercises/new` and `/exercises/:id` routes and
// drives the real form, reproducing — as automated assertions — exactly what
// the independent review verified by hand:
//
//   - the Measurement-profile select's option set/order and its create-mode
//     enabled state;
//   - the create-mode Load-basis select's option set and its
//     appear/disappear behaviour across profiles;
//   - the reactive `409 measurement_profile_locked` revert/disable/copy
//     behaviour on a referenced exercise;
//   - the `duration` profile's static "not available" lines replacing the
//     Strength-estimate/Volume-counting selects entirely.
//
// The Measurement-profile and Load-basis selects are located by their
// wrapping `<label>`'s text rather than by position — ExerciseForm.tsx keeps
// them (deliberately, per its own comment and L-7 of the review) trailing
// after `ContributionEditor`, specifically so tests/e2e/muscleTaxonomyV2.spec.ts's
// positional `page.locator("select").nth(3)`/`.nth(5)` contribution-row
// indices never have to change. Locating by label keeps this spec immune to
// that same positional contract instead of relying on it.
function measurementProfileSelect(page: Page): Locator {
  return page.locator("label", { hasText: "Measurement profile" }).locator("select");
}

function loadBasisLabel(page: Page): Locator {
  return page.locator("label", { hasText: "Load basis" });
}

function loadBasisSelect(page: Page): Locator {
  return loadBasisLabel(page).locator("select");
}

async function optionValues(select: Locator): Promise<string[]> {
  return select
    .locator("option")
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
}

test.describe("ExerciseForm — Measurement profile / Load basis (create mode)", () => {
  test("the Measurement-profile select offers exactly the six profiles, in order, and is enabled", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/exercises/new");

    const select = measurementProfileSelect(page);
    await expect(select).toBeEnabled();
    expect(await optionValues(select)).toEqual([
      "load_reps",
      "reps",
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ]);
  });

  test("create-mode Load basis offers exactly total/per_hand/assistance, and disappears for duration, reappearing for load_duration", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/exercises/new");

    // Default profile is `load_reps` — load-bearing, so Load basis starts
    // visible with the three choosable bases (never `unspecified` — that
    // value is withheld on create, per the form's own comment).
    expect(await optionValues(loadBasisSelect(page))).toEqual(["total", "per_hand", "assistance"]);

    await measurementProfileSelect(page).selectOption("duration");
    await expect(loadBasisLabel(page)).toHaveCount(0);

    await measurementProfileSelect(page).selectOption("load_duration");
    await expect(loadBasisLabel(page)).toBeVisible();
    expect(await optionValues(loadBasisSelect(page))).toEqual(["total", "per_hand", "assistance"]);
  });
});

test.describe("ExerciseForm — 409 measurement_profile_locked reactive handling (edit mode)", () => {
  test("changing the profile of a referenced exercise reverts the select, disables it, and shows the exact locked copy inline and as the error", async ({
    page,
  }) => {
    await login(page);
    const programInfo = await getActiveProgramInfo(page);
    const unique = `E2E MP Lock ${Date.now()}`;
    const exercise = await createMeasurementExercise(page, {
      name: unique,
      equipment: "barbell",
      measurementProfile: "load_reps",
    });
    // Referenced by an `exercise_prescriptions` row only is already enough to
    // lock the profile (athletic-measurement-profiles-release-1-review.md
    // §10.3) — no need to ever start/log a workout for this test.
    const templateId = await createTemplateWithScheme(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
    );

    try {
      await page.goto(`/exercises/${exercise.id}`);
      const select = measurementProfileSelect(page);
      await expect(select).toHaveValue("load_reps");

      await select.selectOption("reps");
      await page.getByRole("button", { name: "Save changes" }).click();

      // The exact accepted copy — MEASUREMENT_PROFILE_LOCKED_COPY in
      // ExerciseForm.tsx — rendered twice: once as the select's own inline
      // helper text (replacing the ordinary hint once locked), once as the
      // form's `role="alert"` error.
      const lockedCopy =
        "Used in history or a template — create a new exercise to change how it is measured.";
      await expect(page.getByText(lockedCopy, { exact: true })).toHaveCount(2);
      // Scoped by text, not a bare `getByRole("alert")` — Next.js's own
      // route announcer (`#__next-route-announcer__`) also carries
      // `role="alert"` and would otherwise make this locator ambiguous.
      await expect(page.getByRole("alert").filter({ hasText: lockedCopy })).toHaveText(lockedCopy);

      await expect(select).toHaveValue("load_reps");
      await expect(select).toBeDisabled();
    } finally {
      await page.request
        .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
        .catch(() => undefined);
    }
  });
});

test.describe("ExerciseForm — structurally-ineligible profiles render static lines, never a select (edit mode)", () => {
  test("a duration exercise shows the exact unavailable copy for both Strength estimate and Volume counting, with no select for either", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E MP Duration Static ${Date.now()}`;
    const exercise = await createMeasurementExercise(page, {
      name: unique,
      equipment: "bodyweight",
      measurementProfile: "duration",
    });

    await page.goto(`/exercises/${exercise.id}`);

    await expect(page.locator('select[aria-label="Strength estimate"]')).toHaveCount(0);
    await expect(page.locator('select[aria-label="Volume counting"]')).toHaveCount(0);

    const unavailableCopy = "Not available for this measurement profile.";
    // Scoped to each field's own <span> label via a following-sibling
    // lookup, rather than a bare page-wide count, so this can't be fooled by
    // the unrelated "View strength estimate" link also present on this page
    // (a <span>-tag restriction already rules that <a> out, but the
    // following-sibling walk additionally proves each line sits under its
    // own field, not just anywhere on the page).
    const strengthEstimateLine = page
      .locator("span", { hasText: "Strength estimate" })
      .locator("xpath=following-sibling::p[1]");
    const volumeCountingLine = page
      .locator("span", { hasText: "Volume counting" })
      .locator("xpath=following-sibling::p[1]");
    await expect(strengthEstimateLine).toHaveText(unavailableCopy);
    await expect(volumeCountingLine).toHaveText(unavailableCopy);
    await expect(page.getByText(unavailableCopy, { exact: true })).toHaveCount(2);
  });
});
