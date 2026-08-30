import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { bodyweightEntries, recoveryEntries, users } from "@/db/schema";
import { isUuidv7 } from "@/domain/ids/uuidv7";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

// Phase 8 — bodyweight/recovery quick-logs joining the offline outbox
// (pwa-offline-strategy.md §2 capability matrix). These tests exercise the
// NEW sync-apply cases (src/server/sync/service.ts's
// applyBodyweightEntryUpsert/applyRecoveryEntryUpsert) — the underlying
// day-grain upsert semantics themselves are already covered by
// bodyweight.integration.test.ts / recovery.integration.test.ts.
async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("sync service — bodyweight/recovery entities (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
  });

  it("bodyweightEntry upsert creates a row using the client-supplied id", async () => {
    const clientId = newId();
    const ops: SyncOpEnvelope[] = [
      {
        opId: newId(),
        entity: "bodyweightEntry",
        operation: "upsert",
        payload: { id: clientId, date: "2026-08-20", weightKg: 82.5 },
      },
    ];

    const result = await applySyncBatch(db, userId, ops);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toEqual([ops[0]!.opId]);

    const [row] = await db
      .select()
      .from(bodyweightEntries)
      .where(eq(bodyweightEntries.userId, userId));
    expect(row?.id).toBe(clientId);
    expect(row?.date).toBe("2026-08-20");
    expect(Number(row?.weightKg)).toBe(82.5);
  });

  it("replaying the identical bodyweightEntry op twice converges (idempotent) without a second row", async () => {
    const op: SyncOpEnvelope = {
      opId: newId(),
      entity: "bodyweightEntry",
      operation: "upsert",
      payload: { id: newId(), date: "2026-08-20", weightKg: 80 },
    };

    await applySyncBatch(db, userId, [op]);
    const second = await applySyncBatch(db, userId, [op]);
    expect(second.applied).toEqual([op.opId]);

    const rows = await db
      .select()
      .from(bodyweightEntries)
      .where(eq(bodyweightEntries.userId, userId));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.weightKg)).toBe(80);
  });

  it("a second bodyweightEntry op for the same day updates in place with a DIFFERENT client id (day-grain upsert, not id-keyed)", async () => {
    const firstId = newId();
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "bodyweightEntry",
        operation: "upsert",
        payload: { id: firstId, date: "2026-08-20", weightKg: 80 },
      },
    ]);

    // A device offline across a whole day would enqueue this with a fresh
    // id, unaware a row already exists (src/sync/dailyLogs.ts never tracks
    // an existing entity id) — the server must still converge on ONE row,
    // keeping the original id, per the "id honored only on insert" contract.
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "bodyweightEntry",
        operation: "upsert",
        payload: { id: newId(), date: "2026-08-20", weightKg: 81.5 },
      },
    ]);

    const rows = await db
      .select()
      .from(bodyweightEntries)
      .where(eq(bodyweightEntries.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(firstId);
    expect(Number(rows[0]?.weightKg)).toBe(81.5);
  });

  it("recoveryEntry upsert only touches the fields present in the payload — a later op with a different field never drops the first", async () => {
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recoveryEntry",
        operation: "upsert",
        payload: { id: newId(), date: "2026-08-20", sleepQuality: 4 },
      },
    ]);
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recoveryEntry",
        operation: "upsert",
        payload: { id: newId(), date: "2026-08-20", readiness: 5 },
      },
    ]);

    const [row] = await db.select().from(recoveryEntries).where(eq(recoveryEntries.userId, userId));
    expect(row?.sleepQuality).toBe(4);
    expect(row?.readiness).toBe(5);
    expect(row?.soreness).toBeNull();
  });

  it("recoveryEntry upsert with an explicit null clears a field the caller actually touched", async () => {
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recoveryEntry",
        operation: "upsert",
        payload: { id: newId(), date: "2026-08-20", sleepQuality: 4, readiness: 3 },
      },
    ]);
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recoveryEntry",
        operation: "upsert",
        payload: { id: newId(), date: "2026-08-20", sleepQuality: null },
      },
    ]);

    const [row] = await db.select().from(recoveryEntries).where(eq(recoveryEntries.userId, userId));
    expect(row?.sleepQuality).toBeNull();
    expect(row?.readiness).toBe(3);
  });

  it("a brand-new day with zero metrics in the payload is rejected as no_metric, not silently dropped or a 500", async () => {
    const op: SyncOpEnvelope = {
      opId: newId(),
      entity: "recoveryEntry",
      operation: "upsert",
      payload: { id: newId(), date: "2026-08-20", note: "just a note, no metric" },
    };

    const result = await applySyncBatch(db, userId, [op]);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([
      { opId: op.opId, entity: "recoveryEntry", reason: "no_metric" },
    ]);

    const rows = await db.select().from(recoveryEntries).where(eq(recoveryEntries.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("recoveryEntry upsert with a client-supplied id is honored only on insert", async () => {
    const clientId = newId();
    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recoveryEntry",
        operation: "upsert",
        payload: { id: clientId, date: "2026-08-20", soreness: 2 },
      },
    ]);

    await applySyncBatch(db, userId, [
      {
        opId: newId(),
        entity: "recoveryEntry",
        operation: "upsert",
        payload: { id: newId(), date: "2026-08-20", soreness: 3 },
      },
    ]);

    const rows = await db.select().from(recoveryEntries).where(eq(recoveryEntries.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(clientId);
    expect(isUuidv7(rows[0]!.id)).toBe(true);
    expect(rows[0]?.soreness).toBe(3);
  });
});
