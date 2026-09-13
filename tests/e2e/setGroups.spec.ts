import { test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  getActiveProgramInfo,
  applyScheduleOverride,
  restoreSchedule,
  type ActiveProgramInfo,
} from "./helpers";

// set-groups-architecture-evaluation.md — the missing browser-level coverage
// for Set Groups Stage A (disclosed as A-17 in the initial implementation
// pass's own report): group authoring (including the per-group progression
// override, §5.3), the full §11.4 selection/prefill transition table (auto-
// advance, dirty drafts, warm-ups, optional sets, reload resume), in-session
// and History group-reassignment correction (§11.3), independent per-group
// recommendations, and the C-1/D-6(a) legacy-conversion bridge. Driven
// through the real browser UI end to end, following the exact conventions
// prescriptionFormMeasurementProfile.spec.ts / measurementProfiles.spec.ts /
// progression.spec.ts already established for this repo's other scheme
// variants.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function createEmptyTemplate(page: Page, programId: string, name: string): Promise<string> {
  const res = await page.request.post(`/api/programs/${programId}/templates`, {
    data: { name },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const { template } = (await res.json()) as { template: { id: string } };
  return template.id;
}

async function createExerciseByName(
  page: Page,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await page.request.post("/api/exercises", {
    data: {
      name,
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { exercise } = (await res.json()) as { exercise: { id: string; name: string } };
  return exercise;
}

// Mirrors helpers.ts's `createTemplateWithScheme`, but allows a real
// progression strategy (that helper hardcodes `manual`) — needed here since
// these specs exercise per-group progression and recommendations.
async function createGroupedTemplate(
  page: Page,
  programId: string,
  exerciseId: string,
  name: string,
  scheme: unknown,
  progression: unknown,
): Promise<{ templateId: string; prescriptionId: string; groupKeys: string[] }> {
  const templateId = await createEmptyTemplate(page, programId, name);
  const res = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
    data: { exerciseId, scheme, progression },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const { prescription } = (await res.json()) as {
    prescription: { id: string; scheme: { scheme: { type: string; groups?: { key: string }[] } } };
  };
  const groupKeys = prescription.scheme.scheme.groups?.map((g) => g.key) ?? [];
  return { templateId, prescriptionId: prescription.id, groupKeys };
}

async function archiveTemplate(page: Page, templateId: string): Promise<void> {
  await page.request
    .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
    .catch(() => undefined);
}

// Independent review L-9 — every test in this file used to restore the
// shared program schedule and archive its own scratch template inside its
// OWN test-body `finally` block, sharing the same timeout clock as the test
// itself: a Playwright test-level timeout firing mid-`finally` (exactly
// what the §6.5 contamination disclosure in
// set-groups-stage-a-implementation.md was) aborts that cleanup along with
// the test, leaving the shared block pointed at an already-archived
// template. `afterEach` gets its own timeout budget, separate from the test
// body's, so cleanup still runs after a body timeout. `owned` is resource-
// ownership tracking: each test records exactly the resources IT created as
// it runs, so this one shared hook only ever touches what that test
// actually owns — never a sibling test's resources, and never more than
// what got created before a failure.
interface OwnedResources {
  templateId?: string;
  programInfo?: ActiveProgramInfo;
}
let owned: OwnedResources = {};

test.beforeEach(() => {
  owned = {};
});

test.afterEach(async ({ page }) => {
  if (owned.programInfo) {
    await page.goto("/today/workout").catch(() => undefined);
    const discardButton = page.getByRole("button", { name: "Discard workout" });
    if (await discardButton.isVisible().catch(() => false)) {
      page.once("dialog", (d) => void d.accept());
      await discardButton.click();
      await page.waitForURL(/\/today$/).catch(() => undefined);
    }
    await restoreSchedule(
      page,
      owned.programInfo.blockId,
      owned.programInfo.originalSchedulePayload,
    ).catch(() => undefined);
  }
  if (owned.templateId) {
    await archiveTemplate(page, owned.templateId);
  }
});

test.describe("Set Groups Stage A — prescription authoring (per-group progression override, §5.3/M-3)", () => {
  test("a slot strategy of rep-progression with TWO fixed-rep groups is authorable in ONE save, each group's required repCap set before either group has a persistent key", async ({
    page,
  }) => {
    // M-3 (independent review) — the review's own most damning scenario:
    // reaching for rep-progression at SLOT level (the obvious choice when
    // every group is meant to use it) with fixed-rep groups used to be a
    // dead end on save one, since neither group's repCap control existed
    // until the server had already assigned it a key. Both groups here are
    // fixed-rep and need their own repCap; this test proves both are
    // authorable in a single create-mode save, addressed by index
    // (`groupOverridesByIndex`) before any key exists.
    await login(page);
    const unique = `E2E SG Author ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(
      page,
      (await getActiveProgramInfo(page)).programId,
      `${unique} Template`,
    );
    owned.templateId = templateId;

    await page.goto(`/templates/${templateId}/prescriptions/new`);
    await page.getByLabel("Exercise").selectOption({ label: exercise.name });
    await page.getByLabel("Scheme").selectOption({ label: "Set groups (top set / back-offs)" });

    // The form's default draft already has TWO groups ("Top" and
    // "Back-off", PrescriptionForm.tsx's own `emptyGroupDraft` seeding) —
    // no "+ Add group" needed for this two-group scheme.
    const group1 = page
      .getByLabel("Group 1 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group1.getByLabel("Sets min").fill("1");
    await group1.getByLabel("Sets max").fill("1");
    await group1.getByLabel("Reps min").fill("2");
    await group1.getByLabel("Reps max").fill("2");

    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2.getByLabel("Sets min").fill("2");
    await group2.getByLabel("Sets max").fill("2");
    await group2.getByLabel("Reps min").fill("8");
    await group2.getByLabel("Reps max").fill("8");

    // Slot strategy: Rep progression — the obvious choice, and the one
    // the review's disclosed §7.1 path never actually tested.
    //
    // M-3's fix unconditionally renders each group's OWN "Progression
    // strategy for this group" select (no longer gated on the group having a
    // key yet), so `getByLabel("Progression strategy")` — substring-matched —
    // now also resolves every group's override select alongside the slot's
    // own. The slot-level field is rendered LAST in the form (after every
    // group card), so `.last()` reliably picks it regardless of group count.
    await page.getByLabel("Progression strategy").last().selectOption({ label: "Rep progression" });

    // §5.3/M-3 — both groups' repCap controls are available NOW, before
    // either group has a server-assigned key. Neither group needs an
    // explicit strategy override (both inherit the slot's rep-progression,
    // "Same as exercise") — the repCap field appears purely because each
    // is fixed-rep under the EFFECTIVE (inherited) strategy.
    await expect(
      page.getByText("Save this group once to set a custom progression strategy for it."),
    ).toHaveCount(0);
    const repCapLabel =
      "Rep cap for this group (required for rep progression on a fixed-rep group)";
    await expect(group1.getByLabel(repCapLabel)).toBeVisible();
    await expect(group2.getByLabel(repCapLabel)).toBeVisible();
    await group1.getByLabel(repCapLabel).fill("4");
    await group2.getByLabel(repCapLabel).fill("10");

    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    // Server-side confirmation: ONE save produced both groups' own
    // resolved repCap, correctly mapped from index to the key each was
    // actually assigned.
    const listRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
    const { prescriptions } = (await listRes.json()) as {
      prescriptions: {
        id: string;
        scheme: { scheme: { groups: { key: string; label: string }[] } };
        progression: {
          groups?: Record<string, { strategyId: string; config: { repCap?: number } }>;
        };
      }[];
    };
    const prescription = prescriptions[0]!;
    const topKey = prescription.scheme.scheme.groups.find((g) => g.label === "Top")!.key;
    const backoffKey = prescription.scheme.scheme.groups.find((g) => g.label === "Back-off")!.key;
    expect(prescription.progression.groups?.[topKey]?.config.repCap).toBe(4);
    expect(prescription.progression.groups?.[backoffKey]?.config.repCap).toBe(10);

    // Persistence round-trip: reload the edit page and confirm both
    // groups' repCaps survived exactly as authored.
    await page.goto(`/prescriptions/${prescription.id}/edit`);
    const group1Reloaded = page
      .getByLabel("Group 1 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    const group2Reloaded = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(group1Reloaded.getByLabel(repCapLabel)).toHaveValue("4");
    await expect(group2Reloaded.getByLabel(repCapLabel)).toHaveValue("10");
  });

  test("adding a group to an existing grouped prescription is authorable in one save, with its own repCap set before it has a key", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E SG Add Group ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const programId = (await getActiveProgramInfo(page)).programId;
    const templateId = await createEmptyTemplate(page, programId, `${unique} Template`);
    owned.templateId = templateId;

    // Start with a single-group scheme.
    const prescriptionRes = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
      data: {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [{ label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } }],
          },
        },
        progression: { strategyId: "load-progression" },
      },
    });
    expect(prescriptionRes.ok(), await prescriptionRes.text()).toBe(true);
    const { prescription } = (await prescriptionRes.json()) as { prescription: { id: string } };

    await page.goto(`/prescriptions/${prescription.id}/edit`);
    // See the create-mode authoring test above for why `.last()` is needed:
    // M-3 unconditionally renders each group's own "Progression strategy for
    // this group" select, which `getByLabel("Progression strategy")` also
    // substring-matches; the slot-level field renders last in the form.
    await page.getByLabel("Progression strategy").last().selectOption({ label: "Rep progression" });

    const repCapLabel =
      "Rep cap for this group (required for rep progression on a fixed-rep group)";
    // Switching the SLOT to rep-progression also makes the pre-existing
    // "Top" group (fixed-rep, no override of its own) need its own repCap
    // now — its `<input required>` blocks the native form submit below with
    // no visible error and no navigation if left empty, exactly like a real
    // user hitting the browser's own validation bubble.
    const group1 = page
      .getByLabel("Group 1 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(group1.getByLabel(repCapLabel)).toBeVisible();
    await group1.getByLabel(repCapLabel).fill("4");

    await page.getByRole("button", { name: "+ Add group" }).click();
    await page.getByLabel("Group 2 label").fill("Back-off");
    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2.getByLabel("Sets min").fill("2");
    await group2.getByLabel("Sets max").fill("2");
    await group2.getByLabel("Reps min").fill("8");
    await group2.getByLabel("Reps max").fill("8");
    await expect(group2.getByLabel(repCapLabel)).toBeVisible();
    await group2.getByLabel(repCapLabel).fill("10");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    const confirmRes = await page.request.get(`/api/prescriptions/${prescription.id}`);
    const { prescription: confirmed } = (await confirmRes.json()) as {
      prescription: {
        scheme: { scheme: { groups: { key: string; label: string }[] } };
        progression: {
          groups?: Record<string, { strategyId: string; config: { repCap?: number } }>;
        };
      };
    };
    const backoffKey = confirmed.scheme.scheme.groups.find((g) => g.label === "Back-off")!.key;
    expect(confirmed.progression.groups?.[backoffKey]?.config.repCap).toBe(10);
  });
});

test.describe("Set Groups Stage A — full workout lifecycle (§11.2/§11.3/§11.4)", () => {
  test("chip row, auto-advance, dirty drafts, warm-ups, optional sets, reload resume, in-session/History correction, and independent recommendations", async ({
    page,
  }) => {
    // Considerably longer than the default 30s: this one test drives an
    // entire two-session, two-group workout lifecycle (authoring already
    // covered separately) — many more sequential UI interactions than a
    // typical spec in this suite.
    test.setTimeout(120_000);
    await login(page);
    await ensureNoActiveSession(page);

    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG Lifecycle ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const scheme = {
      v: 1,
      scheme: {
        type: "groups",
        groups: [
          { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 }, baselineLoadKg: 140 },
          {
            label: "Back-off",
            sets: { min: 2, max: 3 },
            reps: { min: 6, max: 8 },
            baselineLoadKg: 110,
          },
        ],
      },
    };
    const { templateId } = await createGroupedTemplate(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      scheme,
      { strategyId: "load-progression" },
    );
    owned.templateId = templateId;

    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();

    const chipRow = page.getByRole("group", { name: "Select group" });
    await expect(chipRow.getByRole("button", { name: "Top 0/1" })).toBeVisible();
    await expect(chipRow.getByRole("button", { name: "Back-off 0/2–3" })).toBeVisible();

    const weightInput = page.getByLabel("Weight in kilograms");
    const repsInput = page.getByLabel("Repetitions");

    // Mount derivation: Top is the first group under its max, selected by
    // default, prefilled from its own baseline.
    await expect(weightInput).toHaveValue("140");
    await expect(repsInput).toHaveValue("2");

    // Dirty draft: type into the box without logging, then switch groups —
    // the draft must be discarded unconditionally (§11.4 table).
    await weightInput.fill("999");
    await chipRow.getByRole("button", { name: "Back-off 0/2–3" }).click();
    await expect(weightInput).toHaveValue("110");
    await expect(repsInput).toHaveValue("6");

    // Returning to a group re-derives its own prefill again, not whatever
    // was last typed.
    await chipRow.getByRole("button", { name: "Top 0/1" }).click();
    await expect(weightInput).toHaveValue("140");
    await expect(repsInput).toHaveValue("2");

    // Warm-up: excluded from the recorded count and never advances.
    await page.getByRole("checkbox", { name: "Warm-up set" }).check();
    await weightInput.fill("100");
    await repsInput.fill("3");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Top 0/1" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Warm-up set" }).uncheck();

    // Top's real work set — completes Top (1/1), which must auto-advance
    // to Back-off and change the INPUT to Back-off's own load immediately
    // (the specific required assertion: auto-advance changes the actual
    // input, not just which chip is highlighted).
    await weightInput.fill("140");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Top 1/1" })).toBeVisible();
    await expect(weightInput).toHaveValue("110");
    await expect(repsInput).toHaveValue("6");

    // Back-off's two REQUIRED sets.
    await repsInput.fill("7");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 1/2–3" })).toBeVisible();
    await repsInput.fill("7");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 2/2–3" })).toBeVisible();

    // Optional third set (within sets.max): logging it must be perfectly
    // straightforward — no forced navigation away, no blocked input.
    await repsInput.fill("8");
    await page.getByLabel("Reps in reserve").fill("1");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 3/2–3" })).toBeVisible();
    await waitForOutboxDrained(page);

    // Reload mid-flow: with no group under its max, the mount rule falls
    // to the LAST group — must resolve identically after a real reload,
    // not just in memory.
    await page.reload();
    await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();
    await expect(chipRow.getByRole("button", { name: "Back-off 3/2–3" })).toBeVisible();

    // In-session correction (§11.3): reassign Back-off's FIRST work set
    // (the earliest, "110 kg × 7" one) to Top via the set row's own edit
    // form. Leaf `<li>` rows (`:not(:has(li))`) exclude the exercise
    // card's own outer `<li>`, matching the established
    // measurementProfiles.spec.ts / offline-set-edit-delete.spec.ts
    // convention; `hasText` is a substring match, robust against the
    // group-label prefix living in its own nested `<span>` rather than
    // being part of one flat exact string, and against the (expected)
    // duplicate "110 kg × 7 @ RIR 2" line shared by Back-off's first two
    // sets.
    function leafSetRow(text: string) {
      return page.locator("li:not(:has(li))").filter({ hasText: text });
    }
    await leafSetRow("Back-off").first().getByRole("button", { name: "Edit" }).click();
    const editingRow = page
      .locator("li:not(:has(li))")
      .filter({ has: page.getByRole("button", { name: "Save" }) });
    await editingRow.getByLabel("Group").selectOption({ label: "Top" });
    await editingRow.getByRole("button", { name: "Save" }).click();
    await editingRow.waitFor({ state: "detached" });
    // One original Top set plus the reassigned Back-off one; two Back-off
    // sets remain (the second required set and the optional third).
    await expect(leafSetRow("Top")).toHaveCount(2);
    await expect(leafSetRow("Back-off")).toHaveCount(2);
    await expect(chipRow.getByRole("button", { name: "Top 2/1" })).toBeVisible();
    await expect(chipRow.getByRole("button", { name: "Back-off 2/2–3" })).toBeVisible();
    await waitForOutboxDrained(page);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    // History: the correction survived completion, and the History
    // screen's own group-reassignment control also works, post-session.
    const historyRes = await page.request.get("/api/history?limit=1");
    const { sessions } = (await historyRes.json()) as { sessions: { id: string }[] };
    await page.goto(`/history/${sessions[0]!.id}`);
    await expect(leafSetRow("Top")).toHaveCount(2);
    await expect(leafSetRow("Back-off")).toHaveCount(2);
    // The optional "110 kg × 8" set is uniquely identifiable by its rep
    // count — reassign it to "Unattributed" via History's own chip.
    const eightRepRow = leafSetRow("110 kg × 8");
    await expect(eightRepRow).toHaveCount(1);
    await eightRepRow.getByRole("button", { name: "Edit" }).click();
    const historyEditing = page
      .locator("li:not(:has(li))")
      .filter({ has: page.getByRole("button", { name: "Save" }) });
    await historyEditing.getByLabel("Group").selectOption({ label: "Unattributed" });
    await historyEditing.getByRole("button", { name: "Save" }).click();
    await historyEditing.waitFor({ state: "detached" });
    await expect(eightRepRow).not.toContainText("Back-off");
    await expect(leafSetRow("Back-off")).toHaveCount(1);

    // Independent per-group recommendations: both groups progressed
    // independently and both surface, labelled, on the next workout.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/today-bundle");
          const b = (await res.json()) as {
            today?: { exercises?: { pendingRecommendations?: { groupKey: string }[] }[] };
          };
          return (b.today?.exercises?.[0]?.pendingRecommendations ?? []).length;
        },
        { timeout: 20_000 },
      )
      .toBe(2);

    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByText("Top", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Back-off", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Increase load/).first()).toBeVisible();
  });
});

test.describe("Set Groups Stage B — percentage-linked group loads (§6/§19 D-4/D-5)", () => {
  test("authoring: linking Back-off to Top forces manual progression and persists the resolved reference key", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E SG Link Author ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(
      page,
      (await getActiveProgramInfo(page)).programId,
      `${unique} Template`,
    );
    owned.templateId = templateId;

    await page.goto(`/templates/${templateId}/prescriptions/new`);
    await page.getByLabel("Exercise").selectOption({ label: exercise.name });
    await page.getByLabel("Scheme").selectOption({ label: "Set groups (top set / back-offs)" });

    const group1 = page
      .getByLabel("Group 1 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group1.getByLabel("Sets min").fill("1");
    await group1.getByLabel("Sets max").fill("1");
    await group1.getByLabel("Reps min").fill("2");
    await group1.getByLabel("Reps max").fill("2");

    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2.getByLabel("Sets min").fill("2");
    await group2.getByLabel("Sets max").fill("3");
    await group2.getByLabel("Reps min").fill("6");
    await group2.getByLabel("Reps max").fill("8");

    // Before linking: the ordinary per-group progression select is offered.
    // (Not `{ exact: true }` — a `<label>text<select></label>` pairing's
    // computed accessible name includes the select's own current value, e.g.
    // "Progression strategy for this group Same as exercise (Load
    // progression)", so only a substring match against the label's own text
    // is meaningful here; `group2`'s own scoping already rules out matching
    // Group 1's identically-worded label.)
    await expect(group2.getByLabel("Progression strategy for this group")).toBeVisible();

    await group2
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await expect(group2.getByLabel("Progression strategy for this group")).toHaveCount(0);
    await expect(
      group2.getByText("Manual progression (required for a percentage-linked group)."),
    ).toBeVisible();
    await group2.getByLabel("Reference group").selectOption({ label: "Top" });
    await group2.getByLabel("Percent of reference top set").fill("80");

    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    const listRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
    const { prescriptions } = (await listRes.json()) as {
      prescriptions: {
        id: string;
        scheme: {
          scheme: {
            groups: { key: string; label: string; link?: { ref: string; percent: number } }[];
          };
        };
        progression: { groups?: Record<string, { strategyId: string }> };
      }[];
    };
    const prescription = prescriptions[0]!;
    const topKey = prescription.scheme.scheme.groups.find((g) => g.label === "Top")!.key;
    const backoff = prescription.scheme.scheme.groups.find((g) => g.label === "Back-off")!;
    expect(backoff.link).toEqual({ ref: topKey, percent: 80 });
    expect(prescription.progression.groups?.[backoff.key]?.strategyId).toBe("manual");

    // Reload the edit page: the link round-trips exactly as authored.
    await page.goto(`/prescriptions/${prescription.id}/edit`);
    const group2Reloaded = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(
      group2Reloaded.getByLabel(
        "Link this group’s load to an earlier group’s top set (percentage)",
      ),
    ).toBeChecked();
    await expect(group2Reloaded.getByLabel("Reference group")).toHaveValue(topKey);
    await expect(group2Reloaded.getByLabel("Percent of reference top set")).toHaveValue("80");
  });

  test("authoring: reordering the reference group above its dependent explicitly clears the link, with a visible notice — never a silent retarget", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E SG Link Reorder ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(
      page,
      (await getActiveProgramInfo(page)).programId,
      `${unique} Template`,
    );
    owned.templateId = templateId;

    await page.goto(`/templates/${templateId}/prescriptions/new`);
    await page.getByLabel("Exercise").selectOption({ label: exercise.name });
    await page.getByLabel("Scheme").selectOption({ label: "Set groups (top set / back-offs)" });

    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await group2.getByLabel("Reference group").selectOption({ label: "Top" });
    await group2.getByLabel("Percent of reference top set").fill("80");
    await expect(
      group2.getByLabel("Link this group’s load to an earlier group’s top set (percentage)"),
    ).toBeChecked();

    // Moving Back-off ABOVE Top makes its own link reference a group that is
    // now LATER in the slot — invalid. The link must be explicitly cleared
    // (with a visible notice), never silently repointed at whatever group
    // now occupies "index 0".
    await group2.getByRole("button", { name: "↑" }).click();
    await expect(page.getByText(/Link cleared for Back-off/)).toBeVisible();
    const group2AfterMove = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(
      group2AfterMove.getByLabel(
        "Link this group’s load to an earlier group’s top set (percentage)",
      ),
    ).not.toBeChecked();

    // Neither group's sets/reps fields were touched — `emptyGroupDraft`'s own
    // defaults (1x1, 5x5) are already valid, so the save below exercises
    // only the link-clearing behaviour, not unrelated field validation.
    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    const listRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
    const { prescriptions } = (await listRes.json()) as {
      prescriptions: { scheme: { scheme: { groups: { link?: unknown }[] } } }[];
    };
    expect(prescriptions[0]!.scheme.scheme.groups.every((g) => g.link === undefined)).toBe(true);
  });

  test("execution: missing-reference fallback, rounded first-set proposal, copy-forward, and no competing recommendation", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page);
    await ensureNoActiveSession(page);

    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG Link Exec ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const scheme = {
      v: 1,
      scheme: {
        type: "groups",
        groups: [
          { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 }, baselineLoadKg: 140 },
          {
            label: "Back-off",
            sets: { min: 2, max: 3 },
            reps: { min: 6, max: 8 },
            baselineLoadKg: 110,
            link: { refIndex: 0, percent: 80 },
          },
        ],
      },
    };
    const { templateId } = await createGroupedTemplate(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      scheme,
      { strategyId: "load-progression", groupOverridesByIndex: { "1": { strategyId: "manual" } } },
    );
    owned.templateId = templateId;

    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();

    const chipRow = page.getByRole("group", { name: "Select group" });
    const weightInput = page.getByLabel("Weight in kilograms");
    const repsInput = page.getByLabel("Repetitions");

    // Missing-reference fallback: switch to Back-off BEFORE Top has a
    // logged set — no reference work set exists yet, so the note explains
    // the fallback and the box shows Back-off's OWN baseline (110), not any
    // derived percentage.
    await chipRow.getByRole("button", { name: "Back-off 0/2–3" }).click();
    // Stage B remediation F-7 (set-groups-stage-b-review.md) — the note now
    // shows the ACTUAL resolved fallback figure rather than unconditionally
    // asserting a carry-forward that might not exist.
    await expect(
      page.getByText(
        "no Top set logged yet this session; using this group's own prefill (110 kg).",
      ),
    ).toBeVisible();
    await expect(weightInput).toHaveValue("110");

    // Log Top's actual top set at 130 kg.
    await chipRow.getByRole("button", { name: "Top 0/1" }).click();
    await expect(weightInput).toHaveValue("140");
    await weightInput.fill("130");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Top 1/1" })).toBeVisible();

    // Auto-advanced to Back-off: the rounded worked-example proposal —
    // 130 kg × 80% = 104 => 105 kg at the exercise's 2.5 kg step.
    await expect(weightInput).toHaveValue("105");
    await expect(page.getByText("80% of Top (130 kg) → 105 kg proposed")).toBeVisible();
    // Never a competing recommendation surface for a linked group.
    await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(0);

    // Manual deviation: the athlete logs 100 kg instead of the 105 proposal
    // — never rewrites the saved 80% link.
    await weightInput.fill("100");
    await repsInput.fill("7");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 1/2–3" })).toBeVisible();

    // Second back-off set copies the athlete's OWN previous logged load in
    // this group (100), not a re-derivation of the link's 105 proposal —
    // and the note now reads in the past tense (superseded by the own log).
    await expect(weightInput).toHaveValue("100");
    await expect(page.getByText("Linked to 80% of Top (130 kg).")).toBeVisible();
    await repsInput.fill("6");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 2/2–3" })).toBeVisible();
    await waitForOutboxDrained(page);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    // Second session: Top (independent, load-progression) now has a real
    // pending recommendation; Back-off (linked, manual) never does.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/today-bundle");
          const b = (await res.json()) as {
            today?: { exercises?: { pendingRecommendations?: { groupKey: string }[] }[] };
          };
          return (b.today?.exercises?.[0]?.pendingRecommendations ?? []).map((r) => r.groupKey);
        },
        { timeout: 20_000 },
      )
      .toHaveLength(1);

    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(1);
    // Back-off still shows its (updated) link explanation, never a
    // recommendation card of its own.
    await expect(page.getByText(/80% of Top/).first()).toBeVisible();
  });
});

test.describe("Set Groups Stage A — legacy conversion bridge (C-1/D-6(a))", () => {
  test("converting an ungrouped prescription to Set Groups bridges its prior pending recommendation onto the first group's card", async ({
    page,
  }) => {
    await login(page);
    await ensureNoActiveSession(page);

    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG Legacy ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(page, programInfo.programId, `${unique} Template`);
    owned.templateId = templateId;
    const prescriptionRes = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
      data: {
        exerciseId: exercise.id,
        scheme: { v: 1, scheme: { type: "fixed", sets: 1, reps: 2 } },
        progression: { strategyId: "load-progression" },
      },
    });
    expect(prescriptionRes.ok(), await prescriptionRes.text()).toBe(true);
    const { prescription } = (await prescriptionRes.json()) as { prescription: { id: string } };

    await applyScheduleOverride(page, programInfo.blockId, templateId);

    // A completed, ungrouped session that progresses — produces a
    // pending, null-group-key recommendation.
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await page.getByLabel("Weight in kilograms").fill("140");
    await page.getByLabel("Repetitions").fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/today-bundle");
          const b = (await res.json()) as {
            today?: {
              exercises?: { pendingRecommendation?: { target?: { loadKg?: number } } | null }[];
            };
          };
          return b.today?.exercises?.[0]?.pendingRecommendation?.target?.loadKg ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(142.5);

    // Convert to a two-group scheme (Top keeps the pending record via the
    // bridge; Back-off gets none).
    const convertRes = await page.request.patch(`/api/prescriptions/${prescription.id}`, {
      data: {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              { label: "Back-off", sets: { min: 2, max: 2 }, reps: { min: 6, max: 8 } },
            ],
          },
        },
      },
    });
    expect(convertRes.ok(), await convertRes.text()).toBe(true);

    await page.goto("/today");
    await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Top: Increase load: 142.5 kg", { exact: false })).toBeVisible();

    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByText("Top", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Weight in kilograms")).toHaveValue("142.5");
  });
});

test.describe("Set Groups Stage B remediation — F-1/F-2/F-3/F-8/F-9 (set-groups-stage-b-review.md)", () => {
  test("F-1 — the linked group's CLEAN input follows a reference-set edit and deletion, and never overwrites a dirty draft", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);
    await ensureNoActiveSession(page);
    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG F1 ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const scheme = {
      v: 1,
      scheme: {
        type: "groups",
        groups: [
          { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 }, baselineLoadKg: 140 },
          {
            label: "Back-off",
            sets: { min: 2, max: 3 },
            reps: { min: 6, max: 8 },
            baselineLoadKg: 110,
            link: { refIndex: 0, percent: 80 },
          },
        ],
      },
    };
    const { templateId } = await createGroupedTemplate(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      scheme,
      { strategyId: "load-progression", groupOverridesByIndex: { "1": { strategyId: "manual" } } },
    );
    owned.templateId = templateId;

    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();

    const chipRow = page.getByRole("group", { name: "Select group" });
    const weightInput = page.getByLabel("Weight in kilograms");
    const repsInput = page.getByLabel("Repetitions");

    function leafSetRow(text: string) {
      return page.locator("li:not(:has(li))").filter({ hasText: text });
    }

    // Log Top at 130 kg, auto-advance to Back-off: the clean proposal.
    await weightInput.fill("130");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Top 1/1" })).toBeVisible();
    await expect(weightInput).toHaveValue("105");
    await expect(page.getByText("80% of Top (130 kg) → 105 kg proposed")).toBeVisible();

    // F-1 — EDIT the logged Top set (130 -> 140 kg) WITHOUT touching the
    // selection (still Back-off): the CLEAN input must follow the edit.
    async function editTop(newWeight: string) {
      await leafSetRow("Top").getByRole("button", { name: "Edit" }).click();
      const editingRow = page
        .locator("li:not(:has(li))")
        .filter({ has: page.getByRole("button", { name: "Save" }) });
      await editingRow.locator('input[type="text"]').first().fill(newWeight);
      await editingRow.getByRole("button", { name: "Save" }).click();
      await editingRow.waitFor({ state: "detached" });
    }
    await editTop("140");
    await expect(weightInput).toHaveValue("112.5");
    await expect(page.getByText("80% of Top (140 kg) → 112.5 kg proposed")).toBeVisible();

    // F-1 — dirty-draft preservation: type a manual value, then edit the
    // reference AGAIN. The draft must survive untouched, and the note must
    // say it's a manual entry, not (falsely) claim the box holds whatever
    // the new reference would propose.
    await weightInput.fill("999");
    await editTop("160");
    await expect(weightInput).toHaveValue("999");
    await expect(
      page.getByText(
        "80% of Top (160 kg) — manual entry; logging as typed, not the 127.5 kg proposal.",
      ),
    ).toBeVisible();

    // A chip tap intentionally discards a dirty draft (§11.4's own existing
    // rule, unchanged by this remediation) — re-deriving CLEAN from the
    // CURRENT reference (160 kg × 80% = 128 => 127.5 at the 2.5 kg step).
    await chipRow.getByRole("button", { name: "Top 1/1" }).click();
    await chipRow.getByRole("button", { name: "Back-off 0/2–3" }).click();
    await expect(weightInput).toHaveValue("127.5");
    await expect(page.getByText("80% of Top (160 kg) → 127.5 kg proposed")).toBeVisible();

    // F-1 — DELETE the Top set entirely, while CLEAN: "same as no sets yet"
    // (§6.2) — the box must never keep showing a number derived from a set
    // that no longer exists; it falls back to Back-off's own baseline (110).
    //
    // Once this was the ONLY set anywhere on the card, deleting it leaves
    // the OUTER exercise `<li>` with no nested `<li>` at all, so it would
    // itself match `leafSetRow`'s `li:not(:has(li))` shape — and its own
    // scheme-header text ("Top 1 × 2 · Back-off …") contains "Top" as a
    // substring, which is why the delete-verification below targets a weight
    // value rather than `leafSetRow("Top")`'s count (the header names groups,
    // never weights, so it cannot collide with a "160 kg" match).
    //
    // Stage B remediation V-3 (set-groups-stage-b-remediation-verification.md
    // §7) — this used to assert an EXACT match on "160 kg × 2", but
    // `formatSetLine` always appends the logged RIR ("160 kg × 2 @ RIR 2"
    // here), so an exact match on the bare text is zero BEFORE the delete
    // too: the guard could never fail and would not catch a regression where
    // the delete silently stopped working. A non-exact match on "160 kg"
    // discriminates the real row — asserted as exactly one match before the
    // delete and zero after, so a skipped/failed delete now fails this test.
    const topSetRow = page.locator("li:not(:has(li))").filter({ hasText: "160 kg" });
    await expect(topSetRow).toHaveCount(1);
    page.once("dialog", (d) => void d.accept());
    await leafSetRow("Top").getByRole("button", { name: "Delete" }).click();
    await expect(topSetRow).toHaveCount(0);
    await expect(weightInput).toHaveValue("110");
    await expect(page.getByText(/80% of Top — no Top set logged yet this session/)).toBeVisible();
  });

  test("F-2 — linking a group that already holds a pending recommendation removes the competing decision surface, in the browser", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page);
    await ensureNoActiveSession(page);
    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG F2 ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const scheme = {
      v: 1,
      scheme: {
        type: "groups",
        groups: [
          { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 }, baselineLoadKg: 140 },
          {
            label: "Back-off",
            sets: { min: 2, max: 2 },
            reps: { min: 6, max: 8 },
            baselineLoadKg: 100,
          },
        ],
      },
    };
    const { templateId, prescriptionId } = await createGroupedTemplate(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      scheme,
      { strategyId: "load-progression" },
    );
    owned.templateId = templateId;

    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    const chipRow = page.getByRole("group", { name: "Select group" });
    const weightInput = page.getByLabel("Weight in kilograms");
    const repsInput = page.getByLabel("Repetitions");

    // Both groups progress independently and both earn a pending
    // recommendation, on completion, under ORDINARY (unlinked) progression.
    await weightInput.fill("140");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 0/2" })).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await repsInput.fill("7");
      await page.getByLabel("Reps in reserve").fill("2");
      await page.getByRole("button", { name: "Log", exact: true }).click();
    }
    await expect(chipRow.getByRole("button", { name: "Back-off 2/2" })).toBeVisible();
    await waitForOutboxDrained(page);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/today-bundle");
          const b = (await res.json()) as {
            today?: { exercises?: { pendingRecommendations?: { groupKey: string }[] }[] };
          };
          return (b.today?.exercises?.[0]?.pendingRecommendations ?? []).length;
        },
        { timeout: 20_000 },
      )
      .toBe(2);

    // Convert Back-off to a percentage link through the REAL editor form —
    // the review's own "ordinary adoption" reproduction.
    await page.goto(`/prescriptions/${prescriptionId}/edit`);
    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await group2.getByLabel("Reference group").selectOption({ label: "Top" });
    await group2.getByLabel("Percent of reference top set").fill("70");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    // Second session: Top still has a real Accept; Back-off never does, and
    // shows the link explanation instead.
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(1);
    await expect(page.getByText(/70% of Top/).first()).toBeVisible();

    // Bundle assembly independently confirms only Top's key is offered —
    // the server-side half of the fix, not only the card hiding it.
    const res = await page.request.get("/api/today-bundle");
    const b = (await res.json()) as {
      today?: { exercises?: { pendingRecommendations?: { groupKey: string }[] }[] };
    };
    expect(b.today?.exercises?.[0]?.pendingRecommendations).toHaveLength(1);
  });

  // Stage B remediation V-1 (set-groups-stage-b-remediation-verification.md
  // §7) — the review's own reproduction: an independent group earns a
  // pending recommendation, gets linked (F-2 hides it), a session is
  // completed WHILE linked with a real, differently-loaded set actually
  // logged into it, and then it's unlinked. Before this fix the OLD,
  // pre-link target resurfaced as a competing "Accept" card; this proves it
  // no longer does, while Top's own independent progression and a
  // subsequent, legitimate evaluation both keep working.
  test("V-1 — a stale pending recommendation does not resurface as a competing card after unlink, once real work was logged into that group while linked", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page);
    await ensureNoActiveSession(page);
    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG V1 ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const scheme = {
      v: 1,
      scheme: {
        type: "groups",
        groups: [
          { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 }, baselineLoadKg: 140 },
          {
            label: "Back-off",
            sets: { min: 2, max: 2 },
            reps: { min: 6, max: 8 },
            baselineLoadKg: 100,
          },
        ],
      },
    };
    const { templateId, prescriptionId, groupKeys } = await createGroupedTemplate(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      scheme,
      { strategyId: "load-progression" },
    );
    owned.templateId = templateId;
    const backoffKey = groupKeys[1]!;

    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);
    const chipRow = page.getByRole("group", { name: "Select group" });
    const weightInput = page.getByLabel("Weight in kilograms");
    const repsInput = page.getByLabel("Repetitions");

    // Session 1 (unlinked) — both groups earn a real, independent pending
    // recommendation.
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await weightInput.fill("140");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 0/2" })).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await weightInput.fill("100");
      await repsInput.fill("7");
      await page.getByLabel("Reps in reserve").fill("2");
      await page.getByRole("button", { name: "Log", exact: true }).click();
    }
    await waitForOutboxDrained(page);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/today-bundle");
          const b = (await res.json()) as {
            today?: { exercises?: { pendingRecommendations?: { groupKey: string }[] }[] };
          };
          return (b.today?.exercises?.[0]?.pendingRecommendations ?? []).length;
        },
        { timeout: 20_000 },
      )
      .toBe(2);

    // Link Back-off to Top through the real editor form.
    await page.goto(`/prescriptions/${prescriptionId}/edit`);
    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await group2.getByLabel("Reference group").selectOption({ label: "Top" });
    await group2.getByLabel("Percent of reference top set").fill("70");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    // Session 2 (linked) — F-2's existing filter still holds: only Top's
    // Accept shows. Top progresses independently to a NEW value; Back-off is
    // actually logged at a DIFFERENT load than the stale session-1 target
    // (typed over the derived clean proposal, a dirty draft), even though
    // its own evaluation is skipped while linked.
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(1);
    await weightInput.fill("150");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 0/2" })).toBeVisible();
    await expect(page.getByText(/70% of Top \(150 kg\)/)).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await weightInput.fill("90");
      await repsInput.fill("7");
      await page.getByLabel("Reps in reserve").fill("2");
      await page.getByRole("button", { name: "Log", exact: true }).click();
    }
    await waitForOutboxDrained(page);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Complete workout" }).click();
    await page.waitForURL(/\/today$/);
    await waitForOutboxDrained(page);

    // Unlink Back-off through the real editor form.
    await page.goto(`/prescriptions/${prescriptionId}/edit`);
    const group2Again = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2Again
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    // The core regression: the stale, pre-link target must not resurface as
    // a competing decision card. Top's own fresh session-2 recommendation is
    // the only one offered.
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(1);
    const res = await page.request.get("/api/today-bundle");
    const b = (await res.json()) as {
      today?: { exercises?: { pendingRecommendations?: { groupKey: string }[] }[] };
    };
    expect(
      b.today?.exercises?.[0]?.pendingRecommendations?.some((r) => r.groupKey === backoffKey),
    ).toBe(false);
  });

  test("F-3 — changing the slot strategy after linking keeps the linked group forced to manual, with no untick/re-tick needed", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E SG F3 ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(
      page,
      (await getActiveProgramInfo(page)).programId,
      `${unique} Template`,
    );
    owned.templateId = templateId;

    const prescriptionRes = await page.request.post(`/api/templates/${templateId}/prescriptions`, {
      data: {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { refIndex: 0, percent: 80 },
              },
            ],
          },
        },
        progression: {
          strategyId: "manual",
          groupOverridesByIndex: { "1": { strategyId: "manual" } },
        },
      },
    });
    expect(prescriptionRes.ok(), await prescriptionRes.text()).toBe(true);
    const { prescription } = (await prescriptionRes.json()) as { prescription: { id: string } };

    await page.goto(`/prescriptions/${prescription.id}/edit`);
    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(
      group2.getByText("Manual progression (required for a percentage-linked group)."),
    ).toBeVisible();

    // Change the SLOT strategy — the review's exact reproduction (PROBE D).
    // No untick/re-tick of the link control is performed.
    await page
      .getByLabel("Progression strategy")
      .last()
      .selectOption({ label: "Load progression" });
    await page.getByRole("button", { name: "Save changes" }).click();
    // Before the fix this stayed on the edit page with an
    // "incompatible_prescription" HTTP 400; the fix makes it succeed.
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));

    const confirmRes = await page.request.get(`/api/prescriptions/${prescription.id}`);
    const { prescription: confirmed } = (await confirmRes.json()) as {
      prescription: {
        scheme: { scheme: { groups: { key: string; label: string }[] } };
        progression: { strategyId: string; groups?: Record<string, { strategyId: string }> };
      };
    };
    expect(confirmed.progression.strategyId).toBe("load-progression");
    const backoffKey = confirmed.scheme.scheme.groups.find((g) => g.label === "Back-off")!.key;
    expect(confirmed.progression.groups?.[backoffKey]?.strategyId).toBe("manual");
  });

  test("F-8 — removing the reference group explicitly clears the dependent link, with a visible notice", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E SG F8 Remove ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(
      page,
      (await getActiveProgramInfo(page)).programId,
      `${unique} Template`,
    );
    owned.templateId = templateId;

    await page.goto(`/templates/${templateId}/prescriptions/new`);
    await page.getByLabel("Exercise").selectOption({ label: exercise.name });
    await page.getByLabel("Scheme").selectOption({ label: "Set groups (top set / back-offs)" });

    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group2
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await group2.getByLabel("Reference group").selectOption({ label: "Top" });
    await group2.getByLabel("Percent of reference top set").fill("80");
    await expect(
      group2.getByLabel("Link this group’s load to an earlier group’s top set (percentage)"),
    ).toBeChecked();

    // Remove Top (Group 1) — Back-off's reference no longer exists.
    const group1 = page
      .getByLabel("Group 1 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await group1.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(/Link cleared for Back-off/)).toBeVisible();
    await expect(page.getByText(/Progression strategy reset to "Same as exercise"/)).toBeVisible();

    // The sole remaining group is now index 0 — no earlier group exists to
    // link to, so the whole link control is gone, not merely unchecked.
    const remainingGroup = page
      .getByLabel("Group 1 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(
      remainingGroup.getByLabel(
        "Link this group’s load to an earlier group’s top set (percentage)",
      ),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));
    const listRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
    const { prescriptions } = (await listRes.json()) as {
      prescriptions: { scheme: { scheme: { groups: { link?: unknown }[] } } }[];
    };
    expect(prescriptions[0]!.scheme.scheme.groups.every((g) => g.link === undefined)).toBe(true);
  });

  test("F-8 — a reference group itself becoming linked explicitly clears its dependent's link, with a visible notice", async ({
    page,
  }) => {
    await login(page);
    const unique = `E2E SG F8 Chain ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const templateId = await createEmptyTemplate(
      page,
      (await getActiveProgramInfo(page)).programId,
      `${unique} Template`,
    );
    owned.templateId = templateId;

    await page.goto(`/templates/${templateId}/prescriptions/new`);
    await page.getByLabel("Exercise").selectOption({ label: exercise.name });
    await page.getByLabel("Scheme").selectOption({ label: "Set groups (top set / back-offs)" });
    // Default draft has Top + Back-off; add a third so the slot is Top,
    // Mid, Back-off (index 0, 1, 2).
    await page.getByRole("button", { name: "+ Add group" }).click();
    await page.getByLabel("Group 2 label").fill("Mid");
    await page.getByLabel("Group 3 label").fill("Back-off");

    const group2 = page
      .getByLabel("Group 2 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    const group3 = page
      .getByLabel("Group 3 label")
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');

    // Back-off links to Mid first.
    await group3
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await group3.getByLabel("Reference group").selectOption({ label: "Mid" });
    await group3.getByLabel("Percent of reference top set").fill("80");

    // Now link Mid itself to Top — Mid is no longer an eligible (unlinked)
    // reference, so Back-off's link must be explicitly cleared, never
    // silently repointed (e.g. at Top).
    await group2
      .getByLabel("Link this group’s load to an earlier group’s top set (percentage)")
      .check();
    await expect(page.getByText(/Link cleared for Back-off/)).toBeVisible();
    await expect(
      group3.getByLabel("Link this group’s load to an earlier group’s top set (percentage)"),
    ).not.toBeChecked();

    // Stage B remediation V-2 (set-groups-stage-b-remediation-verification.md
    // §7) — this notice used to be erased by ANY subsequent group-list
    // mutation, including an unrelated edit to a different field of the SAME
    // group that triggered it, defeating F-6's warning in exactly the flow it
    // exists to protect: "clear a link, then keep editing". Filling in Mid's
    // OWN reference/percent right here is precisely that "edit another
    // field" step — it invalidates nothing new, so the warning must remain
    // visible through it, not silently vanish.
    await group2.getByLabel("Reference group").selectOption({ label: "Top" });
    await group2.getByLabel("Percent of reference top set").fill("90");
    await expect(page.getByText(/Link cleared for Back-off/)).toBeVisible();

    // Explicit dismissal is the other half of the lifecycle: it clears the
    // notice on demand, rather than it lingering forever or vanishing on its
    // own.
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText(/Link cleared for Back-off/)).not.toBeVisible();

    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForURL(new RegExp(`/templates/${templateId}$`));
    const listRes = await page.request.get(`/api/templates/${templateId}/prescriptions`);
    const { prescriptions } = (await listRes.json()) as {
      prescriptions: {
        scheme: { scheme: { groups: { label: string; link?: { ref: string } }[] } };
      }[];
    };
    const groups = prescriptions[0]!.scheme.scheme.groups;
    expect(groups.find((g) => g.label === "Mid")!.link).toBeDefined();
    expect(groups.find((g) => g.label === "Back-off")!.link).toBeUndefined();
  });

  test("F-9 — a linked group's derived load survives offline completion, an offline reload, and cross-device adoption", async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(90_000);
    await login(page);
    await ensureNoActiveSession(page);
    const programInfo = await getActiveProgramInfo(page);
    owned.programInfo = programInfo;
    const unique = `E2E SG F9 ${Date.now()}`;
    const exercise = await createExerciseByName(page, unique);
    const scheme = {
      v: 1,
      scheme: {
        type: "groups",
        groups: [
          { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 }, baselineLoadKg: 140 },
          {
            label: "Back-off",
            sets: { min: 2, max: 2 },
            reps: { min: 6, max: 8 },
            baselineLoadKg: 110,
            link: { refIndex: 0, percent: 80 },
          },
        ],
      },
    };
    const { templateId } = await createGroupedTemplate(
      page,
      programInfo.programId,
      exercise.id,
      `${unique} Template`,
      scheme,
      { strategyId: "load-progression", groupOverridesByIndex: { "1": { strategyId: "manual" } } },
    );
    owned.templateId = templateId;

    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);
    await waitForOutboxDrained(page);

    // One online reload claims SW control before the offline steps below
    // (clientsClaim: false — the established offline-*.spec.ts pattern).
    await page.reload();
    await expect(page.getByRole("button", { name: "Log", exact: true })).toBeVisible();

    await context.setOffline(true);

    const chipRow = page.getByRole("group", { name: "Select group" });
    const weightInput = page.getByLabel("Weight in kilograms");
    const repsInput = page.getByLabel("Repetitions");
    await weightInput.fill("130");
    await repsInput.fill("2");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Top 1/1" })).toBeVisible();
    // Offline: the link resolves purely client-side — 130 kg × 80% = 104,
    // rounded to 105 at the exercise's 2.5 kg step.
    await expect(weightInput).toHaveValue("105");
    await expect(page.getByText("80% of Top (130 kg) → 105 kg proposed")).toBeVisible();

    // Offline RELOAD: the same derived value must resolve identically from
    // the frozen snapshot + current sets after a real reload, still offline
    // — before any Back-off set has been logged.
    await page.reload();
    await expect(page.getByText(exercise.name, { exact: true })).toBeVisible();
    await expect(weightInput).toHaveValue("105");
    await expect(page.getByText("80% of Top (130 kg) → 105 kg proposed")).toBeVisible();

    // Log Back-off's first set AT the proposed value — the fact the second
    // set (below, on device B) must copy forward, never re-derive.
    await repsInput.fill("7");
    await page.getByLabel("Reps in reserve").fill("2");
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(chipRow.getByRole("button", { name: "Back-off 1/2" })).toBeVisible();

    await context.setOffline(false);
    await waitForOutboxDrained(page);

    // Cross-device ADOPTION: a fresh browser context, same account, resumes
    // the SAME in-progress session and must derive the identical state cold
    // — proving the link survives the wire/IndexedDB round trip, not only a
    // same-device reload.
    const deviceB = await browser.newContext();
    try {
      const pageB = await deviceB.newPage();
      await login(pageB);
      await expect(pageB.getByText(/A workout is already in progress/)).toBeVisible();
      await pageB.getByRole("button", { name: "Resume here" }).click();
      await pageB.waitForURL(/\/today\/workout$/);
      const chipRowB = pageB.getByRole("group", { name: "Select group" });
      await expect(chipRowB.getByRole("button", { name: "Back-off 1/2" })).toBeVisible();
      const weightInputB = pageB.getByLabel("Weight in kilograms");
      const repsInputB = pageB.getByLabel("Repetitions");
      // Back-off already has its OWN logged set (105 kg) — this copies the
      // athlete's own previous log, never re-deriving from the link (§6.2's
      // "later sets copy own log" rule), proving both the link's own
      // persistence AND the copy-forward rule survive adoption together.
      await expect(weightInputB).toHaveValue("105");
      await expect(repsInputB).toHaveValue("7");
      await expect(pageB.getByText("Linked to 80% of Top (130 kg).")).toBeVisible();

      await repsInputB.fill("7");
      await pageB.getByLabel("Reps in reserve").fill("2");
      await pageB.getByRole("button", { name: "Log", exact: true }).click();
      await expect(chipRowB.getByRole("button", { name: "Back-off 2/2" })).toBeVisible();

      pageB.once("dialog", (d) => void d.accept());
      await pageB.getByRole("button", { name: "Complete workout" }).click();
      await pageB.waitForURL(/\/today$/);
      await waitForOutboxDrained(pageB);
    } finally {
      await deviceB.close();
    }
  });
});
