import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exerciseMuscleContributions, exercises, users } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { E2E_EMAIL, login } from "./helpers";

// Pre-Phase-6 Muscle Taxonomy v2 — Release 1 (capability release, ADR-010).
// Phone-viewport real-browser coverage of what a unit/integration test can't
// reach: the contribution picker's rendered <option> set and its "+ Add
// muscle" capacity cap (architecture-review LOW #10 — a naive vocabulary-
// length swap would still cap at the wrong number once a legacy rollup row
// is in the mix), plus the "Unclassified Back" read/reclassify affordance.
//
// The third test seeds a legacy direct-`back` contribution by writing to the
// DB directly (the app itself can never create one after Release 1 — that's
// the point) — same direct-DB-access precedent as tests/e2e/seed.ts. That
// call runs in the Playwright test process itself, not the browser, so
// DATABASE_URL must be set in the shell running `pnpm test:e2e`:
//
//   $env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp"; pnpm test:e2e
//
// Precondition: tests/e2e/seed.ts (or just login()) has provisioned the
// fixed e2e account with its seeded exercise catalog.

test.describe("muscle taxonomy v2 Release 1 (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone-sized

  test("the contribution picker offers exactly the 17 leaves, never Back, and the add-row cap is 17 not 18", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/exercises/new");

    // Same DOM-order reasoning as exerciseDecimalInput.spec.ts: the 4th
    // labelless <select> is the first contribution row's muscle picker.
    const firstMusclePicker = page.locator("select").nth(3);
    const optionTexts = await firstMusclePicker.locator("option").allTextContents();
    expect(optionTexts).toEqual([
      "Select muscle…",
      "Chest",
      "Lats",
      "Upper Back",
      "Front Delts",
      "Side Delts",
      "Rear Delts",
      "Traps",
      "Biceps",
      "Triceps",
      "Forearms",
      "Abs",
      "Quads",
      "Hamstrings",
      "Glutes",
      "Adductors",
      "Calves",
      "Lower Back (Erectors)",
    ]);
    expect(optionTexts).not.toContain("Back");

    const leaves = [
      "chest",
      "lats",
      "upper_back",
      "front_delts",
      "side_delts",
      "rear_delts",
      "traps",
      "biceps",
      "triceps",
      "forearms",
      "abs",
      "quads",
      "hamstrings",
      "glutes",
      "adductors",
      "calves",
      "lower_back",
    ];
    const addMuscleButton = page.getByRole("button", { name: "+ Add muscle" });

    // Two rows exist by default; add the rest one at a time and fill each,
    // proving the cap holds at exactly 17 leaves, not 16 (off-by-one) or 18
    // (the pre-fix full-vocabulary count).
    for (const [i, leaf] of leaves.entries()) {
      if (i >= 2) {
        await expect(addMuscleButton).toBeVisible();
        await addMuscleButton.click();
      }
      await page
        .locator("select")
        .nth(3 + i * 2)
        .selectOption(leaf);
    }

    await expect(addMuscleButton).toBeHidden();
  });

  test("a legacy seeded Back contribution renders as Unclassified Back and survives an unrelated save", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/exercises");

    // "Barbell Row" (src/db/seed/exerciseCatalog.ts) has a `back` primary
    // contribution and is one of the 14 catalog rows Release 1 leaves
    // untouched. Not `exact: true` — the library row's accessible name is
    // the whole link's text content, name plus muscles-worked subtitle, so
    // only a substring match against the name works (same as
    // exerciseDecimalInput.spec.ts's row lookups); "Barbell Row" isn't a
    // substring of any other catalog exercise's name.
    await page.getByRole("link", { name: "Barbell Row" }).click();
    await page.waitForURL(/\/exercises\/[^/]+$/);

    const unclassifiedNote = page.getByText(
      "Unclassified Back — pick Lats or Upper Back, or leave as-is.",
    );
    await expect(unclassifiedNote).toBeVisible();

    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/exercises$/);

    const row = page.getByRole("link", { name: "Barbell Row" });
    await expect(row).toContainText("Unclassified Back");
    expect(await row.innerText()).not.toContain("undefined");

    await row.click();
    await page.waitForURL(/\/exercises\/[^/]+$/);
    await expect(unclassifiedNote).toBeVisible();
  });

  test("a legacy direct Back contribution excludes Back from a freshly added row, and can be explicitly reclassified", async ({
    page,
  }) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) {
      throw new Error(`E2E user "${E2E_EMAIL}" not found — has login() run yet?`);
    }

    const exerciseId = newId();
    const name = `E2E Legacy Back Exercise ${Date.now()}`;
    await db.insert(exercises).values({
      id: exerciseId,
      userId: user.id,
      name,
      equipment: "cable",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
    });
    // Bypasses createExercise's Zod gate on purpose — this is what a
    // pre-Release-1 direct `back` contribution looks like; the app itself
    // can never write one after Release 1.
    await db.insert(exerciseMuscleContributions).values({
      exerciseId,
      muscleGroupId: "back",
      role: "primary",
      weight: 1,
    });

    await login(page);
    await page.goto(`/exercises/${exerciseId}`);

    await expect(
      page.getByText("Unclassified Back — pick Lats or Upper Back, or leave as-is."),
    ).toBeVisible();

    // Coexistence proof: a freshly-added blank row on the same form excludes
    // Back, even though the legacy row's own picker still offers it.
    await page.getByRole("button", { name: "+ Add muscle" }).click();
    const newRowOptions = await page.locator("select").nth(5).locator("option").allTextContents();
    expect(newRowOptions).not.toContain("Back");
    await page.getByRole("button", { name: "Remove muscle" }).nth(1).click();

    // Reclassify the legacy row itself to Lats.
    await page.locator("select").nth(3).selectOption("lats");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/exercises$/);

    // Not `exact: true` — same reason as the Barbell Row lookup above; `name`
    // (timestamped) is still unambiguous as a substring.
    const row = page.getByRole("link", { name });
    await expect(row).toContainText("Lats");
    await expect(row).not.toContainText("Unclassified");
    expect(await row.innerText()).not.toContain("undefined");

    await row.click();
    await page.waitForURL(/\/exercises\/[^/]+$/);
    await expect(page.locator("select").nth(3)).toHaveValue("lats");
    await expect(
      page.getByText("Unclassified Back — pick Lats or Upper Back, or leave as-is."),
    ).toBeHidden();

    // Clean up so reruns against the same dev DB don't accumulate exercises.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/exercises$/);
  });
});
