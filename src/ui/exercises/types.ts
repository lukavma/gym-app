import type { MuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import type {
  ContributionRole,
  Equipment,
  Laterality,
  LoadBasis,
  Mechanics,
  MeasurementProfile,
  StrengthEstimateMode,
  VolumeCounting,
} from "@/domain/exercises/schema";

export interface ExerciseContributionDto {
  muscleGroupId: MuscleGroupSlug;
  role: ContributionRole;
  weight: number;
}

export interface ExerciseDto {
  id: string;
  name: string;
  equipment: Equipment;
  movementPattern: string | null;
  mechanics: Mechanics;
  laterality: Laterality;
  loadStepKg: number;
  strengthEstimate: StrengthEstimateMode;
  // athletic-measurement-profiles-architecture-evaluation.md §12.1.
  measurementProfile: MeasurementProfile;
  loadBasis: LoadBasis | null;
  volumeCounting: VolumeCounting;
  isSeeded: boolean;
  notes: string | null;
  archivedAt: string | null;
  contributions: ExerciseContributionDto[];
}
