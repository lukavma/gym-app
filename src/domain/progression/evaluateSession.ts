import {
  STRATEGY_CONFIG_SCHEMAS,
  supportsScheme,
  type LoadProgressionConfig,
  type RepProgressionConfig,
} from "./registry";
import { evaluateLoadProgression } from "./loadProgression";
import { evaluateRepProgression } from "./repProgression";
import { modalWorkingLoad } from "./loadHelpers";
import type {
  EvaluationBlockContext,
  EvaluationContext,
  PerformedExercise,
  PerformedSet,
  RecommendationDraft,
} from "./engine";
import { STRATEGY_VERSIONS, type PrescriptionSnapshotData } from "../schemas/prescriptionSnapshot";

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

function unsupportedSchemeDraft(
  input: SessionExerciseEvaluationInput,
  snapshot: PrescriptionSnapshotData,
): RecommendationDraft {
  const { loadKg, mixed } = modalWorkingLoad(input.workSets);
  return {
    action: "none",
    reasonCodes: ["UNSUPPORTED_SCHEME"],
    inputs: {
      prescribed: {
        scheme: snapshot.scheme,
        ...(snapshot.targetRir ? { targetRir: snapshot.targetRir } : {}),
      },
      workSets: input.workSets,
      derived: {
        setsCompleted: input.workSets.length,
        prescribedSets: snapshot.scheme.sets,
        finalSetRir:
          input.workSets.length > 0 ? input.workSets[input.workSets.length - 1]!.rir : null,
        workingLoadKg: loadKg,
        mixedLoads: mixed,
      },
      historyDepthUsed: input.history.length,
    },
    confidence: "low",
  };
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
    const strategyId = snapshot.progression.strategyId;
    if (strategyId === "manual") continue;

    let draft: RecommendationDraft;
    let config: Record<string, unknown>;
    if (!supportsScheme(strategyId, snapshot.scheme.type)) {
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
          workSets: exercise.workSets,
        },
        history: exercise.history,
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
    });
  }
  return results;
}
