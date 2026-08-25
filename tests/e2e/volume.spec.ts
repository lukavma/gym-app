import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise } from "@/server/exercises/service";
import { runSeed } from "@/db/seed";
import { E2E_EMAIL, login } from "./helpers";

// implementation-plan.md Phase 6 — phone-sized E2E for the five-week view,
// reference/bandless groups, the Back reconciliation line, a deload badge,
// and a landmark edit. Runs `runSeed` itself (idempotent) so RP General and
// this account's default preset exist regardless of whether `pnpm db:seed`
// was already run against the target database — same direct-DB-access
// precondition as muscleTaxonomyV2.spec.ts (DATABASE_URL must be set in the
// shell running `pnpm test:e2e`). A dedicated, timestamp-suffixed exercise
// keeps this spec's own assertions independent of whatever else has been
// logged against the shared dev account.

test.describe("volume screen (phone-sized viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the 5-week view with the Back reconciliation, bandless groups, a deload badge, and supports a landmark edit", async ({
    page,
  }) => {
    const db = getDb();
    await runSeed(db);

    const [user] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
    if (!user) {
      throw new Error("expected the e2e user to exist — run tests/e2e/seed.ts first");
    }

    // `lats` deliberately has no RP landmark row (volume-model.md §4) —
    // proves the bandless-rendering rule end-to-end.
    const exercise = await createExercise(db, user.id, {
      name: `E2E Volume Pullover ${Date.now()}`,
      equipment: "machine",
      mechanics: "isolation",
      laterality: "bilateral",
      loadStepKg: 5,
      contributions: [{ muscleGroupId: "lats", role: "primary", weight: 1 }],
    });

    const now = new Date();
    const currentSessionId = newId();
    const currentSessionExerciseId = newId();
    await db.insert(workoutSessions).values({
      id: currentSessionId,
      userId: user.id,
      templateName: "E2E Volume",
      weekIndex: 1,
      isDeload: false,
      status: "completed",
      startedAt: now,
      completedAt: now,
    });
    await db.insert(sessionExercises).values({
      id: currentSessionExerciseId,
      sessionId: currentSessionId,
      exerciseId: exercise.id,
      position: 0,
      source: "adhoc", // ad-hoc counts identically to templated (volume-model.md §2)
    });
    await db.insert(setLogs).values([
      {
        id: newId(),
        sessionExerciseId: currentSessionExerciseId,
        setNumber: 1,
        isWarmup: true,
        weightKg: 20,
        reps: 8,
        loggedAt: now,
      },
      {
        id: newId(),
        sessionExerciseId: currentSessionExerciseId,
        setNumber: 2,
        isWarmup: false,
        weightKg: 40,
        reps: 8,
        loggedAt: now,
      },
      {
        id: newId(),
        sessionExerciseId: currentSessionExerciseId,
        setNumber: 3,
        isWarmup: false,
        weightKg: 40,
        reps: 8,
        loggedAt: now,
      },
    ]);

    // A deload session ~8 days back — lands inside the 5-week window
    // regardless of which weekday "now" is, without pinning an exact week
    // index.
    const deloadStart = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const deloadSessionId = newId();
    const deloadSessionExerciseId = newId();
    await db.insert(workoutSessions).values({
      id: deloadSessionId,
      userId: user.id,
      templateName: "E2E Volume",
      weekIndex: 1,
      isDeload: true,
      status: "completed",
      startedAt: deloadStart,
      completedAt: deloadStart,
    });
    await db.insert(sessionExercises).values({
      id: deloadSessionExerciseId,
      sessionId: deloadSessionId,
      exerciseId: exercise.id,
      position: 0,
      source: "adhoc",
    });
    await db.insert(setLogs).values([
      {
        id: newId(),
        sessionExerciseId: deloadSessionExerciseId,
        setNumber: 1,
        isWarmup: false,
        weightKg: 30,
        reps: 8,
        loggedAt: deloadStart,
      },
    ]);

    await login(page);
    await page.goto("/volume");
    await expect(page.getByRole("heading", { name: "Volume" })).toBeVisible();

    // Five week cards (implementation-plan.md Phase 6 — current + previous 4).
    const weekCards = page.locator("section");
    await expect(weekCards).toHaveCount(5);
    const currentWeekCard = weekCards.first();

    // RP provenance caption, exact required copy.
    await expect(
      page.getByText("RP General is a coaching preset (heuristic), not established science.", {
        exact: false,
      }),
    ).toBeVisible();

    // The provenance label travels with each rendered reference band rather
    // than relying only on the page-level caption far above later weeks.
    await expect(currentWeekCard.getByText(/^Coaching heuristic · MV/).first()).toBeVisible();

    // RP publishes Rear/Side Delts as one combined row. The duplicated seed
    // note must be visible alongside both rendered copies.
    await expect(
      currentWeekCard.getByText(/RP lists Rear Delts and Side Delts as one combined row/).first(),
    ).toBeVisible();

    // Back reconciliation line (M-3-corrected: effective-series equation,
    // with the raw-dedup caveat) on the current week's card.
    await expect(currentWeekCard.getByText(/^Back \d+(\.\d+)? = Lats/)).toBeVisible();
    await expect(currentWeekCard.getByText(/deduplicated per-set count/)).toBeVisible();

    // Landmark-less groups (e.g. Lats — RP has no row for it) render "No
    // reference range", never a fabricated band.
    await expect(currentWeekCard.getByText("No reference range").first()).toBeVisible();

    // Deload badge appears somewhere in the 5-week view, de-emphasizing
    // (not excluding) that week's data.
    await expect(page.getByText("Deload").first()).toBeVisible();

    // Landmark edit: the first "Edit reference range" button in the current
    // week's card belongs to the Back rollup row (rendered first).
    await currentWeekCard.getByRole("button", { name: "Edit reference range" }).first().click();

    const mevInput = currentWeekCard.getByLabel("mev minimum");
    await expect(mevInput).toBeVisible();
    await mevInput.fill("11");
    await currentWeekCard.getByRole("button", { name: "Save mev reference value" }).click();

    // Immediate reflection — no manual reload.
    await expect(currentWeekCard.getByText(/MEV 11(?!\d)/)).toBeVisible();
    // The provenance caption is a page-level element (above the week
    // cards, not inside any one of them) — scope to `page`, not the card.
    await expect(page.getByText("Values below are your edited copy of it.")).toBeVisible();
  });
});
