// Metrics dashboard v1 — the Current estimates card (M-4).
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §4 (M-4), §9, §11.1, §11.2 step 9, I-3, I-9, I-13. `deriveStrengthReport`
// is reused byte-identically over a window-bounded, selection-bounded fact
// set — the selection decides only which reports are computed and in which
// order they render (I-13); the estimate itself never depends on selection.
//
// Only `eligible`, the eligibility refusal code, `estimate.currentE1rmKg`,
// `estimate.confidence`, `estimate.latestPoolAgeDays`, `loadStepKg` and
// `archivedAt` are projected — `best`, `staleObservationCount` and every
// other reason code stay off the index (§11.2's "why the index projects
// `current` only").

import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";
import { deriveStrengthReport } from "@/domain/strength/report";
import type { StrengthEstimateMode, StrengthSessionInput } from "@/domain/strength/types";
import type { EstimateIndexRowDto, EstimateIndexRowState } from "./types";

export interface SelectionRowInput {
  exerciseId: string;
  name: string;
  equipment: string;
  archived: boolean;
  position: number;
  loadStepKg: number;
  strengthEstimate: StrengthEstimateMode;
  // §11.2/§11.6 (O-17) — `deriveStrengthReport`'s eligibility gate now checks
  // these two ahead of equipment/switch; without them here every selected
  // exercise would silently read as `measurementProfile: undefined`, failing
  // the gate's first check and turning every row `not_available`.
  measurementProfile: MeasurementProfile;
  loadBasis: LoadBasis | null;
}

function stateFor(
  eligible: boolean,
  refusalCode: string | undefined,
  currentE1rmKg: number | null,
): EstimateIndexRowState {
  if (!eligible) {
    return refusalCode === "EXERCISE_ESTIMATE_DISABLED" ? "turned_off" : "not_available";
  }
  return currentE1rmKg !== null ? "estimate" : "no_current_estimate";
}

export function projectEstimateIndex(
  selection: readonly SelectionRowInput[],
  sessionsByExerciseId: ReadonlyMap<string, readonly StrengthSessionInput[]>,
  asOfLocalDate: string,
): EstimateIndexRowDto[] {
  return [...selection]
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const report = deriveStrengthReport({
        exercise: {
          equipment: row.equipment,
          strengthEstimate: row.strengthEstimate,
          loadStepKg: row.loadStepKg,
          measurementProfile: row.measurementProfile,
          loadBasis: row.loadBasis,
        },
        sessions: sessionsByExerciseId.get(row.exerciseId) ?? [],
        asOfLocalDate,
      });

      const state = stateFor(
        report.eligible,
        report.estimate.reasonCodes[0],
        report.estimate.currentE1rmKg,
      );
      const isEstimate = state === "estimate";

      return {
        exerciseId: row.exerciseId,
        name: row.name,
        equipment: row.equipment,
        archived: row.archived,
        position: row.position,
        loadStepKg: row.loadStepKg,
        state,
        currentE1rmKg: report.estimate.currentE1rmKg,
        confidence: isEstimate ? report.estimate.confidence : null,
        latestPoolAgeDays: isEstimate ? report.estimate.latestPoolAgeDays : null,
      };
    });
}
