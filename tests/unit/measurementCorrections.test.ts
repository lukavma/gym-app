// Athletic Measurement Profiles Release 2 — O-13 (§12.3) coverage for
// src/sync/corrections.ts: `correctHistorySet` now routes through
// `buildSetLogCorrectionPayload` (schema-parsed, closing the gap at
// `corrections.ts:30`), and `deleteHistorySet` now takes the parent slot's
// frozen `profile` and threads it into `buildSetDeletionOps` so its
// renumber upserts are profile-scoped, same as the in-session path.
//
// Driven against the REAL `enqueueOp`/`enqueueOps` (src/sync/outbox.ts) and
// a REAL IndexedDB (fake-indexeddb), following the pattern established by
// tests/unit/measurementActiveSession.test.ts.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import type { SetLogRowFields } from "@/domain/sync/setDeletionOps";

const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("correctHistorySet — schema-parsed via buildSetLogCorrectionPayload (O-13)", () => {
  it("enqueues a schema-valid partial payload for a distance/duration correction", async () => {
    const { correctHistorySet } = await import("@/sync/corrections");
    const setId = newId();
    const sessionExerciseId = newId();

    await correctHistorySet(setId, sessionExerciseId, { durationS: null });

    const ops = await readOutbox();
    expect(ops).toEqual([
      {
        entity: "setLog",
        payload: { id: setId, sessionExerciseId, durationS: null },
      },
    ]);
    expect(flushOutbox).toHaveBeenCalledTimes(1);
  });

  it("throws — and enqueues nothing — for an out-of-range value, closing the pre-O-13 unvalidated gap", async () => {
    const { correctHistorySet } = await import("@/sync/corrections");
    const setId = newId();
    const sessionExerciseId = newId();

    await expect(
      correctHistorySet(setId, sessionExerciseId, { rir: 99 as unknown as number }),
    ).rejects.toThrow();

    expect(await readOutbox()).toEqual([]);
    expect(flushOutbox).not.toHaveBeenCalled();
  });
});

describe("deleteHistorySet — profile-scoped renumber upserts (O-13)", () => {
  it("a load_distance slot's renumbered survivor carries weightKg/distanceM/durationS(null), omits reps/rir", async () => {
    const { deleteHistorySet } = await import("@/sync/corrections");
    const sessionExerciseId = newId();
    const sets: SetLogRowFields[] = [
      {
        id: newId(),
        setNumber: 1,
        isWarmup: false,
        weightKg: 40,
        reps: null,
        rir: null,
        distanceM: 100,
        durationS: null,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
      {
        id: newId(),
        setNumber: 2,
        isWarmup: false,
        weightKg: 42,
        reps: null,
        rir: null,
        distanceM: 110,
        durationS: null,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
    ];

    await deleteHistorySet(sessionExerciseId, sets[0]!.id, sets, "load_distance");

    const ops = await readOutbox();
    expect(ops.map((op) => op.entity)).toEqual(["setLog", "setLog"]);
    const renumberOp = ops[1]!;
    expect(renumberOp.payload).toMatchObject({
      setNumber: 1,
      weightKg: 42,
      distanceM: 110,
      durationS: null,
    });
    expect(Object.keys(renumberOp.payload).sort()).toEqual(
      [
        "id",
        "sessionExerciseId",
        "setNumber",
        "isWarmup",
        "weightKg",
        "distanceM",
        "durationS",
        "loggedAt",
        "notes",
      ].sort(),
    );
  });

  // A-13 (client side) — the same property the integration test's A-13
  // block proves against a real database: renumbering after a delete on a
  // load_distance slot preserves BOTH distanceM and durationS, in ascending
  // order, across every survivor (not just the one adjacent to the deleted
  // round).
  it("A-13 — deleting the first of three load_distance rounds renumbers the rest, preserving distanceM/durationS in ascending order", async () => {
    const { deleteHistorySet } = await import("@/sync/corrections");
    const sessionExerciseId = newId();
    const sets: SetLogRowFields[] = [
      {
        id: newId(),
        setNumber: 1,
        isWarmup: false,
        weightKg: 25,
        reps: null,
        rir: null,
        distanceM: 20,
        durationS: 12,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
      {
        id: newId(),
        setNumber: 2,
        isWarmup: false,
        weightKg: 27,
        reps: null,
        rir: null,
        distanceM: 30,
        durationS: 15,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
      {
        id: newId(),
        setNumber: 3,
        isWarmup: false,
        weightKg: 29,
        reps: null,
        rir: null,
        distanceM: 40,
        durationS: 18,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
    ];

    await deleteHistorySet(sessionExerciseId, sets[0]!.id, sets, "load_distance");

    const ops = await readOutbox();
    expect(ops.map((op) => op.entity)).toEqual(["setLog", "setLog", "setLog"]);
    const renumbered = ops.slice(1).map((op) => op.payload);
    expect(renumbered.map((p) => [p.setNumber, p.distanceM, p.durationS])).toEqual([
      [1, 30, 15],
      [2, 40, 18],
    ]);
    // Ascending order, explicitly, across both preserved fields.
    for (let i = 1; i < renumbered.length; i++) {
      expect(renumbered[i]!.setNumber as number).toBeGreaterThan(
        renumbered[i - 1]!.setNumber as number,
      );
      expect(renumbered[i]!.distanceM as number).toBeGreaterThan(
        renumbered[i - 1]!.distanceM as number,
      );
      expect(renumbered[i]!.durationS as number).toBeGreaterThan(
        renumbered[i - 1]!.durationS as number,
      );
    }
  });

  it("a load_reps slot's renumbered survivor stays the nine-key shape (profile defaulting unaffected)", async () => {
    const { deleteHistorySet } = await import("@/sync/corrections");
    const sessionExerciseId = newId();
    const sets: SetLogRowFields[] = [
      {
        id: newId(),
        setNumber: 1,
        isWarmup: false,
        weightKg: 100,
        reps: 5,
        rir: 2,
        distanceM: null,
        durationS: null,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
      {
        id: newId(),
        setNumber: 2,
        isWarmup: false,
        weightKg: 105,
        reps: 4,
        rir: 1,
        distanceM: null,
        durationS: null,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
    ];

    await deleteHistorySet(sessionExerciseId, sets[0]!.id, sets, "load_reps");

    const ops = await readOutbox();
    const renumberOp = ops[1]!;
    expect(Object.keys(renumberOp.payload).sort()).toEqual(
      [
        "id",
        "sessionExerciseId",
        "setNumber",
        "isWarmup",
        "weightKg",
        "reps",
        "rir",
        "loggedAt",
        "notes",
      ].sort(),
    );
  });
});
