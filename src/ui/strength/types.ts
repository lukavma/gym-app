// Mirrors `src/server/strength/service.ts`'s response shapes by contract —
// same convention as `src/ui/history/types.ts`, `src/ui/volume/types.ts` and
// `src/sync/types.ts`. The UI layer may not import `@/server/**`, and the
// branded unions are widened to `string` here because they arrive through
// JSON.

export type StrengthConfidenceDto = "high" | "medium" | "low";

export interface StrengthAlgorithmDto {
  id: string;
  version: number;
  formula: string;
}

export interface StrengthGroupPositionDto {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  rtf: number;
  e1rmKg: number;
}

export interface StrengthLoadGroupDto {
  loadKg: number;
  setCount: number;
  modalReps: number;
  medianRir: number | null;
  rirComplete: boolean;
  e1rmKg: number;
  status: string;
  isModal: boolean;
  isGoverning: boolean;
  positions: StrengthGroupPositionDto[];
  flags: string[];
}

export interface StrengthObservationDto {
  sessionId: string;
  performedOn: string;
  startedAt: string;
  isDeload: boolean;
  groups: StrengthLoadGroupDto[];
  governingGroupLoadKg: number;
  governingGroupReps: number;
  governingGroupMedianRir: number | null;
  e1rmKg: number;
  flags: string[];
  excludedSetCounts: {
    warmup: number;
    zeroLoad: number;
    highRir: number;
    highRep: number;
    subModal: number;
    implausible: number;
  };
  reasonCodes: string[];
}

export interface StrengthBestDto {
  e1rmKg: number;
  performedOn: string;
  sessionId: string;
  unconfirmed: boolean;
}

export interface StrengthEstimateDto {
  currentE1rmKg: number | null;
  best: StrengthBestDto | null;
  confidence: StrengthConfidenceDto;
  reasonCodes: string[];
  poolSessionIds: string[];
  poolSpreadPct: number | null;
  latestPoolAgeDays: number | null;
  staleObservationCount: number;
  deloadObservationCount: number;
  algorithm: StrengthAlgorithmDto;
  asOfLocalDate: string;
}

export interface StrengthWhatIfDto {
  status: "ok" | "none";
  targetReps: number;
  targetRir: number;
  targetRtf: number;
  loadKg: number | null;
  rawLoadKg: number | null;
  bandKg: [number, number] | null;
  reasonCodes: string[];
}

export interface StrengthExerciseSummaryDto {
  id: string;
  name: string;
  equipment: string;
  laterality: string;
  loadStepKg: number;
  strengthEstimate: string;
  archivedAt: string | null;
}

export interface ExerciseStrengthReportDto {
  eligible: boolean;
  estimate: StrengthEstimateDto;
  observations: StrengthObservationDto[];
  sessionsWithoutEligibleSets: number;
  whatIf: StrengthWhatIfDto | null;
  algorithm: StrengthAlgorithmDto;
  exercise: StrengthExerciseSummaryDto;
  asOf: string;
  asOfLocalDate: string;
  timezone: string;
}

export interface ExerciseStrengthResponse {
  strength: ExerciseStrengthReportDto;
}
