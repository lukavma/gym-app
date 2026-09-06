// Estimated 1RM tracker — the confidence combinator.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §11. `confidence = min(caps)`, starting at `high`; every threshold is a
// stated multiple of `NOISE_SD_PCT`.
//
// Note the deliberate asymmetry §11 records: a single session is `low` for
// the ESTIMATE but would be `medium` for a suggestion. A single same-rep
// session is direct evidence for a LOAD, but one noisy observation of a 1RM,
// which is a formula output. The estimate's copy therefore has to say "based
// on one session" so the two words read as different claims.

import type { StrengthConfidence } from "./types";

const RANK: Record<StrengthConfidence, number> = { low: 0, medium: 1, high: 2 };

export function minConfidence(...values: readonly StrengthConfidence[]): StrengthConfidence {
  let current: StrengthConfidence = "high";
  for (const value of values) {
    if (RANK[value] < RANK[current]) current = value;
  }
  return current;
}
