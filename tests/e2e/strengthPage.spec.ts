import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exercises, sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise } from "@/server/exercises/service";
import { runSeed } from "@/db/seed";
import { E2E_EMAIL, login } from "./helpers";

// Estimated 1RM Release A — the read-only `/exercises/[id]/strength` surface
// (revision §15.1, owner decision O-4) end to end, phone-sized, against the
// real app. Same direct-DB-access precondition as volume.spec.ts and
// muscleTaxonomyV2.spec.ts: DATABASE_URL must be set in the shell running
// `pnpm test:e2e`. A timestamp-suffixed exercise keeps every assertion here
// independent of whatever else the shared dev account has logged.

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
  isDeload = false,
): Promise<void> {
  const db = getDb();
  const startedAt = new Date(Date.now() - daysAgo * 86_400_000);
  const sessionId = newId();
  const sessionExerciseId = newId();
  await db.insert(workoutSessions).values({
    id: sessionId,
    userId,
    templateName: "E2E Strength",
    weekIndex: 1,
    isDeload,
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

test.describe("strength estimate page (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows current, best, the trend and a what-if load, all labelled as estimates", async ({
    page,
  }) => {
    const db = getDb();
    await runSeed(db);
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) throw new Error("expected the e2e user to exist — run tests/e2e/seed.ts first");

    const exercise = await createExercise(db, user.id, {
      name: `E2E Strength Squat ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });

    // 100 / 105 / 110 kg x 5 @ RIR 2 -> RTF 7 -> 123.33 / 129.50 / 135.67.
    // Current is the LOWER MEDIAN, 129.50; on the 2.5 kg grid that renders as
    // 130 with a ±10 % band rounded outward to [115, 142.5]. Best is 135.67
    // -> 135, band [120, 150].
    await logSession(user.id, exercise.id, 20, [
      { weightKg: 60, reps: 5, rir: null, isWarmup: true },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
    ]);
    await logSession(user.id, exercise.id, 12, [
      { weightKg: 105, reps: 5, rir: 2 },
      { weightKg: 105, reps: 5, rir: 2 },
      { weightKg: 105, reps: 5, rir: 2 },
    ]);
    await logSession(user.id, exercise.id, 5, [
      { weightKg: 110, reps: 5, rir: 2 },
      { weightKg: 110, reps: 5, rir: 2 },
      { weightKg: 110, reps: 5, rir: 2 },
    ]);
    // A deload session that must be shown, badged, and not counted.
    await logSession(
      user.id,
      exercise.id,
      2,
      [
        { weightKg: 80, reps: 5, rir: 3 },
        { weightKg: 80, reps: 5, rir: 3 },
      ],
      true,
    );

    await login(page);
    await page.goto(`/exercises/${exercise.id}/strength`);

    await expect(page.getByRole("heading", { name: "Strength estimate" })).toBeVisible();
    await expect(page.getByText(exercise.name)).toBeVisible();

    // Every rendered estimate carries the approximation mark, a band and the
    // "est." label — the structural rule of §15.2 / A-28.
    await expect(page.getByText("≈ 130 kg (likely 115–142.5) est.").first()).toBeVisible();
    await expect(page.getByText("≈ 135 kg (likely 120–150) est.").first()).toBeVisible();
    await expect(page.getByText("high confidence")).toBeVisible();

    // The deload row is present, badged, and excluded from the numbers. The
    // estimate-level reason is stated exactly once — beside the value — while
    // the observation-level one badges the row itself.
    await expect(page.getByText("Deload").first()).toBeVisible();
    await expect(page.getByText("Deload sessions not counted")).toHaveCount(1);
    await expect(page.getByText("Deload session — shown, not counted")).toHaveCount(1);

    // The trend shows the governing set of each session in the app's own
    // set formatting.
    await expect(page.getByText("110 kg × 5 @ RIR 2").first()).toBeVisible();

    // Copy rules: the page never says any of these.
    const body = await page.locator("body").innerText();
    for (const forbidden of ["personal record", "1RM", "research shows", "declin"]) {
      expect(body.includes(forbidden), `page copy contains "${forbidden}"`).toBe(false);
    }
    expect(body).toContain("Estimates only — not tested maxes.");
    expect(body).toContain("Based on the last 90 days of training.");
    expect(body).toContain("e1rm-epley-rir v1");

    // The what-if calculator: 8 reps at RIR 1 -> RTF 9 -> 129.50 / 1.3 =
    // 99.62 -> floored to 97.5 on the 2.5 kg grid.
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByLabel("RIR", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Show the load" }).click();
    await expect(page.getByText("≈ 97.5 kg (likely 87.5–110) est.")).toBeVisible();
    await expect(page.getByText("Rounded down to the load step")).toBeVisible();

    // A near-maximal target is refused with an honest line, not a number.
    await page.getByLabel("Reps", { exact: true }).fill("2");
    await page.getByLabel("RIR", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Show the load" }).click();
    await expect(page.getByText("Nothing offered for near-maximal targets").first()).toBeVisible();

    // No horizontal overflow at phone width (the BLOCKER-1 guarantee).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Review F-6 — every interactive control clears the 44 px iOS touch
    // target the rest of the workout surface follows. Before the remediation
    // the inputs measured 26 px and the button 24 px.
    for (const control of [
      page.getByLabel("Reps", { exact: true }),
      page.getByLabel("RIR", { exact: true }),
      page.getByRole("button", { name: "Show the load" }),
    ]) {
      const box = await control.boundingBox();
      expect(box, "expected the control to be laid out").not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the what-if honours the 1.10 x recent-max cap and puts its reasons under Current", async ({
    page,
  }) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) throw new Error("expected the e2e user to exist — run tests/e2e/seed.ts first");

    const exercise = await createExercise(db, user.id, {
      name: `E2E Strength Cap ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    // One session, 60 days old: 100 kg x 5 @ RIR 2 -> RTF 7 -> 123.33.
    // Heaviest admitted load 100, so §9.5 step 4's cap is 110.00. The age and
    // the single session also give three estimate reasons, which is what makes
    // the placement assertion below meaningful.
    await logSession(user.id, exercise.id, 60, [
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
    ]);

    await login(page);
    await page.goto(`/exercises/${exercise.id}/strength`);
    await expect(page.getByRole("heading", { name: "Strength estimate" })).toBeVisible();

    // Review F-7 — the estimate's remaining reasons belong to the pool, so
    // they render INSIDE the Current card. Rendered after the Best card they
    // sat under a date and read as a qualification of the all-time best.
    const currentCard = page.locator("section").filter({ hasText: "Current" }).first();
    const bestCard = page.locator("section").filter({ hasText: "Best" }).first();
    await expect(
      currentCard.getByText("Most recent session more than six weeks ago"),
    ).toBeVisible();
    await expect(currentCard.getByText("Unconfirmed — no second session near it")).toBeVisible();
    await expect(bestCard.getByText("Most recent session more than six weeks ago")).toHaveCount(0);

    // Review F-2 — 3 reps at RIR 0 translates to 112.12, above the 110.00 cap.
    await page.getByLabel("Reps", { exact: true }).fill("3");
    await page.getByLabel("RIR", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Show the load" }).click();
    await expect(page.getByText("≈ 110 kg (likely 97.5–122.5) est.")).toBeVisible();
    await expect(page.getByText("Capped near your heaviest recent working load")).toBeVisible();
    // NEGATIVE CONTROL: uncapped the band read 100–125.
    await expect(page.getByText("≈ 110 kg (likely 100–125) est.")).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the library row links to the page, and the edit form's toggle turns it off", async ({
    page,
  }) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) throw new Error("expected the e2e user to exist — run tests/e2e/seed.ts first");

    const exercise = await createExercise(db, user.id, {
      name: `E2E Strength Toggle ${Date.now()}`,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    await logSession(user.id, exercise.id, 3, [
      { weightKg: 90, reps: 5, rir: 1 },
      { weightKg: 90, reps: 5, rir: 1 },
      { weightKg: 90, reps: 5, rir: 1 },
    ]);

    await login(page);
    await page.goto("/exercises");
    // The library's search box is a controlled input with a 200 ms debounce.
    // Narrowing to one row is what makes the row's "Strength estimate" link
    // unambiguous — the link deliberately does not repeat the exercise name
    // in its accessible name (see the comment in ExerciseLibrary.tsx).
    await page.getByPlaceholder("Search exercises…").fill(exercise.name);
    await expect(page.getByRole("link", { name: exercise.name })).toHaveCount(1);
    const strengthLink = page.getByRole("link", { name: "Strength estimate", exact: true });
    await expect(strengthLink).toHaveCount(1);
    // Review F-6 — the entry link is a 44 px touch target, not a 20 px line
    // of `text-xs`.
    const linkBox = await strengthLink.boundingBox();
    expect(linkBox).not.toBeNull();
    expect(linkBox!.height).toBeGreaterThanOrEqual(44);
    await strengthLink.click();
    await page.waitForURL(new RegExp(`/exercises/${exercise.id}/strength$`));
    // 90 kg x 5 @ RIR 1 -> RTF 6 -> 108.00, which is 107.5 on a 2.5 kg grid,
    // with a band of [95, 120].
    await expect(page.getByText("≈ 107.5 kg (likely 95–120) est.").first()).toBeVisible();

    // Turn the estimate off from the edit form.
    await page.goto(`/exercises/${exercise.id}`);
    await page.getByLabel("Strength estimate").selectOption("off");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/exercises$/);

    const [row] = await db
      .select({ strengthEstimate: exercises.strengthEstimate })
      .from(exercises)
      .where(eq(exercises.id, exercise.id));
    expect(row?.strengthEstimate).toBe("off");

    await page.goto(`/exercises/${exercise.id}/strength`);
    await expect(page.getByText("Strength estimate turned off for this exercise")).toHaveCount(1);
    // NEGATIVE CONTROL: the number the page showed a moment ago must be gone.
    await expect(page.getByText("≈ 107.5 kg (likely 95–120) est.")).toHaveCount(0);
  });
});
