import { z } from "zod";
import { rirBandSchema } from "../schemes/rirBand";
import type { SchemeType, SetScheme } from "../schemes/setScheme";

// progression-engine.md §2/§4 — strategy registry. This module holds only
// the strategy IDs, their config schemas, `supportsScheme`, and config
// defaulting/classification. `evaluate()` (the actual recommendation logic)
// is Phase 4 scope (progression-engine.md §4, implementation-plan.md Phase
// 4) and is deliberately NOT implemented here.
export const STRATEGY_IDS = ["load-progression", "rep-progression", "manual"] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];
export const strategyIdSchema = z.enum(STRATEGY_IDS);

export const STRATEGY_DISPLAY_NAMES: Record<StrategyId, string> = {
  "load-progression": "Load progression",
  "rep-progression": "Rep progression",
  manual: "Manual",
};

const DEFAULT_PROGRESS_RIR_GATE = { min: 1, max: 10 };

// progression-engine.md §4.1
export const loadProgressionConfigSchema = z
  .object({
    incrementKg: z.number().positive().optional(),
    progressRirGate: rirBandSchema.default(DEFAULT_PROGRESS_RIR_GATE),
    holdAtRirZero: z.boolean().default(true),
    onMissingRir: z.enum(["reps_only", "hold"]).default("reps_only"),
    repShortfallTolerance: z.number().int().min(0).default(0),
    failureAction: z.enum(["hold", "decrease"]).default("hold"),
    decreaseAfterConsecutiveFailures: z.number().int().min(1).default(2),
    decreasePercent: z.number().min(0).max(100).default(10),
    skipDeloadSessions: z.boolean().default(true),
  })
  .strict();
export type LoadProgressionConfig = z.infer<typeof loadProgressionConfigSchema>;

// progression-engine.md §4.2
export const repProgressionConfigSchema = z
  .object({
    repIncrement: z.number().int().positive().default(1),
    repCap: z.number().int().positive().optional(),
    progressRirGate: rirBandSchema.default(DEFAULT_PROGRESS_RIR_GATE),
    onMissingRir: z.enum(["reps_only", "hold"]).default("reps_only"),
    onCapReached: z.enum(["hold", "suggest_load_increase"]).default("hold"),
    loadIncrementOnRollover: z.number().positive().optional(),
    resetRepsOnRollover: z
      .union([z.literal("schemeMin"), z.number().int().positive()])
      .default("schemeMin"),
    skipDeloadSessions: z.boolean().default(true),
  })
  .strict();
export type RepProgressionConfig = z.infer<typeof repProgressionConfigSchema>;

// progression-engine.md §4.3 — no evaluation, no config knobs.
export const manualConfigSchema = z.object({}).strict();
export type ManualConfig = z.infer<typeof manualConfigSchema>;

export const STRATEGY_CONFIG_SCHEMAS = {
  "load-progression": loadProgressionConfigSchema,
  "rep-progression": repProgressionConfigSchema,
  manual: manualConfigSchema,
} as const;

// prescription-model.md §2 compatibility table — every MVP strategy
// supports every MVP scheme type today (only the reserved, unimplemented
// `perSet` variant would ever return false). Kept as a real function, not a
// hardcoded `true`, so the prescription editor and Phase 4's engine share
// one source of truth as scheme variants are added later.
export function supportsScheme(_strategyId: StrategyId, schemeType: SchemeType): boolean {
  return schemeType === "fixed" || schemeType === "repRange";
}

export interface ExerciseLoadContext {
  loadStepKg: number;
}

// progression-engine.md §2 — `defaultConfig(prescription, exercise)`. Phase
// 2 doesn't have a PrescriptionSnapshot yet, but it does have the scheme
// (prescription-model.md §2/§6) and the exercise, which is enough to derive
// every scheme-dependent default the MVP strategies specify: incrementKg
// (progression-engine.md §4.1) and repCap = scheme.maxReps for repRange
// (§4.2 — `fixed` has no natural repCap default, it's a genuine user
// choice, so it's left unset there). Used to pre-fill the config form and
// to classify heuristic vs. user_defined below.
export function defaultConfigFor(
  strategyId: StrategyId,
  scheme: SetScheme,
  exercise: ExerciseLoadContext,
): Record<string, unknown> {
  switch (strategyId) {
    case "load-progression":
      return loadProgressionConfigSchema.parse({ incrementKg: exercise.loadStepKg });
    case "rep-progression":
      return repProgressionConfigSchema.parse(
        scheme.type === "repRange" ? { repCap: scheme.maxReps } : {},
      );
    case "manual":
      return manualConfigSchema.parse({});
  }
}

export type ProgressionClassification = "heuristic" | "user_defined";

export interface ResolvedProgression {
  strategyId: StrategyId;
  config: Record<string, unknown>;
  classification: ProgressionClassification;
}

// Config schemas fill defaults deterministically in declared-key order, so a
// plain JSON comparison of two schema.parse() outputs is a safe, dependency
// -free deep-equal here.
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// domain-model.md §4 — "Default classification for any shipped trigger
// rule: heuristic. When the user tunes config, it becomes user_defined."
//
// H1 fix: `rawConfig` alone can't be compared against the default, because
// exercise/scheme-derived fields (incrementKg, repRange's repCap) are
// `.optional()` with no `.default()` — Zod omits them entirely from a
// parse of `{}`, so they'd never match `defaultConfigFor()`'s materialised
// value. The effective config is therefore built by layering the user's
// parsed config over the materialised default *before* classifying, and
// that merged, materialised object — not the raw input — is what gets
// persisted, so incrementKg/repCap are always present on the stored
// prescription.
export function resolveProgression(
  strategyId: StrategyId,
  rawConfig: unknown,
  scheme: SetScheme,
  exercise: ExerciseLoadContext,
): ResolvedProgression {
  const schema = STRATEGY_CONFIG_SCHEMAS[strategyId];
  const parsedConfig = schema.parse(rawConfig ?? {}) as Record<string, unknown>;
  const defaultConfig = defaultConfigFor(strategyId, scheme, exercise);
  const config = schema.parse({ ...defaultConfig, ...parsedConfig }) as Record<string, unknown>;
  const classification: ProgressionClassification = jsonEqual(config, defaultConfig)
    ? "heuristic"
    : "user_defined";
  return { strategyId, config, classification };
}
