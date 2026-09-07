// Metrics dashboard v1 — the composed read endpoint's server orchestration.
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §11.2 (the query plan), §11.3 (performance boundaries), §16 I-4/I-5/I-12.
//
// This layer owns exactly the query plan and the account-timezone -> local-
// date conversion; every aggregation rule lives in `@/domain/metrics/**`,
// where a fixture can prove it. Steps 4-7 reuse `getWeeklyVolumeReport`
// byte-identically (I-3) — no option is added to it, and
// `src/server/volume/service.ts` is untouched.

import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import {
  bodyweightEntries,
  dashboardEstimateSelections,
  exercises,
  recoveryEntries,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";
import { STRENGTH_ALGORITHM } from "@/domain/strength/constants";
import type {
  StrengthEstimateMode,
  StrengthSessionInput,
  StrengthSetInput,
} from "@/domain/strength/types";
import { addDays, calendarWeekWindows } from "@/domain/volume/weekBuckets";
import type { InstantWeekWindow } from "@/domain/volume/aggregate";
import {
  aggregateTrainingWeeks,
  assembleMetricsDashboard,
  projectEstimateIndex,
  summarizeBodyweight,
  summarizeRecovery,
  type MetricsDashboardDto,
  type SelectionRowInput,
  type TrainingSessionRow,
  type TrainingSetRow,
} from "@/domain/metrics";
import { getWeeklyVolumeReport } from "@/server/volume/service";
import { localDateToUtcInstant, userLocalDateString } from "@/server/time/userLocalDate";

const TRAINING_WEEK_COUNT = 8; // O-2
const DASHBOARD_VOLUME_WEEK_COUNT = 2; // M-5 — exactly weeks[0..1] of the 5-week report
const STRENGTH_WINDOW_DAYS = 90; // the tracker's own EVIDENCE_WINDOW_DAYS

async function queryTrainingSessionRows(
  db: AppDb,
  userId: string,
  startInstant: string,
  endExclusiveInstant: string,
): Promise<TrainingSessionRow[]> {
  const rows = await db
    .select({
      id: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      isDeload: workoutSessions.isDeload,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed"),
        gte(workoutSessions.startedAt, new Date(startInstant)),
        lt(workoutSessions.startedAt, new Date(endExclusiveInstant)),
      ),
    );
  return rows.map((row) => ({
    sessionId: row.id,
    startedAt: row.startedAt.toISOString(),
    isDeload: row.isDeload,
  }));
}

async function queryTrainingSetRows(
  db: AppDb,
  sessionIds: readonly string[],
): Promise<TrainingSetRow[]> {
  // §11.2 step 3 — projects rows only; the domain drops warm-ups and counts
  // (M-2, the `aggregateVolume` precedent). Always issued, even with zero
  // session ids (drizzle's `inArray([])` compiles to a literal `false`
  // rather than an invalid empty `IN ()`) — step 3 is one of the statements
  // A-12 counts unconditionally; only step 9 is genuinely skippable.
  const rows = await db
    .select({ sessionId: sessionExercises.sessionId, isWarmup: setLogs.isWarmup })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
    .where(inArray(sessionExercises.sessionId, sessionIds));
  return rows;
}

interface SelectionExerciseRow {
  exerciseId: string;
  position: number;
  name: string;
  equipment: string;
  loadStepKg: number;
  strengthEstimate: string;
  archivedAt: Date | null;
  measurementProfile: string;
  loadBasis: string | null;
}

async function querySelection(db: AppDb, userId: string): Promise<SelectionExerciseRow[]> {
  // §11.2 step 8 — ownership is in the WHERE clause on BOTH tables, never a
  // post-fetch check (the tracker's rule, RL-10).
  const rows = await db
    .select({
      exerciseId: exercises.id,
      position: dashboardEstimateSelections.position,
      name: exercises.name,
      equipment: exercises.equipment,
      loadStepKg: exercises.loadStepKg,
      strengthEstimate: exercises.strengthEstimate,
      archivedAt: exercises.archivedAt,
      measurementProfile: exercises.measurementProfile,
      loadBasis: exercises.loadBasis,
    })
    .from(dashboardEstimateSelections)
    .innerJoin(exercises, eq(dashboardEstimateSelections.exerciseId, exercises.id))
    .where(and(eq(dashboardEstimateSelections.userId, userId), eq(exercises.userId, userId)))
    .orderBy(asc(dashboardEstimateSelections.position));
  return rows;
}

interface StrengthFactRow {
  exerciseId: string;
  sessionId: string;
  startedAt: Date;
  isDeload: boolean;
  setNumber: number | null;
  isWarmup: boolean | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  measurementProfile: string;
}

// §11.2 step 9 — filtered by the SELECTION, not by eligibility (that stays a
// pure-domain gate, run per selected exercise exactly as the detail endpoint
// does today). Skipped entirely when the selection is empty (A-34).
async function queryStrengthFactRows(
  db: AppDb,
  userId: string,
  exerciseIds: readonly string[],
  startInstant: string,
  endExclusiveInstant: string,
): Promise<StrengthFactRow[]> {
  if (exerciseIds.length === 0) return [];
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      isDeload: workoutSessions.isDeload,
      setNumber: setLogs.setNumber,
      isWarmup: setLogs.isWarmup,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rir: setLogs.rir,
      // §11.3 site #3's rule, reused here for the same reason (this fact
      // query feeds `deriveStrengthReport` too) — the frozen slot profile,
      // never diverges from the exercise's current one once referenced
      // (§10.3).
      measurementProfile: sessionExercises.measurementProfile,
    })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .leftJoin(setLogs, eq(setLogs.sessionExerciseId, sessionExercises.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed"),
        inArray(sessionExercises.exerciseId, exerciseIds),
        gte(workoutSessions.startedAt, new Date(startInstant)),
        lt(workoutSessions.startedAt, new Date(endExclusiveInstant)),
      ),
    )
    // I-11 — the binding contract: exercise_id, started_at, position,
    // set_number. The reused strength pipeline's own stable sort by
    // `set_number` resolves the one remaining ambiguous case.
    .orderBy(
      asc(sessionExercises.exerciseId),
      asc(workoutSessions.startedAt),
      asc(sessionExercises.position),
      asc(setLogs.setNumber),
    );
  return rows;
}

function groupStrengthFactRows(
  rows: readonly StrengthFactRow[],
  timezone: string,
): Map<string, StrengthSessionInput[]> {
  const byExercise = new Map<
    string,
    Map<string, { session: StrengthSessionInput; sets: StrengthSetInput[] }>
  >();
  for (const row of rows) {
    let bySession = byExercise.get(row.exerciseId);
    if (!bySession) {
      bySession = new Map();
      byExercise.set(row.exerciseId, bySession);
    }
    let entry = bySession.get(row.sessionId);
    if (!entry) {
      const sets: StrengthSetInput[] = [];
      entry = {
        sets,
        session: {
          sessionId: row.sessionId,
          performedOn: userLocalDateString(timezone, row.startedAt),
          startedAt: row.startedAt.toISOString(),
          isDeload: row.isDeload,
          sets,
        },
      };
      bySession.set(row.sessionId, entry);
    }
    if (row.setNumber === null) continue; // LEFT JOIN miss: session with no sets
    // §11.3 site #3's rule, mirrored here (this fact query also feeds
    // `deriveStrengthReport`, via `projectEstimateIndex`): keep only
    // load_reps slots, and never coerce a null load/rep count to `0`
    // (I-13/H-12) — an explicit skip, not `?? 0`, is what makes this compile
    // without fabricating a set that was never logged.
    if (row.measurementProfile !== "load_reps") continue;
    if (row.weightKg === null) continue;
    if (row.reps === null) continue;
    entry.sets.push({
      setNumber: row.setNumber,
      isWarmup: row.isWarmup ?? false,
      weightKg: row.weightKg,
      reps: row.reps,
      rir: row.rir,
    });
  }

  const result = new Map<string, StrengthSessionInput[]>();
  for (const [exerciseId, bySession] of byExercise) {
    result.set(
      exerciseId,
      [...bySession.values()].map((entry) => entry.session),
    );
  }
  return result;
}

async function queryBodyweightEntries(
  db: AppDb,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<{ date: string; weightKg: number }[]> {
  const rows = await db
    .select({ date: bodyweightEntries.date, weightKg: bodyweightEntries.weightKg })
    .from(bodyweightEntries)
    .where(
      and(
        eq(bodyweightEntries.userId, userId),
        gte(bodyweightEntries.date, fromDate),
        lte(bodyweightEntries.date, toDate),
      ),
    )
    .orderBy(asc(bodyweightEntries.date));
  return rows;
}

async function queryRecoveryEntries(
  db: AppDb,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<
  {
    date: string;
    sleepHours: number | null;
    sleepQuality: number | null;
    readiness: number | null;
    soreness: number | null;
  }[]
> {
  const rows = await db
    .select({
      date: recoveryEntries.date,
      sleepHours: recoveryEntries.sleepHours,
      sleepQuality: recoveryEntries.sleepQuality,
      readiness: recoveryEntries.readiness,
      soreness: recoveryEntries.soreness,
    })
    .from(recoveryEntries)
    .where(
      and(
        eq(recoveryEntries.userId, userId),
        gte(recoveryEntries.date, fromDate),
        lte(recoveryEntries.date, toDate),
      ),
    )
    .orderBy(asc(recoveryEntries.date));
  return rows;
}

export async function getMetricsDashboard(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<MetricsDashboardDto> {
  // Step 1.
  const [user] = await db
    .select({ timezone: users.timezone, weekStartsOn: users.weekStartsOn })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = user?.timezone ?? "UTC";
  const weekStartsOn = user?.weekStartsOn ?? 1;

  const asOfLocalDate = userLocalDateString(timezone, now);
  const futureGuardInstant = localDateToUtcInstant(
    addDays(asOfLocalDate, 1),
    timezone,
  ).toISOString();

  const trainingDateWindows = calendarWeekWindows(asOfLocalDate, weekStartsOn, TRAINING_WEEK_COUNT);
  const trainingWindows: InstantWeekWindow[] = trainingDateWindows.map((window) => ({
    startDate: window.startDate,
    endDateExclusive: window.endDateExclusive,
    startInstant: localDateToUtcInstant(window.startDate, timezone).toISOString(),
    endInstant: localDateToUtcInstant(window.endDateExclusive, timezone).toISOString(),
  }));
  const oldestWindow = trainingWindows[trainingWindows.length - 1];

  // Steps 2-3.
  const trainingSessions = oldestWindow
    ? await queryTrainingSessionRows(db, userId, oldestWindow.startInstant, futureGuardInstant)
    : [];
  const trainingSetRows = await queryTrainingSetRows(
    db,
    trainingSessions.map((s) => s.sessionId),
  );
  const training = aggregateTrainingWeeks(
    trainingSessions,
    trainingSetRows,
    trainingWindows,
    futureGuardInstant,
  );

  // Steps 4-7 — reused byte-identically (I-3); the metrics service forwards
  // `weeks.slice(0, 2)`, `activePreset` omitted (D-15's headroom, not this
  // release's problem).
  const volumeReport = await getWeeklyVolumeReport(db, userId, now);
  const volumeWeeks = volumeReport.weeks.slice(0, DASHBOARD_VOLUME_WEEK_COUNT);

  // Step 8.
  const selectionRows = await querySelection(db, userId);
  const selectionInputs: SelectionRowInput[] = selectionRows.map((row) => ({
    exerciseId: row.exerciseId,
    name: row.name,
    equipment: row.equipment,
    archived: row.archivedAt !== null,
    position: row.position,
    loadStepKg: row.loadStepKg,
    strengthEstimate: row.strengthEstimate as StrengthEstimateMode,
    measurementProfile: row.measurementProfile as MeasurementProfile,
    loadBasis: row.loadBasis as LoadBasis | null,
  }));

  // Step 9 — the 90-day evidence window, bounded ALSO by the future guard
  // (I-6): a selected exercise's session dated after `asOf` must not move
  // its own estimate index row any more than it moves Training's.
  const windowStartInstant = localDateToUtcInstant(
    addDays(asOfLocalDate, -(STRENGTH_WINDOW_DAYS - 1)),
    timezone,
  ).toISOString();
  const strengthFactRows = await queryStrengthFactRows(
    db,
    userId,
    selectionInputs.map((row) => row.exerciseId),
    windowStartInstant,
    futureGuardInstant,
  );
  const sessionsByExerciseId = groupStrengthFactRows(strengthFactRows, timezone);
  const strengthSelection = projectEstimateIndex(
    selectionInputs,
    sessionsByExerciseId,
    asOfLocalDate,
  );

  // Steps 10-11.
  const bodyweightFromDate = addDays(asOfLocalDate, -(STRENGTH_WINDOW_DAYS - 1));
  const bodyweightRows = await queryBodyweightEntries(
    db,
    userId,
    bodyweightFromDate,
    asOfLocalDate,
  );
  const bodyweight = summarizeBodyweight(bodyweightRows, asOfLocalDate);

  const recoveryFromDate = addDays(asOfLocalDate, -6);
  const recoveryRows = await queryRecoveryEntries(db, userId, recoveryFromDate, asOfLocalDate);
  const recovery = summarizeRecovery(recoveryRows, asOfLocalDate);

  return assembleMetricsDashboard({
    generatedAt: now.toISOString(),
    asOf: now.toISOString(),
    asOfLocalDate,
    timezone,
    weekStartsOn,
    training,
    strengthAlgorithm: STRENGTH_ALGORITHM,
    strengthSelection,
    volumeWeeks,
    bodyweight,
    recovery,
  });
}
