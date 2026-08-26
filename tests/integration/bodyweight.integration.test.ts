import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { bodyweightEntries, users } from "@/db/schema";
import { isUuidv7 } from "@/domain/ids/uuidv7";
import {
  BodyweightEntryNotFoundError,
  deleteBodyweightEntry,
  listBodyweightEntries,
  logBodyweight,
  updateBodyweightEntry,
} from "@/server/bodyweight/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("bodyweight service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
  });

  it("logs a bodyweight entry with a server-generated UUIDv7 id, defaulting to today's user-local date", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const entry = await logBodyweight(db, userId, { weightKg: 83.5 }, now);
    expect(isUuidv7(entry.id)).toBe(true);
    expect(entry.date).toBe("2026-08-20");
    expect(entry.weightKg).toBe(83.5);
    expect(entry.note).toBeNull();
  });

  it("respects an explicit date instead of deriving it from now", async () => {
    const entry = await logBodyweight(db, userId, { date: "2026-08-01", weightKg: 80 });
    expect(entry.date).toBe("2026-08-01");
  });

  // data-model.md §2.18 uq_bodyweight_day / mvp-scope.md F10 — "a second
  // entry for the same user-local day must update the existing entry rather
  // than create a duplicate or return a conflict."
  it("updates the existing entry in place on a second log the same day, rather than duplicating or conflicting", async () => {
    const first = await logBodyweight(db, userId, { date: "2026-08-20", weightKg: 83.5 });
    const second = await logBodyweight(db, userId, {
      date: "2026-08-20",
      weightKg: 84,
      note: "after breakfast",
    });

    expect(second.id).toBe(first.id);
    expect(second.weightKg).toBe(84);
    expect(second.note).toBe("after breakfast");

    const all = await listBodyweightEntries(db, userId);
    expect(all).toHaveLength(1);
  });

  it("allows the same date for two different users independently", async () => {
    const otherUserId = (await insertTestUser(db, "other@example.com")).id;
    await logBodyweight(db, userId, { date: "2026-08-20", weightKg: 83 });
    await expect(
      logBodyweight(db, otherUserId, { date: "2026-08-20", weightKg: 90 }),
    ).resolves.toBeTruthy();

    expect(await listBodyweightEntries(db, userId)).toHaveLength(1);
    expect(await listBodyweightEntries(db, otherUserId)).toHaveLength(1);
  });

  it("lists entries most-recent-date-first", async () => {
    await logBodyweight(db, userId, { date: "2026-08-01", weightKg: 80 });
    await logBodyweight(db, userId, { date: "2026-08-15", weightKg: 81 });
    await logBodyweight(db, userId, { date: "2026-08-10", weightKg: 82 });

    const entries = await listBodyweightEntries(db, userId);
    expect(entries.map((e) => e.date)).toEqual(["2026-08-15", "2026-08-10", "2026-08-01"]);
  });

  it("edits weight and note by id without changing the date", async () => {
    const created = await logBodyweight(db, userId, { date: "2026-08-20", weightKg: 83.5 });
    const updated = await updateBodyweightEntry(db, userId, created.id, {
      weightKg: 82.9,
      note: "corrected",
    });
    expect(updated.weightKg).toBe(82.9);
    expect(updated.note).toBe("corrected");
    expect(updated.date).toBe("2026-08-20");
  });

  it("throws BodyweightEntryNotFoundError when editing a nonexistent entry", async () => {
    await expect(
      updateBodyweightEntry(db, userId, "00000000-0000-7000-8000-000000000000", { weightKg: 80 }),
    ).rejects.toThrow(BodyweightEntryNotFoundError);
  });

  it("throws BodyweightEntryNotFoundError when editing another user's entry", async () => {
    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const created = await logBodyweight(db, otherUserId, { date: "2026-08-20", weightKg: 83 });
    await expect(updateBodyweightEntry(db, userId, created.id, { weightKg: 80 })).rejects.toThrow(
      BodyweightEntryNotFoundError,
    );
  });

  it("true-deletes an entry (no soft-delete/tombstone)", async () => {
    const created = await logBodyweight(db, userId, { date: "2026-08-20", weightKg: 83 });
    await deleteBodyweightEntry(db, userId, created.id);

    const [row] = await db
      .select()
      .from(bodyweightEntries)
      .where(eq(bodyweightEntries.id, created.id));
    expect(row).toBeUndefined();
    expect(await listBodyweightEntries(db, userId)).toHaveLength(0);
  });

  it("throws BodyweightEntryNotFoundError when deleting a nonexistent or foreign entry", async () => {
    await expect(
      deleteBodyweightEntry(db, userId, "00000000-0000-7000-8000-000000000000"),
    ).rejects.toThrow(BodyweightEntryNotFoundError);

    const otherUserId = (await insertTestUser(db, "other3@example.com")).id;
    const created = await logBodyweight(db, otherUserId, { date: "2026-08-20", weightKg: 83 });
    await expect(deleteBodyweightEntry(db, userId, created.id)).rejects.toThrow(
      BodyweightEntryNotFoundError,
    );
  });

  // data-model.md §2.18 — schema-level confirmation that the check
  // constraint matches the spec exactly (weight_kg between 20 and 400),
  // independent of the Zod-layer test in tests/unit/bodyweightSchema.test.ts.
  it("rejects a weight outside 20-400 at the database constraint level", async () => {
    await expect(
      db.execute(
        sql`insert into bodyweight_entries (id, user_id, date, weight_kg) values (gen_random_uuid(), ${userId}, '2026-08-20', 10)`,
      ),
    ).rejects.toThrow();
  });
});
