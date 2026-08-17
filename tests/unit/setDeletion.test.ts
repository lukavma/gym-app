import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { planSetDeletion } from "@/domain/sync/setNumbering";
import { buildSetDeletionOps, type SetLogRowFields } from "@/domain/sync/setDeletionOps";
import { setLogUpsertPayloadSchema, setLogDeletePayloadSchema } from "@/domain/sync/schema";

// Finding D regression coverage — "delete set 2 of 4 leaves 1,3,4 forever",
// on the device and in PostgreSQL.
//
// Same constraint as tests/unit/activeSessionPayloads.test.ts: there is no
// fake-indexeddb in this repo and the vitest unit environment is node, so the
// IndexedDB-backed callers (src/sync/activeSession.ts deleteSet,
// src/sync/corrections.ts deleteHistorySet) cannot run here. That is why the
// renumbering AND the op sequence live in a pure, injectable-id domain module
// — everything that could regress silently is asserted below, and
// tests/integration/sync.integration.test.ts then applies these exact ops to
// real PostgreSQL.

const sessionExerciseId = newId();

function makeSets(count: number): SetLogRowFields[] {
  return Array.from({ length: count }, (_, index) => ({
    id: newId(),
    setNumber: index + 1,
    isWarmup: false,
    weightKg: 100 + index * 2.5,
    reps: 8,
    rir: 2,
    loggedAt: new Date(Date.UTC(2026, 7, 17, 10, index)).toISOString(),
    notes: null,
  }));
}

// Deterministic ids make the ordering assertions readable; a separate case
// below covers the real uuidv7 factory the production callers use.
function countingIdFactory(): () => string {
  let n = 0;
  return () => `op-${++n}`;
}

describe("planSetDeletion", () => {
  it("renumbers 1..n after deleting the first set", () => {
    const sets = makeSets(4);
    const plan = planSetDeletion(sets, sets[0]!.id);

    expect(plan.deleted?.id).toBe(sets[0]!.id);
    expect(plan.remaining.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(plan.remaining.map((s) => s.id)).toEqual([sets[1]!.id, sets[2]!.id, sets[3]!.id]);
    // Every survivor shifted down, so every survivor is renumbered.
    expect(plan.renumbered.map((s) => [s.id, s.setNumber])).toEqual([
      [sets[1]!.id, 1],
      [sets[2]!.id, 2],
      [sets[3]!.id, 3],
    ]);
  });

  it("renumbers only the sets after a deleted middle set", () => {
    const sets = makeSets(4);
    const plan = planSetDeletion(sets, sets[1]!.id);

    expect(plan.remaining.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(plan.remaining.map((s) => s.id)).toEqual([sets[0]!.id, sets[2]!.id, sets[3]!.id]);
    // Set 1 keeps its number and is therefore not re-sent.
    expect(plan.renumbered.map((s) => [s.id, s.setNumber])).toEqual([
      [sets[2]!.id, 2],
      [sets[3]!.id, 3],
    ]);
  });

  it("renumbers nothing when the last set is deleted", () => {
    const sets = makeSets(4);
    const plan = planSetDeletion(sets, sets[3]!.id);

    expect(plan.remaining.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(plan.renumbered).toEqual([]);
  });

  it("returns renumbered sets in ascending order of the NEW set number", () => {
    const sets = makeSets(6);
    const plan = planSetDeletion(sets, sets[0]!.id);
    const numbers = plan.renumbered.map((s) => s.setNumber);

    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    // The order is what keeps every per-op transaction free of a duplicate:
    // each target number is vacated by the preceding step.
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it("repairs numbering that was already non-contiguous", () => {
    // Exactly the state a pre-fix device is in: set 2 was deleted earlier.
    const sets = makeSets(4).filter((s) => s.setNumber !== 2);
    const plan = planSetDeletion(sets, sets[2]!.id);

    expect(plan.remaining.map((s) => s.setNumber)).toEqual([1, 2]);
  });

  it("does not reorder warmup sets or treat them specially", () => {
    const sets = makeSets(3);
    sets[0]!.isWarmup = true;
    const plan = planSetDeletion(sets, sets[1]!.id);

    expect(plan.remaining.map((s) => [s.isWarmup, s.setNumber])).toEqual([
      [true, 1],
      [false, 2],
    ]);
  });

  it("reports nothing deleted for an unknown set id", () => {
    const sets = makeSets(3);
    const plan = planSetDeletion(sets, newId());

    expect(plan.deleted).toBeNull();
    expect(plan.renumbered).toEqual([]);
    expect(plan.remaining.map((s) => s.setNumber)).toEqual([1, 2, 3]);
  });

  it("leaves the input array untouched", () => {
    const sets = makeSets(4);
    const before = sets.map((s) => ({ id: s.id, setNumber: s.setNumber }));
    planSetDeletion(sets, sets[0]!.id);

    expect(sets.map((s) => ({ id: s.id, setNumber: s.setNumber }))).toEqual(before);
  });
});

describe("buildSetDeletionOps", () => {
  it("emits the delete first, then renumber upserts in ascending set number", () => {
    const sets = makeSets(4);
    const { ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: sets[1]!.id,
      sets,
      newOpId: countingIdFactory(),
    });

    expect(ops.map((op) => [op.opId, op.operation])).toEqual([
      ["op-1", "delete"],
      ["op-2", "upsert"],
      ["op-3", "upsert"],
    ]);
    expect(ops[0]!.payload).toEqual({ id: sets[1]!.id });
    expect(ops.slice(1).map((op) => op.payload.setNumber)).toEqual([2, 3]);
    expect(ops.slice(1).map((op) => op.payload.id)).toEqual([sets[2]!.id, sets[3]!.id]);
  });

  it("emits only the delete op when the last set is deleted", () => {
    const sets = makeSets(3);
    const { ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: sets[2]!.id,
      sets,
      newOpId: countingIdFactory(),
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]!.operation).toBe("delete");
  });

  it("emits no ops at all for an unknown set id", () => {
    const sets = makeSets(3);
    const { deleted, ops } = buildSetDeletionOps({
      sessionExerciseId,
      setId: newId(),
      sets,
      newOpId: countingIdFactory(),
    });

    expect(deleted).toBeNull();
    expect(ops).toEqual([]);
  });

  it("sends schema-valid full rows, including the parent FK", () => {
    const sets = makeSets(4);
    const { ops } = buildSetDeletionOps({ sessionExerciseId, setId: sets[0]!.id, sets });

    expect(setLogDeletePayloadSchema.safeParse(ops[0]!.payload).success).toBe(true);
    for (const op of ops.slice(1)) {
      const parsed = setLogUpsertPayloadSchema.safeParse(op.payload);
      expect(parsed.success).toBe(true);
      // BLOCKER-1's rule still holds for renumber ops: without the parent FK
      // the server rejects them as missing_required_fields, which would
      // dead-letter the renumbering and leave PostgreSQL non-contiguous.
      expect(op.payload.sessionExerciseId).toBe(sessionExerciseId);
      // Full row, not a setNumber-only patch.
      expect(Object.keys(op.payload).sort()).toEqual(
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
    }
  });

  it("preserves every non-numbering field of a renumbered set", () => {
    const sets = makeSets(3);
    sets[2]!.notes = "last one felt heavy";
    sets[2]!.rir = 0;
    const { ops } = buildSetDeletionOps({ sessionExerciseId, setId: sets[0]!.id, sets });
    const renumberedLast = ops.at(-1)!.payload;

    expect(renumberedLast).toMatchObject({
      id: sets[2]!.id,
      setNumber: 2,
      weightKg: sets[2]!.weightKg,
      reps: sets[2]!.reps,
      rir: 0,
      loggedAt: sets[2]!.loggedAt,
      notes: "last one felt heavy",
    });
  });

  it("generates strictly ascending opIds with the real uuidv7 factory", () => {
    // The outbox drains FIFO by (createdAt, opId): ops built in the same
    // millisecond only keep their construction order because uuidv7 is
    // monotonic. If that ever stops holding, a renumber op could be applied
    // before the delete it depends on.
    const sets = makeSets(6);
    const { ops } = buildSetDeletionOps({ sessionExerciseId, setId: sets[0]!.id, sets });
    const opIds = ops.map((op) => op.opId);

    expect(opIds).toHaveLength(6);
    expect(new Set(opIds).size).toBe(6);
    expect(opIds).toEqual([...opIds].sort());
  });
});
