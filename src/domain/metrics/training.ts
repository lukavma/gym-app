// Metrics dashboard v1 — the Training card (M-1, M-2, M-3).
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §4 (M-1/M-2/M-3), §11.2 steps 2-3. Only `user_id`, `status = 'completed'`
// and the time bounds are decided in SQL; warm-up exclusion (M-2) and the
// future guard (M-1's "deliberate divergence from Volume") are pure-domain
// decisions, provable by fixture — the same discipline `aggregateVolume`
// established for the Work Set definition.

import type { InstantWeekWindow } from "@/domain/volume/aggregate";
import type { TrainingWeekDto } from "./types";

export interface TrainingSessionRow {
  sessionId: string;
  // ISO instant (`toISOString()`), matching the volume/strength convention.
  startedAt: string;
  isDeload: boolean;
}

// Delivered unfiltered — the domain drops `isWarmup = true` and counts (the
// `aggregateVolume` precedent: the query never filters or counts warm-ups).
export interface TrainingSetRow {
  sessionId: string;
  isWarmup: boolean;
}

export function aggregateTrainingWeeks(
  sessions: readonly TrainingSessionRow[],
  setRows: readonly TrainingSetRow[],
  windows: readonly InstantWeekWindow[],
  // I-6 — the tracker's own future guard, applied here rather than trusted
  // solely to the caller's SQL bound: a session with `startedAt` at or after
  // this instant (`instant(D + 1)`, account-local) counts in neither
  // Training nor Strength, a deliberate divergence from Volume (§8, R-1).
  futureGuardInstant: string,
): TrainingWeekDto[] {
  const guardMs = Date.parse(futureGuardInstant);
  const eligibleSessions = sessions.filter((session) => Date.parse(session.startedAt) < guardMs);

  const workSetsBySession = new Map<string, number>();
  for (const row of setRows) {
    if (row.isWarmup) continue;
    workSetsBySession.set(row.sessionId, (workSetsBySession.get(row.sessionId) ?? 0) + 1);
  }

  return windows.map((window) => {
    const startMs = Date.parse(window.startInstant);
    const endMs = Date.parse(window.endInstant);
    const inWindow = eligibleSessions.filter((session) => {
      const t = Date.parse(session.startedAt);
      return t >= startMs && t < endMs;
    });
    const workSets = inWindow.reduce(
      (sum, session) => sum + (workSetsBySession.get(session.sessionId) ?? 0),
      0,
    );
    return {
      startDate: window.startDate,
      endDateExclusive: window.endDateExclusive,
      sessionsCompleted: inWindow.length,
      workSets,
      isDeload: inWindow.some((session) => session.isDeload),
    };
  });
}
