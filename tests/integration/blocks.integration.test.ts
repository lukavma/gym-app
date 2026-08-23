import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { createProgram, setProgramArchived } from "@/server/programs/service";
import { createTemplate, setTemplateArchived } from "@/server/templates/service";
import { createPrescription } from "@/server/prescriptions/service";
import { newId } from "@/domain/ids/uuidv7";
import {
  abandonBlock,
  activateBlock,
  BlockActiveConflictError,
  BlockInvalidTransitionError,
  BlockNotFoundError,
  BlockScheduleImmutableError,
  BlockScheduleTemplateArchivedError,
  BlockScheduleTemplateNotFoundError,
  completeBlock,
  createBlock,
  getBlock,
  listBlocks,
  updateBlock,
} from "@/server/blocks/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("blocks service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let programId: string;
  let templateId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
    programId = (await createProgram(db, userId, { name: "Program A" })).id;
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    templateId = template.id;
  });

  it("creates a block with a schedule in submitted order and sequence 0", async () => {
    const other = await createTemplate(db, userId, programId, { name: "Pull Day" });
    if (!other) throw new Error("expected template");

    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "strength",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId, weekdays: [1, 3] }, { templateId: other.id }],
    });
    expect(block?.sequence).toBe(0);
    expect(block?.status).toBe("planned");
    expect(block?.schedule.map((e) => e.templateId)).toEqual([templateId, other.id]);
    expect(block?.schedule[0]?.weekdays).toEqual([1, 3]);
    expect(block?.schedule[1]?.weekdays).toBeNull();
  });

  it("assigns incrementing sequence numbers to blocks within a program", async () => {
    const first = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    await abandonBlock(db, userId, first!.id);
    const second = await createBlock(db, userId, programId, {
      name: "Block 2",
      goal: "hypertrophy",
      startDate: "2026-02-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    expect(second?.sequence).toBe(1);
  });

  it("returns null from createBlock/listBlocks/getBlock for a program owned by another user", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await expect(
      createBlock(db, otherUserId, programId, {
        name: "Block 1",
        goal: "hypertrophy",
        startDate: "2026-01-01",
        weeksPlanned: 4,
        schedule: [{ templateId }],
      }),
    ).resolves.toBeNull();
    await expect(listBlocks(db, otherUserId, programId)).resolves.toBeNull();
  });

  it("throws BlockScheduleTemplateNotFoundError for a template outside the program", async () => {
    await setProgramArchived(db, userId, programId, "archive");
    const otherProgramId = (await createProgram(db, userId, { name: "Program B" })).id;
    const otherTemplate = await createTemplate(db, userId, otherProgramId, { name: "Legs Day" });
    if (!otherTemplate) throw new Error("expected template");

    await expect(
      createBlock(db, userId, programId, {
        name: "Block 1",
        goal: "hypertrophy",
        startDate: "2026-01-01",
        weeksPlanned: 4,
        schedule: [{ templateId: otherTemplate.id }],
      }),
    ).rejects.toThrow(BlockScheduleTemplateNotFoundError);
  });

  it("throws BlockScheduleTemplateArchivedError for an archived template", async () => {
    await setTemplateArchived(db, userId, templateId, "archive");
    await expect(
      createBlock(db, userId, programId, {
        name: "Block 1",
        goal: "hypertrophy",
        startDate: "2026-01-01",
        weeksPlanned: 4,
        schedule: [{ templateId }],
      }),
    ).rejects.toThrow(BlockScheduleTemplateArchivedError);
  });

  it("enforces at most one active block per program", async () => {
    const first = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    const second = await createBlock(db, userId, programId, {
      name: "Block 2",
      goal: "hypertrophy",
      startDate: "2026-02-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!first || !second) throw new Error("expected blocks");

    await activateBlock(db, userId, first.id);
    await expect(activateBlock(db, userId, second.id)).rejects.toThrow(BlockActiveConflictError);
  });

  it("walks the full planned -> active -> completed lifecycle", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");

    const activated = await activateBlock(db, userId, block.id);
    expect(activated.status).toBe("active");
    expect(activated.completedAt).toBeNull();

    const completed = await completeBlock(db, userId, block.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid lifecycle transitions", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");

    await expect(completeBlock(db, userId, block.id)).rejects.toThrow(BlockInvalidTransitionError);

    await activateBlock(db, userId, block.id);
    await expect(activateBlock(db, userId, block.id)).rejects.toThrow(BlockInvalidTransitionError);

    await completeBlock(db, userId, block.id);
    await expect(abandonBlock(db, userId, block.id)).rejects.toThrow(BlockInvalidTransitionError);
  });

  it("allows abandoning a block from planned or active", async () => {
    const planned = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!planned) throw new Error("expected block");
    const abandoned = await abandonBlock(db, userId, planned.id);
    expect(abandoned.status).toBe("abandoned");

    const active = await createBlock(db, userId, programId, {
      name: "Block 2",
      goal: "hypertrophy",
      startDate: "2026-02-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!active) throw new Error("expected block");
    await activateBlock(db, userId, active.id);
    const abandonedFromActive = await abandonBlock(db, userId, active.id);
    expect(abandonedFromActive.status).toBe("abandoned");
  });

  // Active-schedule remediation (docs/architecture/domain-model.md §9) —
  // schedule and deload stay mutable for as long as the block is still
  // running; only a finished block locks them. This replaces the earlier,
  // stricter rule that treated activation itself as the lock point.
  it("throws BlockScheduleImmutableError when editing schedule or deload on a completed or abandoned block", async () => {
    const completed = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!completed) throw new Error("expected block");
    await activateBlock(db, userId, completed.id);
    await completeBlock(db, userId, completed.id);

    await expect(
      updateBlock(db, userId, completed.id, { schedule: [{ templateId }] }),
    ).rejects.toThrow(BlockScheduleImmutableError);
    await expect(
      updateBlock(db, userId, completed.id, {
        deload: { mode: "scheduled", weekIndex: "last", modifiers: {} },
      }),
    ).rejects.toThrow(BlockScheduleImmutableError);

    const abandoned = await createBlock(db, userId, programId, {
      name: "Block 2",
      goal: "hypertrophy",
      startDate: "2026-02-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!abandoned) throw new Error("expected block");
    await abandonBlock(db, userId, abandoned.id);

    await expect(
      updateBlock(db, userId, abandoned.id, { schedule: [{ templateId }] }),
    ).rejects.toThrow(BlockScheduleImmutableError);
  });

  it("allows editing schedule while the block is still planned", async () => {
    const other = await createTemplate(db, userId, programId, { name: "Pull Day" });
    if (!other) throw new Error("expected template");
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");

    const updated = await updateBlock(db, userId, block.id, {
      schedule: [{ templateId: other.id }],
    });
    expect(updated.schedule.map((e) => e.templateId)).toEqual([other.id]);
  });

  // Active-schedule remediation acceptance — the full active-block schedule
  // editor: add another entry, remove an entry, change an entry's template,
  // add/remove weekdays, reorder, and switch fixed<->rotation mode, all on
  // an already-*active* block.
  it("allows the full schedule editor on an active block: add, remove, change template, edit weekdays, reorder, switch modes", async () => {
    const upperA = templateId;
    const lowerA = (await createTemplate(db, userId, programId, { name: "Lower A" }))!.id;
    const upperB = (await createTemplate(db, userId, programId, { name: "Upper B" }))!.id;
    const lowerB = (await createTemplate(db, userId, programId, { name: "Lower B" }))!.id;

    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: upperA, weekdays: [1] }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    // Add three more entries (a four-day Upper A / Lower A / Upper B /
    // Lower B fixed-weekday schedule) — the entry count grows while active.
    const withFourDays = await updateBlock(db, userId, block.id, {
      schedule: [
        { templateId: upperA, weekdays: [1] },
        { templateId: lowerA, weekdays: [2] },
        { templateId: upperB, weekdays: [4] },
        { templateId: lowerB, weekdays: [5] },
      ],
    });
    expect(withFourDays.schedule.map((e) => e.templateId)).toEqual([
      upperA,
      lowerA,
      upperB,
      lowerB,
    ]);

    // Move weekdays (Upper A now also covers Thursday, replacing Upper B's
    // slot) and reorder — Lower B moves ahead of Upper B in position order.
    const movedAndReordered = await updateBlock(db, userId, block.id, {
      schedule: [
        { templateId: upperA, weekdays: [1, 4] },
        { templateId: lowerA, weekdays: [2] },
        { templateId: lowerB, weekdays: [5] },
        { templateId: upperB, weekdays: [6] },
      ],
    });
    expect(
      movedAndReordered.schedule.map((e) => ({ templateId: e.templateId, weekdays: e.weekdays })),
    ).toEqual([
      { templateId: upperA, weekdays: [1, 4] },
      { templateId: lowerA, weekdays: [2] },
      { templateId: lowerB, weekdays: [5] },
      { templateId: upperB, weekdays: [6] },
    ]);

    // Remove an entry, then switch the whole schedule explicitly to
    // rotation mode (no entry has weekdays).
    const removed = await updateBlock(db, userId, block.id, {
      schedule: [
        { templateId: upperA, weekdays: [1, 4] },
        { templateId: lowerA, weekdays: [2] },
        { templateId: lowerB, weekdays: [5] },
      ],
    });
    expect(removed.schedule.map((e) => e.templateId)).toEqual([upperA, lowerA, lowerB]);

    const rotation = await updateBlock(db, userId, block.id, {
      schedule: [{ templateId: upperA }, { templateId: lowerA }, { templateId: lowerB }],
    });
    expect(rotation.schedule.every((e) => e.weekdays === null)).toBe(true);
  });

  it("allows editing scheduled-deload configuration on an active block", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    const withDeload = await updateBlock(db, userId, block.id, {
      deload: { mode: "scheduled", weekIndex: 4, modifiers: { setMultiplier: 0.5 } },
    });
    expect(withDeload.deload).toEqual({
      mode: "scheduled",
      weekIndex: 4,
      modifiers: { setMultiplier: 0.5 },
    });

    const cleared = await updateBlock(db, userId, block.id, { deload: null });
    expect(cleared.deload).toBeNull();
  });

  it("still rejects a cross-program or archived template when editing an active block's schedule", async () => {
    const unscheduled = await createTemplate(db, userId, programId, { name: "Bench Day" });
    if (!unscheduled) throw new Error("expected template");

    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    // Archiving is only blocked for a template still referenced by an
    // active block's schedule (domain-model.md §4) — `unscheduled` isn't,
    // so it can be archived, then rejected when the active block tries to
    // schedule it.
    await setTemplateArchived(db, userId, unscheduled.id, "archive");
    await expect(
      updateBlock(db, userId, block.id, { schedule: [{ templateId: unscheduled.id }] }),
    ).rejects.toThrow(BlockScheduleTemplateArchivedError);

    // Only one *active* program is allowed at a time (domain-model.md §4);
    // archiving programId to make room for a second doesn't touch this
    // block's own active status or ownership check.
    await setProgramArchived(db, userId, programId, "archive");
    const otherProgram = await createProgram(db, userId, { name: "Program B" });
    const otherTemplate = await createTemplate(db, userId, otherProgram.id, { name: "Legs Day" });
    if (!otherTemplate) throw new Error("expected template");
    await expect(
      updateBlock(db, userId, block.id, { schedule: [{ templateId: otherTemplate.id }] }),
    ).rejects.toThrow(BlockScheduleTemplateNotFoundError);
  });

  it("allows non-schedule fields (e.g. weeksPlanned) to be edited on an active block", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    const updated = await updateBlock(db, userId, block.id, { weeksPlanned: 6 });
    expect(updated.weeksPlanned).toBe(6);
  });

  it("throws BlockNotFoundError for lifecycle transitions on another user's block", async () => {
    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");

    await expect(activateBlock(db, otherUserId, block.id)).rejects.toThrow(BlockNotFoundError);
  });

  it("computes currentWeekIndex against the provided clock for an active block", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    // M2/M3 remediation: currentWeekIndex is status-aware — a block only has
    // a "current" execution week once it's active (see the planned-block
    // test below), so this scenario now activates the block first.
    await activateBlock(db, userId, block.id);

    const weekOne = await getBlock(db, userId, block.id, new Date("2026-01-01T12:00:00Z"));
    expect(weekOne?.currentWeekIndex).toBe(1);

    const weekTwo = await getBlock(db, userId, block.id, new Date("2026-01-08T12:00:00Z"));
    expect(weekTwo?.currentWeekIndex).toBe(2);
  });

  // M2/M3 remediation: a still-planned block hasn't started, so there is no
  // "current" week to report yet — see domain/scheduling/weekIndex.ts.
  it("reports a null currentWeekIndex for a still-planned block", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-06-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    expect(block?.currentWeekIndex).toBeNull();
  });

  // M2/M3 remediation: currentWeekIndex must stop advancing once a block
  // stops running, instead of growing forever against the wall clock.
  it("freezes currentWeekIndex at completion instead of growing with the wall clock", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);
    const completed = await completeBlock(db, userId, block.id);
    const atCompletion = completed.currentWeekIndex;
    expect(atCompletion).not.toBeNull();

    const muchLater = await getBlock(db, userId, block.id, new Date("2030-01-01T00:00:00Z"));
    expect(muchLater?.currentWeekIndex).toBe(atCompletion);
  });

  it("throws BlockNotFoundError when editing schedule on another user's block", async () => {
    const otherUserId = (await insertTestUser(db, "other3@example.com")).id;
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    await expect(
      updateBlock(db, otherUserId, block.id, { schedule: [{ templateId }] }),
    ).rejects.toThrow(BlockNotFoundError);
  });

  // Active-schedule remediation acceptance — editing an active block's
  // schedule/deload must never touch an in-progress or already-completed
  // session's frozen snapshot (ADR-007 snapshot-on-use; domain-model.md §9:
  // schedule edits change future workout resolution only).
  describe("session snapshot immutability across schedule/deload edits", () => {
    async function setUpBlockWithSession(status: "in_progress" | "completed") {
      await seedMuscleGroups(db);
      const exercise = await createExercise(db, userId, {
        name: "Back Squat",
        equipment: "barbell",
        mechanics: "compound",
        laterality: "bilateral",
        loadStepKg: 2.5,
        contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1 }],
      });
      const prescription = await createPrescription(db, userId, templateId, {
        exerciseId: exercise.id,
        scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
        progression: { strategyId: "manual" },
      });
      if (!prescription) throw new Error("expected prescription");
      const other = await createTemplate(db, userId, programId, { name: "Pull Day" });
      if (!other) throw new Error("expected template");

      const block = await createBlock(db, userId, programId, {
        name: "Block 1",
        goal: "hypertrophy",
        startDate: "2026-01-01",
        weeksPlanned: 8,
        schedule: [{ templateId, weekdays: [1] }],
        deload: { mode: "scheduled", weekIndex: 4, modifiers: { setMultiplier: 0.5 } },
      });
      if (!block) throw new Error("expected block");
      await activateBlock(db, userId, block.id);

      const startedAt = new Date("2026-01-05T09:00:00.000Z");
      const sessionId = newId();
      const sessionExerciseId = newId();
      const snapshot = {
        v: 1,
        snapshot: {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          scheme: { type: "fixed", sets: 3, reps: 5 },
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
      };
      await db.insert(workoutSessions).values({
        id: sessionId,
        userId,
        blockId: block.id,
        templateId,
        templateName: "Push Day",
        weekIndex: 1,
        isDeload: false,
        status,
        startedAt,
        completedAt: status === "completed" ? startedAt : null,
      });
      await db.insert(sessionExercises).values({
        id: sessionExerciseId,
        sessionId,
        exerciseId: exercise.id,
        position: 0,
        source: "template",
        prescription: snapshot,
      });
      await db.insert(setLogs).values({
        id: newId(),
        sessionExerciseId,
        setNumber: 1,
        isWarmup: false,
        weightKg: 100,
        reps: 5,
        rir: null,
        loggedAt: startedAt,
      });

      return { block, other, sessionId, sessionExerciseId };
    }

    async function readSessionRows(sessionId: string, sessionExerciseId: string) {
      const [session] = await db
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.id, sessionId));
      const [sessionExercise] = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.id, sessionExerciseId));
      return { session, sessionExercise };
    }

    it("leaves an in-progress session's frozen snapshot byte-identical after the block's schedule and deload are edited", async () => {
      const { block, other, sessionId, sessionExerciseId } =
        await setUpBlockWithSession("in_progress");
      const before = await readSessionRows(sessionId, sessionExerciseId);

      await updateBlock(db, userId, block.id, {
        schedule: [{ templateId: other.id, weekdays: [2] }],
        deload: { mode: "scheduled", weekIndex: "last", modifiers: { loadMultiplier: 0.8 } },
      });

      const after = await readSessionRows(sessionId, sessionExerciseId);
      expect(after).toEqual(before);
    });

    it("leaves an earlier completed session byte-identical after later schedule and deload edits", async () => {
      const { block, other, sessionId, sessionExerciseId } =
        await setUpBlockWithSession("completed");
      const before = await readSessionRows(sessionId, sessionExerciseId);

      await updateBlock(db, userId, block.id, {
        schedule: [{ templateId: other.id }],
        deload: null,
      });

      const after = await readSessionRows(sessionId, sessionExerciseId);
      expect(after).toEqual(before);
    });
  });
});
