import { test, expect, type Page } from "@playwright/test";
import { login, createMeasurementExercise, getActiveProgramInfo } from "./helpers";

// M-3 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md)
// — the companion to exerciseFormMeasurementProfile.spec.ts. Drives the real
// `/templates/:id/prescriptions/new` route and `PrescriptionForm.tsx`
// component (never the API directly) to reproduce, as automated assertions,
// what the independent review verified by hand for A-11b's client-side
// scheme/strategy/field gating:
//
//   - a `distance_time` exercise offers only `distanceRounds`/`manual`,
//     shows "Distance per round (m)", and hides both the RIR band and
//     Baseline load;
//   - a `reps` exercise offers `fixed`/`repRange` + `manual`, shows the RIR
//     band, and hides Baseline load.

// A template with no prescription yet — just enough scaffolding for the
// create-prescription route to render against, distinct from
// helpers.ts's `createTemplateWithScheme` (which immediately adds one).
async function createEmptyTemplate(page: Page, programId: string, name: string): Promise<string> {
  const res = await page.request.post(`/api/programs/${programId}/templates`, {
    data: { name },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const { template } = (await res.json()) as { template: { id: string } };
  return template.id;
}

async function optionValues(page: Page, label: string): Promise<string[]> {
  return page
    .getByLabel(label)
    .locator("option")
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
}

test.describe("PrescriptionForm — profile-gated scheme/strategy options and field visibility (create mode)", () => {
  test("a distance_time exercise offers only distanceRounds/manual, shows Distance per round, and hides the RIR band and Baseline load", async ({
    page,
  }) => {
    await login(page);
    const programInfo = await getActiveProgramInfo(page);
    const unique = `E2E MP Sprint Form ${Date.now()}`;
    const exercise = await createMeasurementExercise(page, {
      name: unique,
      equipment: "bodyweight",
      measurementProfile: "distance_time",
    });
    const templateId = await createEmptyTemplate(page, programInfo.programId, `${unique} Template`);

    try {
      await page.goto(`/templates/${templateId}/prescriptions/new`);
      await page.getByLabel("Exercise").selectOption({ label: exercise.name });

      expect(await optionValues(page, "Scheme")).toEqual(["distanceRounds"]);
      expect(await optionValues(page, "Progression strategy")).toEqual(["manual"]);

      await expect(page.getByLabel("Distance per round (m)")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Set target RIR band" })).toHaveCount(0);
      await expect(page.getByLabel("Baseline load (kg, optional)")).toHaveCount(0);
    } finally {
      await page.request
        .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
        .catch(() => undefined);
    }
  });

  test("a reps exercise offers fixed/repRange + manual, shows the RIR band, and hides Baseline load", async ({
    page,
  }) => {
    await login(page);
    const programInfo = await getActiveProgramInfo(page);
    const unique = `E2E MP Reps Form ${Date.now()}`;
    const exercise = await createMeasurementExercise(page, {
      name: unique,
      equipment: "bodyweight",
      measurementProfile: "reps",
    });
    const templateId = await createEmptyTemplate(page, programInfo.programId, `${unique} Template`);

    try {
      await page.goto(`/templates/${templateId}/prescriptions/new`);
      await page.getByLabel("Exercise").selectOption({ label: exercise.name });

      expect(await optionValues(page, "Scheme")).toEqual(["fixed", "repRange"]);
      expect(await optionValues(page, "Progression strategy")).toEqual(["manual"]);

      await expect(page.getByRole("checkbox", { name: "Set target RIR band" })).toBeVisible();
      await expect(page.getByLabel("Baseline load (kg, optional)")).toHaveCount(0);
    } finally {
      await page.request
        .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
        .catch(() => undefined);
    }
  });
});
