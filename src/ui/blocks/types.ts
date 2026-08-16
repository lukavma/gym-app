import type { BlockGoal, DeloadConfig } from "@/domain/blocks/schema";

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
