import { and, eq } from "drizzle-orm";
import { recommendations, sessionExercises, setLogs, workoutSessions } from "@/db/schema";
import type { AppDb } from "@/db/client";
import {
  bodyweightEntryUpsertPayloadSchema,
  recommendationDecisionUpsertPayloadSchema,
  recommendationUpsertPayloadSchema,
  recoveryEntryUpsertPayloadSchema,
  sessionExerciseUpsertPayloadSchema,
  setLogDeletePayloadSchema,
  setLogUpsertPayloadSchema,
  workoutSessionUpsertPayloadSchema,
  type SessionExerciseUpsertPayload,
  type SetLogUpsertPayload,
  type SyncEntity,
  type SyncOpEnvelope,
  type WorkoutSessionUpsertPayload,
} from "@/domain/sync/schema";
import {
  evaluateCompletedSession,
  reevaluateForSourceSessionExercise,
  supersedePending,
} from "@/server/progression/service";
import type { RecommendationTarget } from "@/domain/progression/engine";
import { logBodyweight } from "@/server/bodyweight/service";
import { logRecovery, RecoveryEntryHasNoMetricError } from "@/server/recovery/service";

// pwa-offline-strategy.md §5/§6 — the server side of the single execution-
// fact write path. Every op is a full-row upsert/delete keyed by its own
// entity UUID (never the op's `opId`, which exists only for client-side
// outbox bookkeeping) — replays converge naturally because re-applying the
// same values is a no-op, with no `applied_ops` ledger needed.
//
// Ops are applied strictly in array order, one DB transaction per op (not
// one transaction for the whole batch): this lets an earlier op's writes be
// visible to a later op in the same batch (e.g. op1 creates a session, op2
// creates one of its session_exercises) while letting a rejected op (a
// business-rule violation, not a crash) not roll back ops already committed
// before it. An unexpected error (anything other than the known Postgres
// codes handled below) is deliberately left to propagate and fail the whole
// request — see the route handler — so the client's outbox retries the
// batch wholesale; already-committed ops in that retry are harmless no-ops.
export type SyncRejectReason =
  | "invalid_payload"
  | "missing_required_fields"
  | "not_found"
  | "session_locked"
  | "session_conflict"
  | "position_conflict"
  | "set_number_conflict"
  | "invalid_reference"
  | "invalid_lifecycle_transition"
  | "unsupported_operation"
  | "recommendation_conflict"
  | "decision_conflict"
  | "no_metric";

interface SyncOpResult {
  opId: string;
  entity: SyncEntity;
  outcome: "applied" | "rejected";
  reason?: SyncRejectReason;
}

export interface SyncBatchResult {
  applied: string[];
  rejected: { opId: string; entity: SyncEntity; reason: SyncRejectReason }[];
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// See identical helper + rationale in src/server/blocks/service.ts /
// src/server/exercises/service.ts — drizzle-orm wraps the raw pg driver
// error (which carries `.code`, the SQLSTATE) in `.cause`, not on the
// thrown error itself.
function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && isPostgresErrorCode(err.cause, code);
}

// domain-model.md's session lifecycle diagram: only forward transitions out
// of in_progress are legal; completed/discarded are terminal.
const ALLOWED_SESSION_TRANSITIONS: Record<string, string[]> = {
  in_progress: ["completed", "discarded"],
};

type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
type SessionExerciseRow = typeof sessionExercises.$inferSelect;

function rejected(opId: string, entity: SyncEntity, reason: SyncRejectReason): SyncOpResult {
  return { opId, entity, outcome: "rejected", reason };
}
function applied(opId: string, entity: SyncEntity): SyncOpResult {
  return { opId, entity, outcome: "applied" };
}

export async function applySyncBatch(
  db: AppDb,
  userId: string,
  ops: readonly SyncOpEnvelope[],
): Promise<SyncBatchResult> {
  const results: SyncOpResult[] = [];
  for (const op of ops) {
    results.push(await applyOne(db, userId, op));
  }
  return {
    applied: results.filter((r) => r.outcome === "applied").map((r) => r.opId),
    rejected: results
      .filter((r): r is SyncOpResult & { reason: SyncRejectReason } => r.outcome === "rejected")
      .map((r) => ({ opId: r.opId, entity: r.entity, reason: r.reason })),
  };
}

function applyOne(db: AppDb, userId: string, op: SyncOpEnvelope): Promise<SyncOpResult> {
  if (op.entity === "workoutSession") {
    if (op.operation !== "upsert") {
      return Promise.resolve(rejected(op.opId, op.entity, "unsupported_operation"));
    }
    return applyWorkoutSessionUpsert(db, userId, op.opId, op.payload);
  }
  if (op.entity === "sessionExercise") {
    if (op.operation !== "upsert") {
      return Promise.resolve(rejected(op.opId, op.entity, "unsupported_operation"));
    }
    return applySessionExerciseUpsert(db, userId, op.opId, op.payload);
  }
  if (op.entity === "recommendation") {
    if (op.operation !== "upsert") {
      return Promise.resolve(rejected(op.opId, op.entity, "unsupported_operation"));
    }
    return applyRecommendationUpsert(db, userId, op.opId, op.payload);
  }
  if (op.entity === "recommendationDecision") {
    if (op.operation !== "upsert") {
      return Promise.resolve(rejected(op.opId, op.entity, "unsupported_operation"));
    }
    return applyRecommendationDecisionUpsert(db, userId, op.opId, op.payload);
  }
  if (op.entity === "bodyweightEntry") {
    if (op.operation !== "upsert") {
      return Promise.resolve(rejected(op.opId, op.entity, "unsupported_operation"));
    }
    return applyBodyweightEntryUpsert(db, userId, op.opId, op.payload);
  }
  if (op.entity === "recoveryEntry") {
    if (op.operation !== "upsert") {
      return Promise.resolve(rejected(op.opId, op.entity, "unsupported_operation"));
    }
    return applyRecoveryEntryUpsert(db, userId, op.opId, op.payload);
  }
  if (op.operation === "upsert") {
    return applySetLogUpsert(db, userId, op.opId, op.payload);
  }
  return applySetLogDelete(db, userId, op.opId, op.payload);
}

function isNoopWorkoutSessionUpdate(
  existing: WorkoutSessionRow,
  payload: WorkoutSessionUpsertPayload,
): boolean {
  if (payload.blockId !== undefined && payload.blockId !== existing.blockId) return false;
  if (payload.templateId !== undefined && payload.templateId !== existing.templateId) return false;
  if (payload.templateName !== undefined && payload.templateName !== existing.templateName) {
    return false;
  }
  if (payload.weekIndex !== undefined && payload.weekIndex !== existing.weekIndex) return false;
  if (payload.isDeload !== undefined && payload.isDeload !== existing.isDeload) return false;
  if (payload.status !== undefined && payload.status !== existing.status) return false;
  if (
    payload.startedAt !== undefined &&
    new Date(payload.startedAt).getTime() !== existing.startedAt.getTime()
  ) {
    return false;
  }
  if (payload.completedAt !== undefined) {
    const incoming = payload.completedAt ? new Date(payload.completedAt).getTime() : null;
    const current = existing.completedAt ? existing.completedAt.getTime() : null;
    if (incoming !== current) return false;
  }
  if (payload.clientId !== undefined && payload.clientId !== existing.clientId) return false;
  if (payload.notes !== undefined && payload.notes !== existing.notes) return false;
  return true;
}

// Full-row upsert for the session aggregate root. Creation requires
// `startedAt` (and implicitly defaults `status` to 'in_progress', matching
// the DB default and the only sensible client-create flow); everything
// else can arrive later via update. `userId` is always the authenticated
// caller, never client-supplied — the payload schema has no such field.
async function applyWorkoutSessionUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = workoutSessionUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "workoutSession", "invalid_payload");
  const payload = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      let [existing] = await tx
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.id, payload.id));

      if (!existing) {
        if (payload.startedAt === undefined) {
          return rejected(opId, "workoutSession", "missing_required_fields");
        }
        // phase-8-review.md B-2 — a lost response (the server actually
        // applied this exact create, but the client's fetch never saw the
        // reply — a real reconnect race, not a hypothetical: the app's own
        // reconnect flow does a full page navigation that can tear down an
        // in-flight POST client-side while the server keeps processing it)
        // makes the client resend the identical op. A plain INSERT would
        // hit this row's own primary key and — before this fix — get
        // mapped to `session_conflict` exactly like a genuine different-id
        // conflict, permanently dead-lettering an op that already
        // succeeded. `onConflictDoNothing` targets the id specifically: a
        // collision on THIS row's own id quietly no-ops here and falls
        // through to the ordinary update-or-noop path below (which
        // converges harmlessly, since it's the same payload); a genuinely
        // different id claiming the one-in-progress slot still raises the
        // *other* unique index's violation, uncaught by this narrow
        // target, and is still mapped to session_conflict by the catch
        // block below.
        const inserted = await tx
          .insert(workoutSessions)
          .values({
            id: payload.id,
            userId,
            blockId: payload.blockId ?? null,
            templateId: payload.templateId ?? null,
            templateName: payload.templateName ?? null,
            weekIndex: payload.weekIndex ?? null,
            isDeload: payload.isDeload ?? false,
            status: payload.status ?? "in_progress",
            startedAt: new Date(payload.startedAt),
            completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
            clientId: payload.clientId ?? null,
            notes: payload.notes ?? null,
          })
          .onConflictDoNothing({ target: workoutSessions.id })
          .returning();
        if (inserted.length > 0) return applied(opId, "workoutSession");

        [existing] = await tx
          .select()
          .from(workoutSessions)
          .where(eq(workoutSessions.id, payload.id));
        if (!existing) {
          throw new Error("workoutSession insert conflicted but the row was not found");
        }
      }

      // A row with this id exists but isn't this user's — treat identically
      // to "doesn't exist" rather than leaking cross-user existence.
      if (existing.userId !== userId) return rejected(opId, "workoutSession", "not_found");

      if (payload.status !== undefined && payload.status !== existing.status) {
        const allowed = ALLOWED_SESSION_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(payload.status)) {
          return rejected(opId, "workoutSession", "invalid_lifecycle_transition");
        }
      }

      // Structure frozen once terminal (domain-model.md §10 invariant 3):
      // only an exact-match replay of already-stored values is tolerated
      // (idempotent retry), any real mutation is rejected.
      if (existing.status !== "in_progress") {
        if (!isNoopWorkoutSessionUpdate(existing, payload)) {
          return rejected(opId, "workoutSession", "session_locked");
        }
        return applied(opId, "workoutSession");
      }

      const patch: Partial<typeof workoutSessions.$inferInsert> = { updatedAt: new Date() };
      if (payload.blockId !== undefined) patch.blockId = payload.blockId;
      if (payload.templateId !== undefined) patch.templateId = payload.templateId;
      if (payload.templateName !== undefined) patch.templateName = payload.templateName;
      if (payload.weekIndex !== undefined) patch.weekIndex = payload.weekIndex;
      if (payload.isDeload !== undefined) patch.isDeload = payload.isDeload;
      if (payload.status !== undefined) patch.status = payload.status;
      if (payload.startedAt !== undefined) patch.startedAt = new Date(payload.startedAt);
      if (payload.completedAt !== undefined) {
        patch.completedAt = payload.completedAt ? new Date(payload.completedAt) : null;
      }
      if (payload.clientId !== undefined) patch.clientId = payload.clientId;
      if (payload.notes !== undefined) patch.notes = payload.notes;

      await tx.update(workoutSessions).set(patch).where(eq(workoutSessions.id, payload.id));

      // progression-engine.md §5 — server evaluation on session completion,
      // inside this same transaction: an evaluation failure rolls the
      // completion back too, so the client's retried op re-runs both. Only
      // an actual in_progress → completed transition evaluates — a replayed
      // completion is a no-op above and never reaches this point, which is
      // what keeps decided recommendations free of automatic recomputation.
      if (payload.status === "completed") {
        await evaluateCompletedSession(tx, userId, {
          id: existing.id,
          blockId: patch.blockId !== undefined ? patch.blockId : existing.blockId,
          weekIndex: patch.weekIndex !== undefined ? patch.weekIndex : existing.weekIndex,
          isDeload: patch.isDeload !== undefined ? patch.isDeload : existing.isDeload,
          startedAt: patch.startedAt !== undefined ? patch.startedAt : existing.startedAt,
          completedAt: patch.completedAt !== undefined ? patch.completedAt : existing.completedAt,
        });
      }
      return applied(opId, "workoutSession");
    });
  } catch (err) {
    // uq_sessions_one_in_progress — device B tried to start a session while
    // device A's is still open. Client surfaces resume-vs-takeover UX
    // (pwa-offline-strategy.md §6); takeover sends an explicit discard op
    // for the other session's id before retrying its own create.
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) {
      return rejected(opId, "workoutSession", "session_conflict");
    }
    throw err;
  }
}

function isNoopSessionExerciseUpdate(
  existing: SessionExerciseRow,
  payload: SessionExerciseUpsertPayload,
): boolean {
  if (payload.exerciseId !== undefined && payload.exerciseId !== existing.exerciseId) return false;
  if (payload.position !== undefined && payload.position !== existing.position) return false;
  if (payload.source !== undefined && payload.source !== existing.source) return false;
  if (payload.skipped !== undefined && payload.skipped !== existing.skipped) return false;
  if (payload.notes !== undefined && payload.notes !== existing.notes) return false;
  return true;
}

// `prescription` is deliberately never written on the update path, present
// in the payload or not — it is a snapshot-on-use value (ADR-007), set
// exactly once at creation. Silently ignoring it on update (rather than
// comparing-and-rejecting) keeps a verbatim replay of the original create
// op idempotent even after the row exists, without needing an order-
// insensitive deep-equal against the jsonb column's canonicalized key order.
async function applySessionExerciseUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = sessionExerciseUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "sessionExercise", "invalid_payload");
  const payload = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const selectExisting = () =>
        tx
          .select({
            exercise: sessionExercises,
            sessionStatus: workoutSessions.status,
            sessionUserId: workoutSessions.userId,
          })
          .from(sessionExercises)
          .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
          .where(eq(sessionExercises.id, payload.id));

      let [existingRow] = await selectExisting();

      if (!existingRow) {
        if (
          payload.sessionId === undefined ||
          payload.exerciseId === undefined ||
          payload.position === undefined ||
          payload.source === undefined
        ) {
          return rejected(opId, "sessionExercise", "missing_required_fields");
        }
        const [parentSession] = await tx
          .select({ status: workoutSessions.status })
          .from(workoutSessions)
          .where(
            and(eq(workoutSessions.id, payload.sessionId), eq(workoutSessions.userId, userId)),
          );
        if (!parentSession) return rejected(opId, "sessionExercise", "not_found");
        if (parentSession.status !== "in_progress") {
          return rejected(opId, "sessionExercise", "session_locked");
        }

        // phase-8-review.md B-2 — same lost-response contract as
        // applyWorkoutSessionUpsert above: a retried delivery of THIS
        // exact id no-ops here and falls through to the update path below;
        // a different id claiming the same (sessionId, position) slot
        // still raises that index's own violation, caught below as
        // position_conflict.
        const inserted = await tx
          .insert(sessionExercises)
          .values({
            id: payload.id,
            sessionId: payload.sessionId,
            exerciseId: payload.exerciseId,
            position: payload.position,
            source: payload.source,
            prescription: payload.prescription ?? null,
            skipped: payload.skipped ?? false,
            notes: payload.notes ?? null,
          })
          .onConflictDoNothing({ target: sessionExercises.id })
          .returning();
        if (inserted.length > 0) return applied(opId, "sessionExercise");

        [existingRow] = await selectExisting();
        if (!existingRow) {
          throw new Error("sessionExercise insert conflicted but the row was not found");
        }
      }

      if (existingRow.sessionUserId !== userId)
        return rejected(opId, "sessionExercise", "not_found");
      if (payload.sessionId !== undefined && payload.sessionId !== existingRow.exercise.sessionId) {
        return rejected(opId, "sessionExercise", "invalid_payload");
      }

      if (existingRow.sessionStatus !== "in_progress") {
        if (!isNoopSessionExerciseUpdate(existingRow.exercise, payload)) {
          return rejected(opId, "sessionExercise", "session_locked");
        }
        return applied(opId, "sessionExercise");
      }

      const patch: Partial<typeof sessionExercises.$inferInsert> = { updatedAt: new Date() };
      if (payload.exerciseId !== undefined) patch.exerciseId = payload.exerciseId;
      if (payload.position !== undefined) patch.position = payload.position;
      if (payload.source !== undefined) patch.source = payload.source;
      if (payload.skipped !== undefined) patch.skipped = payload.skipped;
      if (payload.notes !== undefined) patch.notes = payload.notes;

      await tx.update(sessionExercises).set(patch).where(eq(sessionExercises.id, payload.id));
      return applied(opId, "sessionExercise");
    });
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) {
      return rejected(opId, "sessionExercise", "position_conflict");
    }
    if (isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)) {
      return rejected(opId, "sessionExercise", "invalid_reference");
    }
    throw err;
  }
}

// The supersede-on-relevant-edit trigger (progression-engine.md §5/§8) must
// fire only when the update actually changes something evaluation consumes —
// set number/warmup/weight/reps/RIR. A byte-identical replay of an earlier
// op (or a notes/loggedAt-only touch-up) is not an edit: re-evaluating on it
// would churn out a superseded+fresh pair and break replay idempotence
// (same batch twice → identical DB, implementation-plan §1.5).
function setLogUpdateChangesEvaluationInputs(
  existing: typeof setLogs.$inferSelect,
  payload: SetLogUpsertPayload,
): boolean {
  if (payload.setNumber !== undefined && payload.setNumber !== existing.setNumber) return true;
  if (payload.isWarmup !== undefined && payload.isWarmup !== existing.isWarmup) return true;
  if (payload.weightKg !== undefined && payload.weightKg !== existing.weightKg) return true;
  if (payload.reps !== undefined && payload.reps !== existing.reps) return true;
  if (payload.rir !== undefined && payload.rir !== existing.rir) return true;
  return false;
}

// domain-model.md §7: SetLog values are user-editable "at any time,
// including after completion" — creation is not, though ("corrections" of
// an existing fact, not late additions), so create requires status ===
// 'in_progress' while update tolerates 'in_progress' | 'completed'.
// 'discarded' sessions are dead history (excluded from history/progression/
// volume) and are treated as fully frozen here, a Phase 3 scope decision
// not spelled out verbatim in the docs.
async function applySetLogUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = setLogUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "setLog", "invalid_payload");
  const payload = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const selectExisting = () =>
        tx
          .select({
            setLog: setLogs,
            sessionStatus: workoutSessions.status,
            sessionUserId: workoutSessions.userId,
          })
          .from(setLogs)
          .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
          .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
          .where(eq(setLogs.id, payload.id));

      let [existingRow] = await selectExisting();

      if (!existingRow) {
        if (
          payload.sessionExerciseId === undefined ||
          payload.setNumber === undefined ||
          payload.weightKg === undefined ||
          payload.reps === undefined ||
          payload.loggedAt === undefined
        ) {
          return rejected(opId, "setLog", "missing_required_fields");
        }
        const [parent] = await tx
          .select({ status: workoutSessions.status })
          .from(sessionExercises)
          .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
          .where(
            and(
              eq(sessionExercises.id, payload.sessionExerciseId),
              eq(workoutSessions.userId, userId),
            ),
          );
        if (!parent) return rejected(opId, "setLog", "not_found");
        if (parent.status !== "in_progress") return rejected(opId, "setLog", "session_locked");

        // phase-8-review.md B-2 — same lost-response contract as
        // applyWorkoutSessionUpsert/applySessionExerciseUpsert above: this is
        // the exact function the reviewer reproduced the bug against
        // (`set_number_conflict` permanently dead-lettering an already-applied
        // create). A retried delivery of THIS id no-ops here and falls
        // through to the update path below; a different id claiming the same
        // (sessionExerciseId, setNumber) slot still raises that index's own
        // violation, caught below as set_number_conflict.
        const inserted = await tx
          .insert(setLogs)
          .values({
            id: payload.id,
            sessionExerciseId: payload.sessionExerciseId,
            setNumber: payload.setNumber,
            isWarmup: payload.isWarmup ?? false,
            weightKg: payload.weightKg,
            reps: payload.reps,
            rir: payload.rir ?? null,
            loggedAt: new Date(payload.loggedAt),
            notes: payload.notes ?? null,
          })
          .onConflictDoNothing({ target: setLogs.id })
          .returning();
        if (inserted.length > 0) return applied(opId, "setLog");

        [existingRow] = await selectExisting();
        if (!existingRow) {
          throw new Error("setLog insert conflicted but the row was not found");
        }
      }

      if (existingRow.sessionUserId !== userId) return rejected(opId, "setLog", "not_found");
      if (
        payload.sessionExerciseId !== undefined &&
        payload.sessionExerciseId !== existingRow.setLog.sessionExerciseId
      ) {
        return rejected(opId, "setLog", "invalid_payload");
      }
      if (existingRow.sessionStatus === "discarded") {
        return rejected(opId, "setLog", "session_locked");
      }

      const patch: Partial<typeof setLogs.$inferInsert> = { updatedAt: new Date() };
      if (payload.setNumber !== undefined) patch.setNumber = payload.setNumber;
      if (payload.isWarmup !== undefined) patch.isWarmup = payload.isWarmup;
      if (payload.weightKg !== undefined) patch.weightKg = payload.weightKg;
      if (payload.reps !== undefined) patch.reps = payload.reps;
      // Evaluated BEFORE the patch lands, against the pre-update row.
      const relevantEdit = setLogUpdateChangesEvaluationInputs(existingRow.setLog, payload);

      if (payload.rir !== undefined) patch.rir = payload.rir;
      if (payload.loggedAt !== undefined) patch.loggedAt = new Date(payload.loggedAt);
      if (payload.notes !== undefined) patch.notes = payload.notes;

      await tx.update(setLogs).set(patch).where(eq(setLogs.id, payload.id));

      // progression-engine.md §8 — "Set edited while rec pending →
      // re-evaluate + supersede". Only completed sessions can have sourced a
      // recommendation; the helper itself no-ops unless a pending rec is
      // sourced from this exact session exercise (decided recs are never
      // recomputed).
      if (relevantEdit && existingRow.sessionStatus === "completed") {
        await reevaluateForSourceSessionExercise(tx, userId, existingRow.setLog.sessionExerciseId);
      }
      return applied(opId, "setLog");
    });
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) {
      return rejected(opId, "setLog", "set_number_conflict");
    }
    if (isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)) {
      return rejected(opId, "setLog", "invalid_reference");
    }
    throw err;
  }
}

// Deletes are naturally idempotent: an already-absent row (never existed,
// already deleted by a prior replay of this exact op, or not owned by this
// user) is reported as applied rather than rejected — there is no way to
// distinguish those cases from "gone", and per pwa-offline-strategy.md §5
// replays must converge, not accumulate failures.
async function applySetLogDelete(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = setLogDeletePayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "setLog", "invalid_payload");
  const payload = parsed.data;

  return db.transaction(async (tx) => {
    const [existingRow] = await tx
      .select({
        sessionExerciseId: setLogs.sessionExerciseId,
        sessionStatus: workoutSessions.status,
        sessionUserId: workoutSessions.userId,
      })
      .from(setLogs)
      .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
      .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
      .where(eq(setLogs.id, payload.id));

    if (!existingRow || existingRow.sessionUserId !== userId) {
      return applied(opId, "setLog");
    }
    if (existingRow.sessionStatus === "discarded") {
      return rejected(opId, "setLog", "session_locked");
    }

    await tx.delete(setLogs).where(eq(setLogs.id, payload.id));

    // Same supersede-on-relevant-edit rule as the upsert path — deleting a
    // set from a completed source session changes the facts a pending
    // recommendation was computed from.
    if (existingRow.sessionStatus === "completed") {
      await reevaluateForSourceSessionExercise(tx, userId, existingRow.sessionExerciseId);
    }
    return applied(opId, "setLog");
  });
}

// Client-computed recommendation (offline completion fallback,
// progression-engine.md §5). The client enqueues these AHEAD of the
// completion op, so the source session may legitimately still be
// 'in_progress' here — ownership and referential consistency are what's
// validated, not lifecycle. A row that already exists under this id is a
// replayed op: recommendations are immutable after insert, so it converges
// as a no-op without content comparison.
async function applyRecommendationUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = recommendationUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "recommendation", "invalid_payload");
  const payload = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: recommendations.id, userId: recommendations.userId })
        .from(recommendations)
        .where(eq(recommendations.id, payload.id));
      if (existing) {
        if (existing.userId !== userId) return rejected(opId, "recommendation", "not_found");
        return applied(opId, "recommendation");
      }

      const [source] = await tx
        .select({
          sessionId: sessionExercises.sessionId,
          exerciseId: sessionExercises.exerciseId,
          sessionUserId: workoutSessions.userId,
        })
        .from(sessionExercises)
        .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
        .where(eq(sessionExercises.id, payload.sourceSessionExerciseId));
      if (!source || source.sessionUserId !== userId) {
        return rejected(opId, "recommendation", "not_found");
      }
      if (
        source.sessionId !== payload.sourceSessionId ||
        source.exerciseId !== payload.exerciseId
      ) {
        return rejected(opId, "recommendation", "invalid_payload");
      }

      // §5 supersede-before-insert — same rule as the server's own
      // evaluation path, which is what makes uq_recs_one_pending hold.
      await supersedePending(tx, userId, payload.exerciseId, payload.blockId);

      await tx.insert(recommendations).values({
        id: payload.id,
        userId,
        exerciseId: payload.exerciseId,
        blockId: payload.blockId,
        sourceSessionId: payload.sourceSessionId,
        sourceSessionExerciseId: payload.sourceSessionExerciseId,
        strategyId: payload.strategyId,
        strategyVersion: payload.strategyVersion,
        classification: payload.classification,
        config: payload.config,
        inputs: payload.inputs,
        action: payload.action,
        target: payload.target,
        reasonCodes: [...payload.reasonCodes],
        confidence: payload.confidence,
        computedBy: "client",
        // The record's creation moment is the client-side evaluation time —
        // an event time the client clock owns, like started_at/logged_at
        // (pwa-offline-strategy.md §5).
        createdAt: new Date(payload.createdAt),
      });
      return applied(opId, "recommendation");
    });
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) {
      return rejected(opId, "recommendation", "recommendation_conflict");
    }
    if (isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)) {
      return rejected(opId, "recommendation", "invalid_reference");
    }
    throw err;
  }
}

function targetsEqual(a: RecommendationTarget | null, b: RecommendationTarget | null): boolean {
  // Field-wise, never JSON.stringify: jsonb normalizes key order, so a
  // round-tripped object need not serialize identically to the payload's.
  if (a === null || b === null) return a === b;
  return a.loadKg === b.loadKg && a.reps === b.reps;
}

// The one-time decision append (progression-engine.md §7, domain-model.md
// §10 invariant 8: "decision written at most once"). Pending → write it;
// an identical replay converges as a no-op; anything else — a different
// decision, or a decision on a superseded record — is a conflict that
// dead-letters rather than silently rewriting a user choice.
async function applyRecommendationDecisionUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = recommendationDecisionUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "recommendationDecision", "invalid_payload");
  const payload = parsed.data;

  return db.transaction(async (tx) => {
    const [rec] = await tx
      .select()
      .from(recommendations)
      .where(eq(recommendations.id, payload.recommendationId));
    if (!rec || rec.userId !== userId) {
      return rejected(opId, "recommendationDecision", "not_found");
    }

    if (rec.decisionStatus === "pending") {
      await tx
        .update(recommendations)
        .set({
          decisionStatus: payload.status,
          decisionChosen: payload.chosen,
          decidedAt: new Date(payload.decidedAt),
          decisionSource: payload.source,
          updatedAt: new Date(),
        })
        .where(eq(recommendations.id, rec.id));
      return applied(opId, "recommendationDecision");
    }

    const identicalReplay =
      rec.decisionStatus === payload.status &&
      rec.decisionSource === payload.source &&
      rec.decidedAt !== null &&
      rec.decidedAt.getTime() === new Date(payload.decidedAt).getTime() &&
      targetsEqual(rec.decisionChosen as RecommendationTarget | null, payload.chosen);
    if (identicalReplay) return applied(opId, "recommendationDecision");

    return rejected(opId, "recommendationDecision", "decision_conflict");
  });
}

// Phase 8 — reuses logBodyweight (src/server/bodyweight/service.ts) as-is:
// the day-grain upsert-by-(userId,date), the 20-400kg range check, and
// ownership are all already correct there. This is a thin adapter, not a
// parallel write path, per the task's "reuse the existing narrow outbox
// architecture" instruction. There is no rejection path beyond
// invalid_payload — logBodyweight has no business-rule rejection of its own
// (unlike recovery's "at least one metric" constraint below).
async function applyBodyweightEntryUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = bodyweightEntryUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "bodyweightEntry", "invalid_payload");
  const payload = parsed.data;

  await logBodyweight(
    db,
    userId,
    { date: payload.date, weightKg: payload.weightKg, note: payload.note },
    new Date(),
    payload.id,
  );
  return applied(opId, "bodyweightEntry");
}

// Phase 8 — same adapter shape as bodyweight above, over logRecovery
// (src/server/recovery/service.ts): a thin pass-through of this op's own
// fields, no pre-read.
//
// phase-8-review.md HIGH-1 — this used to pre-read today's existing row and
// backfill every metric field this op doesn't touch, to work around
// `logRecovery`'s single-statement upsert eagerly validating
// `ck_recovery_entries_has_metric` against the PROPOSED INSERT TUPLE rather
// than the real post-merge row (verified against Postgres 16). That backfill
// opened exactly the lost-update window it was trying to avoid: real-Postgres
// concurrency testing showed 5/6 concurrent partial-update pairs on
// DIFFERENT metrics lost one of them, because each call's stale pre-read
// clobbered whatever the other had just committed. `logRecovery` now handles
// the false-rejection case itself (catch-and-retry as a single atomic plain
// UPDATE, which Postgres validates against the true row) — see its own
// comment — so this adapter needs no read of its own and no longer risks
// racing anything.
async function applyRecoveryEntryUpsert(
  db: AppDb,
  userId: string,
  opId: string,
  rawPayload: unknown,
): Promise<SyncOpResult> {
  const parsed = recoveryEntryUpsertPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return rejected(opId, "recoveryEntry", "invalid_payload");
  const payload = parsed.data;

  try {
    await logRecovery(
      db,
      userId,
      {
        date: payload.date,
        sleepHours: payload.sleepHours,
        sleepQuality: payload.sleepQuality,
        readiness: payload.readiness,
        soreness: payload.soreness,
        note: payload.note,
      },
      new Date(),
      payload.id,
    );
    return applied(opId, "recoveryEntry");
  } catch (err) {
    if (err instanceof RecoveryEntryHasNoMetricError) {
      return rejected(opId, "recoveryEntry", "no_metric");
    }
    throw err;
  }
}
