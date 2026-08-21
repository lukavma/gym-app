import { getIdb, ACTIVE_SESSION_KEY, commitSessionMutation, type OutboxOpInput } from "./db";
import { flushOutbox } from "./flush";
import { getCachedBundle } from "./bundleCache";
import { newId } from "@/domain/ids/uuidv7";
import {
  buildWorkoutSessionUpsertPayload,
  buildSessionExerciseUpsertPayload,
  buildSetLogUpsertPayload,
  buildRecommendationUpsertPayload,
  buildRecommendationDecisionUpsertPayload,
} from "@/domain/sync/payloadBuilders";
import {
  wrapPrescriptionSnapshot,
  STRATEGY_VERSIONS,
  type PrescriptionSnapshot,
} from "@/domain/schemas/prescriptionSnapshot";
import { buildSetDeletionOps } from "@/domain/sync/setDeletionOps";
import { resolveImplicitDecision } from "@/domain/progression/implicitDecision";
import { applyInSessionDecisionToPrefill } from "@/domain/progression/evaluationTarget";
import {
  evaluateSession,
  type SessionExerciseEvaluationInput,
} from "@/domain/progression/evaluateSession";
import type { PerformedExercise, RecommendationTarget } from "@/domain/progression/engine";
import type {
  ActiveSessionDto,
  ActiveSessionExerciseDto,
  ActiveSessionSetDto,
  TodayBundleExerciseEntryDto,
} from "./types";

// Every mutator here follows the same shape: mutate the in-memory
// activeSession aggregate, then commit the resulting aggregate AND every
// outbox op it implies in a single IndexedDB transaction via
// commitSessionMutation (HIGH-1 — no separate persist-then-enqueue pair, so
// a process death between the two writes can never happen). Each outbox
// payload is the full row from the post-mutation aggregate, built through
// the schema-typed builders in domain/sync/payloadBuilders.ts (MEDIUM-1 —
// full-row upserts, not partial diffs; BLOCKER-1 — parent FKs can't be
// omitted, it's a compile error to try). Sync itself (the flushOutbox() kick
// at the end) is fire-and-forget bookkeeping, online or not.

export async function getLocalActiveSession(): Promise<ActiveSessionDto | null> {
  const db = await getIdb();
  const session = await db.get("activeSession", ACTIVE_SESSION_KEY);
  return session ?? null;
}

export async function clearLocalSession(): Promise<void> {
  const db = await getIdb();
  await db.delete("activeSession", ACTIVE_SESSION_KEY);
}

// Cold-client resume and cross-device "resume (view cached)": adopt a
// server-hydrated session verbatim as this device's local state.
//
// Finding C — the last line of defence, and the reason it throws rather than
// returning a flag: everything downstream of this write treats the local
// activeSession as an in-progress workout it may append sets to. A completed
// or discarded session written here becomes a local session whose every
// subsequent op the server rejects as `session_locked`, which is what the
// device actually did. Callers must revalidate against
// src/sync/remoteActiveSession.ts first; this refuses anything else outright.
export async function hydrateFromServer(remote: ActiveSessionDto): Promise<void> {
  if (remote.status !== "in_progress") {
    throw new Error(`Refusing to hydrate a session with status "${remote.status}"`);
  }
  const db = await getIdb();
  await db.put("activeSession", remote, ACTIVE_SESSION_KEY);
}

async function requireLocalSession(): Promise<ActiveSessionDto> {
  const session = await getLocalActiveSession();
  if (!session) throw new Error("No active session");
  return session;
}

function findExercise(
  session: ActiveSessionDto,
  sessionExerciseId: string,
): ActiveSessionExerciseDto {
  const exercise = session.exercises.find((e) => e.id === sessionExerciseId);
  if (!exercise) throw new Error("Session exercise not found");
  return exercise;
}

function nextSetNumber(exercise: ActiveSessionExerciseDto): number {
  return exercise.sets.reduce((max, s) => Math.max(max, s.setNumber), 0) + 1;
}

function buildSnapshotFromBundleEntry(entry: TodayBundleExerciseEntryDto): PrescriptionSnapshot {
  return wrapPrescriptionSnapshot({
    exerciseId: entry.exerciseId,
    exerciseName: entry.exerciseName,
    scheme: entry.scheme,
    targetRir: entry.targetRir,
    restSeconds: entry.restSeconds,
    progression: {
      strategyId: entry.progression.strategyId,
      strategyVersion: STRATEGY_VERSIONS[entry.progression.strategyId],
      config: entry.progression.config,
      classification: entry.progression.classification,
    },
    appliedModifiers: null,
    prefill: entry.prefill,
  });
}

// Full-row helpers — every field the corresponding schema accepts, read
// from the in-memory aggregate. Centralized so every mutator that upserts a
// workoutSession/sessionExercise/setLog row sends the same complete shape.
type WorkoutSessionStatus = "in_progress" | "completed" | "discarded";

function workoutSessionFullRowOp(
  session: ActiveSessionDto,
  overrides?: { status?: WorkoutSessionStatus; completedAt?: string },
) {
  return {
    opId: newId(),
    entity: "workoutSession" as const,
    operation: "upsert" as const,
    payload: buildWorkoutSessionUpsertPayload({
      id: session.id,
      blockId: session.blockId,
      templateId: session.templateId,
      templateName: session.templateName,
      weekIndex: session.weekIndex,
      isDeload: session.isDeload,
      status: overrides?.status ?? session.status,
      startedAt: session.startedAt,
      completedAt: overrides?.completedAt,
      clientId: session.clientId,
      notes: session.notes,
    }),
  };
}

function sessionExerciseFullRowOp(sessionId: string, exercise: ActiveSessionExerciseDto) {
  return {
    opId: newId(),
    entity: "sessionExercise" as const,
    operation: "upsert" as const,
    payload: buildSessionExerciseUpsertPayload({
      id: exercise.id,
      sessionId,
      exerciseId: exercise.exerciseId,
      position: exercise.position,
      source: exercise.source,
      prescription: exercise.prescription,
      skipped: exercise.skipped,
      notes: exercise.notes,
    }),
  };
}

interface DecisionFields {
  status: "accepted" | "modified" | "rejected";
  chosen: RecommendationTarget | null;
  decidedAt: string;
  source: "explicit" | "implicit_first_set";
}

function recommendationDecisionOp(recommendationId: string, decision: DecisionFields) {
  return {
    opId: newId(),
    entity: "recommendationDecision" as const,
    operation: "upsert" as const,
    payload: buildRecommendationDecisionUpsertPayload({
      recommendationId,
      status: decision.status,
      chosen: decision.chosen,
      decidedAt: decision.decidedAt,
      source: decision.source,
    }),
  };
}

function setLogFullRowOp(sessionExerciseId: string, set: ActiveSessionSetDto) {
  return {
    opId: newId(),
    entity: "setLog" as const,
    operation: "upsert" as const,
    payload: buildSetLogUpsertPayload({
      id: set.id,
      sessionExerciseId,
      setNumber: set.setNumber,
      isWarmup: set.isWarmup,
      weightKg: set.weightKg,
      reps: set.reps,
      rir: set.rir,
      loggedAt: set.loggedAt,
      notes: set.notes,
    }),
  };
}

export interface StartSessionInput {
  blockId: string | null;
  templateId: string | null;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  exercises: TodayBundleExerciseEntryDto[];
}

// Snapshot-on-use, exactly once: every scheduled exercise's
// PrescriptionSnapshot is frozen right here, at session creation — never
// lazily per-exercise as the workout progresses (ADR-007).
export async function startSession(input: StartSessionInput): Promise<ActiveSessionDto> {
  const sessionId = newId();
  const startedAt = new Date().toISOString();

  const exercises: ActiveSessionExerciseDto[] = input.exercises.map((entry, index) => ({
    id: newId(),
    exerciseId: entry.exerciseId,
    exerciseName: entry.exerciseName,
    position: index,
    source: "template" as const,
    prescription: buildSnapshotFromBundleEntry(entry),
    skipped: false,
    notes: null,
    loadStepKg: entry.loadStepKg,
    // The pending recommendation rides into the session verbatim — it is
    // decided here (explicitly, or implicitly via the first work set), never
    // re-frozen into the snapshot (progression-engine.md §7).
    recommendation: entry.pendingRecommendation,
    sets: [],
  }));

  const session: ActiveSessionDto = {
    id: sessionId,
    blockId: input.blockId,
    templateId: input.templateId,
    templateName: input.templateName,
    weekIndex: input.weekIndex,
    isDeload: input.isDeload,
    status: "in_progress",
    startedAt,
    clientId: null,
    notes: null,
    exercises,
  };

  const ops: OutboxOpInput[] = [
    workoutSessionFullRowOp(session),
    ...exercises.map((ex) => sessionExerciseFullRowOp(sessionId, ex)),
  ];

  await commitSessionMutation({ session, ops });
  void flushOutbox();
  return session;
}

export async function addAdhocExercise(
  exerciseId: string,
  exerciseName: string,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const id = newId();
  const position = session.exercises.length;
  const exercise: ActiveSessionExerciseDto = {
    id,
    exerciseId,
    exerciseName,
    position,
    source: "adhoc",
    prescription: null,
    skipped: false,
    notes: null,
    loadStepKg: null,
    recommendation: null,
    sets: [],
  };
  session.exercises.push(exercise);

  await commitSessionMutation({
    session,
    ops: [sessionExerciseFullRowOp(session.id, exercise)],
  });
  void flushOutbox();
  return session;
}

export async function setExerciseSkipped(
  sessionExerciseId: string,
  skipped: boolean,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  exercise.skipped = skipped;

  await commitSessionMutation({
    session,
    ops: [sessionExerciseFullRowOp(session.id, exercise)],
  });
  void flushOutbox();
  return session;
}

export async function setExerciseNotes(
  sessionExerciseId: string,
  notes: string | null,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  exercise.notes = notes;

  await commitSessionMutation({
    session,
    ops: [sessionExerciseFullRowOp(session.id, exercise)],
  });
  void flushOutbox();
  return session;
}

export interface LogSetInput {
  sessionExerciseId: string;
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup?: boolean;
  notes?: string | null;
}

export async function logSet(input: LogSetInput): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, input.sessionExerciseId);
  const setId = newId();
  const loggedAt = new Date().toISOString();
  const set: ActiveSessionSetDto = {
    id: setId,
    setNumber: nextSetNumber(exercise),
    isWarmup: input.isWarmup ?? false,
    weightKg: input.weightKg,
    reps: input.reps,
    rir: input.rir,
    loggedAt,
    notes: input.notes ?? null,
  };
  exercise.sets.push(set);

  const ops: OutboxOpInput[] = [setLogFullRowOp(exercise.id, set)];

  // progression-engine.md §7 — the implicit decision: the FIRST work set
  // resolves a still-pending recommendation. Committed in the same IndexedDB
  // transaction as the set itself, so the queue can never hold the set
  // without the decision it implied.
  const rec = exercise.recommendation;
  if (!set.isWarmup && rec && rec.decision.status === "pending") {
    const isFirstWorkSet = exercise.sets.filter((s) => !s.isWarmup).length === 1;
    if (isFirstWorkSet) {
      const implicit = resolveImplicitDecision(
        { action: rec.action, target: rec.target },
        { weightKg: set.weightKg },
        // Engine targets are already rounded to loadStepKg; 0 degrades the
        // comparison to exact-value equality, which is then still correct.
        exercise.loadStepKg ?? 0,
      );
      if (implicit) {
        const decision: DecisionFields = {
          status: implicit.status,
          chosen: implicit.chosen,
          decidedAt: loggedAt,
          source: implicit.source,
        };
        exercise.recommendation = {
          ...rec,
          decision: { ...decision },
        };
        ops.push(recommendationDecisionOp(rec.id, decision));
      }
    }
  }

  await commitSessionMutation({ session, ops });
  void flushOutbox();
  return session;
}

export type ExplicitDecisionInput =
  | { status: "accepted" }
  | { status: "modified"; chosen: RecommendationTarget }
  | { status: "rejected" };

// progression-engine.md §7 — explicit Accept / Keep previous (reject) /
// Custom (modify) from the recommendation card. One-time: only a pending
// recommendation can be decided; the local state flips immediately and the
// decision op rides the same outbox path as every other execution fact.
export async function decideRecommendation(
  sessionExerciseId: string,
  input: ExplicitDecisionInput,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  const rec = exercise.recommendation;
  if (!rec || rec.decision.status !== "pending") {
    throw new Error("No pending recommendation to decide");
  }
  const chosen: RecommendationTarget | null =
    input.status === "accepted"
      ? (rec.target ?? null)
      : input.status === "modified"
        ? input.chosen
        : null;
  if (input.status === "accepted" && chosen === null) {
    throw new Error("Recommendation has no target to accept");
  }
  const decision: DecisionFields = {
    status: input.status,
    chosen,
    decidedAt: new Date().toISOString(),
    source: "explicit",
  };
  exercise.recommendation = { ...rec, decision: { ...decision } };

  await commitSessionMutation({
    session,
    ops: [recommendationDecisionOp(rec.id, decision)],
  });
  void flushOutbox();
  return session;
}

export type EditSetPatch = Partial<
  Pick<ActiveSessionSetDto, "weightKg" | "reps" | "rir" | "isWarmup" | "notes">
>;

// Allowed for both in-progress and already-completed sessions server-side
// (domain-model.md §7 — SetLog values are user-editable at any time,
// including after completion); the client doesn't need to distinguish
// that here since it only ever mutates its OWN locally-held activeSession,
// which by definition is still in_progress. Post-completion corrections go
// through the history UI instead (src/server/history + a dedicated route).
export async function editSet(
  sessionExerciseId: string,
  setId: string,
  patch: EditSetPatch,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  const set = exercise.sets.find((s) => s.id === setId);
  if (!set) throw new Error("Set not found");
  Object.assign(set, patch);

  await commitSessionMutation({
    session,
    ops: [setLogFullRowOp(exercise.id, set)],
  });
  void flushOutbox();
  return session;
}

// Finding D — deleting a set renumbers the survivors to a contiguous 1..n.
// The local aggregate, the renumbering, the delete op and every renumber op
// are committed in the one IndexedDB transaction commitSessionMutation
// already provides (HIGH-1), so the device can never end up having deleted a
// set without having queued the renumbering that goes with it. Op order
// inside the batch is significant — see planSetDeletion.
export async function deleteSet(
  sessionExerciseId: string,
  setId: string,
): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  const exercise = findExercise(session, sessionExerciseId);
  const { deleted, remaining, ops } = buildSetDeletionOps({
    sessionExerciseId: exercise.id,
    setId,
    sets: exercise.sets,
  });
  // Already gone — emitting a delete op would be harmless, but a renumbering
  // pass over rows we have no reason to touch would not be.
  if (!deleted) return session;
  exercise.sets = remaining;

  await commitSessionMutation({ session, ops });
  void flushOutbox();
  return session;
}

export async function setSessionNotes(notes: string | null): Promise<ActiveSessionDto> {
  const session = await requireLocalSession();
  session.notes = notes;

  await commitSessionMutation({
    session,
    ops: [workoutSessionFullRowOp(session)],
  });
  void flushOutbox();
  return session;
}

// pwa-offline-strategy.md §2/§10 — "(if completing offline) client-computed
// recs queue in outbox": the identical pure domain code evaluates against
// the cached bundle context and the results sync up as `computedBy:
// 'client'` records. The recommendation ops are enqueued AHEAD of the
// completion op, so FIFO delivers them first and the server's own
// completion-time evaluation skips those exercises instead of duplicating
// them (progression-engine.md §5 — determinism makes the paths equivalent).
// When online, no client evaluation happens — the server evaluates as the
// completion op lands; if the onLine heuristic is ever wrong, §5's
// missing-evaluation fallback (carry-forward prefill, nothing fabricated)
// covers the next workout.
async function buildClientRecommendationOps(session: ActiveSessionDto): Promise<OutboxOpInput[]> {
  const cached = await getCachedBundle();
  const bundleEntries = new Map<string, TodayBundleExerciseEntryDto>();
  if (cached && cached.bundle.today.kind === "scheduled") {
    for (const entry of cached.bundle.today.exercises) {
      bundleEntries.set(entry.exerciseId, entry);
    }
  }

  const inputs: SessionExerciseEvaluationInput[] = [];
  for (const exercise of session.exercises) {
    if (exercise.skipped || !exercise.prescription) continue;
    const snapshot = exercise.prescription.snapshot;
    if (snapshot.progression.strategyId === "manual") continue;
    const entry = bundleEntries.get(exercise.exerciseId);
    const loadStepKg = exercise.loadStepKg ?? entry?.loadStepKg;
    if (loadStepKg === undefined) continue;

    const history: PerformedExercise[] = (entry?.history ?? []).map((h) => ({
      sessionId: h.sessionId,
      performedAt: h.startedAt,
      isDeload: h.isDeload,
      prescribed: h.prescribed
        ? {
            scheme: h.prescribed.scheme,
            ...(h.prescribed.targetRir ? { targetRir: h.prescribed.targetRir } : {}),
          }
        : null,
      workSets: h.sets
        .filter((s) => !s.isWarmup)
        .map((s) => ({ weightKg: s.weightKg, reps: s.reps, rir: s.rir })),
    }));

    inputs.push({
      sessionExerciseId: exercise.id,
      exerciseId: exercise.exerciseId,
      skipped: exercise.skipped,
      prescription: applyInSessionDecisionToPrefill(
        snapshot,
        exercise.recommendation?.decision ?? null,
      ),
      workSets: exercise.sets
        .filter((s) => !s.isWarmup)
        .slice()
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => ({ weightKg: s.weightKg, reps: s.reps, rir: s.rir })),
      history,
      loadStepKg,
    });
  }
  if (inputs.length === 0) return [];

  const results = evaluateSession({
    sessionId: session.id,
    startedAt: session.startedAt,
    isDeload: session.isDeload,
    // Block goal isn't in the cached bundle; v1 strategies never read it, so
    // client and server evaluations stay byte-equivalent without it.
    block: session.blockId
      ? {
          ...(session.weekIndex !== null ? { weekIndex: session.weekIndex } : {}),
          isDeload: session.isDeload,
        }
      : null,
    exercises: inputs,
  });

  const createdAt = new Date().toISOString();
  return results.map((result) => ({
    opId: newId(),
    entity: "recommendation" as const,
    operation: "upsert" as const,
    payload: buildRecommendationUpsertPayload({
      id: newId(),
      exerciseId: result.exerciseId,
      blockId: session.blockId,
      sourceSessionId: session.id,
      sourceSessionExerciseId: result.sessionExerciseId,
      strategyId: result.strategyId,
      strategyVersion: result.strategyVersion,
      classification: result.classification,
      config: result.config,
      inputs: result.draft.inputs,
      action: result.draft.action,
      target: result.draft.target ?? null,
      reasonCodes: [...result.draft.reasonCodes],
      confidence: result.draft.confidence,
      computedBy: "client",
      createdAt,
    }),
  }));
}

export async function completeSession(): Promise<void> {
  const session = await requireLocalSession();
  const completedAt = new Date().toISOString();

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const recommendationOps = offline ? await buildClientRecommendationOps(session) : [];

  await commitSessionMutation({
    session: null,
    ops: [
      ...recommendationOps,
      workoutSessionFullRowOp(session, { status: "completed", completedAt }),
    ],
  });
  void flushOutbox();
}

// Discards a session by id — defaults to the local session (normal
// discard), but accepts an explicit id for takeover, where the session
// being discarded belongs to another device and was never held locally. In
// the local case the full row (from the in-memory aggregate) is sent; in
// the foreign case there is no local copy to read a full row from, so only
// the id + status are sent — the server-side schema allows that (every
// field but id is optional) and there is nothing else this device could
// possibly know about that row.
export async function discardSession(sessionId?: string): Promise<void> {
  const local = await getLocalActiveSession();
  const id = sessionId ?? local?.id;
  if (!id) throw new Error("No active session");

  if (local && local.id === id) {
    await commitSessionMutation({
      session: null,
      ops: [workoutSessionFullRowOp(local, { status: "discarded" })],
    });
  } else {
    await commitSessionMutation({
      session: undefined,
      ops: [
        {
          opId: newId(),
          entity: "workoutSession",
          operation: "upsert",
          payload: buildWorkoutSessionUpsertPayload({ id, status: "discarded" }),
        },
      ],
    });
  }
  void flushOutbox();
}
