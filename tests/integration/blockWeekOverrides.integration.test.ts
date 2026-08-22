import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock } from "@/server/blocks/service";
import {
  createWeekOverride,
  deleteWeekOverride,
  listWeekOverrides,
  updateWeekOverride,
  BlockNotFoundError,
  BlockWeekOverrideDuplicateError,
  BlockWeekOverrideNotFoundError,
} from "@/server/blocks/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("block week overrides (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let programId: string;
  let templateId: string;
  let blockId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
    const program = await createProgram(db, userId, { name: "Program A" });
    programId = program.id;
    const template = await createTemplate(db, userId, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    templateId = template.id;
    const block = await createBlock(db, userId, program.id, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    blockId = block.id;
  });

  it("creates and lists overrides ordered by week", async () => {
    await createWeekOverride(db, userId, blockId, {
      weekIndex: 4,
      type: "deload",
      modifiers: { setMultiplier: 0.5 },
    });
    await createWeekOverride(db, userId, blockId, {
      weekIndex: 2,
      type: "custom",
      modifiers: { loadMultiplier: 0.8 },
      note: "lighter technique week",
    });

    const overrides = await listWeekOverrides(db, userId, blockId);
    expect(overrides.map((o) => o.weekIndex)).toEqual([2, 4]);
    expect(overrides[0]?.type).toBe("custom");
    expect(overrides[0]?.note).toBe("lighter technique week");
    expect(overrides[1]?.modifiers).toEqual({ setMultiplier: 0.5 });
  });

  it("allows creating an override regardless of block status (not locked to planned)", async () => {
    // Block starts 'planned' by default (no activateBlock call here) — this
    // asserts overrides work at all statuses, unlike schedule/deload.
    await expect(
      createWeekOverride(db, userId, blockId, {
        weekIndex: 1,
        type: "deload",
        modifiers: {},
      }),
    ).resolves.toMatchObject({ weekIndex: 1, type: "deload" });
  });

  it("rejects a duplicate (block, week) pair", async () => {
    await createWeekOverride(db, userId, blockId, {
      weekIndex: 3,
      type: "deload",
      modifiers: {},
    });
    await expect(
      createWeekOverride(db, userId, blockId, {
        weekIndex: 3,
        type: "custom",
        modifiers: {},
      }),
    ).rejects.toThrow(BlockWeekOverrideDuplicateError);
  });

  it("rejects mutations for a block owned by another user", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await expect(
      createWeekOverride(db, otherUserId, blockId, {
        weekIndex: 1,
        type: "deload",
        modifiers: {},
      }),
    ).rejects.toThrow(BlockNotFoundError);
    await expect(listWeekOverrides(db, otherUserId, blockId)).rejects.toThrow(BlockNotFoundError);
  });

  it("updates type/modifiers/note but not weekIndex", async () => {
    const created = await createWeekOverride(db, userId, blockId, {
      weekIndex: 5,
      type: "deload",
      modifiers: { setMultiplier: 0.5 },
    });

    const updated = await updateWeekOverride(db, userId, blockId, created.id, {
      type: "custom",
      modifiers: { loadMultiplier: 0.85 },
      note: "revised",
    });
    expect(updated.weekIndex).toBe(5);
    expect(updated.type).toBe("custom");
    expect(updated.modifiers).toEqual({ loadMultiplier: 0.85 });
    expect(updated.note).toBe("revised");
  });

  it("throws BlockWeekOverrideNotFoundError for an unknown override id", async () => {
    await expect(
      updateWeekOverride(db, userId, blockId, "00000000-0000-0000-0000-000000000000", {
        note: "x",
      }),
    ).rejects.toThrow(BlockWeekOverrideNotFoundError);
    await expect(
      deleteWeekOverride(db, userId, blockId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(BlockWeekOverrideNotFoundError);
  });

  it("deletes an override", async () => {
    const created = await createWeekOverride(db, userId, blockId, {
      weekIndex: 6,
      type: "deload",
      modifiers: {},
    });
    await deleteWeekOverride(db, userId, blockId, created.id);
    expect(await listWeekOverrides(db, userId, blockId)).toEqual([]);
  });

  it("a week override created on one block is not visible on a freshly created second block", async () => {
    await createWeekOverride(db, userId, blockId, {
      weekIndex: 1,
      type: "deload",
      modifiers: { setMultiplier: 0.5 },
    });

    // Same program/template as the first block (only one active program is
    // allowed per user) — a second, still-'planned' block within it is
    // enough to prove the new table isolates by block_id.
    const secondBlock = await createBlock(db, userId, programId, {
      name: "Block 2",
      goal: "hypertrophy",
      startDate: "2026-02-01",
      weeksPlanned: 8,
      schedule: [{ templateId }],
    });
    if (!secondBlock) throw new Error("expected second block");

    expect(await listWeekOverrides(db, userId, secondBlock.id)).toEqual([]);
  });
});
