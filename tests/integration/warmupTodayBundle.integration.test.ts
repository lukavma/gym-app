import { beforeEach, describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { newId } from "@/domain/ids/uuidv7";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { activateBlock, createBlock } from "@/server/blocks/service";
import { createPrescription } from "@/server/prescriptions/service";
import { buildTodayBundle } from "@/server/today/service";
import { applySyncBatch } from "@/server/sync/service";
import { getWeeklyVolumeReport } from "@/server/volume/service";
import {
  createWarmupRoutine,
  deleteWarmupRoutine,
  replaceWarmupRoutine,
  setTemplateWarmupRoutines,
} from "@/server/warmupRoutines/service";
import { recommendations, sessionExercises, setLogs, workoutSessions } from "@/db/schema";
import { wrapPrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";
import { loadProgressionConfigSchema } from "@/domain/progression/registry";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Warm-up Routines v1 — what the Today bundle carries (O-2/O-6), and the
// hard boundaries: no warm-up execution fact is persisted anywhere, and the
// presence of warm-up definitions changes neither progression nor volume.

const fixedScheme = { v: 1 as const, scheme: { type: "fixed" as const, sets: 3, reps: 5 } };
const loadProgressionConfig = loadProgressionConfigSchema.parse({ incrementKg: 2.5 });

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const upperItems = [
  { label: "Bike", instruction: "5 min easy" },
  { label: "Band external rotation", instruction: "2x15 light" },
  { label: "Horizontal rotation", instruction: null },
];

describe("warm-up routines in the Today bundle (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let templateId: string;
  let otherTemplateId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;

    const exercise = await createExercise(db, userId, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    const program = await createProgram(db, userId, { name: "Program A" });
    const upperA = await createTemplate(db, userId, program.id, { name: "Upper A" });
    const upperB = await createTemplate(db, userId, program.id, { name: "Upper B" });
    if (!upperA || !upperB) throw new Error("expected templates");
    templateId = upperA.id;
    otherTemplateId = upperB.id;

    await createPrescription(db, userId, upperA.id, {
      exerciseId: exercise.id,
      scheme: fixedScheme,
      progression: { strategyId: "manual" },
    });

    // Rotation-mode schedule with a single entry: resolves to Upper A on
    // every calendar day, which keeps these assertions weekday-independent
    // (the same trick tests/e2e/seed.ts uses).
    const block = await createBlock(db, userId, program.id, {
      name: "Block A",
      goal: "hypertrophy",
      startDate: "2026-08-01",
      weeksPlanned: 6,
      schedule: [{ templateId: upperA.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);
  });

  function scheduledToday(bundle: Awaited<ReturnType<typeof buildTodayBundle>>) {
    if (bundle.today.kind !== "scheduled") {
      throw new Error(`expected a scheduled today, got ${bundle.today.kind}`);
    }
    return bundle.today;
  }

  it("carries no routines and no default when the template links none", async () => {
    const today = scheduledToday(await buildTodayBundle(db, userId));
    expect(today.warmupRoutines).toEqual([]);
    expect(today.defaultWarmupRoutineId).toBeNull();
  });

  it("carries ONLY the resolved template's linked routines, in link order, with their items", async () => {
    const upper = await createWarmupRoutine(db, userId, {
      name: "Upper Standard",
      items: upperItems,
    });
    const shoulders = await createWarmupRoutine(db, userId, {
      name: "Shoulder Prep",
      items: [{ label: "Horizontal rotation", instruction: "10 controlled reps" }],
    });
    // Deliberately NOT linked to today's template — the switcher must never
    // see this one (owner decision O-2).
    const hips = await createWarmupRoutine(db, userId, {
      name: "Hip Prep",
      items: [{ label: "90/90", instruction: null }],
    });
    await setTemplateWarmupRoutines(db, userId, otherTemplateId, {
      routineIds: [hips.id],
      defaultRoutineId: hips.id,
    });

    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [shoulders.id, upper.id],
      defaultRoutineId: upper.id,
    });

    const today = scheduledToday(await buildTodayBundle(db, userId));
    expect(today.warmupRoutines.map((r) => r.name)).toEqual(["Shoulder Prep", "Upper Standard"]);
    expect(today.defaultWarmupRoutineId).toBe(upper.id);
    expect(today.warmupRoutines.find((r) => r.id === upper.id)?.items).toEqual([
      { label: "Bike", instruction: "5 min easy" },
      { label: "Band external rotation", instruction: "2x15 light" },
      { label: "Horizontal rotation", instruction: null },
    ]);
    expect(today.warmupRoutines.some((r) => r.id === hips.id)).toBe(false);
  });

  it("carries linked routines with a null default when none is marked (the compact-chooser case)", async () => {
    const upper = await createWarmupRoutine(db, userId, { name: "Upper", items: upperItems });
    const shoulders = await createWarmupRoutine(db, userId, {
      name: "Shoulders",
      items: [{ label: "a", instruction: null }],
    });
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [upper.id, shoulders.id],
      defaultRoutineId: null,
    });

    const today = scheduledToday(await buildTodayBundle(db, userId));
    expect(today.warmupRoutines).toHaveLength(2);
    expect(today.defaultWarmupRoutineId).toBeNull();
  });

  it("propagates a template association edit to the next bundle (O-6's Today preview stays current)", async () => {
    const upper = await createWarmupRoutine(db, userId, { name: "Upper", items: upperItems });
    const shoulders = await createWarmupRoutine(db, userId, {
      name: "Shoulders",
      items: [{ label: "a", instruction: null }],
    });

    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [upper.id],
      defaultRoutineId: upper.id,
    });
    expect(scheduledToday(await buildTodayBundle(db, userId)).defaultWarmupRoutineId).toBe(
      upper.id,
    );

    // Re-curate: different set, different default.
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [shoulders.id, upper.id],
      defaultRoutineId: shoulders.id,
    });
    const after = scheduledToday(await buildTodayBundle(db, userId));
    expect(after.warmupRoutines.map((r) => r.name)).toEqual(["Shoulders", "Upper"]);
    expect(after.defaultWarmupRoutineId).toBe(shoulders.id);

    // Clearing the default keeps the links but drops the preview.
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [shoulders.id, upper.id],
      defaultRoutineId: null,
    });
    expect(scheduledToday(await buildTodayBundle(db, userId)).defaultWarmupRoutineId).toBeNull();

    // Clearing the links empties the whole thing.
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [],
      defaultRoutineId: null,
    });
    const cleared = scheduledToday(await buildTodayBundle(db, userId));
    expect(cleared.warmupRoutines).toEqual([]);
    expect(cleared.defaultWarmupRoutineId).toBeNull();
  });

  it("propagates a routine RENAME and item edit to the next bundle", async () => {
    const upper = await createWarmupRoutine(db, userId, { name: "Upper", items: upperItems });
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [upper.id],
      defaultRoutineId: upper.id,
    });

    await replaceWarmupRoutine(db, userId, upper.id, {
      name: "Upper v2",
      items: [{ label: "Rower", instruction: "3 min" }],
    });

    const today = scheduledToday(await buildTodayBundle(db, userId));
    expect(today.warmupRoutines[0]?.name).toBe("Upper v2");
    expect(today.warmupRoutines[0]?.items).toEqual([{ label: "Rower", instruction: "3 min" }]);
  });

  it("a deleted routine simply disappears from the next bundle (SET-free hard delete, R-4)", async () => {
    const upper = await createWarmupRoutine(db, userId, { name: "Upper", items: upperItems });
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [upper.id],
      defaultRoutineId: upper.id,
    });
    await deleteWarmupRoutine(db, userId, upper.id);

    const today = scheduledToday(await buildTodayBundle(db, userId));
    expect(today.warmupRoutines).toEqual([]);
    expect(today.defaultWarmupRoutineId).toBeNull();
  });

  it("does not leak another user's routines into the bundle", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await createWarmupRoutine(db, otherUserId, {
      name: "Not Mine",
      items: [{ label: "a", instruction: null }],
    });

    const today = scheduledToday(await buildTodayBundle(db, userId));
    expect(today.warmupRoutines).toEqual([]);
  });

  it("leaves every pre-existing bundle field untouched", async () => {
    const upper = await createWarmupRoutine(db, userId, { name: "Upper", items: upperItems });
    await setTemplateWarmupRoutines(db, userId, templateId, {
      routineIds: [upper.id],
      defaultRoutineId: upper.id,
    });

    const bundle = await buildTodayBundle(db, userId);
    const today = scheduledToday(bundle);
    expect(today.templateName).toBe("Upper A");
    expect(today.exercises).toHaveLength(1);
    expect(today.exercises[0]?.exerciseName).toBe("Bench Press");
    expect(today.exercises[0]?.prefill).toBeDefined();
    expect(bundle.activeSession).toBeNull();
    expect(typeof bundle.generatedAt).toBe("string");
    // The account default (`users.timezone`), threaded through unchanged.
    expect(bundle.timezone).toBe("Europe/Ljubljana");
  });
});

// The equivalence and no-persisted-facts checks run each arm in its OWN
// freshly migrated database. That isolation is load-bearing rather than
// tidiness: running both sessions against one database makes the second
// arm's `historyDepthUsed` differ purely because the first session exists,
// which would fail for a reason that has nothing to do with warm-ups. Two
// databases give the engine byte-identical inputs, so any difference in the
// output can only come from the one thing that differs — whether the
// template has warm-up routines attached.
interface Scenario {
  db: AppDb;
  userId: string;
  templateId: string;
  blockId: string;
  exerciseId: string;
  routineId: string | null;
}

async function setupScenario(options: { withWarmup: boolean }): Promise<Scenario> {
  const db = await createTestDb();
  await seedMuscleGroups(db);
  const userId = (await insertTestUser(db)).id;

  const exercise = await createExercise(db, userId, {
    name: "Bench Press",
    equipment: "barbell",
    mechanics: "compound",
    laterality: "bilateral",
    loadStepKg: 2.5,
    contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
  });
  const program = await createProgram(db, userId, { name: "Program A" });
  const template = await createTemplate(db, userId, program.id, { name: "Upper A" });
  if (!template) throw new Error("expected template");
  await createPrescription(db, userId, template.id, {
    exerciseId: exercise.id,
    scheme: fixedScheme,
    progression: { strategyId: "load-progression" },
  });
  const block = await createBlock(db, userId, program.id, {
    name: "Block A",
    goal: "hypertrophy",
    startDate: "2026-08-01",
    weeksPlanned: 6,
    schedule: [{ templateId: template.id }],
  });
  if (!block) throw new Error("expected block");
  await activateBlock(db, userId, block.id);

  let routineId: string | null = null;
  if (options.withWarmup) {
    const routine = await createWarmupRoutine(db, userId, {
      name: "Upper Standard",
      items: upperItems,
    });
    routineId = routine.id;
    await setTemplateWarmupRoutines(db, userId, template.id, {
      routineIds: [routine.id],
      defaultRoutineId: routine.id,
    });
  }

  return {
    db,
    userId,
    templateId: template.id,
    blockId: block.id,
    exerciseId: exercise.id,
    routineId,
  };
}

// The exact op sequence one completed workout puts on the wire. Identical
// for both arms — this is what "identical work sets" means concretely.
function buildSessionOps(scenario: Scenario, startedAt: string, weightKg: number) {
  const sessionId = newId();
  const sessionExerciseId = newId();
  const completedAt = new Date(new Date(startedAt).getTime() + 60 * 60 * 1000).toISOString();

  const ops: SyncOpEnvelope[] = [
    {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: {
        id: sessionId,
        blockId: scenario.blockId,
        templateId: scenario.templateId,
        templateName: "Upper A",
        weekIndex: 1,
        isDeload: false,
        startedAt,
      },
    },
    {
      opId: newId(),
      entity: "sessionExercise",
      operation: "upsert",
      payload: {
        id: sessionExerciseId,
        sessionId,
        exerciseId: scenario.exerciseId,
        position: 0,
        source: "template",
        prescription: wrapPrescriptionSnapshot({
          exerciseId: scenario.exerciseId,
          exerciseName: "Bench Press",
          scheme: { type: "fixed", sets: 3, reps: 5 },
          targetRir: { min: 0, max: 2 },
          restSeconds: 120,
          progression: {
            strategyId: "load-progression",
            strategyVersion: 1,
            config: loadProgressionConfig as Record<string, unknown>,
            classification: "heuristic",
          },
          appliedModifiers: null,
          prefill: { loadKg: weightKg, reps: 5 },
        }),
      },
    },
    ...[0, 1, 2].map((index): SyncOpEnvelope => ({
      opId: newId(),
      entity: "setLog",
      operation: "upsert",
      payload: {
        id: newId(),
        sessionExerciseId,
        setNumber: index + 1,
        weightKg,
        reps: 5,
        rir: 2,
        loggedAt: startedAt,
      },
    })),
    {
      opId: newId(),
      entity: "workoutSession",
      operation: "upsert",
      payload: { id: sessionId, status: "completed", completedAt },
    },
  ];

  return { ops, sessionId };
}

const SESSION_AT = "2026-08-10T10:00:00.000Z";

// `AppDb` is the common `PgDatabase` base type shared by `pg` and PGlite
// (src/db/client.ts), whose `execute()` is generic and resolves to `unknown`
// here. These tests deliberately use raw SQL — the point is to inspect what
// PostgreSQL actually holds, not what the query builder believes — so the
// row shape is asserted at the call site instead.
async function rawRows<T extends Record<string, unknown>>(db: AppDb, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

describe("warm-up routines create no execution facts (PGlite integration)", () => {
  it("a completed workout on a warm-up-linked template writes nothing warm-up-related to any execution table", async () => {
    const scenario = await setupScenario({ withWarmup: true });
    const { ops } = buildSessionOps(scenario, SESSION_AT, 100);
    expect((await applySyncBatch(scenario.db, scenario.userId, ops)).rejected).toEqual([]);

    // Direct database inspection: cast every execution ROW to text (not the
    // catalog) and look for anything that only exists because a warm-up
    // routine exists. Casting rows means the unrelated `set_logs.is_warmup`
    // COLUMN name cannot false-positive (I-8's vocabulary separation).
    const dumps = await Promise.all(
      [workoutSessions, sessionExercises, setLogs, recommendations].map((table) =>
        rawRows<{ row: string }>(scenario.db, sql`select ${table}::text as row from ${table}`),
      ),
    );
    const dumped = dumps
      .flat()
      .map((row) => String(row.row))
      .join("\n");

    expect(dumped.length).toBeGreaterThan(0);
    for (const marker of [
      "Upper Standard",
      "Bike",
      "Band external rotation",
      "5 min easy",
      scenario.routineId ?? "unreachable",
    ]) {
      expect(dumped, `execution tables leaked warm-up data: ${marker}`).not.toContain(marker);
    }
    expect(dumped.toLowerCase()).not.toContain("warmup_routine");

    // Negative control: the same dump DOES contain the facts it should, so
    // the absences above are real absences, not an empty scan.
    expect(dumped).toContain("Bench Press");
    expect(dumped).toContain("completed");
  });

  it("no execution table gained a warm-up column, and the three new tables are the only warm-up ones", async () => {
    const scenario = await setupScenario({ withWarmup: true });

    const columns = await rawRows<{ table_name: string; column_name: string }>(
      scenario.db,
      sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public' and column_name ilike '%warmup%'
        order by table_name, column_name
      `,
    );
    // `set_logs.is_warmup` is the only pre-existing match, and it is
    // untouched by this feature. Nothing else acquired a warm-up column.
    expect(columns.map((r) => `${r.table_name}.${r.column_name}`)).toEqual(["set_logs.is_warmup"]);

    const tables = await rawRows<{ table_name: string }>(
      scenario.db,
      sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name like '%warmup%'
        order by table_name
      `,
    );
    expect(tables.map((r) => r.table_name)).toEqual([
      "warmup_routine_items",
      "warmup_routines",
      "workout_template_warmup_routines",
    ]);
  });

  it("identical work sets give identical progression output, warm-up routines or not", async () => {
    const withWarmup = await setupScenario({ withWarmup: true });
    const without = await setupScenario({ withWarmup: false });

    const a = buildSessionOps(withWarmup, SESSION_AT, 100);
    const b = buildSessionOps(without, SESSION_AT, 100);
    expect((await applySyncBatch(withWarmup.db, withWarmup.userId, a.ops)).rejected).toEqual([]);
    expect((await applySyncBatch(without.db, without.userId, b.ops)).rejected).toEqual([]);

    // Everything that must be identical: what the engine decided and why,
    // plus the inputs it decided from. Ids, timestamps and foreign keys
    // necessarily differ between two independent databases.
    const decision = (row: typeof recommendations.$inferSelect | undefined) => ({
      action: row?.action,
      target: row?.target,
      strategyId: row?.strategyId,
      strategyVersion: row?.strategyVersion,
      classification: row?.classification,
      reasonCodes: row?.reasonCodes,
      confidence: row?.confidence,
      inputs: row?.inputs,
      computedBy: row?.computedBy,
      decisionStatus: row?.decisionStatus,
    });

    const recA = (await withWarmup.db.select().from(recommendations))[0];
    const recB = (await without.db.select().from(recommendations))[0];
    expect(recA).toBeDefined();
    expect(recB).toBeDefined();
    expect(decision(recA)).toEqual(decision(recB));

    // Not vacuous: the engine really did produce a decision here.
    expect(recA?.action).toBe("increase_load");
  });

  it("negative control: a genuine difference in the work sets DOES change the progression output", async () => {
    const heavy = await setupScenario({ withWarmup: true });
    const light = await setupScenario({ withWarmup: true });

    expect(
      (await applySyncBatch(heavy.db, heavy.userId, buildSessionOps(heavy, SESSION_AT, 100).ops))
        .rejected,
    ).toEqual([]);
    expect(
      (await applySyncBatch(light.db, light.userId, buildSessionOps(light, SESSION_AT, 60).ops))
        .rejected,
    ).toEqual([]);

    const recHeavy = (await heavy.db.select().from(recommendations))[0];
    const recLight = (await light.db.select().from(recommendations))[0];
    expect(recHeavy?.target).not.toEqual(recLight?.target);
  });

  it("identical work sets give identical volume output, warm-up routines or not", async () => {
    const withWarmup = await setupScenario({ withWarmup: true });
    const without = await setupScenario({ withWarmup: false });

    expect(
      (
        await applySyncBatch(
          withWarmup.db,
          withWarmup.userId,
          buildSessionOps(withWarmup, SESSION_AT, 100).ops,
        )
      ).rejected,
    ).toEqual([]);
    expect(
      (
        await applySyncBatch(
          without.db,
          without.userId,
          buildSessionOps(without, SESSION_AT, 100).ops,
        )
      ).rejected,
    ).toEqual([]);

    const now = new Date(SESSION_AT);
    const reportA = await getWeeklyVolumeReport(withWarmup.db, withWarmup.userId, now);
    const reportB = await getWeeklyVolumeReport(without.db, without.userId, now);

    const weeks = (report: Awaited<ReturnType<typeof getWeeklyVolumeReport>>) =>
      report.weeks.map((week) => ({
        startDate: week.startDate,
        endDateExclusive: week.endDateExclusive,
        isDeload: week.isDeload,
        leaves: week.leaves,
        rollups: week.rollups,
      }));

    expect(weeks(reportA)).toEqual(weeks(reportB));

    // Not vacuous: the warm-up arm really did count three chest work sets.
    expect(reportA.weeks[0]?.leaves.chest.effective).toBe(3);
  });

  it("negative control: a genuine difference in the work sets DOES change the volume output", async () => {
    const three = await setupScenario({ withWarmup: true });
    expect(
      (await applySyncBatch(three.db, three.userId, buildSessionOps(three, SESSION_AT, 100).ops))
        .rejected,
    ).toEqual([]);

    const one = await setupScenario({ withWarmup: true });
    const oneOps = buildSessionOps(one, SESSION_AT, 100);
    // Drop two of the three set-log ops.
    const trimmed = oneOps.ops.filter((op) => op.entity !== "setLog" || op.payload.setNumber === 1);
    expect((await applySyncBatch(one.db, one.userId, trimmed)).rejected).toEqual([]);

    const now = new Date(SESSION_AT);
    expect(
      (await getWeeklyVolumeReport(three.db, three.userId, now)).weeks[0]?.leaves.chest.effective,
    ).toBe(3);
    expect(
      (await getWeeklyVolumeReport(one.db, one.userId, now)).weeks[0]?.leaves.chest.effective,
    ).toBe(1);
  });
});
