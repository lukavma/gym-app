import type { SetSchemeEnvelope } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";
import type { ResolvedProgression, StrategyId } from "@/domain/progression/registry";

export interface PrescriptionDto {
  id: string;
  templateId: string;
  exerciseId: string;
  position: number;
  scheme: SetSchemeEnvelope;
  targetRir: RirBand | null;
  baselineLoadKg: number | null;
  restSeconds: number | null;
  progression: ResolvedProgression;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type { StrategyId };
