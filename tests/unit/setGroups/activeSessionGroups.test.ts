// set-groups-architecture-evaluation.md §5.3/§5.4 A-9 — the client-side
// mechanisms the initial Stage A pass implemented but left untested at this
// level: `logSet`'s per-group attribution stamping, the per-group implicit
// decision (only the decided group's pending record flips), and the offline
// completion fallback's per-group evaluation (`buildClientRecommendationOps`
// in src/sync/activeSession.ts). Driven against the REAL production mutators
// and a REAL IndexedDB (fake-indexeddb), following the pattern established by
// tests/unit/measurementActiveSession.test.ts / activeSessionConcurrency.test.ts.
//
// The offline-completion describe block below is a REGRESSION TEST for a
// real bug found and fixed during this remediation pass: `toPerformedSets`
// (activeSession.ts) mapped every set — both the current exercise's own work
// sets and its history entries' sets — to a bare {weightKg, reps, rir}
// object, silently dropping `groupKey`. `partitionGroupSets`
// (groupEvaluation.ts) filters a slot's work sets by
// `s.groupKey === group.key`; with the tag stripped before it ever got
// there, EVERY group's window would come back empty regardless of what was
// actually logged, for any session completed OFFLINE (the online/server path
// was unaffected — `mapWorkSetRows` there already carried `groupKey`
// correctly). `toPerformedSets` now threads `groupKey` through; this test
// proves a grouped session completed offline evaluates each group from its
// own real logged sets, not an empty window.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { setCachedBundle } from "@/sync/bundleCache";
import type { RecommendationDto, TodayBundleDto, TodayBundleExerciseEntryDto } from "@/sync/types";

const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

const EXERCISE_ID = newId();

function groupsBundleEntry(
  pendingRecommendations: RecommendationDto[] = [],
): TodayBundleExerciseEntryDto {
  return {
    prescriptionId: newId(),
    exerciseId: EXERCISE_ID,
    exerciseName: "Trap Bar Deadlift",
    scheme: {
      type: "groups",
      groups: [
        { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        { key: "q9m4", label: "Back-off", sets: { min: 2, max: 2 }, reps: { min: 6, max: 8 } },
      ],
    },
    targetRir: { min: 1, max: 3 },
    restSeconds: null,
    progression: { strategyId: "load-progression", config: {}, classification: "heuristic" },
    baselineLoadKg: null,
    loadStepKg: 2.5,
    prefill: { loadKg: 140, reps: 2 },
    appliedModifiers: null,
    pendingRecommendation: null,
    pendingRecommendations,
    groupPrefills: { top: { loadKg: 140, reps: 2 }, q9m4: { loadKg: 110, reps: 7 } },
    previousPerformance: [],
    history: [],
    measurement: { profile: "load_reps", loadBasis: "unspecified" },
    prescriptionNotes: null,
  };
}

function pendingRec(groupKey: string, target: { loadKg: number; reps: number }): RecommendationDto {
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
    reasonCodes: ["ALL_REPS_COMPLETED"],
    confidence: "medium",
    inputs: {
      prescribed: { scheme: { type: "fixed", sets: 1, reps: 2 } },
      workSets: [],
      derived: {
        setsCompleted: 1,
        prescribedSets: 1,
        finalSetRir: 2,
        workingLoadKg: target.loadKg,
      },
      historyDepthUsed: 0,
    },
    computedBy: "server",
    createdAt: new Date().toISOString(),
    decision: { status: "pending", chosen: null, decidedAt: null, source: null },
    groupKey,
  };
}

function startInput(pendingRecommendations: RecommendationDto[] = []) {
  return {
    blockId: newId(),
    templateId: newId(),
    templateName: "Upper A",
    weekIndex: 1,
    isDeload: false,
    exercises: [groupsBundleEntry(pendingRecommendations)],
  };
}

async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload as Record<string, unknown> }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logSet — per-group attribution stamping and implicit decision (A-9)", () => {
  it("stamps the selected group's key onto the logged set and the emitted setLog op", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    const started = await startSession(startInput());
    const exerciseId = started.exercises[0]!.id;

    const after = await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 140,
      reps: 2,
      rir: 2,
      groupKey: "top",
    });
    expect(after.exercises[0]!.sets[0]!.groupKey).toBe("top");

    const ops = await readOutbox();
    const setLogOp = ops.find((op) => op.entity === "setLog");
    expect(setLogOp?.payload).toMatchObject({ groupKey: "top" });
  });

  it("forces groupKey to null for a warm-up set even when a group is selected on the card (§4.4 rule 1)", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    const started = await startSession(startInput());
    const exerciseId = started.exercises[0]!.id;

    const after = await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 100,
      reps: 2,
      rir: null,
      isWarmup: true,
      groupKey: "top",
    });
    expect(after.exercises[0]!.sets[0]!.groupKey).toBeNull();
  });

  it("the first work set of a group decides ONLY that group's pending record, never a sibling's", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    const started = await startSession(
      startInput([
        pendingRec("top", { loadKg: 140, reps: 2 }),
        pendingRec("q9m4", { loadKg: 110, reps: 7 }),
      ]),
    );
    const exerciseId = started.exercises[0]!.id;

    const after = await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 140,
      reps: 2,
      rir: 2,
      groupKey: "top",
    });
    const recs = after.exercises[0]!.recommendations!;
    const top = recs.find((r) => r.groupKey === "top")!;
    const backoff = recs.find((r) => r.groupKey === "q9m4")!;
    expect(top.decision.status).not.toBe("pending");
    expect(backoff.decision.status).toBe("pending");

    const ops = await readOutbox();
    expect(ops.filter((op) => op.entity === "recommendationDecision")).toHaveLength(1);
  });

  it("a second group's own first work set decides that group independently, once selected", async () => {
    const { startSession, logSet } = await import("@/sync/activeSession");
    const started = await startSession(
      startInput([
        pendingRec("top", { loadKg: 140, reps: 2 }),
        pendingRec("q9m4", { loadKg: 110, reps: 7 }),
      ]),
    );
    const exerciseId = started.exercises[0]!.id;

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 140,
      reps: 2,
      rir: 2,
      groupKey: "top",
    });
    const after = await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 110,
      reps: 7,
      rir: 2,
      groupKey: "q9m4",
    });
    const recs = after.exercises[0]!.recommendations!;
    expect(recs.find((r) => r.groupKey === "top")!.decision.status).not.toBe("pending");
    expect(recs.find((r) => r.groupKey === "q9m4")!.decision.status).not.toBe("pending");

    const ops = await readOutbox();
    expect(ops.filter((op) => op.entity === "recommendationDecision")).toHaveLength(2);
  });
});

describe("offline completion — per-group evaluation fallback (buildClientRecommendationOps, §5)", () => {
  it("evaluates each group independently from its OWN real logged sets when completing offline — regression test for the toPerformedSets groupKey-dropping bug", async () => {
    const { startSession, logSet, completeSession } = await import("@/sync/activeSession");
    const started = await startSession(startInput());
    const exerciseId = started.exercises[0]!.id;

    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 140,
      reps: 2,
      rir: 2,
      groupKey: "top",
    });
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 110,
      reps: 7,
      rir: 2,
      groupKey: "q9m4",
    });
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 110,
      reps: 7,
      rir: 2,
      groupKey: "q9m4",
    });

    // No unit test in this codebase can reach `navigator.onLine` naturally —
    // the vitest project runs `environment: "node"`, whose own global
    // `navigator` carries no `onLine` at all — so `completeSession`'s
    // offline branch is otherwise only reachable from a real browser (an
    // E2E spec). `vi.stubGlobal` replaces the global outright, which is
    // sufficient here since `completeSession` only ever reads
    // `navigator.onLine`.
    vi.stubGlobal("navigator", { onLine: false });
    await completeSession();

    const ops = await readOutbox();
    const recOps = ops.filter((op) => op.entity === "recommendation");
    expect(recOps).toHaveLength(2);

    const byGroup = new Map(recOps.map((op) => [op.payload.groupKey as string, op.payload]));
    const top = byGroup.get("top")!;
    const backoff = byGroup.get("q9m4")!;

    // The decisive assertion: before the fix, BOTH groups' partitioned
    // window came back empty (the filter `s.groupKey === group.key` matched
    // nothing, since every set arrived with `groupKey` already stripped) —
    // not merely a wrong action, but the persisted `inputs.workSets` itself
    // silently claiming no sets were logged for a group that plainly had
    // some.
    expect((top.inputs as { workSets: unknown[] }).workSets).toHaveLength(1);
    expect((backoff.inputs as { workSets: unknown[] }).workSets).toHaveLength(2);
    expect(top.action).toBe("increase_load");
    expect(
      (top.inputs as { prescribed: { group?: { key: string } } }).prescribed.group,
    ).toMatchObject({ key: "top" });
    expect(
      (backoff.inputs as { prescribed: { group?: { key: string } } }).prescribed.group,
    ).toMatchObject({ key: "q9m4" });
  });

  it("an ungrouped exercise's offline completion is unaffected by the groupKey-threading fix (byte-identical to before Stage A)", async () => {
    const { startSession, logSet, completeSession } = await import("@/sync/activeSession");
    const entry: TodayBundleExerciseEntryDto = {
      prescriptionId: newId(),
      exerciseId: EXERCISE_ID,
      exerciseName: "Back Squat",
      scheme: { type: "fixed", sets: 1, reps: 5 },
      targetRir: { min: 1, max: 3 },
      restSeconds: null,
      progression: { strategyId: "load-progression", config: {}, classification: "heuristic" },
      baselineLoadKg: null,
      loadStepKg: 2.5,
      prefill: { loadKg: 100, reps: 5 },
      appliedModifiers: null,
      pendingRecommendation: null,
      previousPerformance: [],
      history: [],
      measurement: { profile: "load_reps", loadBasis: "unspecified" },
      prescriptionNotes: null,
    };
    const started = await startSession({
      blockId: newId(),
      templateId: newId(),
      templateName: "Upper A",
      weekIndex: 1,
      isDeload: false,
      exercises: [entry],
    });
    const exerciseId = started.exercises[0]!.id;
    await logSet({ sessionExerciseId: exerciseId, weightKg: 100, reps: 5, rir: 2 });

    vi.stubGlobal("navigator", { onLine: false });
    await completeSession();

    const ops = await readOutbox();
    const recOp = ops.find((op) => op.entity === "recommendation");
    expect(recOp).toBeDefined();
    expect("groupKey" in recOp!.payload).toBe(false);
    const inputs = recOp!.payload.inputs as { workSets: unknown[]; extraWorkSets?: unknown };
    expect(inputs.workSets).toHaveLength(1);
    expect("extraWorkSets" in inputs).toBe(false);
  });

  it("M-2 — a manual SLOT strategy with a non-manual GROUP override still evaluates that group when completing offline", async () => {
    // Regression test for the second of M-2's two callers: this pre-filter
    // (`buildClientRecommendationOps` in activeSession.ts) used to drop the
    // WHOLE exercise whenever the slot's own `strategyId` was "manual",
    // never reaching `evaluateSession`'s own per-group dispatch (which
    // already handles an overriding group correctly, per
    // progression-engine.md §5.1). The server-side twin of this bug/fix is
    // covered by an integration test against a real completion.
    const { startSession, logSet, completeSession } = await import("@/sync/activeSession");
    const entry = groupsBundleEntry();
    entry.progression = {
      strategyId: "manual",
      config: {},
      classification: "heuristic",
      groups: {
        top: { strategyId: "load-progression", config: {}, classification: "heuristic" },
      },
    };
    const started = await startSession({
      blockId: newId(),
      templateId: newId(),
      templateName: "Upper A",
      weekIndex: 1,
      isDeload: false,
      exercises: [entry],
    });
    const exerciseId = started.exercises[0]!.id;
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 140,
      reps: 2,
      rir: 2,
      groupKey: "top",
    });

    vi.stubGlobal("navigator", { onLine: false });
    await completeSession();

    const ops = await readOutbox();
    const recOps = ops.filter((op) => op.entity === "recommendation");
    // Before the fix: zero ops (the whole exercise was pre-filtered out).
    expect(recOps).toHaveLength(1);
    expect(recOps[0]!.payload.groupKey).toBe("top");
    expect(recOps[0]!.payload.strategyId).toBe("load-progression");
  });

  it("L-6 — a cached bundle's grouped history entries are threaded per-group into an offline evaluation, driving real streak behaviour", async () => {
    // Every other test in this describe block starts a session WITHOUT ever
    // calling `setCachedBundle`, so `buildClientRecommendationOps`'s own
    // `bundleEntries` map (built from `getCachedBundle()`) is always empty —
    // `entry?.history ?? []` is always `[]`, and `buildGroupHistory` (the
    // per-group history mapper the M-1 fix lives in) never actually runs on
    // a non-empty array for an OFFLINE completion. This is a decisive
    // regression test for that gap: both groups are configured to DECREASE
    // load after 2 consecutive failures at the same load, and only fail
    // ONCE in the live session — a failing streak of 2 (and thus
    // `decrease_load`) is reachable ONLY if the one cached historical
    // failure at the same load is correctly read and attributed to its own
    // group. Before the cached bundle is wired in (comment out the
    // `setCachedBundle` call below to see it), `historyDepthUsed` is 0 for
    // both groups and the action is `hold`/`INSUFFICIENT_HISTORY` instead.
    const entry = groupsBundleEntry();
    entry.progression = {
      strategyId: "load-progression",
      config: { failureAction: "decrease" },
      classification: "heuristic",
    };

    const historicalScheme = entry.scheme;
    const cachedEntry: TodayBundleExerciseEntryDto = {
      ...entry,
      history: [
        {
          sessionId: newId(),
          startedAt: "2026-08-01T00:00:00.000Z",
          isDeload: false,
          prescribed: { scheme: historicalScheme, targetRir: { min: 1, max: 3 } },
          sets: [
            {
              setNumber: 1,
              weightKg: 140,
              reps: 1,
              rir: 1,
              distanceM: null,
              durationS: null,
              isWarmup: false,
              groupKey: "top",
            },
            {
              setNumber: 2,
              weightKg: 110,
              reps: 5,
              rir: 1,
              distanceM: null,
              durationS: null,
              isWarmup: false,
              groupKey: "q9m4",
            },
            {
              setNumber: 3,
              weightKg: 110,
              reps: 5,
              rir: 1,
              distanceM: null,
              durationS: null,
              isWarmup: false,
              groupKey: "q9m4",
            },
          ],
        },
      ],
    };
    const bundle: TodayBundleDto = {
      today: {
        kind: "scheduled",
        blockId: newId(),
        templateId: newId(),
        templateName: "Upper A",
        weekIndex: 1,
        isDeload: false,
        exercises: [cachedEntry],
      },
      activeSession: null,
      generatedAt: "2026-08-10T00:00:00.000Z",
      timezone: "UTC",
    };
    await setCachedBundle(bundle);

    const { startSession, logSet, completeSession } = await import("@/sync/activeSession");
    const started = await startSession({
      blockId: newId(),
      templateId: newId(),
      templateName: "Upper A",
      weekIndex: 1,
      isDeload: false,
      exercises: [entry],
    });
    const exerciseId = started.exercises[0]!.id;

    // Same loads as the cached history, and the same failure shape (short of
    // the group's own target reps) — this session alone would only be a
    // failStreak of 1 (`hold`); the cached historical failure at the same
    // load is what must push it to 2.
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 140,
      reps: 1,
      rir: 1,
      groupKey: "top",
    });
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 110,
      reps: 5,
      rir: 1,
      groupKey: "q9m4",
    });
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 110,
      reps: 5,
      rir: 1,
      groupKey: "q9m4",
    });

    vi.stubGlobal("navigator", { onLine: false });
    await completeSession();

    const ops = await readOutbox();
    const recOps = ops.filter((op) => op.entity === "recommendation");
    expect(recOps).toHaveLength(2);
    const byGroup = new Map(recOps.map((op) => [op.payload.groupKey as string, op.payload]));
    const top = byGroup.get("top")!;
    const backoff = byGroup.get("q9m4")!;

    expect((top.inputs as { historyDepthUsed: number }).historyDepthUsed).toBe(1);
    expect((backoff.inputs as { historyDepthUsed: number }).historyDepthUsed).toBe(1);
    expect(top.action).toBe("decrease_load");
    expect(backoff.action).toBe("decrease_load");
    expect(top.reasonCodes).toContain("DECREASE_APPLIED");
    expect(backoff.reasonCodes).toContain("DECREASE_APPLIED");
  });

  it("L-1 — a modified in-session decision's chosen reps overlay this group's prefill during an offline completion, matching the server's own overlay (evaluationTarget.ts)", async () => {
    // `applyInSessionDecisionsToGroupPrefills` (evaluationTarget.ts) is the
    // SAME shared function `server/progression/service.ts`'s
    // `overlayInSessionDecisions` calls for the server's own grouped
    // completion path — parity between the two callers is structural, not
    // duplicated logic, exactly like M-2's fix above. Before the L-1 fix,
    // `buildClientRecommendationOps` (activeSession.ts) never called this
    // function at all for a `groups` scheme, so an offline completion always
    // evaluated rep-progression against the FROZEN snapshot prefill even
    // after the athlete explicitly chose a different rep target in-session —
    // silently diverging from what the server would have computed for the
    // identical facts.
    const { startSession, logSet, decideRecommendation, completeSession } =
      await import("@/sync/activeSession");
    const entry: TodayBundleExerciseEntryDto = {
      prescriptionId: newId(),
      exerciseId: EXERCISE_ID,
      exerciseName: "Trap Bar Deadlift",
      scheme: {
        type: "groups",
        groups: [{ key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 8, max: 10 } }],
      },
      targetRir: { min: 1, max: 3 },
      restSeconds: null,
      progression: { strategyId: "rep-progression", config: {}, classification: "heuristic" },
      baselineLoadKg: null,
      loadStepKg: 2.5,
      prefill: { loadKg: 100, reps: 8 },
      appliedModifiers: null,
      pendingRecommendation: null,
      pendingRecommendations: [pendingRec("top", { loadKg: 100, reps: 10 })],
      groupPrefills: { top: { loadKg: 100, reps: 8 } },
      previousPerformance: [],
      history: [],
      measurement: { profile: "load_reps", loadBasis: "unspecified" },
      prescriptionNotes: null,
    };
    const started = await startSession({
      blockId: newId(),
      templateId: newId(),
      templateName: "Upper A",
      weekIndex: 1,
      isDeload: false,
      exercises: [entry],
    });
    const exerciseId = started.exercises[0]!.id;

    // The athlete modifies the proposed 8 -> 10 suggestion down to 9 reps
    // in-session — different from BOTH the frozen snapshot prefill (8) and
    // the recommendation's own proposed target (10), so a correct overlay is
    // unambiguous either way it might have gone wrong.
    await decideRecommendation(
      exerciseId,
      { status: "modified", chosen: { loadKg: 100, reps: 9 } },
      "top",
    );
    await logSet({
      sessionExerciseId: exerciseId,
      weightKg: 100,
      reps: 9,
      rir: 2,
      groupKey: "top",
    });

    vi.stubGlobal("navigator", { onLine: false });
    await completeSession();

    const ops = await readOutbox();
    const recOps = ops.filter((op) => op.entity === "recommendation");
    const top = recOps.find((op) => op.payload.groupKey === "top")!;
    const derived = (top.payload.inputs as { derived: { currentRepTarget: number } }).derived;
    // Before the fix: reads the frozen snapshot prefill of 8, not the
    // decided 9 — the decisive assertion.
    expect(derived.currentRepTarget).toBe(9);
  });
});
