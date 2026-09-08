// L-8 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md)
// — `correctHistorySet` (O-13) and `deleteHistorySet` now schema-parse their
// payload and can therefore reject. `src/ui/history/HistoryDetail.tsx`'s two
// call sites apply an optimistic local update BEFORE either fire-and-forget
// async op settles; `src/ui/history/correctionSubmit.ts`'s two wrappers own
// the apply -> await -> revert-and-report shape that keeps a rejection from
// leaving the screen showing a phantom edit/delete with no corresponding
// outbox operation.
//
// Driven against the REAL `enqueueOp`/`enqueueOps` (src/sync/outbox.ts) and a
// REAL IndexedDB (fake-indexeddb), following the pattern established by
// tests/unit/measurementCorrections.test.ts — including forcing the
// rejection with a value that's out of range for `setLogUpsertPayloadSchema`
// (rir > 10) but would never reach here through the UI, since
// `src/ui/workout/validateSetInput.ts` mirrors that exact bound. No
// @testing-library/react is installed and `vitest.config.ts` runs
// `tests/unit/**` under `environment: "node"` (no DOM), which is why this
// exercises the extracted wrapper functions directly rather than clicking
// through `HistorySetRow`.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import type { SetLogRowFields } from "@/domain/sync/setDeletionOps";

const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

async function readOutbox(): Promise<unknown[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  return db.getAllFromIndex("outbox", "byCreatedAt");
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("submitHistorySetCorrection", () => {
  it("applies the optimistic update and does not revert when the correction succeeds", async () => {
    const { submitHistorySetCorrection } = await import("@/ui/history/correctionSubmit");
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const onError = vi.fn();

    await submitHistorySetCorrection(
      newId(),
      newId(),
      { durationS: null },
      { applyOptimistic, revertOptimistic, onError },
    );

    expect(applyOptimistic).toHaveBeenCalledTimes(1);
    expect(revertOptimistic).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(await readOutbox()).toHaveLength(1);
  });

  // The regression this guards: before this remediation, correctHistorySet's
  // rejection here (buildSetLogCorrectionPayload throwing on an out-of-range
  // value, reachable now that O-13 added a real `.parse()`) was an unhandled
  // rejection with no revert — the caller in HistoryDetail.tsx had already
  // applied the optimistic patch and moved on.
  it("reverts the optimistic update and reports an error when the correction is rejected — never leaves it applied", async () => {
    const { submitHistorySetCorrection, CORRECTION_FAILED_MESSAGE } =
      await import("@/ui/history/correctionSubmit");
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const onError = vi.fn();

    // rir: 99 bypasses validateSetInput.ts's own MAX_RIR=10 guard (this is a
    // direct call to the wrapper, not a UI interaction) but still fails
    // setLogUpsertPayloadSchema's own max(10) — the same "unreachable through
    // the UI today, load-bearing regardless" seam the L-8 finding names.
    await submitHistorySetCorrection(
      newId(),
      newId(),
      { rir: 99 as unknown as number },
      { applyOptimistic, revertOptimistic, onError },
    );

    expect(applyOptimistic).toHaveBeenCalledTimes(1);
    expect(revertOptimistic).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith(CORRECTION_FAILED_MESSAGE);
    // No orphaned outbox op either — the throw happens before `enqueueOp` is
    // ever reached.
    expect(await readOutbox()).toHaveLength(0);
  });
});

describe("submitHistorySetDeletion", () => {
  function loadRepsSets(): SetLogRowFields[] {
    return [
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
        // Out of range for setLogUpsertPayloadSchema (rir max 10) — this
        // survivor is what the post-deletion renumber tries to re-upsert,
        // so building that op is what throws.
        reps: 4,
        rir: 99,
        distanceM: null,
        durationS: null,
        loggedAt: new Date(0).toISOString(),
        notes: null,
      },
    ];
  }

  it("applies the optimistic removal and does not revert when the deletion succeeds", async () => {
    const { submitHistorySetDeletion } = await import("@/ui/history/correctionSubmit");
    const sets = loadRepsSets();
    sets[1]!.rir = 1; // valid this time
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const onError = vi.fn();

    await submitHistorySetDeletion(newId(), sets[0]!.id, sets, "load_reps", {
      applyOptimistic,
      revertOptimistic,
      onError,
    });

    expect(applyOptimistic).toHaveBeenCalledTimes(1);
    expect(revertOptimistic).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(await readOutbox()).toHaveLength(2); // delete + one renumbered upsert
  });

  // Same regression shape as the correction test above, for the "adjacent
  // deleteHistorySet call site" the task calls out: fire-and-forget alongside
  // an optimistic `removeLocalSet` that must not survive a rejected delete.
  it("reverts the optimistic removal and reports an error when the deletion is rejected — never leaves it applied", async () => {
    const { submitHistorySetDeletion, DELETION_FAILED_MESSAGE } =
      await import("@/ui/history/correctionSubmit");
    const sets = loadRepsSets();
    const applyOptimistic = vi.fn();
    const revertOptimistic = vi.fn();
    const onError = vi.fn();

    await submitHistorySetDeletion(newId(), sets[0]!.id, sets, "load_reps", {
      applyOptimistic,
      revertOptimistic,
      onError,
    });

    expect(applyOptimistic).toHaveBeenCalledTimes(1);
    expect(revertOptimistic).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith(DELETION_FAILED_MESSAGE);
    expect(await readOutbox()).toHaveLength(0);
  });
});
