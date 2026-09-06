// Estimated 1RM tracker — the whole pure pipeline in one call.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §6 -> §7 -> §8 -> §15.1's Release A surface. The server layer's only jobs
// are the query, the account-timezone conversion, and serialising what comes
// back: every rule lives here, where a fixture can prove it (the volume
// precedent).
//
// Release A is READ-ONLY apart from the exercise opt-out. There is no
// aggregate table, no cache, no persisted estimate, and no strength-derived
// write path — §14.4 and I-1, asserted by the boundary test's grep for a
// column storing an e1RM, a suggestion or a confidence.

import { STRENGTH_ALGORITHM } from "./constants";
import { evaluateExerciseEligibility } from "./eligibility";
import { compareObservations, deriveEstimate, disabledEstimate } from "./estimate";
import { buildObservation } from "./observation";
import { computeWhatIf } from "./whatIf";
import type { StrengthObservation, StrengthReport, StrengthReportInput } from "./types";

// §9.5 step 4's cap basis: the heaviest ADMITTED group load among non-deload
// observations in the evidence window — the heaviest load the athlete has
// actually handled recently, on evidence this feature counts.
//
// Deload observations are excluded because they contribute to no basis
// anywhere (I-6, V-14), and excluded groups are skipped because I-13 forbids
// a sub-modal or implausible group from contributing to anything — so a
// `1100 kg` typo cannot raise the ceiling on what the calculator may answer.
// Null when the window holds no admitted group, which can only happen when
// there is no `currentE1RM` either.
function maxAdmittedLoadKg(observations: readonly StrengthObservation[]): number | null {
  let max: number | null = null;
  for (const observation of observations) {
    if (observation.isDeload) continue;
    for (const group of observation.groups) {
      if (group.status !== "admitted") continue;
      if (max === null || group.loadKg > max) max = group.loadKg;
    }
  }
  return max;
}

export function deriveStrengthReport({
  exercise,
  sessions,
  asOfLocalDate,
  whatIf,
}: StrengthReportInput): StrengthReport {
  // V-3 — the exercise gate runs first and refuses "everywhere" (A-30): the
  // estimate itself carries the code, so no surface has to re-derive the
  // rule. History is not even read for an ineligible exercise, which is also
  // what makes flipping `equipment` or the switch back restore the series
  // unchanged — nothing was ever written.
  const eligibility = evaluateExerciseEligibility(exercise);
  if (!eligibility.eligible) {
    const estimate = disabledEstimate(eligibility.reasonCode, asOfLocalDate);
    return {
      eligible: false,
      estimate,
      observations: [],
      sessionsWithoutEligibleSets: 0,
      whatIf: whatIf
        ? computeWhatIf({
            input: whatIf,
            estimate,
            loadStepKg: exercise.loadStepKg,
            windowMaxAdmittedLoadKg: null,
          })
        : null,
      algorithm: STRENGTH_ALGORITHM,
    };
  }

  const observations: StrengthObservation[] = [];
  let sessionsWithoutEligibleSets = 0;
  for (const session of sessions) {
    const { observation } = buildObservation(session);
    if (observation) observations.push(observation);
    else sessionsWithoutEligibleSets += 1;
  }

  const { estimate, windowObservations } = deriveEstimate({ observations, asOfLocalDate });

  return {
    eligible: true,
    estimate,
    // Newest first for the trend list; the underlying order is the full
    // `(performedOn, startedAt, sessionId)` tiebreak, so two sessions with an
    // identical date and instant still render deterministically (I-5, A-5).
    observations: [...windowObservations].sort((a, b) => compareObservations(b, a)),
    sessionsWithoutEligibleSets,
    whatIf: whatIf
      ? computeWhatIf({
          input: whatIf,
          estimate,
          loadStepKg: exercise.loadStepKg,
          windowMaxAdmittedLoadKg: maxAdmittedLoadKg(windowObservations),
        })
      : null,
    algorithm: STRENGTH_ALGORITHM,
  };
}
