import { test, expect, type Page } from "@playwright/test";
import { login, ensureNoActiveSession } from "./helpers";

// phase-5.5-light-remediation-2 — resolves the seeded e2e template's id via
// the API (same authenticated session as `page`) rather than clicking
// through Programs → Templates, since the test below only cares about the
// prescription form itself, not that navigation chain.
async function findE2eTemplateId(page: Page): Promise<string> {
  const programsRes = await page.request.get("/api/programs");
  const { programs } = (await programsRes.json()) as { programs: { id: string; name: string }[] };
  const program = programs.find((p) => p.name === "E2E Phase 3 Program");
  if (!program) throw new Error("E2E program not found — has tests/e2e/seed.ts been run?");
  const templatesRes = await page.request.get(`/api/programs/${program.id}/templates`);
  const { templates } = (await templatesRes.json()) as {
    templates: { id: string; name: string }[];
  };
  const template = templates.find((t) => t.name === "E2E Phase 3 Day");
  if (!template) throw new Error("E2E template not found — has tests/e2e/seed.ts been run?");
  return template.id;
}

// Phase 5.5 Light — regression coverage for the confirmed decimal-input
// defect: native `<input type="number">` silently collapses `.value` to ""
// when the typed text isn't a period-decimal float, which a comma decimal
// separator (the default on non-US iPhone locales, e.g. German) triggers.
// The affected fields are now `type="text" inputMode="decimal"` with
// app-level comma normalization (`src/ui/decimalInput.ts`) instead of
// relying on the browser's locale-fragile number parsing. Phone-sized
// viewport per the task's requirement for real browser coverage of this
// defect, not just a unit test of the parsing helper.
//
// Precondition: tests/e2e/seed.ts has been run (same as the Phase 3 specs)
// — needed for the second test's active block/template/prescription.

test.describe("decimal input on a phone-sized viewport (Phase 5.5 Light)", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone-sized

  test("a comma-typed loadStepKg on exercise create is captured, not silently reset to the equipment default", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/exercises/new");

    const name = `E2E Decimal Exercise ${Date.now()}`;
    await page.getByLabel("Name").fill(name);
    // Equipment stays at its "barbell" default (equipment-default
    // loadStepKg 2.5) — 2.5 must NOT be what ends up stored once 1,25 is
    // typed below; that would mean the comma silently collapsed the field.
    await page.getByLabel("Load step (kg)").fill("1,25");

    // ContributionEditor's per-row <select>s have no individual <label>;
    // Equipment/Mechanics/Laterality are the first three labeled <select>s
    // in DOM order, so the 4th is the first contribution row's muscle
    // picker. Leaving role at its "Primary" default satisfies the
    // at-least-one-primary-contribution invariant.
    await page.locator("select").nth(3).selectOption("chest");

    await page.getByRole("button", { name: "Create exercise" }).click();
    await page.waitForURL(/\/exercises$/);

    await page.getByRole("link", { name }).click();
    await page.waitForURL(/\/exercises\/[^/]+$/);
    await expect(page.getByLabel("Load step (kg)")).toHaveValue("1.25");

    // Clean up so reruns against the same dev DB don't accumulate exercises.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/exercises$/);
  });

  test("a comma-typed set weight during a workout logs the typed value, not 0", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    // The field may arrive pre-filled from a pending recommendation's
    // target (carry-forward prefill) — fill() replaces the whole value
    // rather than appending, unlike pressSequentially().
    await page.getByLabel("kg").fill("82,5");
    await page.getByLabel("reps").fill("5");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(page.getByText("82.5 kg × 5")).toBeVisible();

    // Clean up so later specs (and reruns against the same dev DB) start fresh.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Discard workout" }).click();
    await page.waitForURL(/\/today$/);
  });

  // M-1(new) (phase-5.5-light-remediation-verification.md) — a 3-decimal
  // contribution weight used to pass every guard and get silently rounded
  // by PostgreSQL (numeric(3,2)). This proves the fix end to end: the
  // invalid value is rejected before any network request, and a
  // valid-precision value round-trips through the real form and real
  // Postgres unrounded.
  test("a 3-decimal contribution weight is rejected before submit; 0.55 persists exactly", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/exercises/new");

    const name = `E2E Contribution Weight Exercise ${Date.now()}`;
    await page.getByLabel("Name").fill(name);
    // Same DOM-order reasoning as the loadStepKg test above: the 4th
    // labelless <select> is the first contribution row's muscle picker.
    await page.locator("select").nth(3).selectOption("chest");
    // That row defaults to role "primary" (placeholder "1.0"), and it is
    // the only weight input with that placeholder on the page.
    const weightInput = page.getByPlaceholder("1.0");

    await weightInput.fill("0,555");
    await page.getByRole("button", { name: "Create exercise" }).click();
    // Rejected client-side: no navigation, no POST — the visible error is
    // the only effect. Scoped to the form's own `<p role="alert">` — Next's
    // route announcer also carries `role="alert"` and would otherwise make
    // `getByRole("alert")` ambiguous.
    await expect(page.locator('p[role="alert"]')).toHaveText(
      "Enter valid muscle contribution weights, or leave them blank.",
    );
    expect(new URL(page.url()).pathname).toBe("/exercises/new");

    await weightInput.fill("0,55");
    await page.getByRole("button", { name: "Create exercise" }).click();
    await page.waitForURL(/\/exercises$/);

    await page.getByRole("link", { name }).click();
    await page.waitForURL(/\/exercises\/[^/]+$/);
    // Reopen and read back exactly what PostgreSQL holds — not 0.56.
    await expect(page.getByPlaceholder("1.0")).toHaveValue("0.55");

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/exercises$/);
  });

  // LOW-2 (phase-5.5-light-remediation-verification.md) — the previous
  // 0.25-grid refine had a float-noise hole that let e.g. 1,005 through; it
  // was then silently rounded by PostgreSQL (numeric(6,2)).
  test("a 3-decimal baselineLoadKg is rejected before submit; 82.5 persists exactly", async ({
    page,
  }) => {
    await login(page);
    const templateId = await findE2eTemplateId(page);
    await page.goto(`/templates/${templateId}/prescriptions/new`);

    await page.getByLabel("Exercise").selectOption({ index: 1 });
    await page.getByLabel("Baseline load (kg, optional)").fill("1,005");
    await page.getByRole("button", { name: "Add exercise" }).click();
    // Scoped to the form's own `<p role="alert">` — see the contribution-
    // weight test above for why `getByRole("alert")` alone is ambiguous.
    await expect(page.locator('p[role="alert"]')).toContainText("at most 2 decimal places");
    expect(new URL(page.url()).pathname).toBe(`/templates/${templateId}/prescriptions/new`);

    await page.getByLabel("Baseline load (kg, optional)").fill("82,5");
    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForURL(`**/templates/${templateId}`);

    const prescriptionsRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
    const { prescriptions } = (await prescriptionsRes.json()) as {
      prescriptions: { id: string; baselineLoadKg: number | null }[];
    };
    const created = prescriptions.find((p) => p.baselineLoadKg === 82.5);
    expect(created).toBeTruthy();

    // Clean up so reruns against the same dev DB don't accumulate prescriptions.
    if (created) {
      await page.request.delete(`/api/prescriptions/${created.id}`);
    }
  });
});
