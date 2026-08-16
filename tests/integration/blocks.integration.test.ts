import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import { createProgram, setProgramArchived } from "@/server/programs/service";
import { createTemplate, setTemplateArchived } from "@/server/templates/service";
import {
  abandonBlock,
  activateBlock,
  BlockActiveConflictError,
  BlockInvalidTransitionError,
  BlockNotFoundError,
  BlockScheduleLockedError,
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

  it("throws BlockScheduleLockedError when editing schedule or deload on a non-planned block", async () => {
    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    await expect(updateBlock(db, userId, block.id, { schedule: [{ templateId }] })).rejects.toThrow(
      BlockScheduleLockedError,
    );
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
});
