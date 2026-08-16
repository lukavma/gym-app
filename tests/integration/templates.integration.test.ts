import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import { createProgram, setProgramArchived } from "@/server/programs/service";
import { activateBlock, createBlock } from "@/server/blocks/service";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  reorderTemplates,
  setTemplateArchived,
  TemplateNameConflictError,
  TemplateNotFoundError,
  TemplateReferencedError,
  TemplateReorderMismatchError,
  updateTemplate,
} from "@/server/templates/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("templates service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let programId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
    programId = (await createProgram(db, userId, { name: "Program A" })).id;
  });

  it("assigns sequential positions to newly created templates", async () => {
    const first = await createTemplate(db, userId, programId, { name: "Push Day" });
    const second = await createTemplate(db, userId, programId, { name: "Pull Day" });
    expect(first?.position).toBe(0);
    expect(second?.position).toBe(1);
  });

  it("returns null from createTemplate/listTemplates/reorderTemplates for a program owned by another user", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await expect(
      createTemplate(db, otherUserId, programId, { name: "Push Day" }),
    ).resolves.toBeNull();
    await expect(listTemplates(db, otherUserId, programId)).resolves.toBeNull();
    await expect(reorderTemplates(db, otherUserId, programId, [])).resolves.toBeNull();
  });

  it("rejects a second active template with the same name in the same program", async () => {
    await createTemplate(db, userId, programId, { name: "Push Day" });
    await expect(createTemplate(db, userId, programId, { name: "Push Day" })).rejects.toThrow(
      TemplateNameConflictError,
    );
  });

  it("allows the same template name in a different program owned by the same user", async () => {
    await setProgramArchived(db, userId, programId, "archive");
    const otherProgramId = (await createProgram(db, userId, { name: "Program B" })).id;
    await createTemplate(db, userId, programId, { name: "Push Day" });
    await expect(
      createTemplate(db, userId, otherProgramId, { name: "Push Day" }),
    ).resolves.toBeTruthy();
  });

  it("allows reusing a template name after the original is archived", async () => {
    const original = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!original) throw new Error("expected template");
    await setTemplateArchived(db, userId, original.id, "archive");
    await expect(createTemplate(db, userId, programId, { name: "Push Day" })).resolves.toBeTruthy();
  });

  it("excludes archived templates from the default list but includes them with includeArchived", async () => {
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    await setTemplateArchived(db, userId, template.id, "archive");

    const defaultList = await listTemplates(db, userId, programId);
    expect(defaultList?.find((t) => t.id === template.id)).toBeUndefined();

    const fullList = await listTemplates(db, userId, programId, { includeArchived: true });
    expect(fullList?.find((t) => t.id === template.id)).toBeTruthy();
  });

  it("blocks archiving a template scheduled in an active block", async () => {
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");

    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);

    await expect(setTemplateArchived(db, userId, template.id, "archive")).rejects.toThrow(
      TemplateReferencedError,
    );
  });

  it("allows archiving a template scheduled only in a planned (not-yet-active) block", async () => {
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");

    const block = await createBlock(db, userId, programId, {
      name: "Block 1",
      goal: "hypertrophy",
      startDate: "2026-01-01",
      weeksPlanned: 4,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");

    await expect(setTemplateArchived(db, userId, template.id, "archive")).resolves.toBeTruthy();
  });

  it("throws TemplateNotFoundError when updating another user's template", async () => {
    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    await expect(
      updateTemplate(db, otherUserId, template.id, { name: "Hijacked" }),
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it("returns null from getTemplate for another user's template", async () => {
    const otherUserId = (await insertTestUser(db, "other3@example.com")).id;
    const template = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    await expect(getTemplate(db, otherUserId, template.id)).resolves.toBeNull();
  });

  it("reorders templates to match the submitted id order", async () => {
    const first = await createTemplate(db, userId, programId, { name: "Push Day" });
    const second = await createTemplate(db, userId, programId, { name: "Pull Day" });
    if (!first || !second) throw new Error("expected templates");

    const reordered = await reorderTemplates(db, userId, programId, [second.id, first.id]);
    expect(reordered?.map((t) => t.id)).toEqual([second.id, first.id]);
    expect(reordered?.map((t) => t.position)).toEqual([0, 1]);
  });

  it("rejects a reorder whose ids don't match the program's current templates", async () => {
    const first = await createTemplate(db, userId, programId, { name: "Push Day" });
    if (!first) throw new Error("expected template");
    await expect(
      reorderTemplates(db, userId, programId, ["00000000-0000-7000-8000-000000000000"]),
    ).rejects.toThrow(TemplateReorderMismatchError);
  });
});
