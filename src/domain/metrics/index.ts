// Metrics dashboard v1 — the pure module's public surface. The server layer
// calls each section's pure function directly and hands the results here to
// be stitched into the one binding DTO shape (§11.1) — no computation lives
// in this file beyond that assembly.

import type { WeekVolumeReport } from "@/domain/volume/aggregate";
import type { StrengthAlgorithmStamp } from "@/domain/strength/types";
import type {
  BodyweightSummaryDto,
  EstimateIndexRowDto,
  MetricsDashboardDto,
  RecoverySummaryDto,
  TrainingWeekDto,
} from "./types";

export * from "./types";
export { aggregateTrainingWeeks } from "./training";
export type { TrainingSessionRow, TrainingSetRow } from "./training";
export { summarizeBodyweight } from "./bodyweight";
export type { BodyweightEntryRow } from "./bodyweight";
export { summarizeRecovery } from "./recovery";
export type { RecoveryEntryRow } from "./recovery";
export { projectEstimateIndex } from "./estimateIndex";
export type { SelectionRowInput } from "./estimateIndex";
export { SELECTION_MAX, isSelectionEligible, putSelectionInputSchema } from "./selection";
export type { PutSelectionInput } from "./selection";

export interface AssembleMetricsDashboardInput {
  generatedAt: string;
  asOf: string;
  asOfLocalDate: string;
  timezone: string;
  weekStartsOn: number;
  training: TrainingWeekDto[];
  // Sourced by the caller from `@/domain/strength/constants` — a value
  // import this module's own boundary (I-12) does not extend to, so the
  // stamp arrives as plain data instead.
  strengthAlgorithm: StrengthAlgorithmStamp;
  strengthSelection: EstimateIndexRowDto[];
  volumeWeeks: WeekVolumeReport[];
  bodyweight: BodyweightSummaryDto;
  recovery: RecoverySummaryDto;
}

export function assembleMetricsDashboard(
  input: AssembleMetricsDashboardInput,
): MetricsDashboardDto {
  return {
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    asOfLocalDate: input.asOfLocalDate,
    timezone: input.timezone,
    weekStartsOn: input.weekStartsOn,
    training: { weeks: input.training },
    strength: {
      windowDays: 90,
      algorithm: input.strengthAlgorithm,
      selection: input.strengthSelection,
    },
    volume: { weeks: input.volumeWeeks },
    bodyweight: input.bodyweight,
    recovery: input.recovery,
  };
}
