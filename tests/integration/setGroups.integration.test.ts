import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { exercisePrescriptions, recommendations, setLogs, users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock, activateBlock } from "@/server/blocks/service";
import {
  createPrescription,
  updatePrescription,
  PrescriptionCompatibilityError,
} from "@/server/prescriptions/service";
import { setSchemeAuthoringEnvelopeSchema } from "@/domain/schemes/setScheme";
import { buildTodayBundle, getActiveSession } from "@/server/today/service";
import { applySyncBatch } from "@/server/sync/service";
import { getExerciseStrengthReport } from "@/server/strength/service";
import { buildSetDeletionOps, type SetLogRowFields } from "@/domain/sync/setDeletionOps";
import { newId } from "@/domain/ids/uuidv7";
import type { SyncOpEnvelope } from "@/domain/sync/schema";
import type { InputsSummary } from "@/domain/progression/engine";

// set-groups-architecture-evaluation.md — Stage A integration coverage
// against real SQL (PGlite, same harness as progression.integration.test.ts):
// per-group evaluation on completion, the CRITICAL INVARIANT that only the
// first `sets.min` attributed sets ever gate (never the best-performing
// ones), the partial-unique-index negative control (NC-3) restated per
// group key, re-evaluation restricted to still-pending keys (M-3/A-13b/
// NC-6), sync-level group-key validation (§4.4 rule 2), the ungrouped
// byte-identity negative control (NC-9) at the STORED jsonb level, and the
// C-1/D-6(a) legacy-history bridge on conversion.

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("Set Groups Stage A — server orchestration (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let exerciseId: string;
  let templateId: string;
  let blockId: string;
  let topKey: string;
  let backoffKey: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    userId = (await insertTestUser(db)).id;
    const exercise = await createExercise(db, userId, {
      name: "Trap Bar Deadlift",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    exerciseId = exercise.id;
    const program = await createProgram(db, userId, { name: "Program A" });
    const template = await createTemplate(db, userId, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    templateId = template.id;

    const prescription = await createPrescription(db, userId, template.id, {
      exerciseId,
      scheme: {
        v: 1,
        scheme: {
          type: "groups",
          groups: [
            { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
            { label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
          ],
        },
      },
      progression: { strategyId: "load-progression" },
    });
    if (!prescription || prescription.scheme.scheme.type !== "groups") {
      throw new Error("expected a groups prescription");
    }
    topKey = prescription.scheme.scheme.groups[0]!.key;
    backoffKey = prescription.scheme.scheme.groups[1]!.key;

    const block = await createBlock(db, userId, program.id, {
      name: "Block A",
      goal: "hypertrophy",
      startDate: "2026-08-01",
      weeksPlanned: 6,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    blockId = block.id;
    await activateBlock(db, userId, block.id);
  });

  interface GroupSetInput {
    groupKey: string;
    weightKg: number;
    reps: number;
    rir: number | null;
  }

  // The frozen snapshot every grouped session op below carries — built once
  // per test from the live prescription so the groups/keys always match
  // `topKey`/`backoffKey` exactly.
  async function frozenGroupedSnapshot() {
    const [row] = await db
      .select()
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.exerciseId, exerciseId));
    if (!row) throw new Error("expected prescription row");
    const rawProgression = row.progression as {
      strategyId: string;
      config: Record<string, unknown>;
      classification: string;
      groups?: Record<
        string,
        { strategyId: string; config: Record<string, unknown>; classification: string }
      >;
    };
    return {
      v: 1 as const,
      snapshot: {
        exerciseId,
        exerciseName: "Trap Bar Deadlift",
        scheme: row.scheme && (row.scheme as { scheme: unknown }).scheme,
        targetRir: null,
        restSeconds: null,
        // The snapshot's `progression` additionally freezes `strategyVersion`
        // per entry (buildSnapshot.ts) — the stored prescription row doesn't
        // carry it, so this test constructs it the same way that builder
        // does, pinned at 1 (every MVP strategy's current version).
        progression: {
          strategyId: rawProgression.strategyId,
          strategyVersion: 1,
          config: rawProgression.config,
          classification: rawProgression.classification,
          ...(rawProgression.groups
            ? {
                groups: Object.fromEntries(
                  Object.entries(rawProgression.groups).map(([key, rp]) => [
                    key,
                    { ...rp, strategyVersion: 1 },
                  ]),
                ),
              }
            : {}),
        },
        appliedModifiers: null,
        prefill: { loadKg: null, reps: null },
      },
    };
  }

  async function runGroupedSession(
    sets: GroupSetInput[],
    startedAt = "2026-08-10T10:00:00.000Z",
    options: { isDeload?: boolean } = {},
  ) {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setIds = sets.map(() => newId());
    const completedAt = new Date(new Date(startedAt).getTime() + 3600_000).toISOString();
    const snapshot = await frozenGroupedSnapshot();

    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          blockId,
          templateId,
          templateName: "Push Day",
          startedAt,
          isDeload: options.isDeload ?? false,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
        },
      },
      ...sets.map((s, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[index]!,
          sessionExerciseId,
          setNumber: index + 1,
          weightKg: s.weightKg,
          reps: s.reps,
          rir: s.rir,
          groupKey: s.groupKey,
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

    const result = await applySyncBatch(db, userId, ops);
    expect(result.rejected).toEqual([]);
    return { sessionId, sessionExerciseId, setIds };
  }

  it("evaluates each group independently: window = workSets, extras recorded, prescribed.group present", async () => {
    await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 3 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 6, rir: 0 },
    ]);

    const rows = await db.select().from(recommendations).orderBy(asc(recommendations.groupKey));
    expect(rows).toHaveLength(2);

    const top = rows.find((r) => r.groupKey === topKey)!;
    expect(top.action).toBe("increase_load");
    expect(top.target).toEqual({ loadKg: 142.5 });
    const topInputs = top.inputs as InputsSummary;
    expect(topInputs.prescribed.group).toEqual({
      key: topKey,
      label: "Top",
      setsMin: 1,
      setsMax: 1,
    });
    expect(topInputs.workSets).toEqual([{ weightKg: 140, reps: 2, rir: 2 }]);
    expect(topInputs.extraWorkSets).toEqual([]);

    const backoff = rows.find((r) => r.groupKey === backoffKey)!;
    // CRITICAL INVARIANT — the third (hard, RIR 0) back-off set is an audit
    // fact, never a gate: the window is the first 2 recorded sets, which
    // both progress, so the group still progresses despite the hard third.
    expect(backoff.action).toBe("increase_load");
    expect(backoff.target).toEqual({ loadKg: 112.5 });
    const backoffInputs = backoff.inputs as InputsSummary;
    expect(backoffInputs.workSets).toEqual([
      { weightKg: 110, reps: 7, rir: 3 },
      { weightKg: 110, reps: 7, rir: 2 },
    ]);
    expect(backoffInputs.extraWorkSets).toEqual([{ weightKg: 110, reps: 6, rir: 0 }]);
    expect(backoffInputs.prescribed.group).toEqual({
      key: backoffKey,
      label: "Back-off",
      setsMin: 2,
      setsMax: 3,
    });
  });

  it("CRITICAL INVARIANT — evaluates exactly the first sets.min attributed sets by order, never the best-performing ones", async () => {
    await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      // First 2 recorded sets (the window) are short; sets 3 alone being
      // good must not rescue the group — "first min, not best min".
      { groupKey: backoffKey, weightKg: 110, reps: 5, rir: 1 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);

    const rows = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.groupKey, backoffKey));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("hold");
    expect(rows[0]!.reasonCodes).toContain("PRESCRIBED_REPS_NOT_COMPLETED");
  });

  it("a group with no recorded sets reports NO_WORK_SETS_LOGGED without affecting its sibling", async () => {
    await runGroupedSession([
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);

    const rows = await db.select().from(recommendations);
    expect(rows).toHaveLength(2);
    const top = rows.find((r) => r.groupKey === topKey)!;
    expect(top.action).toBe("none");
    expect(top.reasonCodes).toEqual(["NO_WORK_SETS_LOGGED"]);
    const backoff = rows.find((r) => r.groupKey === backoffKey)!;
    expect(backoff.action).toBe("increase_load");
  });

  it("A-15 — a deload session produces zero recommendations for a grouped exercise, for every group", async () => {
    await runGroupedSession(
      [
        { groupKey: topKey, weightKg: 130, reps: 2, rir: 3 },
        { groupKey: backoffKey, weightKg: 100, reps: 7, rir: 3 },
        { groupKey: backoffKey, weightKg: 100, reps: 7, rir: 3 },
      ],
      "2026-08-10T10:00:00.000Z",
      { isDeload: true },
    );
    const rows = await db.select().from(recommendations);
    expect(rows).toEqual([]);
  });

  it("NC-3 — one pending recommendation per (exercise, block, group key); a fresh evaluation supersedes only its own key", async () => {
    await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);
    const afterFirst = await db.select().from(recommendations);
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst.every((r) => r.decisionStatus === "pending")).toBe(true);

    // Raw insert attempting a SECOND pending row for the same (exercise,
    // block, key) must violate uq_recs_one_pending — the DB-level guarantee
    // independent of the service's own supersede-before-insert discipline.
    await expect(
      db.insert(recommendations).values({
        id: newId(),
        userId,
        exerciseId,
        blockId,
        groupKey: topKey,
        sourceSessionId: newId(),
        sourceSessionExerciseId: afterFirst[0]!.sourceSessionExerciseId,
        strategyId: "load-progression",
        strategyVersion: 1,
        classification: "heuristic",
        config: {},
        inputs: {},
        action: "hold",
        target: null,
        reasonCodes: [],
        confidence: "low",
        computedBy: "server",
      }),
    ).rejects.toThrow();

    // A second completed session logs only Top. Every group in the frozen
    // scheme is still evaluated for THIS session (A-5 — a group with zero
    // recorded sets reports NO_WORK_SETS_LOGGED, exactly the within-session
    // "skipped group" rule, now exercised across sessions): Top's own key is
    // superseded by a fresh `increase_load`, and Back-off's own prior
    // pending record is ALSO superseded — by a fresh NO_WORK_SETS_LOGGED
    // record sourced from this session, never left dangling from the old one.
    await runGroupedSession(
      [{ groupKey: topKey, weightKg: 142.5, reps: 2, rir: 2 }],
      "2026-08-12T10:00:00.000Z",
    );
    const afterSecond = await db
      .select()
      .from(recommendations)
      .orderBy(asc(recommendations.createdAt));
    expect(afterSecond).toHaveLength(4);
    const topRows = afterSecond.filter((r) => r.groupKey === topKey);
    expect(topRows.map((r) => r.decisionStatus)).toEqual(["superseded", "pending"]);
    expect(topRows[1]!.action).toBe("increase_load");
    const backoffRows = afterSecond.filter((r) => r.groupKey === backoffKey);
    expect(backoffRows.map((r) => r.decisionStatus)).toEqual(["superseded", "pending"]);
    expect(backoffRows[1]!.reasonCodes).toEqual(["NO_WORK_SETS_LOGGED"]);
  });

  it("M-3/A-13b/NC-6 — re-evaluation on edit is restricted to still-pending group keys; a decided group is never resurrected", async () => {
    const { sessionExerciseId, setIds } = await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 3 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);
    const initial = await db.select().from(recommendations);
    const topRec = initial.find((r) => r.groupKey === topKey)!;

    // Decide Top explicitly; Back-off stays pending.
    const decide = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: {
          recommendationId: topRec.id,
          status: "accepted",
          chosen: { loadKg: 142.5 },
          decidedAt: "2026-08-10T11:00:00.000Z",
          source: "explicit",
        },
      },
    ]);
    expect(decide.rejected).toEqual([]);

    // Edit the TOP set (evaluation-relevant: weight changes) on the now-
    // completed session. The M-3 rule: this must NOT resurrect a pending
    // record for Top (already decided), but Back-off (still pending,
    // sourced from the same slot) IS re-evaluated.
    const edit = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[0]!, sessionExerciseId, weightKg: 145 },
      },
    ]);
    expect(edit.rejected).toEqual([]);

    const after = await db.select().from(recommendations).orderBy(asc(recommendations.createdAt));
    const topRows = after.filter((r) => r.groupKey === topKey);
    // Exactly the one decided record — never a second, resurrected pending
    // row beside it.
    expect(topRows).toHaveLength(1);
    expect(topRows[0]!.id).toBe(topRec.id);
    expect(topRows[0]!.decisionStatus).toBe("accepted");

    const backoffRows = after.filter((r) => r.groupKey === backoffKey);
    expect(backoffRows.map((r) => r.decisionStatus)).toEqual(["superseded", "pending"]);
  });

  it("sync-level group-key validation (§4.4 rule 2): unknown key on a grouped slot, and any key on an ungrouped slot, are rejected", async () => {
    const snapshot = await frozenGroupedSnapshot();
    const sessionId = newId();
    const sessionExerciseId = newId();

    const badKey = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, startedAt: "2026-08-10T10:00:00.000Z" },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId,
          setNumber: 1,
          weightKg: 100,
          reps: 5,
          rir: 2,
          groupKey: "not-a-real-group-key",
          loggedAt: "2026-08-10T10:00:00.000Z",
        },
      },
    ]);
    expect(badKey.rejected).toEqual([
      expect.objectContaining({ entity: "setLog", reason: "invalid_payload" }),
    ]);

    // A second, UNGROUPED exercise: a non-null groupKey on its slot must
    // also be rejected.
    const plainExercise = await createExercise(db, userId, {
      name: "Bench Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "chest", role: "primary", weight: 1 }],
    });
    // Reuses the SAME still-in-progress session `badKey` created above
    // (rather than starting a second one) — only one in-progress session per
    // user is allowed, and this test cares about the setLog validation, not
    // session lifecycle.
    const plainSessionExerciseId = newId();
    const ungroupedBad = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: plainSessionExerciseId,
          sessionId,
          exerciseId: plainExercise.id,
          position: 1,
          source: "adhoc",
          prescription: null,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: plainSessionExerciseId,
          setNumber: 1,
          weightKg: 60,
          reps: 5,
          rir: 2,
          groupKey: topKey,
          loggedAt: "2026-08-10T10:00:00.000Z",
        },
      },
    ]);
    expect(ungroupedBad.rejected).toEqual([
      expect.objectContaining({ entity: "setLog", reason: "invalid_payload" }),
    ]);
  });

  it("NC-9 — an ungrouped record's stored inputs carry no group/extraWorkSets keys at all", async () => {
    const plainExercise = await createExercise(db, userId, {
      name: "Overhead Press",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "front_delts", role: "primary", weight: 1 }],
    });
    await createPrescription(db, userId, templateId, {
      exerciseId: plainExercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "load-progression" },
    });

    const sessionId = newId();
    const sessionExerciseId = newId();
    const startedAt = "2026-08-10T10:00:00.000Z";
    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId: plainExercise.id,
          position: 0,
          source: "template",
          prescription: {
            v: 1,
            snapshot: {
              exerciseId: plainExercise.id,
              exerciseName: "Overhead Press",
              scheme: { type: "fixed", sets: 3, reps: 5 },
              targetRir: null,
              restSeconds: null,
              progression: {
                strategyId: "load-progression",
                strategyVersion: 1,
                config: { incrementKg: 2.5 },
                classification: "heuristic",
              },
              appliedModifiers: null,
              prefill: { loadKg: 40, reps: 5 },
            },
          },
        },
      },
      ...[5, 5, 5].map((reps, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId,
          setNumber: index + 1,
          weightKg: 40,
          reps,
          rir: 2,
          loggedAt: startedAt,
        },
      })),
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          status: "completed",
          completedAt: "2026-08-10T11:00:00.000Z",
        },
      },
    ];
    const result = await applySyncBatch(db, userId, ops);
    expect(result.rejected).toEqual([]);

    const [rec] = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.exerciseId, plainExercise.id));
    expect(rec).toBeDefined();
    expect(rec!.groupKey).toBeNull();
    const inputs = rec!.inputs as Record<string, unknown>;
    expect("extraWorkSets" in inputs).toBe(false);
    const prescribed = inputs.prescribed as Record<string, unknown>;
    expect("group" in prescribed).toBe(false);
  });

  it("C-1/D-6(a) — converting an existing ungrouped exercise to multi-group bridges legacy history to the FIRST group only", async () => {
    // A separate, ungrouped exercise/prescription/completed session, whose
    // history must bridge once converted.
    const legacyExercise = await createExercise(db, userId, {
      name: "Front Squat",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const legacyPrescription = await createPrescription(db, userId, templateId, {
      exerciseId: legacyExercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 5, reps: 5 } },
      progression: { strategyId: "load-progression" },
    });
    if (!legacyPrescription) throw new Error("expected legacy prescription");

    const sessionId = newId();
    const sessionExerciseId = newId();
    const startedAt = "2026-08-05T10:00:00.000Z";
    const legacyOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId: legacyExercise.id,
          position: 1,
          source: "template",
          prescription: {
            v: 1,
            snapshot: {
              exerciseId: legacyExercise.id,
              exerciseName: "Front Squat",
              scheme: { type: "fixed", sets: 5, reps: 5 },
              targetRir: null,
              restSeconds: null,
              progression: {
                strategyId: "load-progression",
                strategyVersion: 1,
                config: { incrementKg: 2.5 },
                classification: "heuristic",
              },
              appliedModifiers: null,
              prefill: { loadKg: 100, reps: 5 },
            },
          },
        },
      },
      ...[5, 5, 5, 5, 5].map((reps, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId,
          setNumber: index + 1,
          weightKg: 100,
          reps,
          rir: 2,
          loggedAt: startedAt,
        },
      })),
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: sessionId,
          status: "completed",
          completedAt: "2026-08-05T11:00:00.000Z",
        },
      },
    ];
    const legacyResult = await applySyncBatch(db, userId, legacyOps);
    expect(legacyResult.rejected).toEqual([]);

    // Convert the prescription to a 2-group scheme.
    const converted = await updatePrescription(db, userId, legacyPrescription.id, {
      scheme: {
        v: 1,
        scheme: {
          type: "groups",
          groups: [
            { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 3, max: 3 } },
            { label: "Back-off", sets: { min: 2, max: 2 }, reps: { min: 5, max: 5 } },
          ],
        },
      },
    });
    if (converted.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
    const [firstKey, secondKey] = converted.scheme.scheme.groups.map((g) => g.key);

    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-11T09:00:00.000Z"));
    if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
    const entry = bundle.today.exercises.find((e) => e.exerciseId === legacyExercise.id);
    expect(entry).toBeDefined();
    expect(entry!.groupPrefills?.[firstKey!]?.loadKg).toBe(100);
    // The second group gets NONE of the legacy history — no automatic
    // legacy-history attribution beyond the first group (D-6 default).
    expect(entry!.groupPrefills?.[secondKey!]?.loadKg ?? null).toBeNull();

    // L-5 (independent review) — the bridged PENDING RECOMMENDATION itself
    // (not just the carry-forward prefill) must also be remapped onto the
    // first group's key, or B-3's fix has no CI-reachable guard beyond the
    // E2E spec that originally caught it.
    expect(entry!.pendingRecommendations).toHaveLength(1);
    expect(entry!.pendingRecommendations![0]!.groupKey).toBe(firstKey);
    expect(entry!.pendingRecommendations![0]!.target).toEqual({ loadKg: 102.5 });
  });

  it("§4.5 — removing a group from the template filters its pending record out of the bundle (never surfaced, never decided)", async () => {
    await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);
    const before = await db.select().from(recommendations);
    expect(before.filter((r) => r.decisionStatus === "pending")).toHaveLength(2);

    // Re-author the template with Back-off removed — Top keeps its key.
    const [row] = await db
      .select()
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.exerciseId, exerciseId));
    const converted = await updatePrescription(db, userId, row!.id, {
      scheme: {
        v: 1,
        scheme: {
          type: "groups",
          groups: [
            { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
          ],
        },
      },
    });
    if (converted.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(converted.scheme.scheme.groups.map((g) => g.key)).toEqual([topKey]);

    // The removed key's pending record is untouched in the database (R-7)…
    const after = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.groupKey, backoffKey));
    expect(after).toHaveLength(1);
    expect(after[0]!.decisionStatus).toBe("pending");

    // …but never surfaced by the bundle once its group no longer exists in
    // the current scheme.
    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-10T09:00:00.000Z"));
    if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
    const entry = bundle.today.exercises.find((e) => e.exerciseId === exerciseId);
    expect(entry).toBeDefined();
    expect(entry!.pendingRecommendations).toHaveLength(1);
    expect(entry!.pendingRecommendations![0]!.groupKey).toBe(topKey);
  });

  it("§5.6 reverse bridge (carry-forward) — converting a grouped exercise BACK to ungrouped resolves carry-forward from the FIRST GROUP's own sets, never whichever set happens to have the lowest set number", async () => {
    // Back-off logged FIRST (set numbers 1-2), Top logged LAST (set number
    // 3) — deliberately the opposite of logging order, so a naive "first set
    // by set number" carry-forward (the pre-remediation behaviour) would
    // pick Back-off's 110 kg, while the correct rule ("first GROUP in the
    // scheme's own order", i.e. Top) must pick 140 kg regardless of when it
    // was logged.
    await runGroupedSession(
      [
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
        { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      ],
      "2026-08-05T10:00:00.000Z",
    );

    const [row] = await db
      .select()
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.exerciseId, exerciseId));
    await updatePrescription(db, userId, row!.id, {
      scheme: { v: 1, scheme: { type: "fixed", sets: 1, reps: 2 } },
    });

    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-11T09:00:00.000Z"));
    if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
    const entry = bundle.today.exercises.find((e) => e.exerciseId === exerciseId);
    expect(entry).toBeDefined();
    expect(entry!.prefill.loadKg).toBe(140);
  });

  it("§5.6 reverse bridge (progression history) — an ungrouped slot's fail-streak computation reads only the FIRST group's real performance, never the whole grouped session pooled together", async () => {
    // A historical grouped session where Back-off's own mode (110 kg,
    // appearing twice) would, if pooled, coincide with the NEXT (ungrouped)
    // session's load — and, crucially, a raw `groups` scheme left
    // un-projected makes `isCompleted` unconditionally return false
    // (loadProgression.ts's own defensive guard), which would WRONGLY count
    // Top's fully-completed set as a qualifying "failure" for streak
    // purposes. With the reverse bridge applied correctly (workSets filtered
    // to Top AND the scheme projected to Top's own `fixed` shape), Top's set
    // is correctly recognised as completed and does not extend the streak.
    await runGroupedSession(
      [
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
        { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      ],
      "2026-08-05T10:00:00.000Z",
    );

    const [row] = await db
      .select()
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.exerciseId, exerciseId));
    await updatePrescription(db, userId, row!.id, {
      scheme: { v: 1, scheme: { type: "fixed", sets: 1, reps: 2 } },
      progression: {
        strategyId: "load-progression",
        config: {
          failureAction: "decrease",
          decreaseAfterConsecutiveFailures: 2,
          repShortfallTolerance: 0,
        },
      },
    });

    // A second, ungrouped session at 110 kg (Back-off's pooled mode, NOT
    // Top's own 140 kg) that itself falls short of the prescribed 2 reps —
    // this is what puts the strategy into its history-scanning branch at
    // all. If Top's bridged history entry were wrongly counted as a
    // qualifying failure, failStreak would reach the threshold (2) and the
    // engine would apply a decrease; correctly bridged, it recognises Top's
    // set as a real completion, the streak never advances past 1, and the
    // result stays a plain hold.
    const secondSessionId = newId();
    const secondSessionExerciseId = newId();
    const secondStartedAt = "2026-08-12T10:00:00.000Z";
    const secondOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: secondSessionId, blockId, templateId, startedAt: secondStartedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: secondSessionExerciseId,
          sessionId: secondSessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: {
            v: 1,
            snapshot: {
              exerciseId,
              exerciseName: "Trap Bar Deadlift",
              scheme: { type: "fixed", sets: 1, reps: 2 },
              targetRir: null,
              restSeconds: null,
              progression: {
                strategyId: "load-progression",
                strategyVersion: 1,
                config: {
                  failureAction: "decrease",
                  decreaseAfterConsecutiveFailures: 2,
                  repShortfallTolerance: 0,
                },
                classification: "user_defined",
              },
              appliedModifiers: null,
              prefill: { loadKg: 110, reps: 2 },
            },
          },
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: secondSessionExerciseId,
          setNumber: 1,
          weightKg: 110,
          reps: 1,
          rir: 2,
          loggedAt: secondStartedAt,
        },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: secondSessionId,
          status: "completed",
          completedAt: "2026-08-12T11:00:00.000Z",
        },
      },
    ];
    const secondResult = await applySyncBatch(db, userId, secondOps);
    expect(secondResult.rejected).toEqual([]);

    const [rec] = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.sourceSessionExerciseId, secondSessionExerciseId));
    expect(rec).toBeDefined();
    expect(rec!.action).toBe("hold");
    expect(rec!.reasonCodes).toEqual(["PRESCRIBED_REPS_NOT_COMPLETED"]);
  });

  it("L-7 — reverse conversion leaves old per-group pending records inert: neither the bundle nor getActiveSession ever surface a non-null-key recommendation for the now-ungrouped slot", async () => {
    // Independent review, L-7 disposition: "add one integration assertion
    // that an ungrouped slot's bundle and active session never surface a
    // non-null-key record, so any future un-scoped recommendation query
    // fails loudly." This pins that invariant without building the
    // symmetric write-time supersede the review explicitly says Stage A
    // does not need.
    await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);

    // Both groups' completions produced a real, still-pending recommendation
    // row — these are the orphans the reverse conversion below must leave
    // behind, inert, never deleted (D-6 — "no rewrite of historical rows").
    const orphansBeforeConversion = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.exerciseId, exerciseId));
    expect(orphansBeforeConversion).toHaveLength(2);
    expect(orphansBeforeConversion.map((r) => r.groupKey).sort()).toEqual(
      [topKey, backoffKey].sort(),
    );

    const [row] = await db
      .select()
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.exerciseId, exerciseId));
    await updatePrescription(db, userId, row!.id, {
      scheme: { v: 1, scheme: { type: "fixed", sets: 1, reps: 2 } },
    });

    // The orphaned grouped-key rows are still there, untouched — genuinely
    // inert, not cleaned up.
    const orphansAfterConversion = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.exerciseId, exerciseId));
    expect(orphansAfterConversion).toHaveLength(2);

    const bundle = await buildTodayBundle(db, userId, new Date("2026-08-11T09:00:00.000Z"));
    if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
    const entry = bundle.today.exercises.find((e) => e.exerciseId === exerciseId);
    expect(entry).toBeDefined();
    // Neither orphan is surfaced — the bundle's own pending-recommendation
    // read is null-key scoped, so it sees nothing for this exercise at all,
    // never one of the two stale grouped-key rows.
    expect(entry!.pendingRecommendation).toBeNull();
    expect(entry!.pendingRecommendations).toBeUndefined();

    // A new, in-progress session for the (now ungrouped) slot must resolve
    // exactly the same way through getActiveSession.
    const sessionId = newId();
    const sessionExerciseId = newId();
    const startOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, startedAt: "2026-08-12T10:00:00.000Z" },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: null,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId,
          setNumber: 1,
          weightKg: 100,
          reps: 2,
          rir: 2,
          loggedAt: "2026-08-12T10:00:00.000Z",
        },
      },
    ];
    expect((await applySyncBatch(db, userId, startOps)).rejected).toEqual([]);

    const active = await getActiveSession(db, userId);
    const activeExercise = active!.exercises.find((e) => e.exerciseId === exerciseId)!;
    // Whatever recommendation (if any) getActiveSession surfaces here, it is
    // never one of the two orphaned grouped-key rows — the ungrouped read
    // path is scoped to `groupKey IS NULL` throughout.
    expect(activeExercise.recommendation?.groupKey ?? null).toBeNull();
    expect(activeExercise.recommendations).toBeUndefined();
  });

  it("in-session group reassignment — moving a set to a DECIDED group never resurrects it; the group it left is re-evaluated", async () => {
    const { sessionExerciseId, setIds } = await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);
    const initial = await db.select().from(recommendations);
    const topRec = initial.find((r) => r.groupKey === topKey)!;

    // Decide Top explicitly; Back-off stays pending.
    const decide = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recommendationDecision",
        operation: "upsert",
        payload: {
          recommendationId: topRec.id,
          status: "accepted",
          chosen: { loadKg: 142.5 },
          decidedAt: "2026-08-10T11:00:00.000Z",
          source: "explicit",
        },
      },
    ]);
    expect(decide.rejected).toEqual([]);

    // Reassign Back-off's SECOND set into Top's group (§4.4 rule 4 — an
    // evaluation-relevant edit). Top now has an extra recorded set it never
    // asked to be re-decided over (already accepted); Back-off has one
    // FEWER recorded set than its own sets.min (2), so its own re-evaluation
    // must reflect that shortfall.
    const reassign = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[1]!, sessionExerciseId, groupKey: topKey },
      },
    ]);
    expect(reassign.rejected).toEqual([]);

    const after = await db.select().from(recommendations).orderBy(asc(recommendations.createdAt));

    // Top: still exactly the one, already-decided record — reassigning a
    // set INTO it never resurrects a fresh pending row (M-3), even though
    // Top's own recorded-set count just changed.
    const topRows = after.filter((r) => r.groupKey === topKey);
    expect(topRows).toHaveLength(1);
    expect(topRows[0]!.id).toBe(topRec.id);
    expect(topRows[0]!.decisionStatus).toBe("accepted");

    // Back-off: still pending, so IS re-evaluated — now with only 1 of its
    // required 2 sets, it can no longer complete.
    const backoffRows = after.filter((r) => r.groupKey === backoffKey);
    expect(backoffRows.map((r) => r.decisionStatus)).toEqual(["superseded", "pending"]);
    expect(backoffRows[1]!.action).toBe("hold");
    const backoffInputs = backoffRows[1]!.inputs as InputsSummary;
    expect(backoffInputs.workSets).toHaveLength(1);
  });

  it("deletion/renumbering preserves group identity — surviving sets keep their OWN group_key after a renumber, never shuffled to a neighbour's", async () => {
    const { sessionExerciseId, setIds } = await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 6, rir: 0 },
    ]);

    const rows = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(asc(setLogs.setNumber));
    expect(rows.map((r) => r.groupKey)).toEqual([topKey, backoffKey, backoffKey, backoffKey]);

    // Delete Back-off's FIRST set (set number 2) — the two survivors after
    // it (set numbers 3 and 4) must renumber down to 2 and 3, keeping their
    // OWN group_key (backoffKey), and set 1 (Top) must be untouched.
    const rowFields: SetLogRowFields[] = rows.map((r) => ({
      id: r.id,
      setNumber: r.setNumber,
      isWarmup: r.isWarmup,
      weightKg: r.weightKg,
      reps: r.reps,
      rir: r.rir,
      distanceM: r.distanceM,
      durationS: r.durationS,
      loggedAt: r.loggedAt.toISOString(),
      notes: r.notes,
      groupKey: r.groupKey,
    }));
    const { deleted, ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: setIds[1]!,
      sets: rowFields,
      isGrouped: true,
    });
    expect(deleted).not.toBeNull();

    const result = await applySyncBatch(db, userId, ops);
    expect(result.rejected).toEqual([]);

    const after = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionExerciseId, sessionExerciseId))
      .orderBy(asc(setLogs.setNumber));
    expect(after.map((r) => ({ setNumber: r.setNumber, groupKey: r.groupKey }))).toEqual([
      { setNumber: 1, groupKey: topKey },
      { setNumber: 2, groupKey: backoffKey },
      { setNumber: 3, groupKey: backoffKey },
    ]);
    // The two survivors are the ORIGINAL third and fourth sets (110/7 and
    // 110/6), not re-derived — renumbering only ever touches set_number.
    expect(after.map((r) => r.reps)).toEqual([2, 7, 6]);
  });

  it("grouped replay/idempotence — applying the identical batch of grouped ops twice converges without duplicating or re-evaluating", async () => {
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setIds = [newId(), newId(), newId()];
    const startedAt = "2026-08-10T10:00:00.000Z";
    const snapshot = await frozenGroupedSnapshot();
    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, templateName: "Push Day", startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[0]!,
          sessionExerciseId,
          setNumber: 1,
          weightKg: 140,
          reps: 2,
          rir: 2,
          groupKey: topKey,
          loggedAt: startedAt,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[1]!,
          sessionExerciseId,
          setNumber: 2,
          weightKg: 110,
          reps: 7,
          rir: 2,
          groupKey: backoffKey,
          loggedAt: startedAt,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: setIds[2]!,
          sessionExerciseId,
          setNumber: 3,
          weightKg: 110,
          reps: 7,
          rir: 2,
          groupKey: backoffKey,
          loggedAt: startedAt,
        },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, status: "completed", completedAt: "2026-08-10T11:00:00.000Z" },
      },
    ];

    const first = await applySyncBatch(db, userId, ops);
    expect(first.rejected).toEqual([]);
    const afterFirst = await db
      .select()
      .from(recommendations)
      .orderBy(asc(recommendations.groupKey));
    expect(afterFirst).toHaveLength(2);

    // Replay the IDENTICAL batch — same opIds, same payload, same entity
    // ids — exactly what a lost-response retry resends (pwa-offline-
    // strategy.md §5's natural-idempotency contract, now exercised with
    // grouped ops for the first time).
    const second = await applySyncBatch(db, userId, ops);
    expect(second.rejected).toEqual([]);

    const afterSecond = await db
      .select()
      .from(recommendations)
      .orderBy(asc(recommendations.groupKey));
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond.map((r) => r.id)).toEqual(afterFirst.map((r) => r.id));
    expect(afterSecond.map((r) => r.decisionStatus)).toEqual(
      afterFirst.map((r) => r.decisionStatus),
    );
    expect(afterSecond.map((r) => r.updatedAt.getTime())).toEqual(
      afterFirst.map((r) => r.updatedAt.getTime()),
    );
  });

  it("cross-device resume (getActiveSession) surfaces per-group AND ungrouped pending recommendations, remapped to their own group key", async () => {
    // Regression test for two real bugs this remediation pass found via a
    // browser-level E2E test and traced back here: (1) `getActiveSession`
    // looked recommendations up by bare `exerciseId`, which never matched
    // `getSessionRecommendationsByExercise`'s own `exerciseGroupKey`-keyed
    // map (whose null-group key is `"<id>:"`, never bare `"<id>"`) — cross-
    // device resume of an in-progress session's pending/decided
    // recommendation was silently always `null`; (2) a bridged (C-1/D-6(a))
    // recommendation kept the underlying legacy row's own `groupKey: null`
    // instead of being remapped to the group it's being surfaced for, so
    // every client-side `rec.groupKey === group.key` lookup (the card, the
    // implicit/explicit decision handlers) could never find it at all.
    const { sessionExerciseId: firstSessionExerciseId } = await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);
    const pending = await db.select().from(recommendations);
    expect(pending).toHaveLength(2);

    // A second, IN-PROGRESS session for the same slot (not completed) — the
    // resume scenario `getActiveSession` exists to serve.
    const secondSessionId = newId();
    const secondSessionExerciseId = newId();
    const snapshot = await frozenGroupedSnapshot();
    const startOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: secondSessionId,
          blockId,
          templateId,
          templateName: "Push Day",
          startedAt: "2026-08-12T10:00:00.000Z",
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: secondSessionExerciseId,
          sessionId: secondSessionId,
          exerciseId,
          position: 0,
          source: "template",
          prescription: snapshot,
        },
      },
    ];
    const startResult = await applySyncBatch(db, userId, startOps);
    expect(startResult.rejected).toEqual([]);

    const active = await getActiveSession(db, userId);
    expect(active?.id).toBe(secondSessionId);
    const activeExercise = active!.exercises.find((e) => e.exerciseId === exerciseId)!;
    expect(activeExercise.recommendations).toHaveLength(2);
    const byGroup = new Map(activeExercise.recommendations!.map((r) => [r.groupKey, r]));
    expect(byGroup.get(topKey)?.target).toEqual({ loadKg: 142.5 });
    expect(byGroup.get(backoffKey)?.target).toEqual({ loadKg: 112.5 });
    // Not the raw stored `null` — every one of this file's client-facing
    // consumers keys a recommendation to a group by `groupKey === group.key`.
    expect(activeExercise.recommendations!.every((r) => r.groupKey !== null)).toBe(true);

    // The ORIGINAL (first, completed) session's own sourceSessionExerciseId
    // is untouched by this — a plain sanity check that the fixture's own
    // set-up produced what this test assumes.
    expect(pending.every((r) => r.sourceSessionExerciseId === firstSessionExerciseId)).toBe(true);
  });

  it("cross-device resume (getActiveSession) surfaces an UNGROUPED slot's pending recommendation, and preserves each set's group_key verbatim", async () => {
    const plainExercise = await createExercise(db, userId, {
      name: "Resume Ungrouped",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    await createPrescription(db, userId, templateId, {
      exerciseId: plainExercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 1, reps: 5 } },
      progression: { strategyId: "load-progression" },
    });

    const firstSessionId = newId();
    const firstSessionExerciseId = newId();
    const firstStartedAt = "2026-08-05T10:00:00.000Z";
    const completeOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: firstSessionId, blockId, templateId, startedAt: firstStartedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: firstSessionExerciseId,
          sessionId: firstSessionId,
          exerciseId: plainExercise.id,
          position: 0,
          source: "template",
          prescription: {
            v: 1,
            snapshot: {
              exerciseId: plainExercise.id,
              exerciseName: "Resume Ungrouped",
              scheme: { type: "fixed", sets: 1, reps: 5 },
              targetRir: null,
              restSeconds: null,
              progression: {
                strategyId: "load-progression",
                strategyVersion: 1,
                config: { incrementKg: 2.5 },
                classification: "heuristic",
              },
              appliedModifiers: null,
              prefill: { loadKg: 100, reps: 5 },
            },
          },
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: firstSessionExerciseId,
          setNumber: 1,
          weightKg: 100,
          reps: 5,
          rir: 2,
          loggedAt: firstStartedAt,
        },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: {
          id: firstSessionId,
          status: "completed",
          completedAt: "2026-08-05T11:00:00.000Z",
        },
      },
    ];
    expect((await applySyncBatch(db, userId, completeOps)).rejected).toEqual([]);

    const secondSessionId = newId();
    const secondSessionExerciseId = newId();
    const secondSetId = newId();
    const secondStartedAt = "2026-08-12T10:00:00.000Z";
    const startOps: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: secondSessionId, blockId, templateId, startedAt: secondStartedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: secondSessionExerciseId,
          sessionId: secondSessionId,
          exerciseId: plainExercise.id,
          position: 0,
          source: "template",
          prescription: null,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: secondSetId,
          sessionExerciseId: secondSessionExerciseId,
          setNumber: 1,
          weightKg: 102.5,
          reps: 5,
          rir: 2,
          loggedAt: secondStartedAt,
        },
      },
    ];
    expect((await applySyncBatch(db, userId, startOps)).rejected).toEqual([]);

    const active = await getActiveSession(db, userId);
    expect(active?.id).toBe(secondSessionId);
    const activeExercise = active!.exercises.find((e) => e.exerciseId === plainExercise.id)!;
    expect(activeExercise.recommendation?.target).toEqual({ loadKg: 102.5 });
    expect(activeExercise.recommendations).toBeUndefined();
    expect(activeExercise.sets).toEqual([
      expect.objectContaining({ id: secondSetId, weightKg: 102.5, groupKey: null }),
    ]);
  });

  it("A-16 — numeric e1RM equivalence: identical facts logged grouped vs ungrouped produce an identical strength report", async () => {
    const plainExercise = await createExercise(db, userId, {
      name: "E1RM Plain",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    await createPrescription(db, userId, templateId, {
      exerciseId: plainExercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    });

    const groupedExercise = await createExercise(db, userId, {
      name: "E1RM Grouped",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const groupedRx = await createPrescription(db, userId, templateId, {
      exerciseId: groupedExercise.id,
      scheme: {
        v: 1,
        scheme: {
          type: "groups",
          groups: [{ label: "Solo", sets: { min: 3, max: 3 }, reps: { min: 5, max: 5 } }],
        },
      },
      progression: { strategyId: "manual" },
    });
    if (!groupedRx || groupedRx.scheme.scheme.type !== "groups") {
      throw new Error("expected a groups prescription");
    }
    const soloKey = groupedRx.scheme.scheme.groups[0]!.key;

    const facts = [
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 2 },
      { weightKg: 100, reps: 5, rir: 1 },
    ];
    const startedAt = "2026-08-10T10:00:00.000Z";
    const sessionId = newId();
    const plainSessionExerciseId = newId();
    const groupedSessionExerciseId = newId();
    // ONE shared session for both exercises, so both reports' observations
    // carry the identical sessionId/startedAt — the only fields that would
    // otherwise differ for a reason having nothing to do with grouping.
    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: plainSessionExerciseId,
          sessionId,
          exerciseId: plainExercise.id,
          position: 0,
          source: "template",
          prescription: null,
        },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: groupedSessionExerciseId,
          sessionId,
          exerciseId: groupedExercise.id,
          position: 1,
          source: "template",
          // A real snapshot is required here (unlike the plain exercise's
          // `null` above): `applySetLogUpsert`'s §4.4 rule 2 validates every
          // set's `groupKey` against the PARENT slot's frozen snapshot, so a
          // `groups`-keyed set against a `null` prescription is rejected as
          // `invalid_payload`.
          prescription: {
            v: 1,
            snapshot: {
              exerciseId: groupedExercise.id,
              exerciseName: "E1RM Grouped",
              scheme: groupedRx.scheme.scheme,
              targetRir: null,
              restSeconds: null,
              progression: {
                strategyId: "manual",
                strategyVersion: 1,
                config: {},
                classification: "heuristic",
              },
              appliedModifiers: null,
              prefill: { loadKg: null, reps: null },
            },
          },
        },
      },
      ...facts.map((f, i): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: plainSessionExerciseId,
          setNumber: i + 1,
          weightKg: f.weightKg,
          reps: f.reps,
          rir: f.rir,
          loggedAt: startedAt,
        },
      })),
      ...facts.map((f, i): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: groupedSessionExerciseId,
          setNumber: i + 1,
          weightKg: f.weightKg,
          reps: f.reps,
          rir: f.rir,
          groupKey: soloKey,
          loggedAt: startedAt,
        },
      })),
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, status: "completed", completedAt: "2026-08-10T11:00:00.000Z" },
      },
    ];
    const result = await applySyncBatch(db, userId, ops);
    expect(result.rejected).toEqual([]);

    const asOf = new Date("2026-08-15T00:00:00.000Z");
    const plainReport = await getExerciseStrengthReport(db, userId, plainExercise.id, {}, asOf);
    const groupedReport = await getExerciseStrengthReport(db, userId, groupedExercise.id, {}, asOf);
    expect(plainReport).not.toBeNull();
    expect(groupedReport).not.toBeNull();

    // `group_key` is not even selected by the strength query (§14.5's own
    // module-boundary rule keeps `src/server/strength/**` ignorant of
    // progression/groups entirely) — the numeric report must therefore be
    // byte-for-byte identical apart from which exercise it names. Compared
    // as the explicit `StrengthReport` fields (never "everything but
    // exercise") so the comparison can't silently widen to a field that
    // legitimately differs by exercise identity.
    function reportFacts(report: NonNullable<typeof plainReport>) {
      return {
        eligible: report.eligible,
        estimate: report.estimate,
        observations: report.observations,
        sessionsWithoutEligibleSets: report.sessionsWithoutEligibleSets,
        whatIf: report.whatIf,
        algorithm: report.algorithm,
      };
    }
    expect(reportFacts(groupedReport!)).toEqual(reportFacts(plainReport!));
  });

  it("M-1 — a week-modifier-raised group min never retroactively fails an earlier session frozen at the original min", async () => {
    // A dedicated prescription (Top min=2, not the shared fixture's min=1)
    // so a genuine "2 recorded, min 2" completion is possible, and a later
    // "3 required, 2 recorded" shortfall is meaningfully distinct from it.
    const m1Exercise = await createExercise(db, userId, {
      name: "M-1 Week Modifier",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    const m1Rx = await createPrescription(db, userId, templateId, {
      exerciseId: m1Exercise.id,
      scheme: {
        v: 1,
        scheme: {
          type: "groups",
          groups: [{ label: "Top", sets: { min: 2, max: 2 }, reps: { min: 5, max: 5 } }],
        },
      },
      progression: {
        strategyId: "load-progression",
        config: {
          failureAction: "decrease",
          decreaseAfterConsecutiveFailures: 2,
          repShortfallTolerance: 0,
        },
      },
    });
    if (!m1Rx || m1Rx.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
    const m1Key = m1Rx.scheme.scheme.groups[0]!.key;

    function m1Snapshot(min: number) {
      return {
        v: 1 as const,
        snapshot: {
          exerciseId: m1Exercise.id,
          exerciseName: "M-1 Week Modifier",
          scheme: {
            type: "groups" as const,
            groups: [
              { key: m1Key, label: "Top", sets: { min, max: min }, reps: { min: 5, max: 5 } },
            ],
          },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: "load-progression" as const,
            strategyVersion: 1,
            config: {
              failureAction: "decrease" as const,
              decreaseAfterConsecutiveFailures: 2,
              repShortfallTolerance: 0,
            },
            classification: "user_defined" as const,
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      };
    }

    // Session 1 — frozen at the ORIGINAL min (2), genuinely completed: 2 of
    // 2 required sets, both at the prescribed reps.
    const session1Id = newId();
    const session1ExerciseId = newId();
    const session1StartedAt = "2026-08-05T10:00:00.000Z";
    const session1Ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: session1Id, blockId, templateId, startedAt: session1StartedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: session1ExerciseId,
          sessionId: session1Id,
          exerciseId: m1Exercise.id,
          position: 0,
          source: "template",
          prescription: m1Snapshot(2),
        },
      },
      ...[100, 100].map((weightKg, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: session1ExerciseId,
          setNumber: index + 1,
          weightKg,
          reps: 5,
          rir: 2,
          groupKey: m1Key,
          loggedAt: session1StartedAt,
        },
      })),
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: session1Id, status: "completed", completedAt: "2026-08-05T11:00:00.000Z" },
      },
    ];
    expect((await applySyncBatch(db, userId, session1Ops)).rejected).toEqual([]);

    // Session 2 — simulates a week override (`setMultiplier`) that RAISED
    // Top's min to 3, frozen into THIS session's own snapshot only, per
    // `buildGroupEvaluationUnits` receiving the post-modifier snapshot.
    // Only 2 of the now-required 3 sets land, at the SAME 100 kg load as
    // session 1, which is what makes session 1 wrongly "qualify" for the
    // fail streak if it is (incorrectly) judged against session 2's raised
    // min instead of its own frozen one.
    const session2Id = newId();
    const session2ExerciseId = newId();
    const session2StartedAt = "2026-08-12T10:00:00.000Z";
    const session2Ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: session2Id, blockId, templateId, startedAt: session2StartedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: session2ExerciseId,
          sessionId: session2Id,
          exerciseId: m1Exercise.id,
          position: 0,
          source: "template",
          prescription: m1Snapshot(3),
        },
      },
      ...[100, 100].map((weightKg, index): SyncOpEnvelope => ({
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId: session2ExerciseId,
          setNumber: index + 1,
          weightKg,
          reps: 5,
          rir: 2,
          groupKey: m1Key,
          loggedAt: session2StartedAt,
        },
      })),
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: session2Id, status: "completed", completedAt: "2026-08-12T11:00:00.000Z" },
      },
    ];
    expect((await applySyncBatch(db, userId, session2Ops)).rejected).toEqual([]);

    const [rec] = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.sourceSessionExerciseId, session2ExerciseId));
    expect(rec).toBeDefined();
    // Faithful reading: session 1 was a real completion under ITS OWN frozen
    // min (2), so it never extends the fail streak; session 2 alone (1
    // qualifying entry, threshold 2) never triggers a decrease. The shipped
    // pre-fix behaviour judged session 1 against session 2's raised min (3),
    // wrongly counted it as a qualifying failure, and returned
    // `decrease_load` at 90 kg instead.
    expect(rec!.action).toBe("hold");
    expect(rec!.reasonCodes).toEqual(["PRESCRIBED_REPS_NOT_COMPLETED"]);
  });

  it("M-2 — a manual SLOT strategy with a non-manual GROUP override still progresses that group, through a real completion (not evaluateSession in isolation)", async () => {
    const m2Exercise = await createExercise(db, userId, {
      name: "M-2 Manual Slot Override",
      equipment: "barbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
    });
    // Slot default is "manual" (never evaluated on its own); Top overrides it
    // to "load-progression". Editor-reachable and compatibility-clean per the
    // review's own PROBE 2 (checkPrescriptionCompatibility raises nothing).
    const m2Rx = await createPrescription(db, userId, templateId, {
      exerciseId: m2Exercise.id,
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
      progression: { strategyId: "manual" },
    });
    // The override has to be applied via a follow-up update once the server
    // has assigned real keys (§4.2) — the same two-step shape the editor
    // itself uses (§7.1/M-3).
    if (!m2Rx || m2Rx.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
    const m2TopKey = m2Rx.scheme.scheme.groups[0]!.key;
    const updated = await updatePrescription(db, userId, m2Rx.id, {
      progression: {
        strategyId: "manual",
        groups: { [m2TopKey]: { strategyId: "load-progression" } },
      },
    });
    expect(updated.progression.groups?.[m2TopKey]?.strategyId).toBe("load-progression");

    const sessionId = newId();
    const sessionExerciseId = newId();
    const startedAt = "2026-08-10T10:00:00.000Z";
    const [row] = await db
      .select()
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.id, m2Rx.id));
    const rawProgression = row!.progression as {
      strategyId: string;
      config: Record<string, unknown>;
      classification: string;
      groups?: Record<string, { strategyId: string; config: Record<string, unknown> }>;
    };
    const snapshot = {
      v: 1 as const,
      snapshot: {
        exerciseId: m2Exercise.id,
        exerciseName: "M-2 Manual Slot Override",
        scheme: (row!.scheme as { scheme: unknown }).scheme,
        targetRir: null,
        restSeconds: null,
        progression: {
          strategyId: rawProgression.strategyId,
          strategyVersion: 1,
          config: rawProgression.config,
          classification: rawProgression.classification,
          groups: Object.fromEntries(
            Object.entries(rawProgression.groups ?? {}).map(([key, rp]) => [
              key,
              { ...rp, strategyVersion: 1, classification: "user_defined" },
            ]),
          ),
        },
        appliedModifiers: null,
        prefill: { loadKg: null, reps: null },
      },
    };
    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, blockId, templateId, startedAt },
      },
      {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: {
          id: sessionExerciseId,
          sessionId,
          exerciseId: m2Exercise.id,
          position: 0,
          source: "template",
          prescription: snapshot,
        },
      },
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: {
          id: newId(),
          sessionExerciseId,
          setNumber: 1,
          weightKg: 140,
          reps: 2,
          rir: 2,
          groupKey: m2TopKey,
          loggedAt: startedAt,
        },
      },
      {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: { id: sessionId, status: "completed", completedAt: "2026-08-10T11:00:00.000Z" },
      },
    ];
    const result = await applySyncBatch(db, userId, ops);
    expect(result.rejected).toEqual([]);

    // Before M-2's fix, `assembleAndEvaluate`'s pre-filter dropped this whole
    // exercise (slot strategyId === "manual") before `evaluateSession` ever
    // ran — no row, no error, no card. Fixed: exactly one record, for Top,
    // computed by the group's own overriding strategy.
    const recs = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.exerciseId, m2Exercise.id));
    expect(recs).toHaveLength(1);
    expect(recs[0]!.groupKey).toBe(m2TopKey);
    expect(recs[0]!.strategyId).toBe("load-progression");
    expect(recs[0]!.action).toBe("increase_load");
  });

  describe("M-3 — per-group progression overrides addressable before persistent keys exist", () => {
    it("CREATE — a fixed-rep group's required repCap is authorable in the SAME save that creates the group, via groupOverridesByIndex", async () => {
      const exercise = await createExercise(db, userId, {
        name: "M-3 Create",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      // Slot strategy is rep-progression; Top is fixed-rep (8=8) and would
      // be rejected without its own repCap — supplied here by INDEX (0),
      // since neither group has a key yet at request time.
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 8, max: 8 } },
              { label: "Back-off", sets: { min: 2, max: 2 }, reps: { min: 6, max: 8 } },
            ],
          },
        },
        progression: {
          strategyId: "rep-progression",
          groupOverridesByIndex: { "0": { strategyId: "rep-progression", config: { repCap: 12 } } },
        },
      });
      expect(created).not.toBeNull();
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const topKeyM3 = created.scheme.scheme.groups[0]!.key;
      expect(created.progression.groups?.[topKeyM3]?.strategyId).toBe("rep-progression");
      expect(created.progression.groups?.[topKeyM3]?.config.repCap).toBe(12);
    });

    it("UPDATE — adding a group to an existing prescription accepts an override for the NEW group by index while preserving an EXISTING group's override by key", async () => {
      const exercise = await createExercise(db, userId, {
        name: "M-3 Add Group",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [{ label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } }],
          },
        },
        progression: {
          strategyId: "load-progression",
          groupOverridesByIndex: {
            "0": { strategyId: "load-progression", config: { incrementKg: 5 } },
          },
        },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const existingTopKey = created.scheme.scheme.groups[0]!.key;
      expect(created.progression.groups?.[existingTopKey]?.config.incrementKg).toBe(5);

      // Add a second, fixed-rep Back-off group under rep-progression in the
      // SAME update — its repCap is addressed by index (1, its position in
      // the submitted array), while Top's existing override survives
      // addressed by its own real key, untouched.
      const updated = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              {
                key: existingTopKey,
                label: "Top",
                sets: { min: 1, max: 1 },
                reps: { min: 2, max: 2 },
              },
              { label: "Back-off", sets: { min: 2, max: 2 }, reps: { min: 8, max: 8 } },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: {
            [existingTopKey]: { strategyId: "load-progression", config: { incrementKg: 5 } },
          },
          groupOverridesByIndex: {
            "1": { strategyId: "rep-progression", config: { repCap: 10 } },
          },
        },
      });
      if (updated.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
      const backoffKeyM3 = updated.scheme.scheme.groups[1]!.key;
      expect(backoffKeyM3).not.toBe(existingTopKey);
      expect(updated.progression.groups?.[existingTopKey]?.config.incrementKg).toBe(5);
      expect(updated.progression.groups?.[backoffKeyM3]?.strategyId).toBe("rep-progression");
      expect(updated.progression.groups?.[backoffKeyM3]?.config.repCap).toBe(10);
    });

    it("UPDATE — reordering groups keeps each group's key-addressed override attached to its OWN group, not its array position", async () => {
      const exercise = await createExercise(db, userId, {
        name: "M-3 Reorder",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              { label: "Back-off", sets: { min: 2, max: 2 }, reps: { min: 8, max: 8 } },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groupOverridesByIndex: {
            "0": { strategyId: "load-progression", config: { incrementKg: 5 } },
            "1": { strategyId: "rep-progression", config: { repCap: 10 } },
          },
        },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const [topKeyR, backoffKeyR] = created.scheme.scheme.groups.map((g) => g.key);
      expect(created.progression.groups?.[topKeyR!]?.config.incrementKg).toBe(5);
      expect(created.progression.groups?.[backoffKeyR!]?.strategyId).toBe("rep-progression");

      // Reorder: Back-off now comes FIRST, Top SECOND — same keys, swapped
      // array positions, overrides addressed by (unchanged) key.
      const reordered = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              {
                key: backoffKeyR!,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 8, max: 8 },
              },
              { key: topKeyR!, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: {
            [topKeyR!]: { strategyId: "load-progression", config: { incrementKg: 5 } },
            [backoffKeyR!]: { strategyId: "rep-progression", config: { repCap: 10 } },
          },
        },
      });
      if (reordered.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
      // Each group's own key still carries its OWN override, regardless of
      // which array position it now occupies.
      expect(reordered.scheme.scheme.groups.map((g) => g.key)).toEqual([backoffKeyR, topKeyR]);
      expect(reordered.progression.groups?.[topKeyR!]?.config.incrementKg).toBe(5);
      expect(reordered.progression.groups?.[backoffKeyR!]?.strategyId).toBe("rep-progression");
      expect(reordered.progression.groups?.[backoffKeyR!]?.config.repCap).toBe(10);
    });
  });

  it("L-3 — the server forces groupKey to null when an edit's effective isWarmup is true, regardless of what the payload's own groupKey says", async () => {
    const { sessionExerciseId, setIds } = await runGroupedSession([
      { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
      { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
    ]);

    // A single op that (incorrectly, as a hand-crafted or future-buggy
    // client might) sends BOTH `isWarmup: true` and a real, otherwise-valid
    // `groupKey` together for the same set.
    const result = await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "setLog",
        operation: "upsert",
        payload: { id: setIds[1]!, sessionExerciseId, isWarmup: true, groupKey: backoffKey },
      },
    ]);
    expect(result.rejected).toEqual([]);

    const [row] = await db.select().from(setLogs).where(eq(setLogs.id, setIds[1]!));
    expect(row!.isWarmup).toBe(true);
    expect(row!.groupKey).toBeNull();
  });

  // V-2 (independent verification) — the L-3 test above applies a SINGLE
  // op, so `laterUpsertFields` is null and the forcing decision never
  // interacts with intra-batch forward subsumption at all ("single-op
  // warm-up normalization" — already covered above; not repeated here).
  // These tests exercise the interaction the L-3 test structurally cannot
  // reach: a batch where a LATER op governs `isWarmup` and/or `groupKey`
  // for the SAME row.
  describe("V-2 — replay idempotence and legitimate groupKey preservation under intra-batch subsumption", () => {
    it("the review's own reproduction: a full-row op setting isWarmup+groupKey together, followed by a partial op that only corrects isWarmup, preserves the batch's legitimate groupKey and converges identically on replay", async () => {
      const { sessionExerciseId, setIds } = await runGroupedSession([
        { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      ]);
      const targetId = setIds[1]!;

      // Pre-batch state: a warm-up with no group — the review's own
      // starting condition, and the one that exposed the bug (the OLD
      // code's fallback read this exact PRE-BATCH value from inside the
      // batch under test, then diverged on replay once the row no longer
      // matched it). A solo op with no later-op conflict; the server's own
      // forcing already clears `groupKey` here (same mechanism the L-3
      // test above pins).
      const setup = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: targetId, sessionExerciseId, isWarmup: true },
        },
      ]);
      expect(setup.rejected).toEqual([]);
      const [preBatch] = await db.select().from(setLogs).where(eq(setLogs.id, targetId));
      expect(preBatch).toMatchObject({ isWarmup: true, groupKey: null });

      // The batch under test: op1 is a FULL-ROW upsert that (re)establishes
      // isWarmup: true alongside a real, valid groupKey; op2 is a PARTIAL
      // correction that only touches isWarmup, flipping it back to false —
      // exactly the "full-row create trailing into a partial correction"
      // shape the `writable` computation's own header comment describes.
      // `laterUpsertFields` for op1 is `{isWarmup}` (op2 sets it later) but
      // NOT `{groupKey}` (op2 never touches it). Under the pre-V-2 code,
      // op1's forcing decision read the STALE pre-batch `isWarmup` (true,
      // captured above) and clobbered its own legitimate `groupKey` write
      // with null. V-2 defers the decision away from op1 (a later op
      // governs `isWarmup`) and lets op2's own effective-isWarmup read
      // (which is NOT stale — op2 is never itself subsumed on `isWarmup`)
      // govern instead; since op2's effective isWarmup is false, nothing
      // forces null, and op1's real `groupKey` survives untouched.
      const batch: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: targetId,
            sessionExerciseId,
            setNumber: 2,
            weightKg: 110,
            reps: 7,
            rir: 2,
            isWarmup: true,
            groupKey: backoffKey,
            loggedAt: "2026-08-10T10:00:00.000Z",
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: targetId, sessionExerciseId, isWarmup: false },
        },
      ];

      const first = await applySyncBatch(db, userId, batch);
      expect(first.rejected).toEqual([]);
      const [afterFirst] = await db.select().from(setLogs).where(eq(setLogs.id, targetId));
      // Preservation of the batch's legitimate groupKey — the required
      // coverage item; the pre-fix code left this null instead.
      expect(afterFirst).toMatchObject({ isWarmup: false, groupKey: backoffKey });

      // Identical replay — same opIds, same payloads — must converge to
      // the exact same row, not a different one. V-2's defect was
      // SPECIFICALLY a replay divergence: the stale pre-batch read differs
      // between the first application (pre-batch isWarmup: true) and a
      // replay (pre-batch isWarmup already false, from the first
      // application), so the two runs disagreed on whether to force null.
      const second = await applySyncBatch(db, userId, batch);
      expect(second.rejected).toEqual([]);
      const [afterSecond] = await db.select().from(setLogs).where(eq(setLogs.id, targetId));
      expect(afterSecond).toMatchObject({ isWarmup: false, groupKey: backoffKey });
      expect(afterSecond!.groupKey).toBe(afterFirst!.groupKey);
      expect(afterSecond!.isWarmup).toBe(afterFirst!.isWarmup);
    });

    it("a partial edit touching neither isWarmup nor groupKey leaves the existing groupKey untouched", async () => {
      const { sessionExerciseId, setIds } = await runGroupedSession([
        { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      ]);
      const targetId = setIds[1]!;

      const result = await applySyncBatch(db, userId, [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: targetId, sessionExerciseId, weightKg: 112.5 },
        },
      ]);
      expect(result.rejected).toEqual([]);
      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, targetId));
      expect(row).toMatchObject({ weightKg: 112.5, isWarmup: false, groupKey: backoffKey });
    });

    it("later-op combination — a later op governing ONLY groupKey (never isWarmup) still forces null once the row's true final isWarmup is known", async () => {
      // Earlier op sets {isWarmup: true, groupKey: real}; the LATER op sets
      // ONLY {groupKey: otherReal} and never touches isWarmup. V-2 defers
      // the forcing decision away from the earlier op (a later op governs
      // groupKey); by the time the later op runs, the earlier op has
      // already committed isWarmup: true within the same transaction, so
      // the later op's own `existingRow` read is accurate (not stale) and
      // correctly forces null over its own attempted write — the invariant
      // ("a warm-up set carries no group") still holds even though neither
      // op alone "owns" both facts.
      const { sessionExerciseId, setIds } = await runGroupedSession([
        { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      ]);
      const targetId = setIds[1]!;
      const batch: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: targetId,
            sessionExerciseId,
            setNumber: 2,
            weightKg: 110,
            reps: 7,
            rir: 2,
            isWarmup: true,
            groupKey: backoffKey,
            loggedAt: "2026-08-10T10:00:00.000Z",
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: targetId, sessionExerciseId, groupKey: topKey },
        },
      ];
      const result = await applySyncBatch(db, userId, batch);
      expect(result.rejected).toEqual([]);
      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, targetId));
      expect(row).toMatchObject({ isWarmup: true, groupKey: null });
    });

    it("later-op combination — a later op governing BOTH isWarmup and groupKey wins outright, with no forcing needed from the earlier op", async () => {
      const { sessionExerciseId, setIds } = await runGroupedSession([
        { groupKey: topKey, weightKg: 140, reps: 2, rir: 2 },
        { groupKey: backoffKey, weightKg: 110, reps: 7, rir: 2 },
      ]);
      const targetId = setIds[1]!;
      const batch: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: targetId,
            sessionExerciseId,
            setNumber: 2,
            weightKg: 110,
            reps: 7,
            rir: 2,
            isWarmup: true,
            groupKey: backoffKey,
            loggedAt: "2026-08-10T10:00:00.000Z",
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: { id: targetId, sessionExerciseId, isWarmup: false, groupKey: topKey },
        },
      ];
      const result = await applySyncBatch(db, userId, batch);
      expect(result.rejected).toEqual([]);
      const [row] = await db.select().from(setLogs).where(eq(setLogs.id, targetId));
      expect(row).toMatchObject({ isWarmup: false, groupKey: topKey });
    });
  });

  describe("Stage B — percentage-linked group loads", () => {
    it("CREATE — one-save authoring: a brand-new group links to another brand-new group in the SAME save, resolved to its real assigned key", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B One-Save",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                label: "Back-off",
                sets: { min: 2, max: 3 },
                reps: { min: 6, max: 8 },
                link: { refIndex: 0, percent: 80 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groupOverridesByIndex: { "1": { strategyId: "manual" } },
        },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const [top, backoff] = created.scheme.scheme.groups;
      expect(backoff!.link).toEqual({ ref: top!.key, percent: 80 });
      expect(created.progression.groups?.[backoff!.key]?.strategyId).toBe("manual");
    });

    it("CREATE — rejects a linked group whose effective strategy is not manual (rule L-1)", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B L-1",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      await expect(
        createPrescription(db, userId, templateId, {
          exerciseId: exercise.id,
          scheme: {
            v: 1,
            scheme: {
              type: "groups",
              groups: [
                { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
                {
                  label: "Back-off",
                  sets: { min: 2, max: 3 },
                  reps: { min: 6, max: 8 },
                  link: { refIndex: 0, percent: 80 },
                },
              ],
            },
          },
          progression: { strategyId: "load-progression" },
        }),
      ).rejects.toThrow(PrescriptionCompatibilityError);
    });

    it("UPDATE — a dangling link left by removing its reference group is rejected by the authoring schema before it ever reaches the service", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B Dangling Ref",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                label: "Back-off",
                sets: { min: 2, max: 3 },
                reps: { min: 6, max: 8 },
                link: { refIndex: 0, percent: 80 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groupOverridesByIndex: { "1": { strategyId: "manual" } },
        },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const backoff = created.scheme.scheme.groups[1]!;
      // Naively removing Top without also clearing Back-off's link — exactly
      // the state PrescriptionForm's own client-side `sanitizeGroupLinks`
      // prevents from ever being submitted; this proves the schema is a real
      // backstop, not merely a client-side courtesy.
      const dangling = setSchemeAuthoringEnvelopeSchema.safeParse({
        v: 1,
        scheme: { type: "groups", groups: [backoff] },
      });
      expect(dangling.success).toBe(false);
    });

    it("a real completion never persists a recommendation for a linked group, while its independent sibling still does", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B Completion",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
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
          strategyId: "load-progression",
          groupOverridesByIndex: { "1": { strategyId: "manual" } },
        },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const sbTopKey = created.scheme.scheme.groups[0]!.key;
      const sbBackoffKey = created.scheme.scheme.groups[1]!.key;

      const [row] = await db
        .select()
        .from(exercisePrescriptions)
        .where(eq(exercisePrescriptions.id, created.id));
      const rawProgression = row!.progression as {
        strategyId: string;
        config: Record<string, unknown>;
        classification: string;
        groups?: Record<
          string,
          { strategyId: string; config: Record<string, unknown>; classification: string }
        >;
      };
      const snapshot = {
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B Completion",
          scheme: (row!.scheme as { scheme: unknown }).scheme,
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: rawProgression.strategyId,
            strategyVersion: 1,
            config: rawProgression.config,
            classification: rawProgression.classification,
            groups: Object.fromEntries(
              Object.entries(rawProgression.groups ?? {}).map(([key, rp]) => [
                key,
                { ...rp, strategyVersion: 1, classification: "user_defined" },
              ]),
            ),
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      };

      const sessionId = newId();
      const sessionExerciseId = newId();
      const startedAt = "2026-08-10T10:00:00.000Z";
      const ops: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, blockId, templateId, startedAt },
        },
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId: exercise.id,
            position: 0,
            source: "template",
            prescription: snapshot,
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId,
            setNumber: 1,
            weightKg: 130,
            reps: 2,
            rir: 2,
            groupKey: sbTopKey,
            loggedAt: startedAt,
          },
        },
        // The athlete's actual logged back-off weight (105 kg) is exactly
        // what the client would have proposed (130 × 80% = 104 -> 105 at a
        // 2.5 kg step) — this test only asserts the SERVER never turns that
        // fact into a competing recommendation, not the client math itself
        // (covered by groupSelection.test.ts's resolveLinkedLoad suite).
        ...[105, 105].map((weightKg, index): SyncOpEnvelope => ({
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId,
            setNumber: index + 2,
            weightKg,
            reps: 7,
            rir: 2,
            groupKey: sbBackoffKey,
            loggedAt: startedAt,
          },
        })),
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, status: "completed", completedAt: "2026-08-10T11:00:00.000Z" },
        },
      ];
      const result = await applySyncBatch(db, userId, ops);
      expect(result.rejected).toEqual([]);

      const recs = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      expect(recs).toHaveLength(1);
      expect(recs[0]!.groupKey).toBe(sbTopKey);

      // The linked group's own sets are still real, attributed, persisted
      // facts — they simply never produce a recommendation.
      const backoffSets = await db.select().from(setLogs).where(eq(setLogs.groupKey, sbBackoffKey));
      expect(backoffSets).toHaveLength(2);
    });

    // Stage B remediation F-2 (set-groups-stage-b-review.md) — the review's
    // own "ordinary adoption" reproduction, at the service level: a
    // two-group slot progresses independently, earns a pending
    // recommendation per group, and is THEN converted — Back-off gains a
    // `link` and a forced `manual` override, exactly as PrescriptionForm.tsx
    // submits it. Before the fix, both groups' pending recommendations
    // still resolved through `resolveGroupRecommendation`, so the newly
    // -linked group kept a stale competing decision surface.
    it("linking a group that already holds a pending recommendation removes it from both the bundle and cross-device resume", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B F-2 Adoption",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
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
        progression: { strategyId: "load-progression" },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const f2TopKey = created.scheme.scheme.groups[0]!.key;
      const f2BackoffKey = created.scheme.scheme.groups[1]!.key;

      const snapshotFor = (schemeGroups: typeof created.scheme.scheme.groups) => ({
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B F-2 Adoption",
          scheme: { type: "groups" as const, groups: schemeGroups },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: "load-progression" as const,
            strategyVersion: 1,
            config: { incrementKg: 2.5 },
            classification: "heuristic" as const,
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      });

      // Complete a first session so BOTH groups earn a real pending
      // recommendation under ordinary, still-independent progression.
      const sessionId = newId();
      const sessionExerciseId = newId();
      const startedAt = "2026-08-10T10:00:00.000Z";
      const firstOps: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, blockId, templateId, startedAt },
        },
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: sessionExerciseId,
            sessionId,
            exerciseId: exercise.id,
            position: 0,
            source: "template",
            prescription: snapshotFor(created.scheme.scheme.groups),
          },
        },
        {
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId,
            setNumber: 1,
            weightKg: 130,
            reps: 2,
            rir: 2,
            groupKey: f2TopKey,
            loggedAt: startedAt,
          },
        },
        ...[102.5, 102.5].map((weightKg, index): SyncOpEnvelope => ({
          opId: newId(),
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId,
            setNumber: index + 2,
            weightKg,
            reps: 7,
            rir: 2,
            groupKey: f2BackoffKey,
            loggedAt: startedAt,
          },
        })),
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: sessionId, status: "completed", completedAt: "2026-08-10T11:00:00.000Z" },
        },
      ];
      expect((await applySyncBatch(db, userId, firstOps)).rejected).toEqual([]);

      const beforeLink = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      expect(beforeLink.filter((r) => r.decisionStatus === "pending")).toHaveLength(2);

      // Convert Back-off to a percentage link — exactly what the editor
      // submits: a `link` on the group plus a forced `manual` override.
      const updated = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: f2TopKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: f2BackoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { ref: f2TopKey, percent: 70 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: { [f2BackoffKey]: { strategyId: "manual" } },
        },
      });
      if (updated.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
      expect(updated.scheme.scheme.groups[1]!.link).toEqual({ ref: f2TopKey, percent: 70 });

      // Bundle assembly: only Top's pending recommendation is offered.
      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-11T09:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
      const entry = bundle.today.exercises.find((e) => e.exerciseId === exercise.id);
      expect(entry?.pendingRecommendations?.map((r) => r.groupKey)).toEqual([f2TopKey]);

      // Cross-device resume: start a second session and confirm resume
      // agrees — Back-off never surfaces a `.recommendations` entry.
      const secondSessionId = newId();
      const secondSessionExerciseId = newId();
      const secondStartedAt = "2026-08-11T10:00:00.000Z";
      const startOps: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: { id: secondSessionId, blockId, templateId, startedAt: secondStartedAt },
        },
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: secondSessionExerciseId,
            sessionId: secondSessionId,
            exerciseId: exercise.id,
            position: 0,
            source: "template",
            prescription: {
              v: 1 as const,
              snapshot: {
                ...snapshotFor(updated.scheme.scheme.groups).snapshot,
                progression: {
                  ...snapshotFor(updated.scheme.scheme.groups).snapshot.progression,
                  groups: {
                    [f2BackoffKey]: {
                      strategyId: "manual" as const,
                      strategyVersion: 1,
                      config: {},
                      classification: "user_defined" as const,
                    },
                  },
                },
              },
            },
          },
        },
      ];
      expect((await applySyncBatch(db, userId, startOps)).rejected).toEqual([]);

      const active = await getActiveSession(db, userId);
      const activeExercise = active?.exercises.find((e) => e.exerciseId === exercise.id);
      expect(activeExercise?.recommendations?.map((r) => r.groupKey)).toEqual([f2TopKey]);
    });

    // Stage B remediation V-1 (set-groups-stage-b-remediation-verification.md
    // §7) — F-2's `isLinked` read filter only hides a linked group's stale
    // pending record WHILE it stays linked; `evaluateGroupedExercise` never
    // evaluates a linked group at all (`if (group.link) continue`), so no
    // session completed while linked ever supersedes that record, and
    // unlinking makes it reachable again unchanged — a target computed
    // before real, differently-loaded work was already performed in that
    // exact group. `assembleAndEvaluate`'s new fix supersedes it at the
    // moment real work is actually logged into a linked group, which is the
    // only fact that could make it stale.
    it("V-1 — a stale pending record for a group does not resurface after unlink once real work was logged into it while linked", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B V-1 Unlink",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
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
        progression: { strategyId: "load-progression" },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const topKey = created.scheme.scheme.groups[0]!.key;
      const backoffKey = created.scheme.scheme.groups[1]!.key;

      const snapshotFor = (schemeGroups: typeof created.scheme.scheme.groups) => ({
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B V-1 Unlink",
          scheme: { type: "groups" as const, groups: schemeGroups },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: "load-progression" as const,
            strategyVersion: 1,
            config: { incrementKg: 2.5 },
            classification: "heuristic" as const,
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      });
      const linkedSnapshotFor = (schemeGroups: typeof created.scheme.scheme.groups) => ({
        v: 1 as const,
        snapshot: {
          ...snapshotFor(schemeGroups).snapshot,
          progression: {
            ...snapshotFor(schemeGroups).snapshot.progression,
            groups: {
              [backoffKey]: {
                strategyId: "manual" as const,
                strategyVersion: 1,
                config: {},
                classification: "user_defined" as const,
              },
            },
          },
        },
      });

      function completeSession(
        sessionId: string,
        sessionExerciseId: string,
        startedAt: string,
        completedAt: string,
        prescription: ReturnType<typeof snapshotFor>,
        sets: { groupKey: string; weightKg: number; reps: number; rir: number }[],
      ) {
        const ops: SyncOpEnvelope[] = [
          {
            opId: newId(),
            entity: "workoutSession",
            operation: "upsert",
            payload: { id: sessionId, blockId, templateId, startedAt },
          },
          {
            opId: newId(),
            entity: "sessionExercise",
            operation: "upsert",
            payload: {
              id: sessionExerciseId,
              sessionId,
              exerciseId: exercise.id,
              position: 0,
              source: "template",
              prescription,
            },
          },
          ...sets.map((s, index): SyncOpEnvelope => ({
            opId: newId(),
            entity: "setLog",
            operation: "upsert",
            payload: {
              id: newId(),
              sessionExerciseId,
              setNumber: index + 1,
              weightKg: s.weightKg,
              reps: s.reps,
              rir: s.rir,
              groupKey: s.groupKey,
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
        return applySyncBatch(db, userId, ops);
      }

      // Session 1 (unlinked): both groups earn a real, independent pending
      // recommendation.
      const session1Id = newId();
      const session1ExerciseId = newId();
      expect(
        (
          await completeSession(
            session1Id,
            session1ExerciseId,
            "2026-08-10T10:00:00.000Z",
            "2026-08-10T11:00:00.000Z",
            snapshotFor(created.scheme.scheme.groups),
            [
              { groupKey: topKey, weightKg: 130, reps: 2, rir: 2 },
              { groupKey: backoffKey, weightKg: 100, reps: 7, rir: 2 },
              { groupKey: backoffKey, weightKg: 100, reps: 7, rir: 2 },
            ],
          )
        ).rejected,
      ).toEqual([]);

      const afterSession1 = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session1BackoffRec = afterSession1.find(
        (r) => r.groupKey === backoffKey && r.decisionStatus === "pending",
      );
      expect(session1BackoffRec).toBeDefined();

      // Link Back-off to Top.
      const linked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { ref: topKey, percent: 70 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: { [backoffKey]: { strategyId: "manual" } },
        },
      });
      if (linked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      // Preservation — an ALREADY-RUNNING session started while linked still
      // shows nothing for Back-off (F-2's existing filter, unaffected by
      // this fix): started but not yet completed.
      const session2Id = newId();
      const session2ExerciseId = newId();
      const startSession2: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: {
            id: session2Id,
            blockId,
            templateId,
            startedAt: "2026-08-11T10:00:00.000Z",
          },
        },
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: session2ExerciseId,
            sessionId: session2Id,
            exerciseId: exercise.id,
            position: 0,
            source: "template",
            prescription: linkedSnapshotFor(linked.scheme.scheme.groups),
          },
        },
      ];
      expect((await applySyncBatch(db, userId, startSession2)).rejected).toEqual([]);
      const midSession = await getActiveSession(db, userId);
      const midSessionExercise = midSession?.exercises.find((e) => e.exerciseId === exercise.id);
      // Top (unlinked, independent) still surfaces its own session-1 pending
      // recommendation normally; Back-off (linked) surfaces nothing — F-2's
      // existing filter, unaffected by this fix, still holds mid-session.
      expect(midSessionExercise?.recommendations?.map((r) => r.groupKey)).toEqual([topKey]);

      // Complete session 2 WHILE LINKED: Top progresses independently as
      // usual; Back-off is actually logged (at 95 kg — below the stale 102.5
      // kg target) even though its OWN evaluation is skipped because it's
      // linked.
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session2ExerciseId,
                setNumber: 1,
                weightKg: 140,
                reps: 2,
                rir: 2,
                groupKey: topKey,
                loggedAt: "2026-08-11T10:05:00.000Z",
              },
            },
            ...[95, 95].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session2ExerciseId,
                setNumber: index + 2,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-11T10:10:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                status: "completed",
                completedAt: "2026-08-11T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      // The fix's direct effect: session 1's Back-off record is now
      // superseded, purely because real work was logged into that exact
      // group this session — never because a blanket rule superseded every
      // recommendation for the exercise (Top's own lineage below is
      // untouched by this fix, progressing entirely on its own terms).
      const afterSession2 = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session1BackoffAfter = afterSession2.find((r) => r.id === session1BackoffRec!.id);
      expect(session1BackoffAfter?.decisionStatus).toBe("superseded");
      const backoffRows = afterSession2.filter((r) => r.groupKey === backoffKey);
      expect(backoffRows.every((r) => r.decisionStatus !== "pending")).toBe(true);
      const topRows = afterSession2.filter((r) => r.groupKey === topKey);
      expect(topRows.filter((r) => r.decisionStatus === "pending")).toHaveLength(1);
      expect(topRows.find((r) => r.sourceSessionId === session2Id)?.decisionStatus).toBe("pending");

      // Unlink Back-off.
      const unlinked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
              },
            ],
          },
        },
        progression: { strategyId: "load-progression" },
      });
      if (unlinked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      // The core regression: the stale 102.5 kg record must not resurface,
      // in either read path.
      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-12T09:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
      const entry = bundle.today.exercises.find((e) => e.exerciseId === exercise.id);
      expect(entry?.pendingRecommendations?.find((r) => r.groupKey === backoffKey)).toBeUndefined();

      const session3Id = newId();
      const session3ExerciseId = newId();
      const startSession3: SyncOpEnvelope[] = [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: {
            id: session3Id,
            blockId,
            templateId,
            startedAt: "2026-08-12T10:00:00.000Z",
          },
        },
        {
          opId: newId(),
          entity: "sessionExercise",
          operation: "upsert",
          payload: {
            id: session3ExerciseId,
            sessionId: session3Id,
            exerciseId: exercise.id,
            position: 0,
            source: "template",
            prescription: snapshotFor(unlinked.scheme.scheme.groups),
          },
        },
      ];
      expect((await applySyncBatch(db, userId, startSession3)).rejected).toEqual([]);
      const resumed = await getActiveSession(db, userId);
      const resumedExercise = resumed?.exercises.find((e) => e.exerciseId === exercise.id);
      expect(
        resumedExercise?.recommendations?.find((r) => r.groupKey === backoffKey),
      ).toBeUndefined();

      // Subsequent, legitimate progression still works: complete session 3
      // (unlinked, evaluated normally) and confirm a FRESH pending record
      // appears for Back-off, sourced from THIS session.
      expect(
        (
          await applySyncBatch(db, userId, [
            ...[97.5, 97.5].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session3ExerciseId,
                setNumber: index + 1,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-12T10:05:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session3Id,
                status: "completed",
                completedAt: "2026-08-12T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);
      const afterSession3 = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const freshBackoff = afterSession3.find(
        (r) => r.groupKey === backoffKey && r.decisionStatus === "pending",
      );
      expect(freshBackoff?.sourceSessionId).toBe(session3Id);
    });

    // Coherence check (V-1's own review discussion) — link then unlink with
    // NO intervening workout: nothing became stale, so the pre-existing
    // pending record legitimately reappears unchanged. This is what proves
    // the fix supersedes on real, logged work only, never on the link/unlink
    // transition itself.
    it("V-1 coherence — link then unlink with no intervening workout leaves the original pending record intact and reachable", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B V-1 No Workout",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
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
        progression: { strategyId: "load-progression" },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const topKey = created.scheme.scheme.groups[0]!.key;
      const backoffKey = created.scheme.scheme.groups[1]!.key;

      const sessionId = newId();
      const sessionExerciseId = newId();
      const snapshot = {
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B V-1 No Workout",
          scheme: { type: "groups" as const, groups: created.scheme.scheme.groups },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: "load-progression" as const,
            strategyVersion: 1,
            config: { incrementKg: 2.5 },
            classification: "heuristic" as const,
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      };
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: sessionId,
                blockId,
                templateId,
                startedAt: "2026-08-10T10:00:00.000Z",
              },
            },
            {
              opId: newId(),
              entity: "sessionExercise",
              operation: "upsert",
              payload: {
                id: sessionExerciseId,
                sessionId,
                exerciseId: exercise.id,
                position: 0,
                source: "template",
                prescription: snapshot,
              },
            },
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId,
                setNumber: 1,
                weightKg: 130,
                reps: 2,
                rir: 2,
                groupKey: topKey,
                loggedAt: "2026-08-10T10:00:00.000Z",
              },
            },
            ...[100, 100].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId,
                setNumber: index + 2,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-10T10:00:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: sessionId,
                status: "completed",
                completedAt: "2026-08-10T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      const beforeLink = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const originalBackoffRec = beforeLink.find(
        (r) => r.groupKey === backoffKey && r.decisionStatus === "pending",
      );
      expect(originalBackoffRec).toBeDefined();

      // Link, then immediately unlink — no session completed in between.
      await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { ref: topKey, percent: 70 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: { [backoffKey]: { strategyId: "manual" } },
        },
      });
      const unlinked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
              },
            ],
          },
        },
        progression: { strategyId: "load-progression" },
      });
      if (unlinked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      const afterUnlink = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const originalStillPending = afterUnlink.find((r) => r.id === originalBackoffRec!.id);
      expect(originalStillPending?.decisionStatus).toBe("pending");

      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-11T09:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
      const entry = bundle.today.exercises.find((e) => e.exerciseId === exercise.id);
      expect(entry?.pendingRecommendations?.find((r) => r.groupKey === backoffKey)?.id).toBe(
        originalBackoffRec!.id,
      );
    });

    // Release-residual remediation W-1 (set-groups-release-residual-verification.md
    // §7, §4.2's P6 journey) — the V-1 supersession loop used to run in BOTH
    // modes; in `reevaluate` mode it lacked the per-(slot, groupKey)
    // still-pending guard the neighbouring `toPersist` supersede already has,
    // so correcting a set in an OLDER session frozen as linked could destroy a
    // NEWER, legitimate pending record for the same group produced by a later,
    // unlinked session. Reproduces the exact configuration the review used:
    // Top moved to a per-group `manual` override after unlink so session 3
    // evaluates Back-off only, leaving session 2's own Top record untouched —
    // isolating the correction's effect on Back-off specifically.
    it("W-1 — a historical correction to an older session frozen as linked must not supersede a newer, legitimate pending record for the same group", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B W-1 Reevaluate",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
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
        progression: { strategyId: "load-progression" },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const topKey = created.scheme.scheme.groups[0]!.key;
      const backoffKey = created.scheme.scheme.groups[1]!.key;

      const snapshotFor = (
        schemeGroups: typeof created.scheme.scheme.groups,
        topManual = false,
      ) => ({
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B W-1 Reevaluate",
          scheme: { type: "groups" as const, groups: schemeGroups },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: "load-progression" as const,
            strategyVersion: 1,
            config: { incrementKg: 2.5 },
            classification: "heuristic" as const,
            ...(topManual
              ? {
                  groups: {
                    [topKey]: {
                      strategyId: "manual" as const,
                      strategyVersion: 1,
                      config: {},
                      classification: "user_defined" as const,
                    },
                  },
                }
              : {}),
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      });
      const linkedSnapshotFor = (schemeGroups: typeof created.scheme.scheme.groups) => ({
        v: 1 as const,
        snapshot: {
          ...snapshotFor(schemeGroups).snapshot,
          progression: {
            ...snapshotFor(schemeGroups).snapshot.progression,
            groups: {
              [backoffKey]: {
                strategyId: "manual" as const,
                strategyVersion: 1,
                config: {},
                classification: "user_defined" as const,
              },
            },
          },
        },
      });

      function completeSession(
        sessionId: string,
        sessionExerciseId: string,
        startedAt: string,
        completedAt: string,
        prescription: ReturnType<typeof snapshotFor>,
        sets: { groupKey: string; weightKg: number; reps: number; rir: number }[],
      ) {
        const ops: SyncOpEnvelope[] = [
          {
            opId: newId(),
            entity: "workoutSession",
            operation: "upsert",
            payload: { id: sessionId, blockId, templateId, startedAt },
          },
          {
            opId: newId(),
            entity: "sessionExercise",
            operation: "upsert",
            payload: {
              id: sessionExerciseId,
              sessionId,
              exerciseId: exercise.id,
              position: 0,
              source: "template",
              prescription,
            },
          },
          ...sets.map((s, index): SyncOpEnvelope => ({
            opId: newId(),
            entity: "setLog",
            operation: "upsert",
            payload: {
              id: newId(),
              sessionExerciseId,
              setNumber: index + 1,
              weightKg: s.weightKg,
              reps: s.reps,
              rir: s.rir,
              groupKey: s.groupKey,
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
        return applySyncBatch(db, userId, ops);
      }

      // Session 1 (unlinked) — both groups earn a real, independent pending
      // recommendation.
      const session1Id = newId();
      const session1ExerciseId = newId();
      expect(
        (
          await completeSession(
            session1Id,
            session1ExerciseId,
            "2026-08-10T10:00:00.000Z",
            "2026-08-10T11:00:00.000Z",
            snapshotFor(created.scheme.scheme.groups),
            [
              { groupKey: topKey, weightKg: 130, reps: 2, rir: 2 },
              { groupKey: backoffKey, weightKg: 100, reps: 7, rir: 2 },
              { groupKey: backoffKey, weightKg: 100, reps: 7, rir: 2 },
            ],
          )
        ).rejected,
      ).toEqual([]);

      // Link Back-off to Top.
      const linked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { ref: topKey, percent: 70 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: { [backoffKey]: { strategyId: "manual" } },
        },
      });
      if (linked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      // Session 2 (linked) — Top progresses independently to a fresh pending
      // record (this is the record W-1 protects); Back-off is actually
      // logged at a different load even though its own evaluation is
      // skipped, superseding session 1's stale record (V-1's own rule,
      // unaffected by this pass).
      const session2Id = newId();
      const session2ExerciseId = newId();
      const backoffSet2Ids = [newId(), newId()];
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                blockId,
                templateId,
                startedAt: "2026-08-11T10:00:00.000Z",
              },
            },
            {
              opId: newId(),
              entity: "sessionExercise",
              operation: "upsert",
              payload: {
                id: session2ExerciseId,
                sessionId: session2Id,
                exerciseId: exercise.id,
                position: 0,
                source: "template",
                prescription: linkedSnapshotFor(linked.scheme.scheme.groups),
              },
            },
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session2ExerciseId,
                setNumber: 1,
                weightKg: 140,
                reps: 2,
                rir: 2,
                groupKey: topKey,
                loggedAt: "2026-08-11T10:05:00.000Z",
              },
            },
            ...[95, 95].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: backoffSet2Ids[index]!,
                sessionExerciseId: session2ExerciseId,
                setNumber: index + 2,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-11T10:10:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                status: "completed",
                completedAt: "2026-08-11T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      const afterSession2 = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session2TopRec = afterSession2.find(
        (r) => r.groupKey === topKey && r.sourceSessionId === session2Id,
      );
      expect(session2TopRec?.decisionStatus).toBe("pending");
      expect(
        afterSession2.filter((r) => r.groupKey === backoffKey && r.decisionStatus === "pending"),
      ).toHaveLength(0);

      // Unlink Back-off AND move Top to a per-group `manual` override — the
      // review's own P6 configuration — so session 3 evaluates Back-off
      // ONLY, leaving session 2's Top record untouched by anything other
      // than the correction below.
      const unlinked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: { [topKey]: { strategyId: "manual" } },
        },
      });
      if (unlinked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      // Session 3 — Back-off (unlinked, normal) evaluates freshly; Top
      // (now manual) is skipped entirely, so session 2's Top record is
      // never superseded by this session either.
      const session3Id = newId();
      const session3ExerciseId = newId();
      expect(
        (
          await completeSession(
            session3Id,
            session3ExerciseId,
            "2026-08-12T10:00:00.000Z",
            "2026-08-12T11:00:00.000Z",
            snapshotFor(unlinked.scheme.scheme.groups, true),
            [
              { groupKey: backoffKey, weightKg: 97.5, reps: 7, rir: 2 },
              { groupKey: backoffKey, weightKg: 97.5, reps: 7, rir: 2 },
            ],
          )
        ).rejected,
      ).toEqual([]);

      const afterSession3 = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session3BackoffRec = afterSession3.find(
        (r) => r.groupKey === backoffKey && r.sourceSessionId === session3Id,
      );
      expect(session3BackoffRec?.decisionStatus).toBe("pending");
      const session2TopStillPending = afterSession3.find((r) => r.id === session2TopRec!.id);
      expect(session2TopStillPending?.decisionStatus).toBe("pending");

      // The historical correction: edit one of session 2's own Back-off sets
      // (a completed session frozen as LINKED) through the real sync path —
      // a "relevant edit" on a completed session's set triggers
      // `reevaluateForSourceSessionExercise`, opened here by session 2's own
      // still-pending Top record.
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: backoffSet2Ids[0]!,
                sessionExerciseId: session2ExerciseId,
                setNumber: 2,
                weightKg: 96,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-11T10:10:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      // The core regression: session 3's legitimate, newer Back-off record
      // must survive a correction to the older, linked session 2.
      const afterCorrection = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session3BackoffAfter = afterCorrection.find((r) => r.id === session3BackoffRec!.id);
      expect(session3BackoffAfter?.decisionStatus).toBe("pending");
    });

    // Release-residual remediation W-2 (set-groups-release-residual-verification.md
    // §7, P9) — the loop used to enumerate candidates via `hasEvaluableStrategy`,
    // which is false when every group's effective strategy is manual; a linked
    // group is always manual, so a slot whose sibling is ALSO manual was
    // filtered out before the loop ever ran, leaving a stale pending record
    // reachable after unlink.
    it("W-2 — a linked group's stale record is still superseded when every group in the slot is manual, and does not resurface after unlink", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B W-2 All Manual",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
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
        progression: { strategyId: "load-progression" },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const topKey = created.scheme.scheme.groups[0]!.key;
      const backoffKey = created.scheme.scheme.groups[1]!.key;

      // Session 1 (unlinked, evaluable) — Back-off earns a real pending
      // record under ordinary progression.
      const session1Id = newId();
      const session1ExerciseId = newId();
      const snapshotFor = (
        schemeGroups: typeof created.scheme.scheme.groups,
        slotManual = false,
      ) => ({
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B W-2 All Manual",
          scheme: { type: "groups" as const, groups: schemeGroups },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: (slotManual ? "manual" : "load-progression") as
              "manual" | "load-progression",
            strategyVersion: 1,
            config: slotManual ? {} : { incrementKg: 2.5 },
            classification: "heuristic" as const,
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      });
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session1Id,
                blockId,
                templateId,
                startedAt: "2026-08-10T10:00:00.000Z",
              },
            },
            {
              opId: newId(),
              entity: "sessionExercise",
              operation: "upsert",
              payload: {
                id: session1ExerciseId,
                sessionId: session1Id,
                exerciseId: exercise.id,
                position: 0,
                source: "template",
                prescription: snapshotFor(created.scheme.scheme.groups),
              },
            },
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session1ExerciseId,
                setNumber: 1,
                weightKg: 130,
                reps: 2,
                rir: 2,
                groupKey: topKey,
                loggedAt: "2026-08-10T10:00:00.000Z",
              },
            },
            ...[100, 100].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session1ExerciseId,
                setNumber: index + 2,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-10T10:00:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session1Id,
                status: "completed",
                completedAt: "2026-08-10T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      const beforeLink = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session1BackoffRec = beforeLink.find(
        (r) => r.groupKey === backoffKey && r.decisionStatus === "pending",
      );
      expect(session1BackoffRec).toBeDefined();

      // Link Back-off AND make the SLOT default itself `manual` — Top has no
      // override, so it inherits `manual` too, making the whole slot
      // all-manual (Back-off's own L-1 requirement is satisfied by
      // inheriting the slot default; no explicit group override is needed).
      const linked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { ref: topKey, percent: 80 },
              },
            ],
          },
        },
        progression: { strategyId: "manual" },
      });
      if (linked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");
      expect(
        linked.progression.groups?.[backoffKey]?.strategyId ?? linked.progression.strategyId,
      ).toBe("manual");

      // Session 2 (all-manual slot, Back-off linked and actually performed
      // at a different load) — pre-fix, `hasEvaluableStrategy` would exclude
      // this exercise from the loop entirely; post-fix, the loop still
      // covers it.
      const session2Id = newId();
      const session2ExerciseId = newId();
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                blockId,
                templateId,
                startedAt: "2026-08-11T10:00:00.000Z",
              },
            },
            {
              opId: newId(),
              entity: "sessionExercise",
              operation: "upsert",
              payload: {
                id: session2ExerciseId,
                sessionId: session2Id,
                exerciseId: exercise.id,
                position: 0,
                source: "template",
                prescription: snapshotFor(linked.scheme.scheme.groups, true),
              },
            },
            ...[95, 95].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session2ExerciseId,
                setNumber: index + 1,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-11T10:05:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                status: "completed",
                completedAt: "2026-08-11T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      const afterSession2 = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session1BackoffAfter = afterSession2.find((r) => r.id === session1BackoffRec!.id);
      expect(session1BackoffAfter?.decisionStatus).toBe("superseded");

      // Unlink Back-off, restoring ordinary (evaluable) progression for the
      // slot.
      const unlinked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
              },
            ],
          },
        },
        progression: { strategyId: "load-progression" },
      });
      if (unlinked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-12T09:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
      const entry = bundle.today.exercises.find((e) => e.exerciseId === exercise.id);
      expect(entry?.pendingRecommendations?.find((r) => r.groupKey === backoffKey)).toBeUndefined();
    });

    // Release-residual remediation W-3 (set-groups-release-residual-verification.md
    // §7, P8) — the loop ran before `evaluateSession`'s own `isDeload`
    // short-circuit and had no deload condition of its own, so a deload
    // session with a linked, performed group superseded its pending record —
    // a recommendation-state change A-15/`recommendationForDeload` say a
    // deload must never make. Documents the consequence after unlink as an
    // explicit, accepted exception, not a silent behaviour change.
    it("W-3 — a deload session leaves a linked group's pending record untouched, so it legitimately resurfaces after unlink", async () => {
      const exercise = await createExercise(db, userId, {
        name: "Stage B W-3 Deload",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const created = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
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
        progression: { strategyId: "load-progression" },
      });
      if (!created || created.scheme.scheme.type !== "groups") {
        throw new Error("expected groups scheme");
      }
      const topKey = created.scheme.scheme.groups[0]!.key;
      const backoffKey = created.scheme.scheme.groups[1]!.key;

      const snapshotFor = (schemeGroups: typeof created.scheme.scheme.groups) => ({
        v: 1 as const,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: "Stage B W-3 Deload",
          scheme: { type: "groups" as const, groups: schemeGroups },
          targetRir: null,
          restSeconds: null,
          progression: {
            strategyId: "load-progression" as const,
            strategyVersion: 1,
            config: { incrementKg: 2.5 },
            classification: "heuristic" as const,
          },
          appliedModifiers: null,
          prefill: { loadKg: null, reps: null },
        },
      });
      const linkedSnapshotFor = (schemeGroups: typeof created.scheme.scheme.groups) => ({
        v: 1 as const,
        snapshot: {
          ...snapshotFor(schemeGroups).snapshot,
          progression: {
            ...snapshotFor(schemeGroups).snapshot.progression,
            groups: {
              [backoffKey]: {
                strategyId: "manual" as const,
                strategyVersion: 1,
                config: {},
                classification: "user_defined" as const,
              },
            },
          },
        },
      });

      // Session 1 (unlinked) — Back-off earns a real pending record.
      const session1Id = newId();
      const session1ExerciseId = newId();
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session1Id,
                blockId,
                templateId,
                startedAt: "2026-08-10T11:00:00.000Z",
              },
            },
            {
              opId: newId(),
              entity: "sessionExercise",
              operation: "upsert",
              payload: {
                id: session1ExerciseId,
                sessionId: session1Id,
                exerciseId: exercise.id,
                position: 0,
                source: "template",
                prescription: snapshotFor(created.scheme.scheme.groups),
              },
            },
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session1ExerciseId,
                setNumber: 1,
                weightKg: 130,
                reps: 2,
                rir: 2,
                groupKey: topKey,
                loggedAt: "2026-08-10T11:00:00.000Z",
              },
            },
            ...[100, 100].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session1ExerciseId,
                setNumber: index + 2,
                weightKg,
                reps: 7,
                rir: 2,
                groupKey: backoffKey,
                loggedAt: "2026-08-10T11:00:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session1Id,
                status: "completed",
                completedAt: "2026-08-10T12:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      const beforeLink = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      const session1BackoffRec = beforeLink.find(
        (r) => r.groupKey === backoffKey && r.decisionStatus === "pending",
      );
      expect(session1BackoffRec).toBeDefined();

      // Link Back-off to Top.
      const linked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
                link: { ref: topKey, percent: 70 },
              },
            ],
          },
        },
        progression: {
          strategyId: "load-progression",
          groups: { [backoffKey]: { strategyId: "manual" } },
        },
      });
      if (linked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      // Session 2 — a DELOAD session, Back-off linked and actually
      // performed at a different load. Must change NO recommendation state
      // at all (A-15), not merely leave Back-off's record untouched.
      const session2Id = newId();
      const session2ExerciseId = newId();
      expect(
        (
          await applySyncBatch(db, userId, [
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                blockId,
                templateId,
                startedAt: "2026-08-11T10:00:00.000Z",
                isDeload: true,
              },
            },
            {
              opId: newId(),
              entity: "sessionExercise",
              operation: "upsert",
              payload: {
                id: session2ExerciseId,
                sessionId: session2Id,
                exerciseId: exercise.id,
                position: 0,
                source: "template",
                prescription: linkedSnapshotFor(linked.scheme.scheme.groups),
              },
            },
            {
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session2ExerciseId,
                setNumber: 1,
                weightKg: 120,
                reps: 2,
                rir: 3,
                groupKey: topKey,
                loggedAt: "2026-08-11T10:05:00.000Z",
              },
            },
            ...[85, 85].map((weightKg, index): SyncOpEnvelope => ({
              opId: newId(),
              entity: "setLog",
              operation: "upsert",
              payload: {
                id: newId(),
                sessionExerciseId: session2ExerciseId,
                setNumber: index + 2,
                weightKg,
                reps: 7,
                rir: 3,
                groupKey: backoffKey,
                loggedAt: "2026-08-11T10:10:00.000Z",
              },
            })),
            {
              opId: newId(),
              entity: "workoutSession",
              operation: "upsert",
              payload: {
                id: session2Id,
                status: "completed",
                completedAt: "2026-08-11T11:00:00.000Z",
              },
            },
          ])
        ).rejected,
      ).toEqual([]);

      const afterDeload = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.exerciseId, exercise.id));
      // A-15 — a deload session changes NO recommendation state: same two
      // rows as before, both still exactly as they were.
      expect(afterDeload).toHaveLength(beforeLink.length);
      const session1BackoffAfterDeload = afterDeload.find((r) => r.id === session1BackoffRec!.id);
      expect(session1BackoffAfterDeload?.decisionStatus).toBe("pending");

      // Unlink Back-off — the documented consequence: because the deload
      // changed nothing, the pre-existing (now quite stale) record is
      // exactly as reachable as it always would have been. This is the
      // explicit, accepted exception, not a regression.
      const unlinked = await updatePrescription(db, userId, created.id, {
        scheme: {
          v: 1,
          scheme: {
            type: "groups",
            groups: [
              { key: topKey, label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
              {
                key: backoffKey,
                label: "Back-off",
                sets: { min: 2, max: 2 },
                reps: { min: 6, max: 8 },
              },
            ],
          },
        },
        progression: { strategyId: "load-progression" },
      });
      if (unlinked.scheme.scheme.type !== "groups") throw new Error("expected groups scheme");

      const bundle = await buildTodayBundle(db, userId, new Date("2026-08-12T09:00:00.000Z"));
      if (bundle.today.kind !== "scheduled") throw new Error("expected a scheduled day");
      const entry = bundle.today.exercises.find((e) => e.exerciseId === exercise.id);
      expect(entry?.pendingRecommendations?.find((r) => r.groupKey === backoffKey)?.id).toBe(
        session1BackoffRec!.id,
      );
    });
  });
});
