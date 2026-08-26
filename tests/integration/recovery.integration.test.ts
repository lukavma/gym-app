import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { recoveryEntries, users } from "@/db/schema";
import { isUuidv7 } from "@/domain/ids/uuidv7";
import {
  RecoveryEntryHasNoMetricError,
  RecoveryEntryNotFoundError,
  deleteRecoveryEntry,
  getTodayRecoveryEntry,
  listRecoveryEntries,
  logRecovery,
  updateRecoveryEntry,
} from "@/server/recovery/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("recovery service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
  });

  it("logs a recovery entry with a server-generated UUIDv7 id, defaulting to today's user-local date", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const entry = await logRecovery(
      db,
      userId,
      { sleepQuality: 4, readiness: 3, soreness: 2 },
      now,
    );
    expect(isUuidv7(entry.id)).toBe(true);
    expect(entry.date).toBe("2026-08-20");
    expect(entry.sleepQuality).toBe(4);
    expect(entry.readiness).toBe(3);
    expect(entry.soreness).toBe(2);
    expect(entry.sleepHours).toBeNull();
    expect(entry.note).toBeNull();
  });

  it("logs an entry with a single metric and no note", async () => {
    const entry = await logRecovery(db, userId, { date: "2026-08-20", soreness: 5 });
    expect(entry.soreness).toBe(5);
    expect(entry.sleepQuality).toBeNull();
    expect(entry.readiness).toBeNull();
  });

  // data-model.md §2.19 uq_recovery_day — same daily-grain upsert semantics
  // as bodyweight (implementation-plan.md Phase 7).
  it("updates the existing entry in place on a second check-in the same day", async () => {
    const first = await logRecovery(db, userId, {
      date: "2026-08-20",
      sleepQuality: 3,
      readiness: 3,
      soreness: 3,
    });
    const second = await logRecovery(db, userId, {
      date: "2026-08-20",
      sleepQuality: 5,
      readiness: 4,
      soreness: 2,
      note: "much better",
    });

    expect(second.id).toBe(first.id);
    expect(second.sleepQuality).toBe(5);
    expect(second.note).toBe("much better");
    expect(await listRecoveryEntries(db, userId)).toHaveLength(1);
  });

  it("lists entries most-recent-date-first", async () => {
    await logRecovery(db, userId, { date: "2026-08-01", soreness: 2 });
    await logRecovery(db, userId, { date: "2026-08-15", soreness: 3 });
    await logRecovery(db, userId, { date: "2026-08-10", soreness: 1 });

    const entries = await listRecoveryEntries(db, userId);
    expect(entries.map((e) => e.date)).toEqual(["2026-08-15", "2026-08-10", "2026-08-01"]);
  });

  it("edits a metric and note by id, leaving the date and other metrics untouched", async () => {
    const created = await logRecovery(db, userId, {
      date: "2026-08-20",
      sleepQuality: 3,
      readiness: 3,
      soreness: 3,
    });
    const updated = await updateRecoveryEntry(db, userId, created.id, {
      soreness: 5,
      note: "sore today",
    });
    expect(updated.soreness).toBe(5);
    expect(updated.sleepQuality).toBe(3);
    expect(updated.readiness).toBe(3);
    expect(updated.note).toBe("sore today");
    expect(updated.date).toBe("2026-08-20");
  });

  it("allows a note-only patch that leaves every metric untouched", async () => {
    const created = await logRecovery(db, userId, { date: "2026-08-20", readiness: 4 });
    const updated = await updateRecoveryEntry(db, userId, created.id, { note: "just a note" });
    expect(updated.readiness).toBe(4);
    expect(updated.note).toBe("just a note");
  });

  // data-model.md §2.19 ck_recovery_day — clearing every metric via an edit
  // would violate the same constraint a create would; the service must map
  // it to a domain error, not a raw DB 500.
  it("throws RecoveryEntryHasNoMetricError when an edit would clear every metric", async () => {
    const created = await logRecovery(db, userId, { date: "2026-08-20", soreness: 3 });
    await expect(updateRecoveryEntry(db, userId, created.id, { soreness: null })).rejects.toThrow(
      RecoveryEntryHasNoMetricError,
    );

    const [row] = await db.select().from(recoveryEntries).where(eq(recoveryEntries.id, created.id));
    expect(row?.soreness).toBe(3);
  });

  it("allows clearing one metric as long as another remains", async () => {
    const created = await logRecovery(db, userId, {
      date: "2026-08-20",
      readiness: 4,
      soreness: 3,
    });
    const updated = await updateRecoveryEntry(db, userId, created.id, { soreness: null });
    expect(updated.soreness).toBeNull();
    expect(updated.readiness).toBe(4);
  });

  it("throws RecoveryEntryNotFoundError when editing a nonexistent or foreign entry", async () => {
    await expect(
      updateRecoveryEntry(db, userId, "00000000-0000-7000-8000-000000000000", { soreness: 3 }),
    ).rejects.toThrow(RecoveryEntryNotFoundError);

    const otherUserId = (await insertTestUser(db, "other2@example.com")).id;
    const created = await logRecovery(db, otherUserId, { date: "2026-08-20", soreness: 3 });
    await expect(updateRecoveryEntry(db, userId, created.id, { soreness: 4 })).rejects.toThrow(
      RecoveryEntryNotFoundError,
    );
  });

  it("true-deletes an entry (no soft-delete/tombstone)", async () => {
    const created = await logRecovery(db, userId, { date: "2026-08-20", soreness: 3 });
    await deleteRecoveryEntry(db, userId, created.id);

    const [row] = await db.select().from(recoveryEntries).where(eq(recoveryEntries.id, created.id));
    expect(row).toBeUndefined();
    expect(await listRecoveryEntries(db, userId)).toHaveLength(0);
  });

  it("throws RecoveryEntryNotFoundError when deleting a nonexistent or foreign entry", async () => {
    await expect(
      deleteRecoveryEntry(db, userId, "00000000-0000-7000-8000-000000000000"),
    ).rejects.toThrow(RecoveryEntryNotFoundError);

    const otherUserId = (await insertTestUser(db, "other3@example.com")).id;
    const created = await logRecovery(db, otherUserId, { date: "2026-08-20", soreness: 3 });
    await expect(deleteRecoveryEntry(db, userId, created.id)).rejects.toThrow(
      RecoveryEntryNotFoundError,
    );
  });

  // data-model.md §2.19 — schema-level confirmation the check constraint
  // matches the spec exactly, independent of the Zod-layer tests.
  it("rejects a row with every metric null at the database constraint level", async () => {
    await expect(
      db.execute(
        sql`insert into recovery_entries (id, user_id, date) values (gen_random_uuid(), ${userId}, '2026-08-20')`,
      ),
    ).rejects.toThrow();
  });

  it("rejects a 1-5 metric outside its range at the database constraint level", async () => {
    await expect(
      db.execute(
        sql`insert into recovery_entries (id, user_id, date, soreness) values (gen_random_uuid(), ${userId}, '2026-08-20', 6)`,
      ),
    ).rejects.toThrow();
  });
});

// phase-7-review.md HIGH-1 — "determine today using the user's server-side
// timezone" before ever rendering a check-in form, so it can tell "nothing
// logged yet" apart from "already logged."
describe("getTodayRecoveryEntry (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
  });

  it("returns null when nothing is logged for today", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    await expect(getTodayRecoveryEntry(db, userId, now)).resolves.toBeNull();
  });

  it("returns the entry logged for today, not some other day", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    await logRecovery(db, userId, { date: "2026-08-19", soreness: 4 }, now);
    await logRecovery(db, userId, { date: "2026-08-20", soreness: 2 }, now);

    const today = await getTodayRecoveryEntry(db, userId, now);
    expect(today?.date).toBe("2026-08-20");
    expect(today?.soreness).toBe(2);
  });

  it("resolves 'today' from the user's own timezone, not UTC", async () => {
    await db
      .update(users)
      .set({ timezone: "Pacific/Kiritimati" }) // UTC+14
      .where(eq(users.id, userId));
    // 2026-06-15T23:30:00Z is already 2026-06-16 in Kiritimati.
    const now = new Date("2026-06-15T23:30:00.000Z");
    await logRecovery(db, userId, { soreness: 3 }, now);

    const entry = await getTodayRecoveryEntry(db, userId, now);
    expect(entry?.date).toBe("2026-06-16");
  });
});

// phase-7-review.md MEDIUM-1 — presence-aware upsert: a field the caller
// omits must preserve whatever the row already holds; a field explicitly
// sent as `null` deliberately clears it. This is the mechanism underneath
// HIGH-1's fix (the recovery card never sends `sleepHours` at all, so it
// can never null it) and is tested here independently of any UI.
describe("logRecovery presence semantics (PGlite integration, phase-7-review.md MEDIUM-1)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
  });

  it("preserves sleepHours when a later same-day call omits it entirely", async () => {
    await logRecovery(db, userId, { date: "2026-08-20", sleepHours: 7.5, sleepQuality: 4 });
    const second = await logRecovery(db, userId, { date: "2026-08-20", readiness: 3 });

    expect(second.sleepHours).toBe(7.5);
    expect(second.sleepQuality).toBe(4);
    expect(second.readiness).toBe(3);
  });

  it("preserves a previously saved note when a later same-day call omits it", async () => {
    await logRecovery(db, userId, {
      date: "2026-08-20",
      soreness: 3,
      note: "first note of the day",
    });
    const second = await logRecovery(db, userId, { date: "2026-08-20", soreness: 4 });

    expect(second.note).toBe("first note of the day");
    expect(second.soreness).toBe(4);
  });

  it("explicitly clears sleepHours when the caller sends null (deliberate clear, not omission)", async () => {
    await logRecovery(db, userId, { date: "2026-08-20", sleepHours: 7.5, sleepQuality: 4 });
    const cleared = await logRecovery(db, userId, {
      date: "2026-08-20",
      sleepHours: null,
      sleepQuality: 4,
    });

    expect(cleared.sleepHours).toBeNull();
    expect(cleared.sleepQuality).toBe(4);
  });

  it("explicitly clears a note when the caller sends null", async () => {
    await logRecovery(db, userId, { date: "2026-08-20", soreness: 3, note: "will be cleared" });
    const cleared = await logRecovery(db, userId, {
      date: "2026-08-20",
      soreness: 3,
      note: null,
    });

    expect(cleared.note).toBeNull();
  });

  it("throws RecoveryEntryHasNoMetricError rather than an unmapped DB error on a fresh day with no metric value", async () => {
    // Passes all-null metrics directly to the service (bypassing
    // logRecoveryInputSchema's own refine, which would reject this at the
    // route layer first) to prove the service layer's own guard — the DB
    // check-violation mapping — holds independently of Zod. This is the
    // path a fresh day's insert takes, distinct from updateRecoveryEntry's
    // pre-fetch-and-merge guard.
    await expect(
      logRecovery(db, userId, {
        date: "2026-08-20",
        sleepHours: null,
        sleepQuality: null,
        readiness: null,
        soreness: null,
        note: "only a note",
      }),
    ).rejects.toThrow(RecoveryEntryHasNoMetricError);

    expect(await listRecoveryEntries(db, userId)).toHaveLength(0);
  });

  it("throws RecoveryEntryHasNoMetricError when a same-day re-log would explicitly null every existing metric", async () => {
    await logRecovery(db, userId, { date: "2026-08-20", soreness: 3 });
    await expect(
      logRecovery(db, userId, {
        date: "2026-08-20",
        soreness: null,
      }),
    ).rejects.toThrow(RecoveryEntryHasNoMetricError);

    // The atomic INSERT ... ON CONFLICT DO UPDATE rejected by Postgres
    // itself leaves the original row untouched (transactional statement).
    const [entry] = await listRecoveryEntries(db, userId);
    expect(entry?.soreness).toBe(3);
  });
});
