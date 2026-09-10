import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exerciseMuscleContributions, exercises, muscleGroups, users } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { E2E_EMAIL, login } from "./helpers";

// Pre-Phase-6 Muscle Taxonomy v2 — Release 1 (capability release, ADR-010).
// Phone-viewport real-browser coverage of what a unit/integration test can't
// reach: the contribution picker's rendered <option> set and its "+ Add
// muscle" capacity cap (architecture-review LOW #10 — a naive vocabulary-
// length swap would still cap at the wrong number once a legacy rollup row
// is in the mix), plus the "Unclassified Back" read/reclassify affordance.
//
// The second and third tests each seed their own legacy direct-`back`
// contribution by writing to the DB directly (the app itself can never
// create one after Release 1 — that's the point) — same direct-DB-access
// precedent as tests/e2e/seed.ts. Neither relies on a seeded catalog
// exercise still carrying `back`: Release 2's reconciliation
// (pre-phase-6-muscle-taxonomy-release-2-implementation.md) deliberately
// re-points every one of the 14 mapped catalog exercises (including
// "Barbell Row", the original fixture here) onto its leaf target the first
// time it runs against a database, so that assumption is no longer safe to
// build a test on. These direct-DB calls run in the Playwright test process
// itself, not the browser, so DATABASE_URL must be set in the shell running
// `pnpm test:e2e`:
//
//   $env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp"; pnpm test:e2e
//
// Precondition: tests/e2e/seed.ts (or just login()) has provisioned the
// fixed e2e account with its seeded exercise catalog.

test.describe("muscle taxonomy v2 Release 1 (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone-sized

  test("the contribution picker offers exactly the 18 leaves, never Back, and the add-row cap is 18 not 19", async ({
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
      "Tibialis (Shin)",
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
      "tibialis",
    ];
    const addMuscleButton = page.getByRole("button", { name: "+ Add muscle" });

    // Two rows exist by default; add the rest one at a time and fill each,
    // proving the cap holds at exactly 18 leaves, not 17 (off-by-one) or 19
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

  test("a legacy direct Back contribution renders as Unclassified Back and survives an unrelated save", async ({
    page,
  }) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) {
      throw new Error(`E2E user "${E2E_EMAIL}" not found — has login() run yet?`);
    }

    // Explicit fixture, owned by this test — not a seeded catalog exercise.
    // Release 2's reconciliation deliberately re-points every catalog
    // exercise's `back` row (including the "Barbell Row" this test used to
    // rely on) onto its leaf target the first time it runs against a
    // database, so a real catalog exercise can no longer be assumed to
    // still carry `back` here. Bypasses createExercise's Zod gate on
    // purpose — this is what a pre-Release-1 direct `back` contribution
    // looks like; the app itself can never write one after Release 1.
    const exerciseId = newId();
    const name = `E2E Legacy Back Unrelated Save ${Date.now()}`;
    await db.insert(exercises).values({
      id: exerciseId,
      userId: user.id,
      name,
      equipment: "cable",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
    });
    await db.insert(exerciseMuscleContributions).values({
      exerciseId,
      muscleGroupId: "back",
      role: "primary",
      weight: 1,
    });

    await login(page);
    await page.goto(`/exercises/${exerciseId}`);

    const unclassifiedNote = page.getByText(
      "Unclassified Back — pick Lats or Upper Back, or leave as-is.",
    );
    await expect(unclassifiedNote).toBeVisible();

    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/exercises$/);

    // Not `exact: true` — same reason as the reclassify test below; `name`
    // (timestamped) is unambiguous as a substring.
    const row = page.getByRole("link", { name });
    await expect(row).toContainText("Unclassified Back");
    expect(await row.innerText()).not.toContain("undefined");

    await row.click();
    await page.waitForURL(/\/exercises\/[^/]+$/);
    await expect(unclassifiedNote).toBeVisible();

    // Clean up so reruns don't accumulate exercises.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/exercises$/);
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

    // Not `exact: true` — same reason as the row lookup in the test above;
    // `name` (timestamped) is unambiguous as a substring.
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

// D-CE1-1(iii) forward hardening (catalog-expansion-1 §12.8) — the
// unknown-slug fallback generalises the rollup mechanism above to any slug
// this bundle's vocabulary doesn't recognise, so the *next* amendment (after
// `tibialis`) doesn't reproduce Window B's "Select muscle…" failure
// (catalog-expansion-1 §12.6). `obliques` — the spec's own example of a
// future leaf (§14) — stands in for that not-yet-added slug: seeded directly
// into `muscle_groups` here (simulating a server that has it, matching what
// D-CE1-1(iii) is forward protection for), while this bundle's compiled
// vocabulary constants — built from source, same as production — do not.
test.describe("D-CE1-1(iii) unknown-slug forward hardening (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone-sized

  test("an unrecognised muscle slug renders as itself — never blank — and its untouched-save payload preserves it (NC-A, NC-B, NC-E)", async ({
    page,
  }) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) {
      throw new Error(`E2E user "${E2E_EMAIL}" not found — has login() run yet?`);
    }

    // Simulates a server that has seeded a leaf this bundle predates —
    // exactly D-CE1-1(iii)'s forward-protection scenario, not the `back`
    // rollup case above.
    await db
      .insert(muscleGroups)
      .values({ id: "obliques", displayName: "Obliques", position: 999, kind: "muscle" })
      .onConflictDoNothing();

    const exerciseId = newId();
    const name = `E2E Unknown Slug Unrelated Save ${Date.now()}`;
    await db.insert(exercises).values({
      id: exerciseId,
      userId: user.id,
      name,
      equipment: "cable",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
    });
    // Bypasses createExercise's Zod gate on purpose, same as the legacy
    // `back` fixtures above — this is what an untouched stale-client payload
    // looks like once a new leaf exists server-side.
    await db.insert(exerciseMuscleContributions).values({
      exerciseId,
      muscleGroupId: "obliques",
      role: "primary",
      weight: 1,
    });

    try {
      await login(page);
      await page.goto(`/exercises/${exerciseId}`);

      // NC-A: the picker shows the raw slug as its SELECTED option — never
      // "Select muscle…", never blank.
      const musclePicker = page.locator("select").nth(3);
      await expect(musclePicker).toHaveValue("obliques");
      const selectedOptionText = await musclePicker
        .locator("option[value='obliques']")
        .textContent();
      expect(selectedOptionText?.trim()).toBe("obliques");

      // NC-E: no "Unclassified " prefix — that prefix is reserved for a
      // known rollup (`back`), never applied to a merely-unrecognised slug.
      await expect(page.getByText(/^Unclassified/)).toBeHidden();

      // NC-B: the payload itself, not just the DOM. `obliques` exists only
      // as a raw DB row here (not in this bundle's compiled vocabulary, by
      // design — see the describe-block comment), so the *server's* own
      // validation correctly 400s the PATCH (NC-F: the fallback does not
      // broaden acceptance) — this test does not depend on the save
      // succeeding. What it proves is narrower and exactly what NC-B asks:
      // the form builds its outgoing payload from React state, so an
      // untouched picker submits the same slug it loaded, never "" and
      // never something else.
      const patchRequest = page.waitForRequest(
        (req) => req.url().includes(`/api/exercises/${exerciseId}`) && req.method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save changes" }).click();
      const request = await patchRequest;
      const body = request.postDataJSON() as { contributions?: { muscleGroupId: string }[] };
      expect(body.contributions).toEqual([
        { muscleGroupId: "obliques", role: "primary", weight: 1 },
      ]);
    } finally {
      // Clean up so reruns don't accumulate exercises or the injected leaf.
      await db
        .delete(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
      await db.delete(exercises).where(eq(exercises.id, exerciseId));
      await db.delete(muscleGroups).where(eq(muscleGroups.id, "obliques"));
    }
  });

  test("an unrecognised muscle slug is never offered to a freshly added row on the same form (NC-C)", async ({
    page,
  }) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) {
      throw new Error(`E2E user "${E2E_EMAIL}" not found — has login() run yet?`);
    }

    await db
      .insert(muscleGroups)
      .values({ id: "obliques", displayName: "Obliques", position: 999, kind: "muscle" })
      .onConflictDoNothing();

    const exerciseId = newId();
    const name = `E2E Unknown Slug New Row ${Date.now()}`;
    await db.insert(exercises).values({
      id: exerciseId,
      userId: user.id,
      name,
      equipment: "cable",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
    });
    await db.insert(exerciseMuscleContributions).values({
      exerciseId,
      muscleGroupId: "obliques",
      role: "primary",
      weight: 1,
    });

    try {
      await login(page);
      await page.goto(`/exercises/${exerciseId}`);

      // Coexistence proof, extending the legacy-rollup one above: a
      // freshly-added blank row excludes both the unrecognised slug and
      // Back, even though the legacy row's own picker still offers
      // "obliques" self-only.
      await page.getByRole("button", { name: "+ Add muscle" }).click();
      const newRowOptions = await page.locator("select").nth(5).locator("option").allTextContents();
      expect(newRowOptions).not.toContain("obliques");
      expect(newRowOptions).not.toContain("Back");

      // Discard — this test only asserts the option list, never saves.
      await page.getByRole("button", { name: "Remove muscle" }).nth(1).click();
    } finally {
      // Clean up so reruns don't accumulate exercises or the injected leaf.
      await db
        .delete(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.exerciseId, exerciseId));
      await db.delete(exercises).where(eq(exercises.id, exerciseId));
      await db.delete(muscleGroups).where(eq(muscleGroups.id, "obliques"));
    }
  });
});
