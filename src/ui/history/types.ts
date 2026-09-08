import type { PrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";

// Mirrors src/server/history/service.ts's response shapes by contract —
// same convention as src/ui/templates/types.ts and src/sync/types.ts.
export interface HistorySetDetail {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  // Release 2 (athletic-measurement-profiles-architecture-evaluation.md
  // §21.2, §11.3 site #5) — widened to number|null and to carry
  // distanceM/durationS, mirroring the server's own HistorySetDetail
  // (src/server/history/service.ts): a null is never coerced to 0
  // (I-13/H-12).
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
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
  // §12.1 — the slot's frozen shape, from the typed `session_exercises`
  // columns (§8.2); always present (not optional, unlike the today-bundle's
  // `measurement` on TodayBundleExerciseEntryDto — H-10 is about tolerating
  // a stale CACHED bundle, which this live, non-cached endpoint has no
  // equivalent of, mirroring src/server/history/service.ts's own comment).
  measurement: { profile: MeasurementProfile; loadBasis: LoadBasis | null };
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
