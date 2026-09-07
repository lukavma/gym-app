// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §9.2
// (profile × scheme × strategy compatibility).
//
// May import only from `./profile` within this module's own tree — still
// zero imports outside `src/domain/measurement/**` (I-10). `schemeType` and
// `strategyId` are typed as plain `string` rather than `SchemeType` /
// the registry's strategy id union, so this module never needs to import
// `src/domain/schemes/setScheme` or `src/domain/progression/registry` — the
// caller (`registry.ts`'s `supportsScheme`) narrows the wider type down to
// this function's answer.
import type { MeasurementProfile } from "./profile";

// §9.2's four scheme columns.
const SUPPORTED_SCHEMES: Record<MeasurementProfile, readonly string[]> = {
  load_reps: ["fixed", "repRange"],
  reps: ["fixed", "repRange"],
  load_distance: ["distanceRounds"],
  distance_time: ["distanceRounds"],
  duration: ["durationRounds"],
  load_duration: ["durationRounds"],
};

export function profileSupportsScheme(profile: MeasurementProfile, schemeType: string): boolean {
  return SUPPORTED_SCHEMES[profile].includes(schemeType);
}

// §9.2 — "why rep-progression is `load_reps`-only": every strategy's output
// is persisted through `inputsSummarySchema`/`performedSetSchema`, strict
// and non-nullable on `weightKg` (I-6, unchanged in this release), so
// `load-progression` and `rep-progression` can only ever run on `load_reps`
// sets in v1; the `reps` profile is `manual`-only until a release is allowed
// to widen those schemas (N-13). `manual` supports every profile.
const LOAD_REPS_ONLY_STRATEGIES = new Set(["load-progression", "rep-progression"]);

export function strategySupportsProfile(strategyId: string, profile: MeasurementProfile): boolean {
  if (strategyId === "manual") return true;
  if (LOAD_REPS_ONLY_STRATEGIES.has(strategyId)) return profile === "load_reps";
  return false;
}
