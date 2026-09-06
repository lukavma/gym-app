// `exercises.strength_estimate` — the per-exercise opt-out (revision §14.4,
// owner decision O-2; ADR-011).
//
// Kept in its own zero-import module for two reasons: it is the single source
// the DB CHECK constraint (`src/db/schema/exercises.ts`), the Zod update
// schema (`src/domain/exercises/schema.ts`) and the pure strength pipeline
// all read, and §14.5 forbids `src/domain/strength/**` from importing
// `src/domain/exercises/**`, so the vocabulary cannot live in the exercise
// schema without breaking that boundary.
//
// An enum rather than a boolean deliberately: it leaves room for the deferred
// values D-3 (bodyweight-inclusive estimation) and D-11 (PI-005's measurement
// profile) without a second migration (review O-2, accepted with
// modifications).
//
// `'auto'` means "eligible **if** the equipment category allows" — V-3: the
// switch can only ever disable, never enable.
export const STRENGTH_ESTIMATE_MODES = ["auto", "off"] as const;
export type StrengthEstimateMode = (typeof STRENGTH_ESTIMATE_MODES)[number];

export const DEFAULT_STRENGTH_ESTIMATE_MODE: StrengthEstimateMode = "auto";
