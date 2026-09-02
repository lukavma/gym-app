import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

// Warm-up Routines v1 — management UI and curated template associations
// (owner decisions O-1/O-2/O-4/O-5/O-6).
//
// Precondition, same as every other spec here: tests/e2e/seed.ts has been run
// against the target Postgres, so the e2e account has an active block whose
// single rotation-mode schedule entry resolves to the seeded template on any
// calendar day. Local-only (needs a real Postgres), never run in CI.
//
// Everything this spec creates is find-or-create and is cleaned up at the
// end, so it is idempotent against the shared dev database — the same
// discipline tests/e2e/seed.ts and deleteAllRecoveryEntries follow.

const UPPER_STANDARD = "E2E Upper Standard";
const SHOULDER_PREP = "E2E Shoulder Prep";
const HIP_PREP = "E2E Hip Prep";
const UPPER_A = "E2E Warmup Upper A";
const UPPER_B = "E2E Warmup Upper B";

interface RoutineDto {
  id: string;
  name: string;
  items: { label: string; instruction: string | null }[];
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

interface TemplateDto {
  id: string;
  name: string;
}

// Reuses an existing template of the same name if a previous run left one
// behind (there is no template DELETE endpoint — templates are archived, not
// deleted — so create-or-reuse is what keeps this spec re-runnable).
async function findOrCreateTemplate(page: Page, name: string): Promise<TemplateDto> {
  const programsRes = await page.request.get("/api/programs");
  const { programs } = (await programsRes.json()) as { programs: { id: string; status: string }[] };
  const program = programs.find((p) => p.status === "active") ?? programs[0];
  if (!program) throw new Error("expected the e2e seed to have created a program");

  const listRes = await page.request.get(`/api/programs/${program.id}/templates`);
  const { templates } = (await listRes.json()) as { templates: TemplateDto[] };
  const existing = templates.find((t) => t.name === name);
  if (existing) return existing;

  const created = await page.request.post(`/api/programs/${program.id}/templates`, {
    data: { name },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { template: TemplateDto }).template;
}

async function clearTemplateWarmupLinks(page: Page, templateId: string): Promise<void> {
  await page.request.put(`/api/templates/${templateId}/warmup-routines`, {
    data: { routineIds: [], defaultRoutineId: null },
  });
}

// The template the e2e seed actually schedules — the one Today resolves to.
async function scheduledTemplateId(page: Page): Promise<string> {
  const res = await page.request.get("/api/today-bundle");
  const bundle = (await res.json()) as { today: { kind: string; templateId?: string } };
  if (bundle.today.kind !== "scheduled" || !bundle.today.templateId) {
    throw new Error(`expected a scheduled today, got ${bundle.today.kind}`);
  }
  return bundle.today.templateId;
}

test.describe("warm-up routines: management under Programs", () => {
  test.afterEach(async ({ page }) => {
    await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP, HIP_PREP]);
  });

  test("creating and editing a five-item routine through the mobile UI", async ({ page }) => {
    // iPhone-class viewport: the whole flow has to fit and stay tappable.
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD]);

    // O-4 — reachable from Programs, and NOT from the top nav.
    await page.goto("/programs");
    await expect(page.getByRole("heading", { name: "Warm-up routines" })).toBeVisible();
    await expect(page.locator("nav").getByRole("link", { name: /warm-?up/i })).toHaveCount(0);

    await page
      .getByRole("heading", { name: "Warm-up routines" })
      .locator("xpath=../..")
      .getByRole("link", { name: "+ New" })
      .click();
    await page.waitForURL(/\/warmup-routines\/new$/);

    await page.getByLabel("Name").fill(UPPER_STANDARD);

    const items = [
      ["Bike", "5 min easy"],
      ["Band external rotation", "2x15 light"],
      ["Horizontal rotation", "10 controlled reps"],
      ["Scap pull-ups", "2x8"],
      ["Cat-cow", ""],
    ] as const;

    for (const [index, [label, instruction]] of items.entries()) {
      if (index > 0) await page.getByRole("button", { name: "+ Add item" }).click();
      await page.getByLabel(`Item ${index + 1} label`).fill(label);
      if (instruction !== "") {
        await page.getByLabel(`Item ${index + 1} instruction`).fill(instruction);
      }
    }

    await page.getByRole("button", { name: "Create routine" }).click();
    await page.waitForURL(/\/warmup-routines\/[0-9a-f-]{36}$/);

    // Reloaded from the server, in the saved order.
    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue(UPPER_STANDARD);
    for (const [index, [label]] of items.entries()) {
      await expect(page.getByLabel(`Item ${index + 1} label`)).toHaveValue(label);
    }
    // The optional instruction really is optional.
    await expect(page.getByLabel("Item 5 instruction")).toHaveValue("");

    // Edit: reorder, change a label, and remove one — all one save.
    await page.getByRole("button", { name: "Move item 1 down" }).click();
    await expect(page.getByLabel("Item 1 label")).toHaveValue("Band external rotation");
    await expect(page.getByLabel("Item 2 label")).toHaveValue("Bike");
    await page.getByLabel("Item 4 label").fill("Scapular pull-ups");
    await page.getByRole("button", { name: "Remove item 5" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

    await page.reload();
    await expect(page.getByLabel("Item 1 label")).toHaveValue("Band external rotation");
    await expect(page.getByLabel("Item 2 label")).toHaveValue("Bike");
    await expect(page.getByLabel("Item 4 label")).toHaveValue("Scapular pull-ups");
    await expect(page.getByLabel("Item 5 label")).toHaveCount(0);

    // No horizontal overflow at iPhone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("a duplicate name is a friendly conflict, not a crash", async ({ page }) => {
    await login(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD]);
    await createRoutine(page, UPPER_STANDARD, [{ label: "Bike" }]);

    await page.goto("/warmup-routines/new");
    await page.getByLabel("Name").fill(UPPER_STANDARD.toLowerCase());
    await page.getByLabel("Item 1 label").fill("Rower");
    await page.getByRole("button", { name: "Create routine" }).click();

    await expect(page.locator("p[role='alert']")).toHaveText(
      /already have a warm-up routine with this name/i,
    );
    expect(new URL(page.url()).pathname).toBe("/warmup-routines/new");
  });

  test("validation: a routine needs a name and at least one item", async ({ page }) => {
    await login(page);
    await page.goto("/warmup-routines/new");

    await page.getByLabel("Name").fill("E2E Empty");
    await page.getByRole("button", { name: "Create routine" }).click();
    await expect(page.locator("p[role='alert']")).toHaveText(/at least one item/i);
    expect(new URL(page.url()).pathname).toBe("/warmup-routines/new");
  });

  test("deleting a routine is confirmed and hard-deletes it", async ({ page }) => {
    await login(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD]);
    const routine = await createRoutine(page, UPPER_STANDARD, [{ label: "Bike" }]);

    await page.goto(`/warmup-routines/${routine.id}`);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete routine" }).click();
    await page.waitForURL(/\/programs$/);

    const res = await page.request.get(`/api/warmup-routines/${routine.id}`);
    expect(res.status()).toBe(404);
  });

  test("a malformed routine id answers 404, never a 500", async ({ page }) => {
    await login(page);
    for (const path of ["/api/warmup-routines/not-a-uuid", "/api/warmup-routines/123"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(404);
    }
    const put = await page.request.put("/api/warmup-routines/not-a-uuid", {
      data: { name: "x", items: [{ label: "a" }] },
    });
    expect(put.status()).toBe(404);
    const del = await page.request.delete("/api/warmup-routines/not-a-uuid");
    expect(del.status()).toBe(404);
    const links = await page.request.get("/api/templates/not-a-uuid/warmup-routines");
    expect(links.status()).toBe(404);
  });
});

test.describe("warm-up routines: curated template associations (O-1/O-2)", () => {
  test.afterEach(async ({ page }) => {
    const scheduled = await scheduledTemplateId(page).catch(() => null);
    if (scheduled) await clearTemplateWarmupLinks(page, scheduled);
    for (const name of [UPPER_A, UPPER_B]) {
      const template = await findOrCreateTemplate(page, name).catch(() => null);
      if (template) await clearTemplateWarmupLinks(page, template.id);
    }
    await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP, HIP_PREP]);
  });

  test("linking several routines to Upper A and Upper B keeps each template's choices separate", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP, HIP_PREP]);

    await createRoutine(page, UPPER_STANDARD, [
      { label: "Bike", instruction: "5 min easy" },
      { label: "Band external rotation", instruction: "2x15 light" },
    ]);
    await createRoutine(page, SHOULDER_PREP, [
      { label: "Horizontal rotation", instruction: "10 controlled reps" },
    ]);
    await createRoutine(page, HIP_PREP, [{ label: "90/90" }]);

    const upperA = await findOrCreateTemplate(page, UPPER_A);
    const upperB = await findOrCreateTemplate(page, UPPER_B);
    await clearTemplateWarmupLinks(page, upperA.id);
    await clearTemplateWarmupLinks(page, upperB.id);

    // --- Upper A: two routines, the second marked default.
    await page.goto(`/templates/${upperA.id}`);
    const section = page.locator("section", {
      has: page.getByText("Only the routines linked here"),
    });
    await expect(section.getByText("No warm-up routines linked to this template.")).toBeVisible();

    await section.getByLabel("Link a warm-up routine").selectOption({ label: UPPER_STANDARD });
    await section.getByLabel("Link a warm-up routine").selectOption({ label: SHOULDER_PREP });
    await section.getByLabel(`Make ${SHOULDER_PREP} the default`).check();
    await section.getByRole("button", { name: "Save warm-up routines" }).click();
    await expect(section.getByText("Warm-up routines saved.")).toBeVisible();

    // Scoped to the LINKED list, not the whole section: the "Link a routine"
    // select below it legitimately still lists every unlinked routine, so a
    // section-wide text assertion would be testing the wrong thing.
    const linkedList = section.getByRole("list", { name: "Linked warm-up routines" });

    await page.reload();
    await expect(linkedList.getByText(UPPER_STANDARD)).toBeVisible();
    await expect(linkedList.getByText(SHOULDER_PREP)).toBeVisible();
    await expect(linkedList.getByText(HIP_PREP)).toHaveCount(0);
    await expect(section.getByLabel(`Make ${SHOULDER_PREP} the default`)).toBeChecked();

    // --- Upper B: a different single routine.
    await page.goto(`/templates/${upperB.id}`);
    await section.getByLabel("Link a warm-up routine").selectOption({ label: HIP_PREP });
    await section.getByRole("button", { name: "Save warm-up routines" }).click();
    await expect(section.getByText("Warm-up routines saved.")).toBeVisible();

    await page.reload();
    await expect(linkedList.getByText(HIP_PREP)).toBeVisible();
    await expect(linkedList.getByText(UPPER_STANDARD)).toHaveCount(0);
    await expect(linkedList.getByText(SHOULDER_PREP)).toHaveCount(0);

    // Same fact, read back through the API: each template sees only its own.
    const a = await page.request.get(`/api/templates/${upperA.id}/warmup-routines`);
    const b = await page.request.get(`/api/templates/${upperB.id}/warmup-routines`);
    const linksA = ((await a.json()) as { links: { name: string; isDefault: boolean }[] }).links;
    const linksB = ((await b.json()) as { links: { name: string; isDefault: boolean }[] }).links;
    expect(linksA.map((l) => l.name)).toEqual([UPPER_STANDARD, SHOULDER_PREP]);
    expect(linksA.filter((l) => l.isDefault).map((l) => l.name)).toEqual([SHOULDER_PREP]);
    expect(linksB.map((l) => l.name)).toEqual([HIP_PREP]);
  });

  test("reordering and clearing the default are saved atomically", async ({ page }) => {
    await login(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD, SHOULDER_PREP]);
    await createRoutine(page, UPPER_STANDARD, [{ label: "Bike" }]);
    await createRoutine(page, SHOULDER_PREP, [{ label: "Horizontal rotation" }]);

    const upperA = await findOrCreateTemplate(page, UPPER_A);
    await clearTemplateWarmupLinks(page, upperA.id);

    await page.goto(`/templates/${upperA.id}`);
    const section = page.locator("section", {
      has: page.getByText("Only the routines linked here"),
    });
    await section.getByLabel("Link a warm-up routine").selectOption({ label: UPPER_STANDARD });
    await section.getByLabel("Link a warm-up routine").selectOption({ label: SHOULDER_PREP });
    await section.getByLabel(`Make ${UPPER_STANDARD} the default`).check();
    await section.getByRole("button", { name: "Save warm-up routines" }).click();
    await expect(section.getByText("Warm-up routines saved.")).toBeVisible();

    // Move the second above the first, then clear the default.
    await section.getByRole("button", { name: `Move ${SHOULDER_PREP} up` }).click();
    await section.getByRole("button", { name: "Clear default" }).click();
    await section.getByRole("button", { name: "Save warm-up routines" }).click();
    await expect(section.getByText("Warm-up routines saved.")).toBeVisible();

    const res = await page.request.get(`/api/templates/${upperA.id}/warmup-routines`);
    const links = (
      (await res.json()) as {
        links: { name: string; position: number; isDefault: boolean }[];
      }
    ).links;
    expect(links.map((l) => [l.position, l.name, l.isDefault])).toEqual([
      [0, SHOULDER_PREP, false],
      [1, UPPER_STANDARD, false],
    ]);
  });

  test("Today shows the compact 'Warm-up: <name>' line and still starts in one tap (O-6)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await deleteRoutinesByName(page, [UPPER_STANDARD]);
    const routine = await createRoutine(page, UPPER_STANDARD, [
      { label: "Bike", instruction: "5 min easy" },
    ]);

    const templateId = await scheduledTemplateId(page);
    await page.goto("/today");
    // Before linking: no preview line at all.
    await expect(page.getByText(/^Warm-up: /)).toHaveCount(0);

    await page.request.put(`/api/templates/${templateId}/warmup-routines`, {
      data: { routineIds: [routine.id], defaultRoutineId: routine.id },
    });

    await page.goto("/today");
    await expect(page.getByText(`Warm-up: ${UPPER_STANDARD}`)).toBeVisible();
    // Informational only — the single start control is still the only CTA.
    await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
    await expect(page.getByRole("button", { name: /choose|select/i })).toHaveCount(0);

    // Clearing the default removes the line on the next load, while the
    // routine stays linked.
    await page.request.put(`/api/templates/${templateId}/warmup-routines`, {
      data: { routineIds: [routine.id], defaultRoutineId: null },
    });
    await page.goto("/today");
    await expect(page.getByText(`Warm-up: ${UPPER_STANDARD}`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
  });
});
