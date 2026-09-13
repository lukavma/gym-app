import { and, asc, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
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
import { hasEvaluableStrategy } from "@/domain/progression/groupEvaluation";
import {
  applyInSessionDecisionToPrefill,
  applyInSessionDecisionsToGroupPrefills,
  type InSessionDecision,
} from "@/domain/progression/evaluationTarget";
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
import { DEFAULT_MEASUREMENT_PROFILE } from "@/domain/measurement/profile";

// progression-engine.md §5 — the impure half of "onSessionCompleted": repo
// queries assemble the EvaluationContext OUTSIDE the pure core, the domain's
// evaluateSession() computes drafts, and this module persists them with
// supersede-before-insert. Everything here runs inside the caller's sync-op
// transaction, so a failed evaluation rolls the completion back with it and
// the client's retried op re-runs both — evaluation happens exactly once per
// actual in_progress → completed transition, never on no-op replays (which
// is what keeps "no automatic recomputation after a Decision" true).
//
// set-groups-architecture-evaluation.md §5.3/D-2 (Stage A) — independent
// progression per group means one recommendation record PER (exercise,
// block, group key), not per (exercise, block). Every lookup and mutation in
// this file that used to be keyed by (exercise, block) alone is now keyed by
// (exercise, block, group key), with `groupKey = null` for an ungrouped slot
// — the degenerate case that keeps every existing behaviour byte-identical.

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
  // set-groups-architecture-evaluation.md §5.3 — the group this record
  // belongs to; `null` for an ungrouped slot.
  groupKey: string | null;
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
    groupKey: row.groupKey,
  };
}

function parseSnapshot(prescription: unknown): PrescriptionSnapshotData | null {
  if (!prescription) return null;
  const parsed = prescriptionSnapshotSchema.safeParse(prescription);
  return parsed.success ? parsed.data.snapshot : null;
}

// Composite key every per-group lookup in this file shares — exported so
// server/today/service.ts can look results up the identical way.
export function exerciseGroupKey(exerciseId: string, groupKey: string | null): string {
  return `${exerciseId}:${groupKey ?? ""}`;
}

// set-groups-architecture-evaluation.md §5.3/§5.6 C-1/D-6(a) — the ONE
// place a group's recommendation is resolved from an `exerciseGroupKey`-
// keyed map, shared by `server/today/service.ts`'s bundle assembly
// (pendingRecommendations) AND cross-device resume (`getActiveSession`'s
// `.recommendations`), so the two can never resolve the bridge differently.
//
// Found and fixed during this remediation pass: a first cut of the bridge
// (both call sites, independently) returned the legacy null-key record
// UNCHANGED — its own `groupKey` field stayed `null`. Every client-side
// consumer keys a recommendation to a group by `rec.groupKey === group.key`
// (ExerciseCard.tsx's card lookup, TodaySection.tsx's preview label lookup,
// activeSession.ts's implicit-decision and explicit-decision lookups) — a
// `null` groupKey never matches a real group key, so the bridged
// recommendation was fetched into the bundle/session correctly but then
// rendered NOWHERE and could never be decided at all, silently defeating
// the entire point of the bridge ("surfaced, decided normally"). Caught by
// a browser-level E2E test (tests/e2e/setGroups.spec.ts), never by a unit
// or integration test, since those asserted only on the bundle's raw
// carry-forward/pending-record PRESENCE, never on whether a client-side
// `groupKey`-keyed lookup could actually find it. The fix remaps the
// RETURNED copy's `groupKey` to the bridging group's own key — the
// underlying stored row (and its `id`, which a decision op still targets)
// is never rewritten (D-6 — "no rewrite of historical rows").
// Stage B remediation F-2 (set-groups-stage-b-review.md) — `isLinked` is the
// caller's CURRENT (bundle assembly) or FROZEN-snapshot (cross-device resume)
// answer to "does this group have a `link` right now"; either way, a linked
// group must never surface a recommendation as a competing decision surface
// (§6.3 rule L-1's visible consequence: "no recommendation and no decision …
// ever"), regardless of whether one was computed or even accepted BEFORE the
// group became linked. This is the single shared choke point both bundle
// assembly and resume read through, so filtering here — rather than only at
// render time — closes the defect at its root: a recommendation that can
// never be surfaced can never be decided through the UI, and therefore can
// never reach `getLatestDecisionChosenByExercise` (which only ever returns
// already-decided rows) to poison a later session's `groupPrefills` fallback.
// A write-time supersede-on-link was considered and deliberately NOT added:
// this read filter is provably sufficient (a merely-pending record that is
// never reachable can never transition to accepted/modified), and a
// prescription update has no reliable single `blockId` to scope a
// `supersedePending` call against (a template can be scheduled by more than
// one block), whereas this filter needs no block-scoping at all.
export function resolveGroupRecommendation(
  byExerciseGroupKey: ReadonlyMap<string, RecommendationDto>,
  exerciseId: string,
  groupKey: string,
  isFirstGroup: boolean,
  isLinked: boolean,
): RecommendationDto | undefined {
  if (isLinked) return undefined;
  const own = byExerciseGroupKey.get(exerciseGroupKey(exerciseId, groupKey));
  if (own) return own;
  if (!isFirstGroup) return undefined;
  const bridged = byExerciseGroupKey.get(exerciseGroupKey(exerciseId, null));
  return bridged ? { ...bridged, groupKey } : undefined;
}

function firstGroupKeyOf(snapshot: PrescriptionSnapshotData | null): string | null {
  if (!snapshot || snapshot.scheme.type !== "groups") return null;
  return snapshot.scheme.groups[0]?.key ?? null;
}

// The raw shape `getWorkSetsByExercise`'s join produces, one row per set —
// `measurementProfile` is the PARENT SLOT's (`session_exercises`), not the
// set row's own mirrored column, matching §11.3 site #1's exact wording.
export interface WorkSetSourceRow {
  sessionExerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  measurementProfile: string;
  // set-groups-architecture-evaluation.md §4.4 — carried through so the
  // domain layer (groupEvaluation.ts) can partition a slot's work sets by
  // group without a second query.
  groupKey: string | null;
}

// §11.3 site #1 (I-13) — the pure half of the SQL→domain boundary, split out
// so NC-10's mixed-profile equality/count assertions exercise the actual
// mapping rule without a database. Keeps only `load_reps` slots, excluded
// BEFORE any `PerformedSet` is built (never map-then-filter, so a null
// weight/reps never transiently touches the numeric fields).
export function mapWorkSetRows(rows: readonly WorkSetSourceRow[]): Map<string, PerformedSet[]> {
  const result = new Map<string, PerformedSet[]>();
  for (const row of rows) {
    if (row.measurementProfile !== DEFAULT_MEASUREMENT_PROFILE) continue;
    // The DB's own ck_set_logs_profile_shape guarantees a load_reps row's
    // weight_kg/reps are non-null (§8.3) — this narrows the post-migration
    // `number | null` columns as a runtime invariant, not a coercion
    // (I-13/H-12); a row that ever disagreed is skipped, never fabricated
    // into a `0`/`1` set (matches the existing `RESTRICT FK — unreachable`
    // defensive-skip idiom below in this file).
    if (row.weightKg === null || row.reps === null) continue;
    const list = result.get(row.sessionExerciseId) ?? [];
    list.push({ weightKg: row.weightKg, reps: row.reps, rir: row.rir, groupKey: row.groupKey });
    result.set(row.sessionExerciseId, list);
  }
  return result;
}

async function getWorkSetsByExercise(
  db: AppDb,
  sessionExerciseIds: string[],
): Promise<Map<string, PerformedSet[]>> {
  if (sessionExerciseIds.length === 0) return new Map();
  const rows = await db
    .select({
      sessionExerciseId: setLogs.sessionExerciseId,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rir: setLogs.rir,
      measurementProfile: sessionExercises.measurementProfile,
      groupKey: setLogs.groupKey,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
    .where(and(inArray(setLogs.sessionExerciseId, sessionExerciseIds), eq(setLogs.isWarmup, false)))
    .orderBy(asc(setLogs.setNumber));
  return mapWorkSetRows(rows);
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

function groupKeyScope(groupKey: string | null) {
  return groupKey === null
    ? isNull(recommendations.groupKey)
    : eq(recommendations.groupKey, groupKey);
}

// The rep target "as executed THIS session" (evaluationTarget.ts): the
// latest accepted/modified decision per (exercise, group key) whose
// decidedAt falls inside the session window and whose recommendation came
// from an earlier session — i.e. the recommendation the athlete decided at
// this workout. Keyed by `exerciseGroupKey` so a grouped slot's per-group
// in-session decisions never collide.
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
      groupKey: recommendations.groupKey,
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
    const key = exerciseGroupKey(row.exerciseId, row.groupKey);
    if (result.has(key)) continue; // rows are newest-first
    if (!row.decidedAt) continue;
    const decidedMs = row.decidedAt.getTime();
    if (decidedMs < startedAtMs) continue;
    if (completedAtMs !== null && decidedMs > completedAtMs) continue;
    const chosen = (row.decisionChosen ?? null) as RecommendationTarget | null;
    if (chosen) result.set(key, chosen);
  }
  return result;
}

// Applies the in-session decision overlay for one exercise, per group when
// the frozen scheme is `groups` (evaluationTarget.ts's per-key sibling),
// else the original single-key overlay — the degenerate case that keeps an
// ungrouped exercise's prefill overlay byte-identical to before Stage A.
function overlayInSessionDecisions(
  snapshot: PrescriptionSnapshotData,
  exerciseId: string,
  decisionChosen: ReadonlyMap<string, RecommendationTarget>,
): PrescriptionSnapshotData {
  if (snapshot.scheme.type === "groups") {
    const perGroup = new Map<string, InSessionDecision>();
    for (const group of snapshot.scheme.groups) {
      const chosen = decisionChosen.get(exerciseGroupKey(exerciseId, group.key));
      if (chosen) perGroup.set(group.key, { status: "accepted", chosen });
    }
    return applyInSessionDecisionsToGroupPrefills(snapshot, perGroup);
  }
  const chosen = decisionChosen.get(exerciseGroupKey(exerciseId, null)) ?? null;
  return applyInSessionDecisionToPrefill(snapshot, chosen ? { status: "accepted", chosen } : null);
}

// Exported for the sync service's client-computed-recommendation handler,
// which must apply the same supersede-before-insert rule (§5) the server's
// own evaluation path uses. `groupKeys` defaults to `[null]` (the ungrouped
// case, unchanged); a grouped caller passes `[group.key]`, or
// `[group.key, null]` for the FIRST group of a scheme — the C-1/D-6(a)
// bridge: the slot's pre-conversion null-key pending record is superseded
// the first time that group's OWN key produces a fresh evaluation, "closed
// out by the group's next record" per the architecture evaluation.
export async function supersedePending(
  db: AppDb,
  userId: string,
  exerciseId: string,
  blockId: string | null,
  groupKeys: readonly (string | null)[] = [null],
): Promise<void> {
  await db
    .update(recommendations)
    .set({ decisionStatus: "superseded", updatedAt: new Date() })
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.exerciseId, exerciseId),
        blockScope(blockId),
        or(...groupKeys.map(groupKeyScope)),
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
  //
  // Set Groups release-residual remediation W-2
  // (set-groups-release-residual-verification.md §7) — this used to filter
  // on `hasEvaluableStrategy` too, which is false for an all-manual slot and
  // silently hid a linked group's own lifecycle work (below) from an
  // all-manual slot entirely. `candidates` is now the base
  // non-skipped/parseable list only (§14.1's per-group condition table);
  // `toEvaluate`, derived from it, keeps the ordinary evaluate-and-persist
  // pipeline's candidate set byte-for-byte identical to before this pass —
  // M-2's own "manual SLOT default + non-manual GROUP override" case is
  // still exactly what `hasEvaluableStrategy` (not a bare slot-level
  // `strategyId !== "manual"` check) exists to keep from being dropped.
  const candidates = exerciseRows
    .map((row) => ({ row, snapshot: parseSnapshot(row.prescription) }))
    .filter(
      (c): c is { row: SessionExerciseRow; snapshot: PrescriptionSnapshotData } =>
        !c.row.skipped && c.snapshot !== null,
    );
  if (candidates.length === 0) return;
  const toEvaluate = candidates.filter((c) => hasEvaluableStrategy(c.snapshot));

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

  // W-2 — widened from `toEvaluate` to `candidates` (a superset) so an
  // all-manual slot's own logged sets are available to the linked-group
  // supersession loop below, which no longer runs only over `toEvaluate`.
  const workSets = await getWorkSetsByExercise(
    db,
    candidates.map((c) => c.row.id),
  );
  const decisionChosen = await getInSessionDecisionChosen(db, userId, session, exerciseIds);

  const inputs: SessionExerciseEvaluationInput[] = [];
  const snapshotBySessionExerciseId = new Map<string, PrescriptionSnapshotData>();
  for (const { row, snapshot } of toEvaluate) {
    const loadStepKg = loadStepById.get(row.exerciseId);
    if (loadStepKg === undefined) continue; // RESTRICT FK — unreachable
    const history = await getEngineHistory(db, userId, row.exerciseId, session);
    snapshotBySessionExerciseId.set(row.id, snapshot);
    inputs.push({
      sessionExerciseId: row.id,
      exerciseId: row.exerciseId,
      skipped: row.skipped,
      prescription: overlayInSessionDecisions(snapshot, row.exerciseId, decisionChosen),
      workSets: workSets.get(row.id) ?? [],
      history,
      loadStepKg,
    });
  }

  // Stage B remediation V-1 (set-groups-stage-b-remediation-verification.md
  // §7), corrected by the release-residual remediation W-1/W-2/W-3
  // (set-groups-release-residual-verification.md §7 — see §14.1's behaviour
  // matrix in the implementation report for the full derivation) —
  // `evaluateGroupedExercise`'s `if (group.link) continue` means a linked
  // group's OWN evaluation never runs, so a pending record computed before
  // the group was linked is never superseded by any session completed while
  // it stays linked; F-2's `isLinked` read-time filter then hides that stale
  // record only while linked, and unlinking makes it reachable again —
  // resurfacing a target that predates real, differently-loaded work already
  // logged into this exact group. Unlike the write-time supersede-on-link
  // shape F-2 already rejected (no reliable `blockId` exists at a
  // prescription-EDIT moment, since a template can be scheduled by more than
  // one block), this runs at SESSION COMPLETION, where `session.blockId` is
  // already well-defined and already used by every other `supersedePending`
  // call in this function — so scoping to it is not a new limitation, it is
  // the existing convention.
  //
  // W-1 — a linked group's own evaluation is ALWAYS skipped (unconditional on
  // `mode`), so it can never have a recommendation row sourced from its own
  // slot; the neighbouring `toPersist` guard's `reevaluate`-mode condition
  // ("the record sourced from THIS slot is still pending") can therefore
  // never be satisfied for a linked group's key, in either mode. Applying
  // that exact guard here is mathematically equivalent to never running this
  // loop in `reevaluate` mode — there is no configuration where the guard
  // would permit a supersede that skipping the mode outright would forbid —
  // so the loop runs only for `mode === "initial"`, the completion-only
  // operation the rule was always meant to be. This is what stops correcting
  // a set in an OLDER session frozen as linked from destroying a NEWER,
  // legitimate pending record for the same group that a later, unlinked
  // session already produced.
  //
  // W-3 — gated on `!session.isDeload` too, and positioned (as before)
  // ahead of `evaluateSession`'s own `isDeload` short-circuit, so it must
  // check the flag itself rather than inherit that short-circuit: A-15 and
  // `recommendationForDeload` both express "a deload session changes no
  // recommendation state," and superseding a pending record is a state
  // change. A deload session with a linked, performed group therefore now
  // leaves that group's stale record exactly as reachable after a later
  // unlink as it was before this fix existed — an explicit, documented
  // exception to the linked-and-performed rule, not an oversight: real work
  // was logged, but a deload week's own "change nothing" contract wins.
  //
  // W-2 — iterates `candidates` (every non-skipped, parseable slot), not
  // `toEvaluate` (§14.1/M-2's `hasEvaluableStrategy`-filtered subset), so an
  // all-manual slot's own linked, performed group is still covered — slot
  // eligibility for ordinary progression is orthogonal to whether a linked
  // group's stale record needs invalidating.
  //
  // Fires ONLY when the group (a) is linked in this session's own FROZEN
  // snapshot and (b) actually has a logged set THIS session — never for a
  // linked-but-untouched group (no new fact would justify invalidating
  // anything, which is also why link→unlink with no intervening workout
  // correctly leaves the old record reachable again, unchanged), never for a
  // sibling group or another block (a stale record filed under a different
  // block that also schedules this template is deliberately left alone), and
  // never for a `manual`-strategy group (the analogous-looking manual
  // transition is a distinct, pre-existing, out-of-scope behaviour class —
  // see the review's V-1 discussion — and widening this fix to cover it
  // would be exactly the "broader recommendation redesign" the task keeps
  // out of scope). Only marks already-'pending' rows 'superseded', same
  // idempotent, replay-safe update every other caller here uses; never
  // touches an accepted/modified row.
  if (mode === "initial" && !session.isDeload) {
    for (const { row, snapshot } of candidates) {
      if (snapshot.scheme.type !== "groups") continue;
      const sets = workSets.get(row.id) ?? [];
      for (const group of snapshot.scheme.groups) {
        if (!group.link) continue;
        if (!sets.some((s) => s.groupKey === group.key)) continue;
        const keys: (string | null)[] =
          firstGroupKeyOf(snapshot) === group.key ? [group.key, null] : [group.key];
        await supersedePending(db, userId, row.exerciseId, session.blockId, keys);
      }
    }
  }

  const results = evaluateSession({
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
    isDeload: session.isDeload,
    block: blockContext,
    exercises: inputs,
  });
  if (results.length === 0) return;

  // set-groups-architecture-evaluation.md §5.3 M-3 — one existence-and-status
  // lookup, keyed by (sourceSessionExerciseId, groupKey), serves BOTH modes:
  // 'initial' dedupes against a client-precomputed record (any status —
  // "already exists" is enough to skip, matching the pre-Stage-A single-key
  // rule exactly for an ungrouped slot); 'reevaluate' persists ONLY for a key
  // whose existing record from THIS slot is still 'pending' — a group
  // decided this session, or superseded by a later session, is never
  // re-evaluated from an older slot (A-13b, NC-6).
  const sessionExerciseIds = [...new Set(toEvaluate.map((c) => c.row.id))];
  const existingRows = await db
    .select({
      sourceSessionExerciseId: recommendations.sourceSessionExerciseId,
      groupKey: recommendations.groupKey,
      decisionStatus: recommendations.decisionStatus,
    })
    .from(recommendations)
    .where(inArray(recommendations.sourceSessionExerciseId, sessionExerciseIds));
  const statusByKey = new Map<string, string>();
  for (const row of existingRows) {
    statusByKey.set(`${row.sourceSessionExerciseId}:${row.groupKey ?? ""}`, row.decisionStatus);
  }

  const toPersist = results.filter((result) => {
    const key = `${result.sessionExerciseId}:${result.groupKey ?? ""}`;
    if (mode === "initial") return !statusByKey.has(key);
    return statusByKey.get(key) === "pending";
  });

  for (const result of toPersist) {
    const snapshot = snapshotBySessionExerciseId.get(result.sessionExerciseId) ?? null;
    const supersedeKeys: (string | null)[] =
      result.groupKey !== null && firstGroupKeyOf(snapshot) === result.groupKey
        ? [result.groupKey, null]
        : [result.groupKey];
    await supersedePending(db, userId, result.exerciseId, session.blockId, supersedeKeys);
    await db.insert(recommendations).values({
      id: newId(),
      userId,
      exerciseId: result.exerciseId,
      blockId: session.blockId,
      groupKey: result.groupKey,
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
// the at-most-one pending recommendation per (exercise, group key) in the
// given block scope, keyed by `exerciseGroupKey`.
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
  for (const row of rows)
    result.set(exerciseGroupKey(row.exerciseId, row.groupKey), toRecommendationDto(row));
  return result;
}

// prescription-model.md §4 step 1 — "chosen values of latest recommendation
// Decision for (E, current block)". Only accepted/modified decisions carry
// chosen values; rejected decisions are transparent (workingTargets.ts), so
// they are simply not part of this query. Keyed by `exerciseGroupKey`.
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
      groupKey: recommendations.groupKey,
      decisionChosen: recommendations.decisionChosen,
      decidedAt: recommendations.decidedAt,
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
    const key = exerciseGroupKey(row.exerciseId, row.groupKey);
    if (result.has(key)) continue; // newest-first
    const chosen = row.decisionChosen as DecisionChosen | null;
    if (chosen) result.set(key, chosen);
  }
  return result;
}

// Cross-device resume context: for each (exercise, group key) of an
// in-progress session, the recommendation the athlete is deciding at this
// workout — the latest non-superseded record sourced from a different
// session. Keyed by `exerciseGroupKey`.
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
    const key = exerciseGroupKey(row.exerciseId, row.groupKey);
    if (result.has(key)) continue; // newest-first
    result.set(key, toRecommendationDto(row));
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
//
// set-groups-architecture-evaluation.md §5.3 M-3 — this GATE is unchanged
// (still "does ANY pending record sourced from this slot exist"); the fix is
// inside `assembleAndEvaluate`'s per-(sessionExercise, groupKey) status check
// above, which is what actually restricts 'reevaluate' mode to still-pending
// keys.
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
