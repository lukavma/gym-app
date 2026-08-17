import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  blocks,
  blockScheduleEntries,
  exercisePrescriptions,
  exercises,
  programs,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
  workoutTemplates,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { userLocalDateString } from "@/server/time/userLocalDate";
import { currentWeekIndex } from "@/domain/scheduling/weekIndex";
import { isoWeekday } from "@/domain/scheduling/isoWeekday";
import { resolveTodayTemplate } from "@/domain/scheduling/todayTemplate";
import { buildPrescriptionSnapshotData } from "@/domain/prescriptions/buildSnapshot";
import type { CarryForwardCandidate } from "@/domain/progression/carryForward";
import type { SetScheme, SetSchemeEnvelope } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";
import type { ResolvedProgression } from "@/domain/progression/registry";
import type { PrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";

// Bounded lookback for "previous performance" / the future progression
// engine's history window (progression-engine.md §2's `history` input —
// only the window is populated here; `evaluate()` itself is Phase 4).
// pwa-offline-strategy.md §4 splits this into two roles sharing one fetched
// window: `previousPerformance` (last 3, non-deload) for display, and
// `history` (last 5) as the future engine's input. HISTORY_WINDOW must
// cover the larger of the two display limits.
const HISTORY_WINDOW = 8;
const HISTORY_DISPLAY_LIMIT = 5;
const PREVIOUS_PERFORMANCE_LIMIT = 3;

export interface HistorySetDto {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup: boolean;
}

export interface HistorySessionDto {
  sessionId: string;
  startedAt: string;
  isDeload: boolean;
  sets: HistorySetDto[];
}

export interface TodayBundleExerciseEntry {
  prescriptionId: string;
  exerciseId: string;
  exerciseName: string;
  scheme: SetScheme;
  targetRir: RirBand | null;
  restSeconds: number | null;
  progression: ResolvedProgression;
  baselineLoadKg: number | null;
  loadStepKg: number;
  prefill: { loadKg: number | null; reps: number | null };
  previousPerformance: HistorySessionDto[];
  history: HistorySessionDto[];
}

export interface ActiveSessionSetDto {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  weightKg: number;
  reps: number;
  rir: number | null;
  loggedAt: string;
  notes: string | null;
}

export interface ActiveSessionExerciseDto {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  source: "template" | "adhoc";
  prescription: PrescriptionSnapshot | null;
  skipped: boolean;
  notes: string | null;
  sets: ActiveSessionSetDto[];
}

export interface ActiveSessionDto {
  id: string;
  blockId: string | null;
  templateId: string | null;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  status: "in_progress";
  startedAt: string;
  clientId: string | null;
  notes: string | null;
  exercises: ActiveSessionExerciseDto[];
}

export type TodayResolutionDto =
  | {
      kind: "scheduled";
      blockId: string;
      templateId: string;
      templateName: string;
      weekIndex: number | null;
      isDeload: boolean;
      exercises: TodayBundleExerciseEntry[];
    }
  | { kind: "rest" }
  | { kind: "no_schedule" };

export interface TodayBundle {
  today: TodayResolutionDto;
  activeSession: ActiveSessionDto | null;
  generatedAt: string;
}

interface HistorySessionExerciseRow {
  sessionExerciseId: string;
  sessionId: string;
  startedAt: Date;
  isDeload: boolean;
  sets: HistorySetDto[];
}

async function getExerciseHistory(
  db: AppDb,
  userId: string,
  exerciseId: string,
): Promise<HistorySessionExerciseRow[]> {
  const rows = await db
    .select({
      sessionExerciseId: sessionExercises.id,
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      isDeload: workoutSessions.isDeload,
    })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed"),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(HISTORY_WINDOW);

  if (rows.length === 0) return [];

  const setRows = await db
    .select()
    .from(setLogs)
    .where(
      inArray(
        setLogs.sessionExerciseId,
        rows.map((r) => r.sessionExerciseId),
      ),
    )
    .orderBy(asc(setLogs.setNumber));

  const setsBySessionExercise = new Map<string, HistorySetDto[]>();
  for (const s of setRows) {
    const list = setsBySessionExercise.get(s.sessionExerciseId) ?? [];
    list.push({
      setNumber: s.setNumber,
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      isWarmup: s.isWarmup,
    });
    setsBySessionExercise.set(s.sessionExerciseId, list);
  }

  return rows.map((r) => ({
    sessionExerciseId: r.sessionExerciseId,
    sessionId: r.sessionId,
    startedAt: r.startedAt,
    isDeload: r.isDeload,
    sets: setsBySessionExercise.get(r.sessionExerciseId) ?? [],
  }));
}

function toCarryForwardCandidate(h: HistorySessionExerciseRow): CarryForwardCandidate {
  const firstWorkSet = h.sets.find((s) => !s.isWarmup);
  return {
    status: "completed",
    isDeload: h.isDeload,
    startedAt: h.startedAt.toISOString(),
    firstWorkSetLoadKg: firstWorkSet ? firstWorkSet.weightKg : null,
  };
}

function toHistoryDto(h: HistorySessionExerciseRow): HistorySessionDto {
  return {
    sessionId: h.sessionId,
    startedAt: h.startedAt.toISOString(),
    isDeload: h.isDeload,
    sets: h.sets,
  };
}

// Exported for `/api/active-session` (Finding C), which serves this on its
// own so the client can read live active-session state without going through
// the cacheable today bundle. `status` is hard-coded `"in_progress"` below
// because the query only ever selects in-progress rows — a completed or
// discarded session is simply absent, i.e. `null`.
export async function getActiveSession(
  db: AppDb,
  userId: string,
): Promise<ActiveSessionDto | null> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, "in_progress")));
  if (!session) return null;

  const exerciseRows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, session.id))
    .orderBy(asc(sessionExercises.position));

  const exerciseIds = exerciseRows.map((e) => e.exerciseId);
  const exerciseNameRows = exerciseIds.length
    ? await db
        .select({ id: exercises.id, name: exercises.name })
        .from(exercises)
        .where(inArray(exercises.id, exerciseIds))
    : [];
  const nameById = new Map(exerciseNameRows.map((e) => [e.id, e.name]));

  const sessionExerciseIds = exerciseRows.map((e) => e.id);
  const setRows = sessionExerciseIds.length
    ? await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionExerciseId, sessionExerciseIds))
        .orderBy(asc(setLogs.setNumber))
    : [];
  const setsBySessionExercise = new Map<string, ActiveSessionSetDto[]>();
  for (const s of setRows) {
    const list = setsBySessionExercise.get(s.sessionExerciseId) ?? [];
    list.push({
      id: s.id,
      setNumber: s.setNumber,
      isWarmup: s.isWarmup,
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      loggedAt: s.loggedAt.toISOString(),
      notes: s.notes,
    });
    setsBySessionExercise.set(s.sessionExerciseId, list);
  }

  return {
    id: session.id,
    blockId: session.blockId,
    templateId: session.templateId,
    templateName: session.templateName,
    weekIndex: session.weekIndex,
    isDeload: session.isDeload,
    status: "in_progress",
    startedAt: session.startedAt.toISOString(),
    clientId: session.clientId,
    notes: session.notes,
    exercises: exerciseRows.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      exerciseName: nameById.get(e.exerciseId) ?? "",
      position: e.position,
      source: e.source as "template" | "adhoc",
      prescription: e.prescription as PrescriptionSnapshot | null,
      skipped: e.skipped,
      notes: e.notes,
      sets: setsBySessionExercise.get(e.id) ?? [],
    })),
  };
}

export async function buildTodayBundle(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<TodayBundle> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = user?.timezone ?? "UTC";
  const today = userLocalDateString(timezone, now);
  const weekday = isoWeekday(today);

  let todayDto: TodayResolutionDto = { kind: "no_schedule" };

  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")));

  if (program) {
    const [block] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.programId, program.id), eq(blocks.status, "active")));

    if (block) {
      const scheduleRows = await db
        .select()
        .from(blockScheduleEntries)
        .where(eq(blockScheduleEntries.blockId, block.id));

      const [completedCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.blockId, block.id), eq(workoutSessions.status, "completed")));
      const completedCount = completedCountRow?.count ?? 0;

      const resolution = resolveTodayTemplate(
        scheduleRows.map((r) => ({
          templateId: r.templateId,
          position: r.position,
          weekdays: r.weekdays,
        })),
        completedCount,
        weekday,
      );

      if (resolution.kind === "scheduled") {
        const [template] = await db
          .select()
          .from(workoutTemplates)
          .where(eq(workoutTemplates.id, resolution.templateId));

        if (template) {
          const weekIdx = currentWeekIndex("active", block.startDate, today, null);

          const prescriptionRows = await db
            .select()
            .from(exercisePrescriptions)
            .where(eq(exercisePrescriptions.templateId, template.id))
            .orderBy(asc(exercisePrescriptions.position));

          const exerciseIds = prescriptionRows.map((p) => p.exerciseId);
          const exerciseRows = exerciseIds.length
            ? await db.select().from(exercises).where(inArray(exercises.id, exerciseIds))
            : [];
          const exerciseById = new Map(exerciseRows.map((e) => [e.id, e]));

          const entries: TodayBundleExerciseEntry[] = [];
          for (const p of prescriptionRows) {
            const exercise = exerciseById.get(p.exerciseId);
            if (!exercise) continue; // exercise_id is RESTRICT, shouldn't happen
            const history = await getExerciseHistory(db, userId, p.exerciseId);
            const snapshotData = buildPrescriptionSnapshotData(
              { id: exercise.id, name: exercise.name },
              {
                scheme: (p.scheme as SetSchemeEnvelope).scheme,
                targetRir: p.targetRir as RirBand | null,
                restSeconds: p.restSeconds,
                progression: p.progression as ResolvedProgression,
                baselineLoadKg: p.baselineLoadKg,
              },
              history.map(toCarryForwardCandidate),
            );
            entries.push({
              prescriptionId: p.id,
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              scheme: snapshotData.scheme,
              targetRir: snapshotData.targetRir,
              restSeconds: snapshotData.restSeconds,
              progression: p.progression as ResolvedProgression,
              baselineLoadKg: p.baselineLoadKg,
              loadStepKg: exercise.loadStepKg,
              prefill: snapshotData.prefill,
              previousPerformance: history
                .filter((h) => !h.isDeload)
                .slice(0, PREVIOUS_PERFORMANCE_LIMIT)
                .map(toHistoryDto),
              history: history.slice(0, HISTORY_DISPLAY_LIMIT).map(toHistoryDto),
            });
          }

          todayDto = {
            kind: "scheduled",
            blockId: block.id,
            templateId: template.id,
            templateName: template.name,
            weekIndex: weekIdx,
            // Phase 3 never applies deload logic (implementation-plan.md
            // Phase 3 "Not yet: deload behavior") — always false until
            // Phase 5 starts reading the block's DeloadConfig here.
            isDeload: false,
            exercises: entries,
          };
        }
      } else {
        todayDto = resolution;
      }
    }
  }

  const activeSession = await getActiveSession(db, userId);

  return { today: todayDto, activeSession, generatedAt: now.toISOString() };
}
