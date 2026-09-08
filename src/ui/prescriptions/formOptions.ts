// Athletic Measurement Profiles Release 2 — A-11b
// (docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.2, §21.2): "the scheme and strategy selects offer only compatible
// options". Both derivations below reuse the exact tables the server-side
// gate (`checkPrescriptionCompatibility` / `src/domain/prescriptions/schema.ts`)
// already checks — `profileSupportsScheme` and `strategySupportsProfile`
// from `src/domain/measurement/compatibility` — rather than re-deriving a
// second, UI-side compatibility table that could drift out of sync with the
// server's.
//
// Zero React import on purpose: this is plain derivation logic, testable
// directly (tests/unit/prescriptions/formOptions.test.ts) without mounting
// `PrescriptionForm` (a "use client" component with its own `fetch`/
// `useRouter` wiring that a Node-environment unit test can't drive).
import { profileSupportsScheme, strategySupportsProfile } from "@/domain/measurement/compatibility";
import type { MeasurementProfile } from "@/domain/measurement/profile";
import { SCHEME_TYPES, type SchemeType } from "@/domain/schemes/setScheme";
import { STRATEGY_IDS, type StrategyId } from "@/domain/progression/registry";

// The scheme-select options for a given exercise's profile — e.g. `reps`
// offers only `fixed`/`repRange`; `load_distance` offers only
// `distanceRounds`. Always non-empty: every profile supports at least one
// scheme type (§9.2).
export function schemeTypesForProfile(profile: MeasurementProfile): SchemeType[] {
  return SCHEME_TYPES.filter((type) => profileSupportsScheme(profile, type));
}

// The strategy-select options for a given exercise's profile. For `reps`
// this reduces to `["manual"]` (O-11) as a consequence of
// `strategySupportsProfile`'s existing load_reps-only rule for
// load-progression/rep-progression — not a `reps`-specific branch here.
export function strategyIdsForProfile(profile: MeasurementProfile): StrategyId[] {
  return STRATEGY_IDS.filter((id) => strategySupportsProfile(id, profile));
}
