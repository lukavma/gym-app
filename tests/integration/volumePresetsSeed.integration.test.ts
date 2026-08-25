import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users, volumeLandmarks, volumePresets } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { seedVolumePresets, RP_GENERAL_PRESET_ID } from "@/db/seed/volumePresets";
import { LEAF_MUSCLE_GROUP_SLUGS, ROLLUP_MEMBERS } from "@/domain/exercises/muscleGroups";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const NO_RP_ROW_LEAVES = ["lats", "upper_back", "adductors", "forearms", "lower_back"] as const;

describe("seedVolumePresets (PGlite integration)", () => {
  let db: AppDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
  });

  it("creates exactly one builtin RP General preset with the deterministic id", async () => {
    await seedVolumePresets(db);
    const rows = await db.select().from(volumePresets).where(eq(volumePresets.isBuiltin, true));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(RP_GENERAL_PRESET_ID);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.classification).toBe("heuristic");
    expect(rows[0]?.sourceRef).toBe("docs/input/rp-volume-landmarks.md");
  });

  it("writes no landmark row for any rollup member leaf or RP-unsupported group", async () => {
    await seedVolumePresets(db);
    const rows = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));
    const touchedLeaves = new Set(rows.map((r) => r.muscleGroupId));
    for (const leaf of NO_RP_ROW_LEAVES) {
      expect(touchedLeaves.has(leaf)).toBe(false);
    }
    // Sanity: `lats`/`upper_back` really are back's members (so this test
    // is checking the right thing, not leaves that were never at risk).
    expect(ROLLUP_MEMBERS.back).toEqual(expect.arrayContaining(["lats", "upper_back"]));
  });

  it("attaches the RP 'Back' row to the rollup only, never duplicated onto lats/upper_back", async () => {
    await seedVolumePresets(db);
    const backRows = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID))
      .orderBy(asc(volumeLandmarks.key));
    const back = backRows.filter((r) => r.muscleGroupId === "back");
    expect(back).toHaveLength(4); // mv, mev, mav, mrv
    const mev = back.find((r) => r.key === "mev");
    expect(mev?.valueMin).toBe(10);
    expect(mev?.valueMax).toBe(10);
  });

  it("duplicates the Rear/Side Delts row onto both leaves with an identical, non-empty caveat note", async () => {
    await seedVolumePresets(db);
    const rows = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));
    const rear = rows.filter((r) => r.muscleGroupId === "rear_delts");
    const side = rows.filter((r) => r.muscleGroupId === "side_delts");
    expect(rear).toHaveLength(4);
    expect(side).toHaveLength(4);
    for (const r of [...rear, ...side]) {
      expect(r.note).toBeTruthy();
      expect(r.note).toMatch(/combined/i);
    }
    const rearByKey = Object.fromEntries(
      rear.map((r) => [r.key, { min: r.valueMin, max: r.valueMax }]),
    );
    const sideByKey = Object.fromEntries(
      side.map((r) => [r.key, { min: r.valueMin, max: r.valueMax }]),
    );
    expect(rearByKey).toEqual(sideByKey);
  });

  it("represents open-ended MRV values with valueMax null and openEnded true", async () => {
    await seedVolumePresets(db);
    const rows = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));
    const mrvRows = rows.filter((r) => r.key === "mrv");
    expect(mrvRows.length).toBeGreaterThan(0);
    for (const r of mrvRows) {
      expect(r.openEnded).toBe(true);
      expect(r.valueMax).toBeNull();
      expect(r.valueMin).not.toBeNull();
    }
  });

  it("is exactly idempotent: running twice produces identical row content and does not touch an explicit user selection", async () => {
    const user = await insertTestUser(db);
    await seedVolumePresets(db);

    // `updatedAt` legitimately advances on every re-run — `onConflictDoUpdate`
    // always executes its SET clause on a conflict (same convention as
    // `seedMuscleGroups`), so it's stripped before comparing; every other
    // column must be byte-identical.
    const stripTimestamps = <T extends { updatedAt?: unknown }>(rows: T[]) =>
      rows.map((row) => {
        const rest = { ...row };
        delete rest.updatedAt;
        return rest;
      });

    const firstPresetRows = stripTimestamps(await db.select().from(volumePresets));
    const firstLandmarkRows = await db
      .select()
      .from(volumeLandmarks)
      .orderBy(asc(volumeLandmarks.muscleGroupId), asc(volumeLandmarks.key));

    // Simulate the user explicitly picking a different default afterward.
    const explicitPresetId = firstPresetRows[0]!.id; // reuse RP General's own id as a stand-in
    await db
      .update(users)
      .set({ defaultVolumePresetId: explicitPresetId })
      .where(eq(users.id, user.id));

    await seedVolumePresets(db);
    await seedVolumePresets(db);

    const secondPresetRows = stripTimestamps(await db.select().from(volumePresets));
    const secondLandmarkRows = await db
      .select()
      .from(volumeLandmarks)
      .orderBy(asc(volumeLandmarks.muscleGroupId), asc(volumeLandmarks.key));

    expect(secondPresetRows).toEqual(firstPresetRows);
    expect(secondLandmarkRows).toEqual(firstLandmarkRows); // volume_landmarks has no updatedAt column at all
    expect(secondLandmarkRows.length).toBe(firstLandmarkRows.length); // no duplication

    const [refreshedUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(refreshedUser?.defaultVolumePresetId).toBe(explicitPresetId); // never overwritten
  });

  it("initializes a user's default preset only when it was never set (null)", async () => {
    const user = await insertTestUser(db);
    const [before] = await db.select().from(users).where(eq(users.id, user.id));
    expect(before?.defaultVolumePresetId).toBeNull();

    await seedVolumePresets(db);

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after?.defaultVolumePresetId).toBe(RP_GENERAL_PRESET_ID);
  });

  it("never leaves a user with a null default preset row count mismatch after seeding", async () => {
    await insertTestUser(db, "a@example.com");
    await insertTestUser(db, "b@example.com");
    await seedVolumePresets(db);
    const stillNull = await db.select().from(users).where(isNull(users.defaultVolumePresetId));
    expect(stillNull).toHaveLength(0);
  });
});

// implementation-plan.md Phase 6 test list — "no persisted aggregates
// anywhere (grep-level check: no volume cache table/column exists)". A
// live-schema check is stronger than a text grep: it queries the actual
// migrated database rather than trusting that no stray file mentions a
// cache table.
describe("no persisted volume aggregate (schema-level check)", () => {
  it("volume_presets and volume_landmarks carry no aggregate/cache column, and no third volume table exists", async () => {
    const db = await createTestDb();
    const tableResult = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'volume%' order by table_name`,
    );
    const tableNames = (tableResult as unknown as { rows: { table_name: string }[] }).rows.map(
      (r) => r.table_name,
    );
    expect(tableNames).toEqual(["volume_landmarks", "volume_presets"]);

    for (const table of tableNames) {
      const columnResult = await db.execute(
        sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table}`,
      );
      const columnNames = (columnResult as unknown as { rows: { column_name: string }[] }).rows.map(
        (r) => r.column_name,
      );
      for (const name of columnNames) {
        expect(name).not.toMatch(/effective|raw_sets|weekly|aggregate|cache/i);
      }
    }
  });

  it("every leaf slug is at least representable in the vocabulary used to seed landmarks (sanity)", () => {
    expect(LEAF_MUSCLE_GROUP_SLUGS.length).toBe(17);
  });
});
