import { beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import {
  createProgram,
  getProgram,
  listPrograms,
  ProgramActiveConflictError,
  ProgramNotFoundError,
  setProgramArchived,
  updateProgram,
} from "@/server/programs/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("programs service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
  });

  it("creates a program that is active by default", async () => {
    const program = await createProgram(db, userId, { name: "Hypertrophy Block" });
    expect(program.status).toBe("active");
    expect(program.archivedAt).toBeNull();
  });

  it("rejects a second active program for the same user", async () => {
    await createProgram(db, userId, { name: "Program A" });
    await expect(createProgram(db, userId, { name: "Program B" })).rejects.toThrow(
      ProgramActiveConflictError,
    );
  });

  it("allows two different users to each have an active program", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await createProgram(db, userId, { name: "Program A" });
    await expect(createProgram(db, otherUserId, { name: "Program A" })).resolves.toBeTruthy();
  });

  it("allows creating a new active program after archiving the previous one", async () => {
    const first = await createProgram(db, userId, { name: "Program A" });
    await setProgramArchived(db, userId, first.id, "archive");
    await expect(createProgram(db, userId, { name: "Program B" })).resolves.toBeTruthy();
  });

  it("excludes archived programs from the default list but includes them with includeArchived", async () => {
    const program = await createProgram(db, userId, { name: "Program A" });
    await setProgramArchived(db, userId, program.id, "archive");

    const defaultList = await listPrograms(db, userId);
    expect(defaultList.find((p) => p.id === program.id)).toBeUndefined();

    const fullList = await listPrograms(db, userId, { includeArchived: true });
    expect(fullList.find((p) => p.id === program.id)).toBeTruthy();
  });

  it("archived programs remain retrievable by id", async () => {
    const program = await createProgram(db, userId, { name: "Program A" });
    await setProgramArchived(db, userId, program.id, "archive");
    const fetched = await getProgram(db, userId, program.id);
    expect(fetched?.archivedAt).toBeInstanceOf(Date);
  });

  it("unarchiving clears archivedAt when there is no conflicting active program", async () => {
    const program = await createProgram(db, userId, { name: "Program A" });
    await setProgramArchived(db, userId, program.id, "archive");
    const restored = await setProgramArchived(db, userId, program.id, "unarchive");
    expect(restored.archivedAt).toBeNull();
    expect(restored.status).toBe("active");
  });

  it("rejects unarchiving into a collision with an already-active program", async () => {
    const first = await createProgram(db, userId, { name: "Program A" });
    await setProgramArchived(db, userId, first.id, "archive");
    await createProgram(db, userId, { name: "Program B" });

    await expect(setProgramArchived(db, userId, first.id, "unarchive")).rejects.toThrow(
      ProgramActiveConflictError,
    );
  });

  it("returns null from getProgram for another user's program", async () => {
    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const program = await createProgram(db, otherUserId, { name: "Program A" });
    await expect(getProgram(db, userId, program.id)).resolves.toBeNull();
  });

  it("throws ProgramNotFoundError when updating another user's program", async () => {
    const otherUserId = (await insertTestUser(db, "other3@example.com")).id;
    const program = await createProgram(db, otherUserId, { name: "Program A" });
    await expect(updateProgram(db, userId, program.id, { name: "Hijacked" })).rejects.toThrow(
      ProgramNotFoundError,
    );
  });

  it("throws ProgramNotFoundError when archiving a nonexistent program", async () => {
    await expect(
      setProgramArchived(db, userId, "00000000-0000-7000-8000-000000000000", "archive"),
    ).rejects.toThrow(ProgramNotFoundError);
  });

  it("updates editable fields", async () => {
    const program = await createProgram(db, userId, { name: "Program A" });
    const updated = await updateProgram(db, userId, program.id, {
      name: "Renamed",
      description: "New description",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("New description");
  });
});
