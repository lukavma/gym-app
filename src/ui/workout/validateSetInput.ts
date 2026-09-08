// Athletic Measurement Profiles Release 2 —
// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.3's binding input matrix, generalising the pre-Release-2
// `validateSetInput` (previously inline in `ExerciseCard.tsx`, `load_reps`
// only) to every measurement profile via `dimensionsOf` — the single source
// of the required/optional/forbidden matrix (`src/domain/measurement/
// profile.ts` §6.2) — rather than restating it here.
//
// Lives under `src/ui/workout/`, not `src/domain/measurement/`, because it
// must reuse `decimalPlaceCount` (`src/ui/decimalInput.ts`) for the `m`/`s`
// guard (§15.3: "reuse src/ui/decimalInput.ts's existing guard"), and
// `eslint.config.mjs`'s boundaries rule forbids a `domain` module importing
// from `ui` (`domain` may import only `domain`; `ui` may import `domain` and
// `ui`).
//
// MEDIUM-3 (pre-Release-2) — every bound mirrors `setLogUpsertPayloadSchema`
// exactly (`src/domain/sync/schema.ts`), so an out-of-range value is caught
// here instead of dead-lettering silently after a round trip to the sync
// API. `weightKg` keeps its pre-Release-2 range-only rule with NO decimal
// guard added (O-15, accepted) — every other numeric bound below is new.
import { decimalPlaceCount } from "@/ui/decimalInput";
import {
  dimensionsOf,
  type FieldRequirement,
  type MeasurementProfile,
} from "@/domain/measurement/profile";

export const MAX_WEIGHT_KG = 9999.99;
export const MAX_REPS = 100;
export const MAX_RIR = 10;
// §12.2's `distanceM`/`durationS` column ceilings, verbatim.
export const MAX_DISTANCE_M = 99999.99;
export const MAX_DURATION_S = 86400;

export interface SetInputDraft {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  // The raw, as-typed draft for `distanceM`/`durationS` — BEFORE
  // `parseDecimalInput` — because `decimalPlaceCount` must read the actual
  // keystrokes, not the parsed float (decimalInput.ts's own note: binary
  // floating point can misrepresent a decimal literal, e.g.
  // `1.005 * 100 !== 100.5`). Optional: a caller that only cares about range
  // (not the decimal-place guard) may omit it, in which case this module
  // falls back to `String(value)` — imprecise for the guard's own edge
  // case, but only ever exercised by a caller that chose not to pass the
  // real draft.
  distanceMRaw?: string;
  durationSRaw?: string;
}

function validateNumericField(
  requirement: FieldRequirement,
  value: number | null,
  copy: { forbidden: string; missing: string },
  check: (value: number) => string | null,
): string | null {
  if (requirement === "forbidden") {
    return value !== null ? copy.forbidden : null;
  }
  if (value === null) {
    return requirement === "required" ? copy.missing : null;
  }
  return check(value);
}

// §15.3's binding matrix, plus the `m`/`s` decimal-place guard and the
// numeric bounds mirrored from the wire schema. Field order below matches
// §15.3's own row order (weight, reps, rir, distance, duration) — order of
// evaluation only; it has no bearing on which single message is returned,
// since at most one field is ever invalid in the callers this module has
// (each keystroke is sanitised on the way in).
export function validateSetInput(profile: MeasurementProfile, input: SetInputDraft): string | null {
  const dims = dimensionsOf(profile);

  const weightError = validateNumericField(
    dims.weight,
    input.weightKg,
    { forbidden: "Weight is not recorded for this exercise.", missing: "Weight is required." },
    (weightKg) => {
      if (!Number.isFinite(weightKg) || weightKg < 0) return "Weight must be 0 or more.";
      if (weightKg > MAX_WEIGHT_KG) return `Weight must be ${MAX_WEIGHT_KG} kg or less.`;
      return null;
    },
  );
  if (weightError) return weightError;

  const repsError = validateNumericField(
    dims.reps,
    input.reps,
    { forbidden: "Reps are not recorded for this exercise.", missing: "Reps are required." },
    (reps) => {
      if (!Number.isInteger(reps) || reps < 1) return "Reps must be a whole number of 1 or more.";
      if (reps > MAX_REPS) return `Reps must be ${MAX_REPS} or less.`;
      return null;
    },
  );
  if (repsError) return repsError;

  // RIR is never required by any profile (O-11 extends "optional" to
  // `reps`) — only the forbidden/optional-and-present branches apply.
  const rirError = validateNumericField(
    dims.rir,
    input.rir,
    { forbidden: "RIR is not recorded for this exercise.", missing: "" },
    (rir) => {
      if (!Number.isInteger(rir) || rir < 0) return "RIR must be a whole number of 0 or more.";
      if (rir > MAX_RIR) return `RIR must be ${MAX_RIR} or less.`;
      return null;
    },
  );
  if (rirError) return rirError;

  // Distance (m) — copy tone matches RecommendationCard.tsx:84.
  const distanceError = validateNumericField(
    dims.distance,
    input.distanceM,
    {
      forbidden: "Distance is not recorded for this exercise.",
      missing: "Enter a distance in metres.",
    },
    (distanceM) => {
      if (!Number.isFinite(distanceM) || distanceM <= 0) return "Enter a distance in metres.";
      if (distanceM > MAX_DISTANCE_M) return `Distance must be ${MAX_DISTANCE_M} m or less.`;
      if (decimalPlaceCount(input.distanceMRaw ?? String(distanceM)) > 2) {
        return "Distance can have at most 2 decimal places.";
      }
      return null;
    },
  );
  if (distanceError) return distanceError;

  // Time (s) — copy tone matches RecommendationCard.tsx:84. O-8's `m:ss`
  // display is purely presentational and plays no part in validation.
  const durationError = validateNumericField(
    dims.duration,
    input.durationS,
    { forbidden: "Time is not recorded for this exercise.", missing: "Enter a time in seconds." },
    (durationS) => {
      if (!Number.isFinite(durationS) || durationS <= 0) return "Enter a time in seconds.";
      if (durationS > MAX_DURATION_S) return `Time must be ${MAX_DURATION_S} s or less.`;
      if (decimalPlaceCount(input.durationSRaw ?? String(durationS)) > 2) {
        return "Time can have at most 2 decimal places.";
      }
      return null;
    },
  );
  if (durationError) return durationError;

  return null;
}
