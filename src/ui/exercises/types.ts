import type { MuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import type {
  ContributionRole,
  Equipment,
  Laterality,
  Mechanics,
  StrengthEstimateMode,
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
  isSeeded: boolean;
  notes: string | null;
  archivedAt: string | null;
  contributions: ExerciseContributionDto[];
}
