import { z } from "zod";
import { rirBandSchema } from "../schemes/rirBand";
import {
  setSchemeAuthoringEnvelopeSchema,
  projectGroup,
  type SetScheme,
} from "../schemes/setScheme";
import { strategyIdSchema, type StrategyId } from "../progression/registry";
import { profileSupportsScheme, strategySupportsProfile } from "../measurement/compatibility";
import { dimensionsOf, type MeasurementProfile } from "../measurement/profile";

// prescription-model.md §6 — 0 <= x <= 1000, multiple of 0.25. (The
// `numeric(6,2)` column could hold up to 9999.99; this is a narrower,
// doc-specified application ceiling, same pattern as exercises'
// MAX_LOAD_STEP_KG vs. its column ceiling.)
export const MAX_BASELINE_LOAD_KG = 1000;

// LOW-2 (phase-5.5-light-remediation-verification.md) — the previous
// `Math.round(v * 100) % 25 === 0` refine had a real floating-point hole:
// raw `v * 100` arithmetic on e.g. 1.005 can itself already be imprecise
// (IEEE 754), so values within ~0.005 of the grid (1.005, 82.501, 0.249,
// 1.001) passed and were then silently rounded by the numeric(6,2) column.
// `.multipleOf(0.25)` uses zod's string-decimal-based comparison instead of
// raw float arithmetic (the same mechanism already proven float-safe for
// loadStepKg's `.multipleOf(0.01)`), so it rejects all four correctly.
const baselineLoadKgSchema = z.number().min(0).max(MAX_BASELINE_LOAD_KG).multipleOf(0.25);

// set-groups-architecture-evaluation.md §5.3 — "optional per-group override
// `progression.groups?: Record<key, {strategyId, config}>`". Applies only to
// a `groups` scheme; `checkPrescriptionCompatibility` below rejects it
// otherwise so an override can never silently apply to nothing.
const groupProgressionOverrideSchema = z.object({
  strategyId: strategyIdSchema,
  config: z.record(z.string(), z.unknown()).optional(),
});

const progressionInputSchema = z.object({
  strategyId: strategyIdSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  groups: z.record(z.string(), groupProgressionOverrideSchema).optional(),
  // M-3 (independent review) — a per-group override for a group that has NO
  // real key yet at request-construction time (a brand-new group being
  // created, or added to an existing prescription, in this same save — §4.2
  // means the server assigns that key only during THIS request). Keyed by
  // the group's own POSITIONAL INDEX within the submitted `scheme.groups`
  // array (as a string), request-local and unambiguous only within this one
  // request; the service layer resolves each index to that position's
  // server-assigned key, merges it into the by-key `groups` map above, and
  // never persists this shape. A group that already has a real key is always
  // addressed via `groups` (by key), never here, even if it also appears at
  // some index — key-addressing survives a reorder, index-addressing exists
  // only to bridge the "no key yet" gap.
  groupOverridesByIndex: z.record(z.string(), groupProgressionOverrideSchema).optional(),
});
export type ProgressionInput = z.infer<typeof progressionInputSchema>;

const prescriptionFieldsSchema = {
  exerciseId: z.string().uuid(),
  scheme: setSchemeAuthoringEnvelopeSchema,
  targetRir: rirBandSchema.optional(),
  baselineLoadKg: baselineLoadKgSchema.optional(),
  restSeconds: z.number().int().positive().optional(),
  progression: progressionInputSchema,
  notes: z.string().trim().max(2000).optional(),
};

// domain-model.md §4 — ExercisePrescription. `position` is service-managed.
export const createPrescriptionSchema = z.object(prescriptionFieldsSchema);
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = z
  .object({
    exerciseId: prescriptionFieldsSchema.exerciseId.optional(),
    scheme: prescriptionFieldsSchema.scheme.optional(),
    targetRir: prescriptionFieldsSchema.targetRir.nullable().optional(),
    baselineLoadKg: prescriptionFieldsSchema.baselineLoadKg.nullable().optional(),
    restSeconds: prescriptionFieldsSchema.restSeconds.nullable().optional(),
    progression: prescriptionFieldsSchema.progression.optional(),
    notes: prescriptionFieldsSchema.notes.nullable().optional(),
  })
  .strict();
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;

export const reorderPrescriptionsSchema = z.object({
  prescriptionIds: z.array(z.string().uuid()).min(1),
});
export type ReorderPrescriptionsInput = z.infer<typeof reorderPrescriptionsSchema>;

// Presence-only: a field is flagged when the *effective* value carries an
// actual value and the profile forbids the field — never based on the value
// itself. `undefined` ("not part of this effective combination") and
// `null` ("explicitly unset") both mean "nothing to reject"; only a real
// value on a forbidden field is an issue.
export interface PrescriptionCompatibilityFields {
  targetRir?: unknown;
  baselineLoadKg?: unknown;
}

// domain-model.md §4 invariant: "progression.strategyId must exist in the
// code registry; strategy must support the scheme type." Plus
// prescription-model.md §2's compatibility table footnote: rep-progression
// requires an explicit `repCap` in config for `fixed` schemes (repRange
// schemes infer it from `maxReps` — progression-engine.md §4.2). Plus
// measurement-profiles-architecture-evaluation.md §9.2 (profile × scheme ×
// strategy — both issue kinds) and §9.3 (targetRir/baselineLoadKg allowed
// only where the profile has an rir/weight field — reusing `dimensionsOf`
// rather than re-deriving that table here, so the two can't drift).
//
// This runs in the service layer (not a Zod .superRefine) because on
// PATCH, `scheme`, `progression`, `targetRir` and `baselineLoadKg` can each
// be omitted independently — the service merges the patch onto the
// existing row and validates the *effective* combination, which only it can
// assemble.
export interface PrescriptionCompatibilityProgression {
  strategyId: StrategyId;
  config: Record<string, unknown>;
  // set-groups-architecture-evaluation.md §5.3 — the fully RESOLVED
  // per-group progression (registry.ts's `resolvePrescriptionProgression`),
  // keyed by group key; each entry already carries its own defaulted config.
  groups?: Record<string, { strategyId: StrategyId; config: Record<string, unknown> }>;
}

export function checkPrescriptionCompatibility(
  scheme: SetScheme,
  progression: PrescriptionCompatibilityProgression,
  profile: MeasurementProfile,
  fields: PrescriptionCompatibilityFields = {},
): string[] {
  const issues: string[] = [];
  if (!profileSupportsScheme(profile, scheme.type)) {
    issues.push(`${profile} does not support ${scheme.type} schemes`);
  }
  if (!strategySupportsProfile(progression.strategyId, profile)) {
    issues.push(`${progression.strategyId} does not support ${profile}`);
  }
  if (progression.strategyId === "rep-progression" && scheme.type === "fixed") {
    if (typeof progression.config.repCap !== "number") {
      issues.push("repCap is required in rep-progression config for fixed schemes");
    }
  }

  if (scheme.type === "groups") {
    // §5.3 L-3 — "on a `groups` scheme, `repCap` is forbidden at slot level
    // and allowed only in `progression.groups[key].config` — a slot-level
    // cap cannot be right for two groups with different `reps.max`."
    if (progression.strategyId === "rep-progression" && "repCap" in progression.config) {
      issues.push(
        "repCap is not allowed in slot-level config for groups schemes; set it per group",
      );
    }
    const groupKeys = new Set(scheme.groups.map((g) => g.key));
    for (const overrideKey of Object.keys(progression.groups ?? {})) {
      if (!groupKeys.has(overrideKey)) {
        issues.push(`progression.groups references unknown group key "${overrideKey}"`);
      }
    }
    for (const group of scheme.groups) {
      const resolved = progression.groups?.[group.key];
      const effectiveStrategyId = resolved?.strategyId ?? progression.strategyId;
      const effectiveConfig = resolved?.config ?? progression.config;
      if (!strategySupportsProfile(effectiveStrategyId, profile)) {
        issues.push(`${effectiveStrategyId} does not support ${profile} (group "${group.label}")`);
      }
      // The existing "fixed scheme requires an explicit repCap" rule,
      // applied to the projected group (F-23 — neither existing check would
      // fire on its own for a `groups` scheme).
      if (effectiveStrategyId === "rep-progression" && projectGroup(group).type === "fixed") {
        if (typeof effectiveConfig.repCap !== "number") {
          issues.push(
            `repCap is required for rep-progression on a fixed-rep group ("${group.label}")`,
          );
        }
      }
      // set-groups-architecture-evaluation.md §6.3 rule L-1 — a percent-linked
      // group's load authority is the link itself; it must never also carry a
      // competing load-progressing strategy. The editor never offers one
      // (PrescriptionForm.tsx forces "manual" for a linked group); this is the
      // write-time enforcement point.
      if (group.link && effectiveStrategyId !== "manual") {
        issues.push(
          `a percent-linked group cannot use load-progression or rep-progression ("${group.label}")`,
        );
      }
    }
  } else if (progression.groups !== undefined && Object.keys(progression.groups).length > 0) {
    issues.push("progression.groups is only valid for groups schemes");
  }

  const dims = dimensionsOf(profile);
  if (fields.targetRir !== undefined && fields.targetRir !== null && dims.rir === "forbidden") {
    issues.push(`targetRir is not supported for ${profile}`);
  }
  if (
    fields.baselineLoadKg !== undefined &&
    fields.baselineLoadKg !== null &&
    dims.weight === "forbidden"
  ) {
    issues.push(`baselineLoadKg is not supported for ${profile}`);
  }
  return issues;
}
