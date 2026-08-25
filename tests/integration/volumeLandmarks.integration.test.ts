import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { blocks, users, volumeLandmarks, volumePresets } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { seedVolumePresets, RP_GENERAL_PRESET_ID } from "@/db/seed/volumePresets";
import { newId } from "@/domain/ids/uuidv7";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { activateBlock, createBlock } from "@/server/blocks/service";
import {
  NoActivePresetError,
  getWeeklyVolumeReport,
  upsertVolumeLandmark,
} from "@/server/volume/service";

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

describe("upsertVolumeLandmark (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    userId = user.id;
    // Runs after the user exists, so the default-preset init step
    // (src/db/seed/volumePresets.ts) actually reaches this user's row —
    // matches the real deploy pipeline's db:seed-after-user-creation order.
    await seedVolumePresets(db);
  });

  it("throws NoActivePresetError when there is no active preset", async () => {
    // Clear the default the seed just set, and confirm no active block
    // preset exists either.
    await db.update(users).set({ defaultVolumePresetId: null }).where(eq(users.id, userId));
    await expect(
      upsertVolumeLandmark(db, userId, { muscleGroupId: "chest", key: "mev", valueMin: 10 }),
    ).rejects.toThrow(NoActivePresetError);
  });

  it("editing a builtin landmark creates a user-owned copy and never mutates the builtin", async () => {
    const before = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));

    const updated = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 11,
      valueMax: 11,
    });

    expect(updated.id).not.toBe(RP_GENERAL_PRESET_ID);
    expect(updated.isBuiltin).toBe(false);
    expect(updated.classification).toBe("user_defined");

    const after = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, RP_GENERAL_PRESET_ID));
    expect(after).toEqual(before); // builtin untouched

    const [builtinChestMev] = before.filter((l) => l.muscleGroupId === "chest" && l.key === "mev");
    expect(builtinChestMev?.valueMin).toBe(10); // RP's seeded value, unchanged

    const copyChestMev = updated.landmarks.find(
      (l) => l.muscleGroupId === "chest" && l.key === "mev",
    );
    expect(copyChestMev?.valueMin).toBe(11);

    // The copy carried every other builtin landmark row over unedited.
    expect(updated.landmarks.length).toBe(before.length);
    const copyBiceps = updated.landmarks.find(
      (l) => l.muscleGroupId === "biceps" && l.key === "mev",
    );
    const builtinBiceps = before.find((l) => l.muscleGroupId === "biceps" && l.key === "mev");
    expect(copyBiceps?.valueMin).toBe(builtinBiceps?.valueMin);
  });

  it("makes the duplicate the user's new default so the next read reflects it immediately", async () => {
    await upsertVolumeLandmark(db, userId, { muscleGroupId: "chest", key: "mev", valueMin: 11 });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user?.defaultVolumePresetId).not.toBe(RP_GENERAL_PRESET_ID);

    const report = await getWeeklyVolumeReport(db, userId, new Date("2026-08-06T12:00:00.000Z"));
    const chestMev = report.activePreset?.landmarks.find(
      (l) => l.muscleGroupId === "chest" && l.key === "mev",
    );
    expect(chestMev?.valueMin).toBe(11);
  });

  it("editing an already user-owned preset updates the row in place (no further duplication)", async () => {
    const first = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 11,
    });
    const second = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 12,
    });

    expect(second.id).toBe(first.id); // same preset, no second duplicate
    const chestMev = second.landmarks.find((l) => l.muscleGroupId === "chest" && l.key === "mev");
    expect(chestMev?.valueMin).toBe(12);

    const rows = await db
      .select()
      .from(volumeLandmarks)
      .where(eq(volumeLandmarks.presetId, first.id));
    const matching = rows.filter((r) => r.muscleGroupId === "chest" && r.key === "mev");
    expect(matching).toHaveLength(1); // updated in place, not duplicated
  });

  // NOT a proof of the `pg_advisory_xact_lock` in `upsertVolumeLandmark` —
  // PGlite is a single in-process backend (one `pg_backend_pid()` for every
  // query) and drizzle's `db.transaction()` calls against it execute
  // strictly in sequence, so there is no interleaving here for an advisory
  // lock to prevent (this test still passes with the lock removed — see
  // docs/reviews/phase-6-remediation.md M-3). What this test *does* prove,
  // legitimately: on a serialized backend, two "first edit of the builtin"
  // calls converge on one copy rather than each independently duplicating —
  // i.e. the duplicate-on-first-edit logic itself is idempotent-under-
  // sequential-retry, which is a real property worth keeping covered here.
  // Real concurrent-connection lock coverage lives in
  // tests/integration/volumeLandmarksConcurrency.integration.test.ts,
  // gated on its own `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL`.
  it("converges sequential first-edit calls on one copy (not a concurrency/lock proof — see volumeLandmarksConcurrency.integration.test.ts)", async () => {
    await Promise.all([
      upsertVolumeLandmark(db, userId, {
        muscleGroupId: "chest",
        key: "mev",
        valueMin: 11,
      }),
      upsertVolumeLandmark(db, userId, {
        muscleGroupId: "quads",
        key: "mev",
        valueMin: 9,
      }),
    ]);

    const ownedPresets = await db
      .select({ id: volumePresets.id })
      .from(volumePresets)
      .where(eq(volumePresets.userId, userId));
    expect(ownedPresets).toHaveLength(1);

    const report = await getWeeklyVolumeReport(db, userId, new Date("2026-08-06T12:00:00.000Z"));
    const chestMev = report.activePreset?.landmarks.find(
      (landmark) => landmark.muscleGroupId === "chest" && landmark.key === "mev",
    );
    const quadsMev = report.activePreset?.landmarks.find(
      (landmark) => landmark.muscleGroupId === "quads" && landmark.key === "mev",
    );
    expect(chestMev?.valueMin).toBe(11);
    expect(quadsMev?.valueMin).toBe(9);
  });

  it("can add a landmark to a leaf that had none before (e.g. `lats`, which RP has no row for)", async () => {
    const updated = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "lats",
      key: "mev",
      valueMin: 8,
    });
    const lats = updated.landmarks.find((l) => l.muscleGroupId === "lats" && l.key === "mev");
    expect(lats?.valueMin).toBe(8);
  });

  it("represents an open-ended landmark with valueMax null and openEnded true", async () => {
    const updated = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "chest",
      key: "mrv",
      valueMin: 22,
      openEnded: true,
    });
    const mrv = updated.landmarks.find((l) => l.muscleGroupId === "chest" && l.key === "mrv");
    expect(mrv).toEqual(expect.objectContaining({ valueMin: 22, valueMax: null, openEnded: true }));
  });

  it("edits the active block's preset (not the user default) when a block preset is active, without ever leaking into another user's data", async () => {
    const program = await createProgram(db, userId, { name: "Program A" });
    const template = await createTemplate(db, userId, program.id, { name: "Push Day" });
    if (!template) throw new Error("expected template");
    const block = await createBlock(db, userId, program.id, {
      name: "Block 1",
      goal: "general",
      startDate: "2026-01-01",
      weeksPlanned: 8,
      schedule: [{ templateId: template.id }],
    });
    if (!block) throw new Error("expected block");
    await activateBlock(db, userId, block.id);
    await db
      .update(blocks)
      .set({ volumePresetId: RP_GENERAL_PRESET_ID })
      .where(eq(blocks.id, block.id));

    const otherUser = await insertTestUser(db, "other@example.com");
    // Give the newly-created user their own default too (mirrors a second
    // `pnpm db:seed` run after signup, per the real deploy pipeline).
    await seedVolumePresets(db);

    const updated = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 15,
    });

    const [refreshedBlock] = await db.select().from(blocks).where(eq(blocks.id, block.id));
    expect(refreshedBlock?.volumePresetId).toBe(updated.id); // block repointed, not the user default

    const [refreshedUser] = await db.select().from(users).where(eq(users.id, userId));
    expect(refreshedUser?.defaultVolumePresetId).toBe(RP_GENERAL_PRESET_ID); // untouched

    // Ownership isolation: the other user's own default (RP General, from
    // the seed) sees none of this edit.
    const otherReport = await getWeeklyVolumeReport(
      db,
      otherUser.id,
      new Date("2026-08-06T12:00:00.000Z"),
    );
    const otherChestMev = otherReport.activePreset?.landmarks.find(
      (l) => l.muscleGroupId === "chest" && l.key === "mev",
    );
    expect(otherChestMev?.valueMin).toBe(10); // RP's original seeded value
    expect(otherReport.activePreset?.id).toBe(RP_GENERAL_PRESET_ID);
  });

  it("cannot read another user's user-owned preset by id — no existence leakage", async () => {
    const owned = await upsertVolumeLandmark(db, userId, {
      muscleGroupId: "chest",
      key: "mev",
      valueMin: 11,
    });
    const otherUser = await insertTestUser(db, "other2@example.com");

    // Point the other user's default at the first user's preset id directly
    // (simulating a hypothetical id leak) and confirm resolution refuses it.
    await db
      .update(users)
      .set({ defaultVolumePresetId: owned.id })
      .where(eq(users.id, otherUser.id));

    const report = await getWeeklyVolumeReport(
      db,
      otherUser.id,
      new Date("2026-08-06T12:00:00.000Z"),
    );
    expect(report.activePreset).toBeNull(); // ownership check silently refuses, no leak, no crash
  });
});

describe("volume presets ownership FK cleanup", () => {
  it("a preset row can exist detached from any block/default reference (sanity check on schema wiring)", async () => {
    const db = await createTestDb();
    await seedMuscleGroups(db);
    const user = await insertTestUser(db);
    const [row] = await db
      .insert(volumePresets)
      .values({ id: newId(), userId: user.id, name: "Scratch", classification: "user_defined" })
      .returning();
    expect(row?.id).toBeTruthy();
  });
});
