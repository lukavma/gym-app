import { z } from "zod";
import { rirBandSchema } from "../schemes/rirBand";
import { projectGroup, type SchemeType, type SetGroup, type SetScheme } from "../schemes/setScheme";
import { profileSupportsScheme, strategySupportsProfile } from "../measurement/compatibility";
import type { MeasurementProfile } from "../measurement/profile";

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

// measurement-profiles-architecture-evaluation.md §9.2 — the compatibility
// table is now two-dimensional: a scheme type is only ever offered for
// profiles it structurally fits (`profileSupportsScheme`, the table's rows),
// and a strategy only ever runs on profiles it's registered against
// (`strategySupportsProfile`, the table's columns — v1: load-progression and
// rep-progression are `load_reps`-only, N-13). Both live in
// `domain/measurement/compatibility.ts`, the single source §9.2 names; this
// function composes them rather than re-deriving the table, so the
// prescription editor and the engine share one source of truth as scheme
// variants and strategies are added later.
export function supportsScheme(
  profile: MeasurementProfile,
  strategyId: StrategyId,
  schemeType: SchemeType,
): boolean {
  return profileSupportsScheme(profile, schemeType) && strategySupportsProfile(strategyId, profile);
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
// set-groups-architecture-evaluation.md §5.3/L-3 — F-23 closed: the
// rep-progression branch is now an exhaustive switch over every scheme type
// (not `scheme.type === "repRange" ? : {}`), so a sixth variant fails to
// compile here instead of silently defaulting to `{}`. A `groups` scheme has
// no single repCap default — rep-progression `repCap` is FORBIDDEN at slot
// level for `groups` (prescriptions/schema.ts's `checkPrescriptionCompatibility`)
// and resolved per group instead, by `resolveGroupProgression` below against
// each group's own *projected* scheme.
export function defaultConfigFor(
  strategyId: StrategyId,
  scheme: SetScheme,
  exercise: ExerciseLoadContext,
): Record<string, unknown> {
  switch (strategyId) {
    case "load-progression":
      return loadProgressionConfigSchema.parse({ incrementKg: exercise.loadStepKg });
    case "rep-progression": {
      let repCap: number | undefined;
      switch (scheme.type) {
        case "repRange":
          repCap = scheme.maxReps;
          break;
        case "fixed":
        case "distanceRounds":
        case "durationRounds":
        case "groups":
          repCap = undefined;
          break;
      }
      return repProgressionConfigSchema.parse(repCap !== undefined ? { repCap } : {});
    }
    case "manual":
      return manualConfigSchema.parse({});
  }
}

// set-groups-architecture-evaluation.md §5.3 — "For every group:
// resolveProgression(strategyId, rawSlotConfig ⊕ rawGroupOverride,
// projectGroup(g), exercise) — defaults are re-derived per group from the
// projected scheme (so a ranged group's repCap defaults to its own
// reps.max), and classification is computed per group." The override merges
// SHALLOWLY over the slot's raw config before either reaches its schema, so
// a group that overrides only e.g. `repCap` still inherits the slot's other
// tuned fields (`progressRirGate`, etc.) rather than losing them.
export function resolveGroupProgression(
  strategyId: StrategyId,
  rawSlotConfig: unknown,
  rawGroupOverride: Record<string, unknown> | undefined,
  group: SetGroup,
  exercise: ExerciseLoadContext,
): ResolvedProgression {
  const merged =
    rawGroupOverride === undefined
      ? rawSlotConfig
      : {
          ...(typeof rawSlotConfig === "object" && rawSlotConfig ? rawSlotConfig : {}),
          ...rawGroupOverride,
        };
  return resolveProgression(strategyId, merged, projectGroup(group), exercise);
}

export interface RawProgressionInput {
  strategyId: StrategyId;
  config?: unknown;
  groups?: Record<string, { strategyId: StrategyId; config?: unknown }>;
}

// Orchestrates the slot-level resolution (unchanged) plus, for a `groups`
// scheme, one `resolveGroupProgression` call per group — the single entry
// point `server/prescriptions/service.ts` uses so the persisted
// `exercise_prescriptions.progression` JSONB and the frozen snapshot mirror
// (`prescriptionSnapshot.ts`) are always built the same way.
export function resolvePrescriptionProgression(
  input: RawProgressionInput,
  scheme: SetScheme,
  exercise: ExerciseLoadContext,
): ResolvedProgression {
  const slot = resolveProgression(input.strategyId, input.config, scheme, exercise);
  if (scheme.type !== "groups") return slot;
  const groups: Record<string, ResolvedProgression> = {};
  for (const group of scheme.groups) {
    const override = input.groups?.[group.key];
    groups[group.key] = resolveGroupProgression(
      override?.strategyId ?? input.strategyId,
      input.config,
      override?.config as Record<string, unknown> | undefined,
      group,
      exercise,
    );
  }
  return { ...slot, groups };
}

export type ProgressionClassification = "heuristic" | "user_defined";

export interface ResolvedProgression {
  strategyId: StrategyId;
  config: Record<string, unknown>;
  classification: ProgressionClassification;
  // set-groups-architecture-evaluation.md §5.3/manifest item 5 — additive
  // optional, present only for a `groups` scheme: the per-group resolved
  // progression, keyed by group key, each independently defaulted against
  // that group's own *projected* scheme (a ranged group's `repCap` default
  // comes from its own `reps.max`, never the slot's).
  groups?: Record<string, ResolvedProgression>;
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
