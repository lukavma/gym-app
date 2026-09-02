import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users, warmupRoutineItems, workoutTemplateWarmupRoutines } from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import {
  createWarmupRoutine,
  deleteWarmupRoutine,
  getWarmupRoutine,
  listTemplateWarmupRoutines,
  listWarmupRoutines,
  replaceWarmupRoutine,
  setTemplateWarmupRoutines,
  WarmupRoutineDefaultNotLinkedError,
  WarmupRoutineLinkTargetNotFoundError,
  WarmupRoutineNameConflictError,
  WarmupRoutineNotFoundError,
} from "@/server/warmupRoutines/service";

// Warm-up Routines v1 — CRUD, ownership, ordering, and the association /
// default invariants owner decision O-1 requires, against a real (PGlite)
// PostgreSQL. The same constraints were separately probed against a freshly
// migrated Docker PostgreSQL 16 (see the implementation report).

async function insertTestUser(db: AppDb, email = "lifter@example.com") {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const bikeAndBands = [
  { label: "Bike", instruction: "5 min easy" },
  { label: "Band external rotation", instruction: "2x15 light" },
  { label: "Horizontal rotation", instruction: null },
];

describe("warm-up routines service (PGlite integration)", () => {
  let db: AppDb;
  let userId: string;
  let programId: string;
  let upperAId: string;
  let upperBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    userId = (await insertTestUser(db)).id;
    programId = (await createProgram(db, userId, { name: "Program A" })).id;
    const upperA = await createTemplate(db, userId, programId, { name: "Upper A" });
    const upperB = await createTemplate(db, userId, programId, { name: "Upper B" });
    if (!upperA || !upperB) throw new Error("failed to create templates");
    upperAId = upperA.id;
    upperBId = upperB.id;
  });

  describe("create / read", () => {
    it("stores items in the submitted order with 0-based positions", async () => {
      const routine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: bikeAndBands,
      });

      expect(routine.name).toBe("Upper Standard");
      expect(routine.items.map((i) => [i.position, i.label, i.instruction])).toEqual([
        [0, "Bike", "5 min easy"],
        [1, "Band external rotation", "2x15 light"],
        [2, "Horizontal rotation", null],
      ]);
      expect(routine.linkedTemplateCount).toBe(0);
    });

    it("lists a user's routines name-sorted, case-insensitively", async () => {
      await createWarmupRoutine(db, userId, {
        name: "zebra",
        items: [{ label: "a", instruction: null }],
      });
      await createWarmupRoutine(db, userId, {
        name: "Alpha",
        items: [{ label: "a", instruction: null }],
      });
      await createWarmupRoutine(db, userId, {
        name: "middle",
        items: [{ label: "a", instruction: null }],
      });

      const routines = await listWarmupRoutines(db, userId);
      expect(routines.map((r) => r.name)).toEqual(["Alpha", "middle", "zebra"]);
    });

    it("rejects a duplicate name for the same user, case-insensitively", async () => {
      await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: [{ label: "a", instruction: null }],
      });
      await expect(
        createWarmupRoutine(db, userId, {
          name: "upper standard",
          items: [{ label: "a", instruction: null }],
        }),
      ).rejects.toThrow(WarmupRoutineNameConflictError);
    });

    it("allows the same name for a different user", async () => {
      const otherUserId = (await insertTestUser(db, "other@example.com")).id;
      await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: [{ label: "a", instruction: null }],
      });
      await expect(
        createWarmupRoutine(db, otherUserId, {
          name: "Upper Standard",
          items: [{ label: "a", instruction: null }],
        }),
      ).resolves.toBeTruthy();
    });
  });

  describe("ownership", () => {
    it("does not expose another user's routine by id or in the list", async () => {
      const otherUserId = (await insertTestUser(db, "other@example.com")).id;
      const mine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: [{ label: "a", instruction: null }],
      });

      await expect(getWarmupRoutine(db, otherUserId, mine.id)).resolves.toBeNull();
      await expect(listWarmupRoutines(db, otherUserId)).resolves.toEqual([]);
    });

    it("refuses to replace or delete another user's routine", async () => {
      const otherUserId = (await insertTestUser(db, "other@example.com")).id;
      const mine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: [{ label: "a", instruction: null }],
      });

      await expect(
        replaceWarmupRoutine(db, otherUserId, mine.id, {
          name: "Hijacked",
          items: [{ label: "x", instruction: null }],
        }),
      ).rejects.toThrow(WarmupRoutineNotFoundError);
      await expect(deleteWarmupRoutine(db, otherUserId, mine.id)).rejects.toThrow(
        WarmupRoutineNotFoundError,
      );

      const survivor = await getWarmupRoutine(db, userId, mine.id);
      expect(survivor?.name).toBe("Upper Standard");
    });

    it("treats a malformed uuid as not-found rather than letting SQLSTATE 22P02 escape as a 500", async () => {
      await expect(getWarmupRoutine(db, userId, "not-a-uuid")).resolves.toBeNull();
      await expect(
        replaceWarmupRoutine(db, userId, "not-a-uuid", {
          name: "x",
          items: [{ label: "a", instruction: null }],
        }),
      ).rejects.toThrow(WarmupRoutineNotFoundError);
      await expect(deleteWarmupRoutine(db, userId, "not-a-uuid")).rejects.toThrow(
        WarmupRoutineNotFoundError,
      );
      await expect(listTemplateWarmupRoutines(db, userId, "not-a-uuid")).resolves.toBeNull();
      await expect(
        setTemplateWarmupRoutines(db, userId, "not-a-uuid", {
          routineIds: [],
          defaultRoutineId: null,
        }),
      ).resolves.toBeNull();
    });
  });

  describe("replace (routine + items as one unit)", () => {
    it("replaces the name and the whole item list, renumbering positions", async () => {
      const routine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: bikeAndBands,
      });

      const updated = await replaceWarmupRoutine(db, userId, routine.id, {
        name: "Upper Standard v2",
        items: [
          { label: "Rower", instruction: "3 min" },
          { label: "Bike", instruction: null },
        ],
      });

      expect(updated.name).toBe("Upper Standard v2");
      expect(updated.items.map((i) => [i.position, i.label, i.instruction])).toEqual([
        [0, "Rower", "3 min"],
        [1, "Bike", null],
      ]);

      // No orphans: the old rows are gone, not merely detached.
      const remaining = await db
        .select()
        .from(warmupRoutineItems)
        .where(eq(warmupRoutineItems.routineId, routine.id));
      expect(remaining).toHaveLength(2);
    });

    it("reordering is just a replace with a different order", async () => {
      const routine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: bikeAndBands,
      });
      const reversed = [...bikeAndBands].reverse();

      const updated = await replaceWarmupRoutine(db, userId, routine.id, {
        name: routine.name,
        items: reversed,
      });
      expect(updated.items.map((i) => i.label)).toEqual([
        "Horizontal rotation",
        "Band external rotation",
        "Bike",
      ]);
    });

    it("rolls back entirely when the new name collides (no half-applied edit)", async () => {
      await createWarmupRoutine(db, userId, {
        name: "Taken",
        items: [{ label: "a", instruction: null }],
      });
      const routine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: bikeAndBands,
      });

      await expect(
        replaceWarmupRoutine(db, userId, routine.id, {
          name: "Taken",
          items: [{ label: "only", instruction: null }],
        }),
      ).rejects.toThrow(WarmupRoutineNameConflictError);

      const unchanged = await getWarmupRoutine(db, userId, routine.id);
      expect(unchanged?.name).toBe("Upper Standard");
      expect(unchanged?.items.map((i) => i.label)).toEqual([
        "Bike",
        "Band external rotation",
        "Horizontal rotation",
      ]);
    });
  });

  describe("hard delete (X-8)", () => {
    it("removes the routine, its items, and every template association", async () => {
      const routine = await createWarmupRoutine(db, userId, {
        name: "Upper Standard",
        items: bikeAndBands,
      });
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [routine.id],
        defaultRoutineId: routine.id,
      });
      await setTemplateWarmupRoutines(db, userId, upperBId, {
        routineIds: [routine.id],
        defaultRoutineId: null,
      });

      await deleteWarmupRoutine(db, userId, routine.id);

      await expect(getWarmupRoutine(db, userId, routine.id)).resolves.toBeNull();
      expect(
        await db
          .select()
          .from(warmupRoutineItems)
          .where(eq(warmupRoutineItems.routineId, routine.id)),
      ).toEqual([]);
      await expect(listTemplateWarmupRoutines(db, userId, upperAId)).resolves.toEqual([]);
      await expect(listTemplateWarmupRoutines(db, userId, upperBId)).resolves.toEqual([]);
    });

    it("throws not-found for an unknown id", async () => {
      await expect(deleteWarmupRoutine(db, userId, newId())).rejects.toThrow(
        WarmupRoutineNotFoundError,
      );
    });
  });

  describe("template associations (owner decisions O-1 / O-2)", () => {
    let upper: string;
    let shoulders: string;
    let hips: string;

    beforeEach(async () => {
      upper = (
        await createWarmupRoutine(db, userId, { name: "Upper Standard", items: bikeAndBands })
      ).id;
      shoulders = (
        await createWarmupRoutine(db, userId, {
          name: "Shoulder Prep",
          items: [{ label: "Horizontal rotation", instruction: "10 controlled reps" }],
        })
      ).id;
      hips = (
        await createWarmupRoutine(db, userId, {
          name: "Hip Prep",
          items: [{ label: "90/90", instruction: null }],
        })
      ).id;
    });

    it("links zero, one, or many routines, preserving the submitted order as position", async () => {
      await expect(listTemplateWarmupRoutines(db, userId, upperAId)).resolves.toEqual([]);

      const links = await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [shoulders, upper, hips],
        defaultRoutineId: upper,
      });
      expect(links?.map((l) => [l.position, l.name, l.isDefault])).toEqual([
        [0, "Shoulder Prep", false],
        [1, "Upper Standard", true],
        [2, "Hip Prep", false],
      ]);
    });

    it("carries each linked routine's items, in item order", async () => {
      const links = await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper],
        defaultRoutineId: null,
      });
      expect(links?.[0]?.items.map((i) => i.label)).toEqual([
        "Bike",
        "Band external rotation",
        "Horizontal rotation",
      ]);
    });

    it("keeps each template's curated set independent (Upper A and Upper B see only their own)", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper, shoulders],
        defaultRoutineId: upper,
      });
      await setTemplateWarmupRoutines(db, userId, upperBId, {
        routineIds: [hips],
        defaultRoutineId: hips,
      });

      const a = await listTemplateWarmupRoutines(db, userId, upperAId);
      const b = await listTemplateWarmupRoutines(db, userId, upperBId);
      expect(a?.map((l) => l.name)).toEqual(["Upper Standard", "Shoulder Prep"]);
      expect(b?.map((l) => l.name)).toEqual(["Hip Prep"]);
    });

    it("one routine may be the default of several templates (reuse, the core requirement)", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper],
        defaultRoutineId: upper,
      });
      await setTemplateWarmupRoutines(db, userId, upperBId, {
        routineIds: [upper],
        defaultRoutineId: upper,
      });

      expect((await listTemplateWarmupRoutines(db, userId, upperAId))?.[0]?.isDefault).toBe(true);
      expect((await listTemplateWarmupRoutines(db, userId, upperBId))?.[0]?.isDefault).toBe(true);
      expect((await getWarmupRoutine(db, userId, upper))?.linkedTemplateCount).toBe(2);
    });

    it("replacement is wholesale: reordering, adding, removing and re-defaulting are one call", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper, shoulders],
        defaultRoutineId: upper,
      });
      const links = await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [hips, shoulders],
        defaultRoutineId: shoulders,
      });

      expect(links?.map((l) => [l.position, l.name, l.isDefault])).toEqual([
        [0, "Hip Prep", false],
        [1, "Shoulder Prep", true],
      ]);
      // Exactly two rows exist — the replaced set did not accumulate.
      const rows = await db
        .select()
        .from(workoutTemplateWarmupRoutines)
        .where(eq(workoutTemplateWarmupRoutines.templateId, upperAId));
      expect(rows).toHaveLength(2);
    });

    it("an empty list clears every association and the default with it", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper],
        defaultRoutineId: upper,
      });
      await expect(
        setTemplateWarmupRoutines(db, userId, upperAId, {
          routineIds: [],
          defaultRoutineId: null,
        }),
      ).resolves.toEqual([]);
    });

    it("links may exist with no default at all (the compact-chooser case)", async () => {
      const links = await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper, shoulders],
        defaultRoutineId: null,
      });
      expect(links?.every((l) => !l.isDefault)).toBe(true);
    });

    it("never allows two defaults for one template — only the submitted id is marked", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper, shoulders, hips],
        defaultRoutineId: shoulders,
      });
      const rows = await db
        .select()
        .from(workoutTemplateWarmupRoutines)
        .where(
          and(
            eq(workoutTemplateWarmupRoutines.templateId, upperAId),
            eq(workoutTemplateWarmupRoutines.isDefault, true),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.routineId).toBe(shoulders);
    });

    it("rejects a default that is not in the submitted set, leaving the previous set intact", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper],
        defaultRoutineId: upper,
      });

      await expect(
        setTemplateWarmupRoutines(db, userId, upperAId, {
          routineIds: [shoulders],
          defaultRoutineId: hips,
        }),
      ).rejects.toThrow(WarmupRoutineDefaultNotLinkedError);

      const links = await listTemplateWarmupRoutines(db, userId, upperAId);
      expect(links?.map((l) => l.name)).toEqual(["Upper Standard"]);
      expect(links?.[0]?.isDefault).toBe(true);
    });

    it("rejects a routine that does not exist, atomically — the previous set is untouched", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper],
        defaultRoutineId: upper,
      });

      await expect(
        setTemplateWarmupRoutines(db, userId, upperAId, {
          routineIds: [shoulders, newId()],
          defaultRoutineId: shoulders,
        }),
      ).rejects.toThrow(WarmupRoutineLinkTargetNotFoundError);

      const links = await listTemplateWarmupRoutines(db, userId, upperAId);
      expect(links?.map((l) => l.name)).toEqual(["Upper Standard"]);
    });

    it("rejects another user's routine as a link target, and does not disclose that it exists", async () => {
      const otherUserId = (await insertTestUser(db, "other@example.com")).id;
      const foreign = await createWarmupRoutine(db, otherUserId, {
        name: "Not Mine",
        items: [{ label: "a", instruction: null }],
      });

      await expect(
        setTemplateWarmupRoutines(db, userId, upperAId, {
          routineIds: [foreign.id],
          defaultRoutineId: null,
        }),
      ).rejects.toThrow(WarmupRoutineLinkTargetNotFoundError);
    });

    it("returns null for another user's template, and writes nothing", async () => {
      const otherUserId = (await insertTestUser(db, "other@example.com")).id;
      await expect(listTemplateWarmupRoutines(db, otherUserId, upperAId)).resolves.toBeNull();
      await expect(
        setTemplateWarmupRoutines(db, otherUserId, upperAId, {
          routineIds: [],
          defaultRoutineId: null,
        }),
      ).resolves.toBeNull();
    });

    it("deleting a template's program cascades the links away without touching the routines", async () => {
      await setTemplateWarmupRoutines(db, userId, upperAId, {
        routineIds: [upper],
        defaultRoutineId: upper,
      });
      // Templates cascade from programs; associations cascade from templates.
      const { programs } = await import("@/db/schema");
      await db.delete(programs).where(eq(programs.id, programId));

      expect(await db.select().from(workoutTemplateWarmupRoutines)).toEqual([]);
      expect((await getWarmupRoutine(db, userId, upper))?.name).toBe("Upper Standard");
    });
  });
});
