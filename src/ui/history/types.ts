import type { PrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";

// Mirrors src/server/history/service.ts's response shapes by contract —
// same convention as src/ui/templates/types.ts and src/sync/types.ts.
export interface HistorySetDetail {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  weightKg: number;
  reps: number;
  rir: number | null;
  loggedAt: string;
  notes: string | null;
}

export interface HistoryExerciseDetail {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  source: "template" | "adhoc";
  prescription: PrescriptionSnapshot | null;
  skipped: boolean;
  notes: string | null;
  sets: HistorySetDetail[];
}

export interface HistorySessionDetail {
  id: string;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  status: "completed";
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  exercises: HistoryExerciseDetail[];
}

export interface HistorySessionListItem {
  id: string;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  startedAt: string;
  completedAt: string | null;
  exerciseCount: number;
  setCount: number;
  notes: string | null;
}
