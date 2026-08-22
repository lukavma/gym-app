import type {
  BlockGoal,
  DeloadConfig,
  WeekModifiers,
  WeekOverrideType,
} from "@/domain/blocks/schema";

export interface ScheduleEntryDto {
  id: string;
  templateId: string;
  position: number;
  weekdays: number[] | null;
}

export type BlockStatus = "planned" | "active" | "completed" | "abandoned";

export interface BlockDto {
  id: string;
  programId: string;
  name: string;
  sequence: number;
  goal: BlockGoal;
  startDate: string;
  weeksPlanned: number;
  status: BlockStatus;
  volumePresetId: string | null;
  deload: DeloadConfig | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  schedule: ScheduleEntryDto[];
  currentWeekIndex: number | null;
}

export interface WeekOverrideDto {
  id: string;
  blockId: string;
  weekIndex: number;
  type: WeekOverrideType;
  modifiers: WeekModifiers;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlockSummaryExerciseDto {
  exerciseId: string;
  exerciseName: string;
  beforeLoadKg: number;
  afterLoadKg: number;
}

export interface BlockSummaryDto {
  sessionsCompleted: number;
  hadDeloadSession: boolean;
  exercises: BlockSummaryExerciseDto[];
}
