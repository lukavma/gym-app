export interface MuscleVolumeDto {
  effective: number;
  raw: number;
}

export interface RollupVolumeDto extends MuscleVolumeDto {
  unclassified: number;
}

export interface WeekVolumeReportDto {
  startDate: string;
  endDateExclusive: string;
  isDeload: boolean;
  leaves: Record<string, MuscleVolumeDto>;
  rollups: Record<string, RollupVolumeDto>;
}

export interface VolumeLandmarkDto {
  id: string;
  muscleGroupId: string;
  key: string;
  valueMin: number | null;
  valueMax: number | null;
  openEnded: boolean;
  note: string | null;
}

export interface VolumePresetDto {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  classification: string;
  sourceRef: string | null;
  evidenceRefs: string[] | null;
  isBuiltin: boolean;
  landmarks: VolumeLandmarkDto[];
}

export interface WeeklyVolumeReportResponse {
  weeks: WeekVolumeReportDto[];
  activePreset: VolumePresetDto | null;
}
