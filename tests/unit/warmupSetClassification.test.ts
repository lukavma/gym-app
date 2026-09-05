// Warm-up Set Classification remediation
// (docs/reviews/estimated-1rm-load-translation-architecture-review.md §9 /
// F-1) — client-side mutator coverage against the REAL production mutators
// in src/sync/activeSession.ts and a REAL IndexedDB (fake-indexeddb),
// following the pattern established by
// tests/unit/activeSessionConcurrency.test.ts and
// tests/unit/warmupActiveSession.test.ts.
//
// This file does not touch or restate the gating logic in logSet/editSet
// (it already existed and already special-cases `isWarmup` — see
// activeSession.ts:469-470,551-553). It only exercises that logic with
// isWarmup actually populated, which — before the ExerciseCard/HistoryDetail
// UI remediation — no caller ever did.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import type { InputsSummary, RecommendationTarget } from "@/domain/progression/engine";
import type {
  ActiveSessionDto,
  RecommendationDto,
  TodayBundleExerciseEntryDto,
} from "@/sync/types";

// Same rationale as warmupActiveSession.test.ts: sync is irrelevant to this
// file's concern, and unmocked, every mutator's fire-and-forget
// `void flushOutbox()` would attempt a relative-URL fetch Node cannot
// resolve.
const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

const EXERCISE_ID = newId();

const inputsSummary: InputsSummary = {
  prescribed: { scheme: { type: "fixed", sets: 3, reps: 5 } },
  workSets: [],
  derived: { setsCompleted: 3, prescribedSets: 3, finalSetRir: 2, workingLoadKg: 100 },
  historyDepthUsed: 1,
};

function pendingRecommendation(target: RecommendationTarget): RecommendationDto {
  return {
    id: newId(),
    exerciseId: EXERCISE_ID,
    blockId: null,
    sourceSessionId: newId(),
    strategyId: "load-progression",
    strategyVersion: 1,
    classification: "heuristic",
    action: "increase_load",
    target,
    reasonCodes: ["ALL_PRESCRIBED_REPS_COMPLETED"],
    confidence: "medium",
    inputs: inputsSummary,
    computedBy: "server",
    createdAt: new Date(0).toISOString(),
    decision: { status: "pending", chosen: null, decidedAt: null, source: null },
  };
}

function bundleEntry(
  overrides: Partial<TodayBundleExerciseEntryDto> = {},
): TodayBundleExerciseEntryDto {
  return {
    prescriptionId: newId(),
    exerciseId: EXERCISE_ID,
    exerciseName: "Back Squat",
    scheme: { type: "fixed", sets: 3, reps: 5 },
    targetRir: null,
    restSeconds: null,
    progression: { strategyId: "manual", config: {}, classification: "user_defined" },
    baselineLoadKg: 60,
    loadStepKg: 2.5,
    prefill: { loadKg: 60, reps: 5 },
    appliedModifiers: null,
    pendingRecommendation: null,
    previousPerformance: [],
    history: [],
    ...overrides,
  };
}

function startInput(entry: TodayBundleExerciseEntryDto, isDeload = false) {
  return {
    blockId: newId(),
    templateId: newId(),
    templateName: "Push Day",
    weekIndex: 1,
    isDeload,
    exercises: [entry],
  };
}

async function reloadSession(): Promise<ActiveSessionDto | null> {
  const { getLocalActiveSession } = await import("@/sync/activeSession");
  return getLocalActiveSession();
}

async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload }));
}

async function clearOutbox(): Promise<void> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  await db.clear("outbox");
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("outcomes 1/3 — warm-up ramp then a work set: correct flags, and a pending recommendation only resolves from the first work set", () => {
  it("60kg/80kg warm-up ramp then a 110kg work set at the recommended target", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    await startSession(
      startInput(bundleEntry({ pendingRecommendation: pendingRecommendation({ loadKg: 110 }) })),
    );
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 60,
      reps: 5,
      rir: null,
      isWarmup: true,
    });
    expect((await reloadSession())?.exercises[0]?.recommendation?.decision.status).toBe("pending");

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 80,
      reps: 5,
      rir: null,
      isWarmup: true,
    });
    expect((await reloadSession())?.exercises[0]?.recommendation?.decision.status).toBe("pending");

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 110,
      reps: 5,
      rir: null,
      isWarmup: false,
    });
    const after = await reloadSession();

    expect(
      after?.exercises[0]?.sets.map((s) => ({ weightKg: s.weightKg, isWarmup: s.isWarmup })),
    ).toEqual([
      { weightKg: 60, isWarmup: true },
      { weightKg: 80, isWarmup: true },
      { weightKg: 110, isWarmup: false },
    ]);
    // The work set matched the recommended target exactly → implicit accept.
    expect(after?.exercises[0]?.recommendation?.decision.status).toBe("accepted");
    expect(after?.exercises[0]?.recommendation?.decision.source).toBe("implicit_first_set");
    expect(after?.exercises[0]?.recommendation?.decision.chosen).toEqual({ loadKg: 110 });
  });

  it("any number of warm-up sets never counts toward 'first work set', and a second work set never re-triggers the implicit decision", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    await startSession(
      startInput(bundleEntry({ pendingRecommendation: pendingRecommendation({ loadKg: 100 }) })),
    );
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    for (const kg of [40, 60, 80, 90]) {
      await logSet({
        sessionExerciseId: exerciseId,
        weightKg: kg,
        reps: 5,
        rir: null,
        isWarmup: true,
      });
    }
    expect((await reloadSession())?.exercises[0]?.recommendation?.decision.status).toBe("pending");

    // A different load than the target → implicit "modified", not "accepted".
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 95,
      reps: 5,
      rir: null,
      isWarmup: false,
    });
    const afterFirstWorkSet = await reloadSession();
    expect(afterFirstWorkSet?.exercises[0]?.recommendation?.decision.status).toBe("modified");
    expect(afterFirstWorkSet?.exercises[0]?.recommendation?.decision.chosen).toEqual({
      loadKg: 95,
    });

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 95,
      reps: 5,
      rir: null,
      isWarmup: false,
    });
    const ops = await readOutbox();
    expect(ops.filter((op) => op.entity === "recommendationDecision")).toHaveLength(1);
  });

  it("negative control: omitting isWarmup on a set intended as a warm-up defaults it to a work set and resolves the recommendation early", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    await startSession(
      startInput(bundleEntry({ pendingRecommendation: pendingRecommendation({ loadKg: 110 }) })),
    );
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    // The exact defect this remediation fixes: a caller that forgets to pass
    // isWarmup (e.g. the pre-remediation UI, which never did) gets a work
    // set by default, not a warm-up set.
    await logSet({ sessionExerciseId: exerciseId, weightKg: 60, reps: 5, rir: null });
    const after = await reloadSession();
    expect(after?.exercises[0]?.sets[0]?.isWarmup).toBe(false);
    // Consequence: the pending recommendation is already resolved after one
    // "warm-up" set — exactly the defect the UI toggle exists to prevent.
    expect(after?.exercises[0]?.recommendation?.decision.status).not.toBe("pending");
  });
});

describe("outcome 8 — editSet reclassification is a plain field patch: no fabricated fields, no recommendation side effects", () => {
  it("flips isWarmup on an already-logged set without touching weightKg/reps/rir", async () => {
    const { startSession, logSet, editSet } = await import("@/sync/activeSession");
    await startSession(startInput(bundleEntry()));
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({ sessionExerciseId: exerciseId, weightKg: 60, reps: 5, rir: 2, isWarmup: false });
    const setId = (await reloadSession())?.exercises[0]?.sets[0]?.id;
    if (!setId) throw new Error("expected a logged set");

    await editSet(exerciseId, setId, { isWarmup: true });
    const set = (await reloadSession())?.exercises[0]?.sets[0];
    expect(set?.isWarmup).toBe(true);
    expect(set?.weightKg).toBe(60);
    expect(set?.reps).toBe(5);
    expect(set?.rir).toBe(2);
  });

  it("editSet does not retroactively resolve or alter a pending recommendation", async () => {
    const { startSession, logSet, editSet } = await import("@/sync/activeSession");
    await startSession(
      startInput(bundleEntry({ pendingRecommendation: pendingRecommendation({ loadKg: 110 }) })),
    );
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 60,
      reps: 5,
      rir: null,
      isWarmup: true,
    });
    const setId = (await reloadSession())?.exercises[0]?.sets[0]?.id;
    if (!setId) throw new Error("expected a logged set");

    await editSet(exerciseId, setId, { isWarmup: false });
    expect((await reloadSession())?.exercises[0]?.recommendation?.decision.status).toBe("pending");
  });
});

describe("outcome 10 — offline preservation: isWarmup rides the existing setLog op, no new entity kind or field", () => {
  it("logSet's op payload carries isWarmup for a warm-up set", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    await startSession(startInput(bundleEntry()));
    await clearOutbox();
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 60,
      reps: 5,
      rir: null,
      isWarmup: true,
    });
    const ops = await readOutbox();
    // No new op entity kind was introduced for this feature.
    expect(ops.map((op) => op.entity)).toEqual(["setLog"]);
    expect(ops[0]?.payload.isWarmup).toBe(true);
  });

  it("editSet's op payload carries a flipped isWarmup as a full-row upsert (same op shape as logSet)", async () => {
    const { startSession, logSet, editSet } = await import("@/sync/activeSession");
    await startSession(startInput(bundleEntry()));
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 60,
      reps: 5,
      rir: null,
      isWarmup: false,
    });
    const setId = (await reloadSession())?.exercises[0]?.sets[0]?.id;
    if (!setId) throw new Error("expected a logged set");
    await clearOutbox();
    await editSet(exerciseId, setId, { isWarmup: true });

    const ops = await readOutbox();
    expect(ops.map((op) => op.entity)).toEqual(["setLog"]);
    expect(ops[0]?.payload.isWarmup).toBe(true);
    expect(ops[0]?.payload.weightKg).toBe(60);
  });
});

describe("outcome 12 — normal work-set logging is unchanged when the toggle is never used", () => {
  it("defaults isWarmup to false and behaves exactly as before this remediation", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    await startSession(
      startInput(bundleEntry({ pendingRecommendation: pendingRecommendation({ loadKg: 100 }) })),
    );
    const session = await reloadSession();
    const exerciseId = session?.exercises[0]?.id;
    if (!exerciseId) throw new Error("expected a session exercise");

    await logSet({ sessionExerciseId: exerciseId, weightKg: 100, reps: 5, rir: 2 });
    const after = await reloadSession();
    expect(after?.exercises[0]?.sets[0]?.isWarmup).toBe(false);
    expect(after?.exercises[0]?.recommendation?.decision.status).toBe("accepted");
  });
});
