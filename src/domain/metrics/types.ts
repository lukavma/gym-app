// Metrics dashboard v1 — the pure module's data contract.
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §11.1 (the DTO), §11.5 (the selection contract). Nothing here is
// persisted beyond the ordered selection itself (§11.5): every metric is
// recomputed on read (I-1, I-2).

import type { WeekVolumeReport } from "@/domain/volume/aggregate";
import type { StrengthAlgorithmStamp, StrengthConfidence } from "@/domain/strength/types";

export interface TrainingWeekDto {
  startDate: string;
  endDateExclusive: string;
  sessionsCompleted: number;
  workSets: number;
  isDeload: boolean;
}

// M-4 — one row per selected exercise, in the stored `position` order.
export type EstimateIndexRowState =
  "estimate" | "no_current_estimate" | "not_available" | "turned_off";

export interface EstimateIndexRowDto {
  exerciseId: string;
  name: string;
  equipment: string;
  archived: boolean;
  position: number;
  loadStepKg: number;
  state: EstimateIndexRowState;
  currentE1rmKg: number | null;
  confidence: StrengthConfidence | null;
  latestPoolAgeDays: number | null;
}

export interface BodyweightLatestDto {
  date: string;
  weightKg: number;
}

export interface BodyweightAverageDto {
  kg: number;
  entryCount: number;
}

export interface BodyweightChangeDto {
  kg: number;
  currentEntryCount: number;
  priorEntryCount: number;
}

export interface BodyweightSeriesPointDto {
  date: string;
  weightKg: number;
}

export interface BodyweightSummaryDto {
  latest: BodyweightLatestDto | null;
  sevenDayAverage: BodyweightAverageDto | null;
  sevenDayEntryCount: number;
  thirtyDayChange: BodyweightChangeDto | null;
  series: BodyweightSeriesPointDto[];
}

export interface RecoveryDayEntryDto {
  sleepHours: number | null;
  sleepQuality: number | null;
  readiness: number | null;
  soreness: number | null;
}

export interface RecoveryDayDto {
  date: string;
  entry: RecoveryDayEntryDto | null;
}

export interface RecoveryMeanSleepDto {
  hours: number;
  count: number;
}

export interface RecoverySummaryDto {
  days: RecoveryDayDto[];
  daysLogged: number;
  meanSleepHours: RecoveryMeanSleepDto | null;
}

export interface MetricsDashboardDto {
  generatedAt: string;
  asOf: string;
  asOfLocalDate: string;
  timezone: string;
  weekStartsOn: number;
  training: { weeks: TrainingWeekDto[] };
  strength: {
    windowDays: 90;
    algorithm: StrengthAlgorithmStamp;
    selection: EstimateIndexRowDto[];
  };
  volume: { weeks: WeekVolumeReport[] };
  bodyweight: BodyweightSummaryDto;
  recovery: RecoverySummaryDto;
}

// --- The selection contract (§11.5) -----------------------------------------

export interface SelectionRowDto {
  exerciseId: string;
  name: string;
  archived: boolean;
  position: number;
  state: EstimateIndexRowState;
}

export interface CandidateDto {
  exerciseId: string;
  name: string;
  equipment: string;
}

export interface MetricsSelectionResponseDto {
  selection: SelectionRowDto[];
  candidates: CandidateDto[];
}
