import { and, asc, desc, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import {
  blocks,
  exercises,
  recommendations,
  sessionExercises,
  setLogs,
  workoutSessions,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import {
  evaluateSession,
  type SessionExerciseEvaluationInput,
} from "@/domain/progression/evaluateSession";
import { applyInSessionDecisionToPrefill } from "@/domain/progression/evaluationTarget";
import {
  prescriptionSnapshotSchema,
  type PrescriptionSnapshotData,
} from "@/domain/schemas/prescriptionSnapshot";
import type {
  EvaluationBlockContext,
  InputsSummary,
  PerformedExercise,
  PerformedSet,
  RecommendationAction,
  RecommendationTarget,
} from "@/domain/progression/engine";
import type { DecisionChosen } from "@/domain/progression/workingTargets";

// progression-engine.md §5 — the impure half of "onSessionCompleted": repo
// queries assemble the EvaluationContext OUTSIDE the pure core, the domain's
// evaluateSession() computes drafts, and this module persists them with
// supersede-before-insert. Everything here runs inside the caller's sync-op
// transaction, so a failed evaluation rolls the completion back with it and
// the client's retried op re-runs both — evaluation happens exactly once per
// actual in_progress → completed transition, never on no-op replays (which
// is what keeps "no automatic recomputation after a Decision" true).

// progression-engine.md §2 — history window "capped (default 5)".
const ENGINE_HISTORY_CAP = 5;

export interface CompletedSessionContext {
  id: string;
  blockId: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

type SessionExerciseRow = typeof sessionExercises.$inferSelect;
export type RecommendationRow = typeof recommendations.$inferSelect;

// The wire/UI shape of a persisted recommendation (progression-engine.md
// §6 minus config — the card renders codes + target + inputs + confidence +
// classification; the full config stays server-side audit data). Stored
// jsonb (target/inputs/chosen) is trusted on read — it was validated on
// write (prescription-model.md §6 convention).
export interface RecommendationDecisionDto {
  status: "pending" | "accepted" | "modified" | "rejected" | "superseded";
  chosen: RecommendationTarget | null;
  decidedAt: string | null;
  source: "explicit" | "implicit_first_set" | null;
}

export interface RecommendationDto {
  id: string;
  exerciseId: string;
  blockId: string | null;
  sourceSessionId: string;
  strategyId: string;
  strategyVersion: number;
  classification: "evidence_supported" | "heuristic" | "user_defined";
  action: RecommendationAction;
  target: RecommendationTarget | null;
  reasonCodes: string[];
  confidence: "low" | "medium" | "high";
  inputs: InputsSummary;
  computedBy: "server" | "client";
  createdAt: string;
  decision: RecommendationDecisionDto;
}

export function toRecommendationDto(row: RecommendationRow): RecommendationDto {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    blockId: row.blockId,
    sourceSessionId: row.sourceSessionId,
    strategyId: row.strategyId,
    strategyVersion: row.strategyVersion,
    classification: row.classification as RecommendationDto["classification"],
    action: row.action as RecommendationAction,
    target: row.target as RecommendationTarget | null,
    reasonCodes: row.reasonCodes,
    confidence: row.confidence as RecommendationDto["confidence"],
    inputs: row.inputs as InputsSummary,
    computedBy: row.computedBy as RecommendationDto["computedBy"],
    createdAt: row.createdAt.toISOString(),
    decision: {
      status: row.decisionStatus as RecommendationDecisionDto["status"],
      chosen: row.decisionChosen as RecommendationTarget | null,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      source: row.decisionSource as RecommendationDecisionDto["source"],
    },
  };
}

function parseSnapshot(prescription: unknown): PrescriptionSnapshotData | null {
  if (!prescription) return null;
  const parsed = prescriptionSnapshotSchema.safeParse(prescription);
  return parsed.success ? parsed.data.snapshot : null;
}

async function getWorkSetsByExercise(
  db: AppDb,
  sessionExerciseIds: string[],
): Promise<Map<string, PerformedSet[]>> {
  const result = new Map<string, PerformedSet[]>();
  if (sessionExerciseIds.length === 0) return result;
  const rows = await db
    .select()
    .from(setLogs)
    .where(and(inArray(setLogs.sessionExerciseId, sessionExerciseIds), eq(setLogs.isWarmup, false)))
    .orderBy(asc(setLogs.setNumber));
  for (const row of rows) {
    const list = result.get(row.sessionExerciseId) ?? [];
    list.push({ weightKg: row.weightKg, reps: row.reps, rir: row.rir });
    result.set(row.sessionExerciseId, list);
  }
  return result;
}

// progression-engine.md §2 — "same exercise, completed non-discarded
// sessions, most recent first, deloads flagged; capped". The frame is
// strictly sessions started before the evaluated one, which makes a later
// re-evaluation (supersede-on-edit) reconstruct the identical history the
// original evaluation saw.
async function getEngineHistory(
  db: AppDb,
  userId: string,
  exerciseId: string,
  evaluatedSession: { id: string; startedAt: Date },
): Promise<PerformedExercise[]> {
  const rows = await db
    .select({
      sessionExerciseId: sessionExercises.id,
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      isDeload: workoutSessions.isDeload,
      prescription: sessionExercises.prescription,
    })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed"),
        ne(workoutSessions.id, evaluatedSession.id),
        lt(workoutSessions.startedAt, evaluatedSession.startedAt),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(ENGINE_HISTORY_CAP);

  const workSets = await getWorkSetsByExercise(
    db,
    rows.map((r) => r.sessionExerciseId),
  );

  return rows.map((row) => {
    const snapshot = parseSnapshot(row.prescription);
    return {
      sessionId: row.sessionId,
      performedAt: row.startedAt.toISOString(),
      isDeload: row.isDeload,
      prescribed: snapshot
        ? {
            scheme: snapshot.scheme,
            ...(snapshot.targetRir ? { targetRir: snapshot.targetRir } : {}),
          }
        : null,
      workSets: workSets.get(row.sessionExerciseId) ?? [],
    };
  });
}

function blockScope(blockId: string | null) {
  // Equivalent grouping to uq_recs_one_pending's coalesce: block-less
  // recommendations form their own slot; no real block ever has the zero
  // uuid, so eq/isNull matches the index's key exactly.
  return blockId === null ? isNull(recommendations.blockId) : eq(recommendations.blockId, blockId);
}

// The rep target "as executed THIS session" (evaluationTarget.ts): the
// latest accepted/modified decision per exercise whose decidedAt falls
// inside the session window and whose recommendation came from an earlier
// session — i.e. the recommendation the athlete decided at this workout.
async function getInSessionDecisionChosen(
  db: AppDb,
  userId: string,
  session: CompletedSessionContext,
  exerciseIds: string[],
): Promise<Map<string, RecommendationTarget>> {
  const result = new Map<string, RecommendationTarget>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select({
      exerciseId: recommendations.exerciseId,
      decisionChosen: recommendations.decisionChosen,
      decidedAt: recommendations.decidedAt,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        inArray(recommendations.exerciseId, exerciseIds),
        blockScope(session.blockId),
        inArray(recommendations.decisionStatus, ["accepted", "modified"]),
        ne(recommendations.sourceSessionId, session.id),
      ),
    )
    .orderBy(desc(recommendations.decidedAt));

  const startedAtMs = session.startedAt.getTime();
  const completedAtMs = session.completedAt?.getTime() ?? null;
  for (const row of rows) {
    if (result.has(row.exerciseId)) continue; // rows are newest-first
    if (!row.decidedAt) continue;
    const decidedMs = row.decidedAt.getTime();
    if (decidedMs < startedAtMs) continue;
    if (completedAtMs !== null && decidedMs > completedAtMs) continue;
    const chosen = (row.decisionChosen ?? null) as RecommendationTarget | null;
    if (chosen) result.set(row.exerciseId, chosen);
  }
  return result;
}

// Exported for the sync service's client-computed-recommendation handler,
// which must apply the same supersede-before-insert rule (§5) the server's
// own evaluation path uses.
export async function supersedePending(
  db: AppDb,
  userId: string,
  exerciseId: string,
  blockId: string | null,
): Promise<void> {
  await db
    .update(recommendations)
    .set({ decisionStatus: "superseded", updatedAt: new Date() })
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.exerciseId, exerciseId),
        blockScope(blockId),
        eq(recommendations.decisionStatus, "pending"),
      ),
    );
}

async function assembleAndEvaluate(
  db: AppDb,
  userId: string,
  session: CompletedSessionContext,
  exerciseRows: SessionExerciseRow[],
  mode: "initial" | "reevaluate",
): Promise<void> {
  // Cheap pre-filter mirroring the domain's own skip rules, so ineligible
  // exercises never cost a history query. The domain re-applies the same
  // rules — this is an optimization, not the authority.
  const candidates = exerciseRows
    .map((row) => ({ row, snapshot: parseSnapshot(row.prescription) }))
    .filter(
      (c): c is { row: SessionExerciseRow; snapshot: PrescriptionSnapshotData } =>
        !c.row.skipped && c.snapshot !== null && c.snapshot.progression.strategyId !== "manual",
    );
  if (candidates.length === 0) return;

  // Initial evaluation dedupes against client-computed recommendations for
  // this same session: the offline client enqueues its recommendation ops
  // ahead of the completion op, so by the time this runs, any client
  // evaluation of these exact session exercises is already persisted —
  // re-evaluating them server-side would only churn out duplicate records of
  // identical content (determinism makes the two paths equivalent,
  // progression-engine.md §5). Re-evaluation must NOT dedupe — the pending
  // rec it exists to supersede is itself sourced from this session exercise.
  let toEvaluate = candidates;
  if (mode === "initial") {
    const candidateIds = candidates.map((c) => c.row.id);
    const existing = await db
      .select({ sourceSessionExerciseId: recommendations.sourceSessionExerciseId })
      .from(recommendations)
      .where(inArray(recommendations.sourceSessionExerciseId, candidateIds));
    const alreadyEvaluated = new Set(existing.map((r) => r.sourceSessionExerciseId));
    toEvaluate = candidates.filter((c) => !alreadyEvaluated.has(c.row.id));
  }
  if (toEvaluate.length === 0) return;

  const exerciseIds = [...new Set(toEvaluate.map((c) => c.row.exerciseId))];
  const exerciseMetaRows = await db
    .select({ id: exercises.id, loadStepKg: exercises.loadStepKg })
    .from(exercises)
    .where(inArray(exercises.id, exerciseIds));
  const loadStepById = new Map(exerciseMetaRows.map((e) => [e.id, e.loadStepKg]));

  let blockContext: EvaluationBlockContext | null = null;
  if (session.blockId) {
    const [blockRow] = await db
      .select({ goal: blocks.goal })
      .from(blocks)
      .where(eq(blocks.id, session.blockId));
    blockContext = {
      ...(session.weekIndex !== null ? { weekIndex: session.weekIndex } : {}),
      isDeload: session.isDeload,
      ...(blockRow ? { goal: blockRow.goal as EvaluationBlockContext["goal"] } : {}),
    };
  }

  const workSets = await getWorkSetsByExercise(
    db,
    toEvaluate.map((c) => c.row.id),
  );
  const decisionChosen = await getInSessionDecisionChosen(db, userId, session, exerciseIds);

  const inputs: SessionExerciseEvaluationInput[] = [];
  for (const { row, snapshot } of toEvaluate) {
    const loadStepKg = loadStepById.get(row.exerciseId);
    if (loadStepKg === undefined) continue; // RESTRICT FK — unreachable
    const history = await getEngineHistory(db, userId, row.exerciseId, session);
    const chosen = decisionChosen.get(row.exerciseId) ?? null;
    inputs.push({
      sessionExerciseId: row.id,
      exerciseId: row.exerciseId,
      skipped: row.skipped,
      prescription: applyInSessionDecisionToPrefill(
        snapshot,
        chosen ? { status: "accepted", chosen } : null,
      ),
      workSets: workSets.get(row.id) ?? [],
      history,
      loadStepKg,
    });
  }

  const results = evaluateSession({
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
    isDeload: session.isDeload,
    block: blockContext,
    exercises: inputs,
  });

  for (const result of results) {
    await supersedePending(db, userId, result.exerciseId, session.blockId);
    await db.insert(recommendations).values({
      id: newId(),
      userId,
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
      computedBy: "server",
    });
  }
}

// Bundle assembly (pwa-offline-strategy.md §4 "pendingRecommendation?"):
// the at-most-one pending recommendation per exercise in the given block
// scope, keyed by exercise id.
export async function getPendingRecommendationsByExercise(
  db: AppDb,
  userId: string,
  blockId: string | null,
  exerciseIds: string[],
): Promise<Map<string, RecommendationDto>> {
  const result = new Map<string, RecommendationDto>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        inArray(recommendations.exerciseId, exerciseIds),
        blockScope(blockId),
        eq(recommendations.decisionStatus, "pending"),
      ),
    );
  for (const row of rows) result.set(row.exerciseId, toRecommendationDto(row));
  return result;
}

// prescription-model.md §4 step 1 — "chosen values of latest recommendation
// Decision for (E, current block)". Only accepted/modified decisions carry
// chosen values; rejected decisions are transparent (workingTargets.ts), so
// they are simply not part of this query.
export async function getLatestDecisionChosenByExercise(
  db: AppDb,
  userId: string,
  blockId: string | null,
  exerciseIds: string[],
): Promise<Map<string, DecisionChosen>> {
  const result = new Map<string, DecisionChosen>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select({
      exerciseId: recommendations.exerciseId,
      decisionChosen: recommendations.decisionChosen,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        inArray(recommendations.exerciseId, exerciseIds),
        blockScope(blockId),
        inArray(recommendations.decisionStatus, ["accepted", "modified"]),
      ),
    )
    .orderBy(desc(recommendations.decidedAt));
  for (const row of rows) {
    if (result.has(row.exerciseId)) continue; // newest-first
    const chosen = row.decisionChosen as DecisionChosen | null;
    if (chosen) result.set(row.exerciseId, chosen);
  }
  return result;
}

// Cross-device resume context: for each exercise of an in-progress session,
// the recommendation the athlete is deciding at this workout — the latest
// non-superseded record for (exercise, block) sourced from a different
// session (pending, or already decided during this session).
export async function getSessionRecommendationsByExercise(
  db: AppDb,
  userId: string,
  session: { id: string; blockId: string | null },
  exerciseIds: string[],
): Promise<Map<string, RecommendationDto>> {
  const result = new Map<string, RecommendationDto>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        inArray(recommendations.exerciseId, exerciseIds),
        blockScope(session.blockId),
        ne(recommendations.decisionStatus, "superseded"),
        ne(recommendations.sourceSessionId, session.id),
      ),
    )
    .orderBy(desc(recommendations.createdAt));
  for (const row of rows) {
    if (result.has(row.exerciseId)) continue; // newest-first
    result.set(row.exerciseId, toRecommendationDto(row));
  }
  return result;
}

// The normal path (progression-engine.md §5): server evaluation on session
// completion. Called by the sync service inside the completion op's
// transaction, only on an actual in_progress → completed transition.
export async function evaluateCompletedSession(
  db: AppDb,
  userId: string,
  session: CompletedSessionContext,
): Promise<void> {
  const exerciseRows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, session.id))
    .orderBy(asc(sessionExercises.position));
  await assembleAndEvaluate(db, userId, session, exerciseRows, "initial");
}

// progression-engine.md §5/§8 — "Set edited while rec pending → re-evaluate
// + supersede." Fires only when a *pending* recommendation is sourced from
// the edited session exercise; decided recommendations are never recomputed
// (the user's choice stands). The sync service calls this for set-log
// upserts/deletes on completed sessions — an in-progress session cannot have
// sourced a recommendation yet, and a pending rec's source is always a
// completed session, so the completed-only gate loses nothing.
export async function reevaluateForSourceSessionExercise(
  db: AppDb,
  userId: string,
  sessionExerciseId: string,
): Promise<void> {
  const [pending] = await db
    .select({ id: recommendations.id })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.sourceSessionExerciseId, sessionExerciseId),
        eq(recommendations.decisionStatus, "pending"),
      ),
    );
  if (!pending) return;

  const [row] = await db
    .select({ exercise: sessionExercises, session: workoutSessions })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(eq(sessionExercises.id, sessionExerciseId));
  if (!row || row.session.userId !== userId) return;

  await assembleAndEvaluate(
    db,
    userId,
    {
      id: row.session.id,
      blockId: row.session.blockId,
      weekIndex: row.session.weekIndex,
      isDeload: row.session.isDeload,
      startedAt: row.session.startedAt,
      completedAt: row.session.completedAt,
    },
    [row.exercise],
    "reevaluate",
  );
}
