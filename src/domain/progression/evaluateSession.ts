import {
  STRATEGY_CONFIG_SCHEMAS,
  supportsScheme,
  type LoadProgressionConfig,
  type RepProgressionConfig,
} from "./registry";
import { evaluateLoadProgression } from "./loadProgression";
import { evaluateRepProgression } from "./repProgression";
import { modalWorkingLoad } from "./loadHelpers";
import {
  bridgeUngroupedHistoryEntry,
  buildGroupEvaluationUnits,
  stripGroupKey,
} from "./groupEvaluation";
import type {
  EvaluationBlockContext,
  EvaluationContext,
  PerformedExercise,
  PerformedSet,
  RecommendationDraft,
} from "./engine";
import { STRATEGY_VERSIONS, type PrescriptionSnapshotData } from "../schemas/prescriptionSnapshot";
import { DEFAULT_MEASUREMENT_PROFILE } from "../measurement/profile";

// progression-engine.md §5 — the pure half of "onSessionCompleted". This
// module is the isomorphism point: the server runs it inside the completion
// transaction, the offline client runs it against the cached bundle context;
// determinism + versioning make the two paths equivalent. Everything with a
// side effect (repo queries, supersede, insert) stays with the callers.

export type EvaluableStrategyId = "load-progression" | "rep-progression";

export interface SessionExerciseEvaluationInput {
  sessionExerciseId: string;
  exerciseId: string;
  skipped: boolean;
  // The frozen PrescriptionSnapshot data, with `prefill.reps` already
  // overlaid by any in-session decision (evaluationTarget.ts) — "as executed
  // THIS session". Null for free ad-hoc exercises (implicitly manual, §8).
  prescription: PrescriptionSnapshotData | null;
  workSets: PerformedSet[]; // warmups excluded, ordered by set number
  history: PerformedExercise[]; // strictly-before sessions, most recent first, capped
  loadStepKg: number;
}

export interface SessionEvaluationInput {
  sessionId: string;
  startedAt: string; // ISO — data, not a clock
  isDeload: boolean;
  block: EvaluationBlockContext | null;
  exercises: SessionExerciseEvaluationInput[];
}

export interface EvaluatedRecommendation {
  sessionExerciseId: string;
  exerciseId: string;
  strategyId: EvaluableStrategyId;
  strategyVersion: number;
  classification: "heuristic" | "user_defined";
  config: Record<string, unknown>;
  draft: RecommendationDraft;
  // set-groups-architecture-evaluation.md §5.3/manifest item 8 — the group
  // this record belongs to, or `null` for an ungrouped slot (never omitted,
  // so every caller can key results uniformly).
  groupKey: string | null;
}

function evaluateStrategy(
  strategyId: EvaluableStrategyId,
  ctx: EvaluationContext,
  config: Record<string, unknown>,
): RecommendationDraft {
  if (strategyId === "load-progression") {
    return evaluateLoadProgression(ctx, config as LoadProgressionConfig);
  }
  return evaluateRepProgression(ctx, config as RepProgressionConfig);
}

// A `groups` scheme has no top-level `sets` field (setScheme.ts §4.2's
// deliberate compile-error design); `evaluateSession`'s own dispatch never
// calls this function for one (it branches to `evaluateGroupedExercise`
// first), so this is a defensive fallback for a case that is also
// structurally unreachable, not a meaningful value.
function prescribedSetsOf(scheme: PrescriptionSnapshotData["scheme"]): number {
  return scheme.type === "groups" ? 0 : scheme.sets;
}

function unsupportedSchemeDraft(
  input: SessionExerciseEvaluationInput,
  snapshot: PrescriptionSnapshotData,
): RecommendationDraft {
  const workSets = stripGroupKey(input.workSets);
  const { loadKg, mixed } = modalWorkingLoad(workSets);
  return {
    action: "none",
    reasonCodes: ["UNSUPPORTED_SCHEME"],
    inputs: {
      prescribed: {
        scheme: snapshot.scheme,
        ...(snapshot.targetRir ? { targetRir: snapshot.targetRir } : {}),
      },
      workSets,
      derived: {
        setsCompleted: workSets.length,
        prescribedSets: prescribedSetsOf(snapshot.scheme),
        finalSetRir: workSets.length > 0 ? workSets[workSets.length - 1]!.rir : null,
        workingLoadKg: loadKg,
        mixedLoads: mixed,
      },
      historyDepthUsed: input.history.length,
    },
    confidence: "low",
  };
}

// set-groups-architecture-evaluation.md §5.3/D-2 — independent per-group
// progression: one evaluation, one persisted record, per group. Strategies
// are NEVER modified (§5.4) — `buildGroupEvaluationUnits` does the
// projection/windowing; this loop only resolves each group's effective
// strategy/config (per-group override, else the slot default) and augments
// the strategy's own output with the group-identifying `inputs.prescribed.group`
// and `inputs.extraWorkSets` (§5.4/§5.5, rev. 3 V-1 — both omitted entirely
// for an ungrouped record, which this function never touches).
function evaluateGroupedExercise(
  exercise: SessionExerciseEvaluationInput,
  snapshot: PrescriptionSnapshotData,
  input: SessionEvaluationInput,
): EvaluatedRecommendation[] {
  const scheme = snapshot.scheme;
  if (scheme.type !== "groups") return [];
  const units = buildGroupEvaluationUnits({
    snapshot,
    scheme,
    workSets: exercise.workSets,
    history: exercise.history,
    block: input.block,
    exercise: { id: exercise.exerciseId, loadStepKg: exercise.loadStepKg },
    sessionId: input.sessionId,
    performedAt: input.startedAt,
    isDeload: input.isDeload,
  });

  const results: EvaluatedRecommendation[] = [];
  for (const { group, ctx, partition } of units) {
    const override = snapshot.progression.groups?.[group.key];
    const strategyId = override?.strategyId ?? snapshot.progression.strategyId;
    // §6.3 rule L-1 (Stage B) / a plain per-group choice in Stage A — a
    // group whose effective strategy is `manual` progresses independently of
    // its siblings: no draft, no record, exactly like an ungrouped manual
    // slot (D-2 — "independent groups receive independent progression").
    if (strategyId === "manual") continue;
    // Stage B — defensive, structurally unreachable: `checkPrescriptionCompatibility`
    // rejects any linked group whose effective strategy isn't already
    // `manual` (the branch above), so this can only ever fire against a
    // snapshot that predates that gate or bypassed it. A linked group must
    // never produce a competing recommendation regardless.
    if (group.link) continue;

    const rawConfig = override?.config ?? snapshot.progression.config;
    const parsed = STRATEGY_CONFIG_SCHEMAS[strategyId].safeParse(rawConfig);
    if (!parsed.success) continue;
    const config = parsed.data as Record<string, unknown>;

    const draft = evaluateStrategy(strategyId, ctx, config);
    draft.inputs.prescribed.group = {
      key: group.key,
      label: group.label,
      setsMin: group.sets.min,
      setsMax: group.sets.max,
    };
    draft.inputs.extraWorkSets = partition.extra;

    if (draft.action === "none" && draft.reasonCodes.length === 0) continue;

    results.push({
      sessionExerciseId: exercise.sessionExerciseId,
      exerciseId: exercise.exerciseId,
      strategyId,
      strategyVersion: STRATEGY_VERSIONS[strategyId],
      classification: override?.classification ?? snapshot.progression.classification,
      config,
      draft,
      groupKey: group.key,
    });
  }
  return results;
}

export function evaluateSession(input: SessionEvaluationInput): EvaluatedRecommendation[] {
  // §5 / §9 case 10 — deload sessions are not evaluated at all (engine
  // default; nothing sets isDeload=true until Phase 5 applies deloads).
  if (input.isDeload) return [];

  const results: EvaluatedRecommendation[] = [];
  for (const exercise of input.exercises) {
    // §5 — only non-skipped exercises with a non-manual prescription are
    // evaluated; ad-hoc exercises without a prescription are implicitly
    // manual (§8).
    if (exercise.skipped || !exercise.prescription) continue;
    const snapshot = exercise.prescription;

    // §11.2/§11.3 site #1, NC-9 — progression strategies are load_reps-only
    // in v1 (N-13: reps-profile rep-progression is deferred); skip BEFORE
    // even checking scheme compatibility, with the same silent-skip
    // treatment an unparseable config (below) already gets — no draft, no
    // row, no reason code.
    const profile = snapshot.measurement?.profile ?? DEFAULT_MEASUREMENT_PROFILE;
    if (profile !== DEFAULT_MEASUREMENT_PROFILE) continue;

    // set-groups-architecture-evaluation.md §5.3 — a `groups` scheme is
    // evaluated per group, independent of the slot-level `strategyId` (which
    // is only the DEFAULT for groups that don't override it — a slot default
    // of `manual` with an overriding group must still progress that group).
    if (snapshot.scheme.type === "groups") {
      results.push(...evaluateGroupedExercise(exercise, snapshot, input));
      continue;
    }

    const strategyId = snapshot.progression.strategyId;
    if (strategyId === "manual") continue;

    let draft: RecommendationDraft;
    let config: Record<string, unknown>;
    if (!supportsScheme(profile, strategyId, snapshot.scheme.type)) {
      // prescription-model.md §2 — defensive, should be unreachable: the
      // editor only offers compatible pairs.
      draft = unsupportedSchemeDraft(exercise, snapshot);
      config = snapshot.progression.config;
    } else {
      const parsed = STRATEGY_CONFIG_SCHEMAS[strategyId].safeParse(snapshot.progression.config);
      // A snapshot config that no longer parses (validated on write, so this
      // means corruption or a schema change without an upgrade path) is
      // skipped rather than crashing the completion — no recommendation is
      // fabricated from unvalidated config.
      if (!parsed.success) continue;
      config = parsed.data as Record<string, unknown>;
      const ctx: EvaluationContext = {
        prescription: snapshot,
        performance: {
          sessionId: input.sessionId,
          performedAt: input.startedAt,
          isDeload: input.isDeload,
          prescribed: {
            scheme: snapshot.scheme,
            ...(snapshot.targetRir ? { targetRir: snapshot.targetRir } : {}),
          },
          // set-groups-architecture-evaluation.md §5.4 discipline — an
          // ungrouped slot's persisted `inputs.workSets` must stay
          // byte-identical to before Stage A (rev. 3 V-1/NC-9): callers may
          // uniformly tag every PerformedSet with `groupKey` (server/client
          // work-set mapping is shared with the grouped path), so this
          // branch strips it back off before it can reach a strategy's own
          // `inputs.workSets = sets` passthrough.
          workSets: stripGroupKey(exercise.workSets),
        },
        // set-groups-architecture-evaluation.md §5.6 reverse bridge — a
        // historical entry that was itself a `groups` scheme contributes
        // only its OWN first group's sets and PROJECTED scheme (resolved
        // from that entry's own frozen snapshot), never every group's sets
        // pooled together; an ordinarily-ungrouped entry is unaffected.
        // Symmetric to the forward bridge `buildGroupHistory` applies for a
        // currently-grouped slot.
        history: exercise.history.map(bridgeUngroupedHistoryEntry),
        block: input.block,
        exercise: { id: exercise.exerciseId, loadStepKg: exercise.loadStepKg },
      };
      draft = evaluateStrategy(strategyId, ctx, config);
    }

    // §5 persist rule — "if draft.action ≠ 'none' or draft.reasonCodes ≠ []".
    if (draft.action === "none" && draft.reasonCodes.length === 0) continue;

    results.push({
      sessionExerciseId: exercise.sessionExerciseId,
      exerciseId: exercise.exerciseId,
      strategyId,
      // The version of the strategy code that actually ran (the registry's
      // current version); the snapshot's frozen version documents what was
      // promised at session start — both are 1 for every MVP strategy.
      strategyVersion: STRATEGY_VERSIONS[strategyId],
      classification: snapshot.progression.classification,
      config,
      draft,
      groupKey: null,
    });
  }
  return results;
}
