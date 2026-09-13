import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { exercises, sessionExercises, setLogs, workoutSessions } from "@/db/schema";
import type { AppDb } from "@/db/client";
import type { PrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";

// mvp-scope.md F9 — history is rendered purely from session snapshots
// (`workout_sessions.template_name`/`week_index`/`is_deload`,
// `session_exercises.prescription`), never from live template/prescription
// joins, so a session still renders correctly after its source template is
// deleted (lineage FK is SET NULL) or an exercise it used is archived.
// `session_exercises.exercise_id` is a live join only as a name fallback
// for ad-hoc slots (`prescription: null`, so no snapshotted `exerciseName`)
// — safe because exercises are RESTRICT, never hard-deletable.
//
// domain-model.md's Session invariants: "discarded sessions are retained
// but excluded from history" — only `completed` sessions are listed here.
const HISTORY_STATUS = "completed";

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 100;

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

export interface HistorySetDetail {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  // §11.3 site #5 — display consumer: nullable to match `set_logs`'
  // post-0013 shape (I-13/H-12, a null is never coerced to `0`).
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  loggedAt: string;
  notes: string | null;
  // set-groups-architecture-evaluation.md §7 "History" — the group this set
  // is attributed to; `null` on an ungrouped session, or for an unattributed
  // set inside a grouped session (§4.4 rule 3, rendered without a label).
  groupKey: string | null;
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
  // columns (§8.2); always present, unlike the today-bundle's optional
  // `measurement` (H-10 is about tolerating a stale CACHED bundle, which
  // this live, non-cached endpoint has no equivalent of).
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

export async function listHistorySessions(
  db: AppDb,
  userId: string,
  options: { limit?: number; before?: string } = {},
): Promise<HistorySessionListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);

  const conditions = [
    eq(workoutSessions.userId, userId),
    eq(workoutSessions.status, HISTORY_STATUS),
  ];
  if (options.before !== undefined) {
    conditions.push(lt(workoutSessions.startedAt, new Date(options.before)));
  }

  const sessions = await db
    .select()
    .from(workoutSessions)
    .where(and(...conditions))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit);
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const exerciseRows = await db
    .select({ id: sessionExercises.id, sessionId: sessionExercises.sessionId })
    .from(sessionExercises)
    .where(inArray(sessionExercises.sessionId, sessionIds));

  const exerciseIdsBySession = new Map<string, string[]>();
  for (const row of exerciseRows) {
    const list = exerciseIdsBySession.get(row.sessionId) ?? [];
    list.push(row.id);
    exerciseIdsBySession.set(row.sessionId, list);
  }

  const allSessionExerciseIds = exerciseRows.map((r) => r.id);
  const setCountRows = allSessionExerciseIds.length
    ? await db
        .select({ sessionExerciseId: setLogs.sessionExerciseId })
        .from(setLogs)
        .where(inArray(setLogs.sessionExerciseId, allSessionExerciseIds))
    : [];
  const sessionExerciseToSession = new Map<string, string>();
  for (const row of exerciseRows) sessionExerciseToSession.set(row.id, row.sessionId);
  const setCountBySession = new Map<string, number>();
  for (const row of setCountRows) {
    const sessionId = sessionExerciseToSession.get(row.sessionExerciseId);
    if (!sessionId) continue;
    setCountBySession.set(sessionId, (setCountBySession.get(sessionId) ?? 0) + 1);
  }

  return sessions.map((s) => ({
    id: s.id,
    templateName: s.templateName,
    weekIndex: s.weekIndex,
    isDeload: s.isDeload,
    startedAt: s.startedAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    exerciseCount: exerciseIdsBySession.get(s.id)?.length ?? 0,
    setCount: setCountBySession.get(s.id) ?? 0,
    notes: s.notes,
  }));
}

export async function getHistorySessionDetail(
  db: AppDb,
  userId: string,
  id: string,
): Promise<HistorySessionDetail | null> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, id),
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, HISTORY_STATUS),
      ),
    );
  if (!session) return null;

  const exerciseRows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, session.id))
    .orderBy(asc(sessionExercises.position));

  // Ad-hoc slots (prescription: null) have no snapshotted exerciseName —
  // only fall back to the live catalog for those.
  const adhocExerciseIds = exerciseRows
    .filter((e) => e.prescription === null)
    .map((e) => e.exerciseId);
  const nameById = new Map<string, string>();
  if (adhocExerciseIds.length > 0) {
    const rows = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(inArray(exercises.id, adhocExerciseIds));
    for (const row of rows) nameById.set(row.id, row.name);
  }

  const sessionExerciseIds = exerciseRows.map((e) => e.id);
  const setRows = sessionExerciseIds.length
    ? await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionExerciseId, sessionExerciseIds))
        .orderBy(asc(setLogs.setNumber))
    : [];
  const setsBySessionExercise = new Map<string, HistorySetDetail[]>();
  for (const s of setRows) {
    const list = setsBySessionExercise.get(s.sessionExerciseId) ?? [];
    list.push({
      id: s.id,
      setNumber: s.setNumber,
      isWarmup: s.isWarmup,
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      distanceM: s.distanceM,
      durationS: s.durationS,
      loggedAt: s.loggedAt.toISOString(),
      notes: s.notes,
      groupKey: s.groupKey,
    });
    setsBySessionExercise.set(s.sessionExerciseId, list);
  }

  return {
    id: session.id,
    templateName: session.templateName,
    weekIndex: session.weekIndex,
    isDeload: session.isDeload,
    status: "completed",
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    notes: session.notes,
    exercises: exerciseRows.map((e) => {
      const prescription = e.prescription as PrescriptionSnapshot | null;
      return {
        id: e.id,
        exerciseId: e.exerciseId,
        exerciseName: prescription?.snapshot.exerciseName ?? nameById.get(e.exerciseId) ?? "",
        position: e.position,
        source: e.source as "template" | "adhoc",
        prescription,
        skipped: e.skipped,
        notes: e.notes,
        sets: setsBySessionExercise.get(e.id) ?? [],
        measurement: {
          profile: e.measurementProfile as MeasurementProfile,
          loadBasis: e.loadBasis as LoadBasis | null,
        },
      };
    }),
  };
}
