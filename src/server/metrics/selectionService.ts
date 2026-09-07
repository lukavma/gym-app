// Metrics dashboard v1 — the selection's read/write contract (O-3, O-8,
// §11.5). The feature's one write path: a full, idempotent replacement of
// the athlete's ordered exercise selection, serialised per user by an
// advisory lock so two devices editing at once never interleave positions.

import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  dashboardEstimateSelections,
  exercises,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { isSelectionEligible } from "@/domain/metrics/selection";
import { deriveStrengthReport } from "@/domain/strength/report";
import type {
  StrengthEstimateMode,
  StrengthSessionInput,
  StrengthSetInput,
} from "@/domain/strength/types";
import type {
  CandidateDto,
  EstimateIndexRowState,
  MetricsSelectionResponseDto,
  SelectionRowDto,
} from "@/domain/metrics/types";
import { addDays } from "@/domain/volume/weekBuckets";
import { localDateToUtcInstant, userLocalDateString } from "@/server/time/userLocalDate";

// M-2 remediation — the same 90-day evidence window `getMetricsDashboard`'s
// own step 9 uses (`@/server/metrics/service.ts`'s `STRENGTH_WINDOW_DAYS`),
// duplicated rather than imported: the two services share no dependency
// edge today, and the window length is the tracker's own
// `EVIDENCE_WINDOW_DAYS` product convention, not a metrics-specific number.
const STRENGTH_WINDOW_DAYS = 90;

export class InvalidSelectionExerciseError extends Error {
  constructor(public readonly exerciseId: string) {
    super(`Exercise ${exerciseId} is not a valid selection candidate`);
    this.name = "InvalidSelectionExerciseError";
  }
}

interface SelectionMetadataRow {
  exerciseId: string;
  position: number;
  name: string;
  equipment: string;
  loadStepKg: number;
  strengthEstimate: string;
  archivedAt: Date | null;
}

async function querySelectionMetadata(db: AppDb, userId: string): Promise<SelectionMetadataRow[]> {
  return db
    .select({
      exerciseId: exercises.id,
      position: dashboardEstimateSelections.position,
      name: exercises.name,
      equipment: exercises.equipment,
      loadStepKg: exercises.loadStepKg,
      strengthEstimate: exercises.strengthEstimate,
      archivedAt: exercises.archivedAt,
    })
    .from(dashboardEstimateSelections)
    .innerJoin(exercises, eq(dashboardEstimateSelections.exerciseId, exercises.id))
    .where(and(eq(dashboardEstimateSelections.userId, userId), eq(exercises.userId, userId)))
    .orderBy(asc(dashboardEstimateSelections.position));
}

interface FactRow {
  exerciseId: string;
  sessionId: string;
  startedAt: Date;
  isDeload: boolean;
  setNumber: number | null;
  isWarmup: boolean | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
}

// M-2 remediation — bounded exactly like `getMetricsDashboard`'s own step 9
// (`[instant(D-89), instant(D+1))`), so this endpoint's one fact query is
// never unbounded in time (§11.3's own stated invariant): the editor is
// opened far less often than the dashboard, but the per-account query cost
// still grows without bound for the lifetime of the account if it scans
// all-time, and the athlete-visible `state` this produces is identical
// either way (`deriveStrengthReport`'s own 90-day window already discards
// anything older). Still batched across every selected exercise in one
// round trip and bounded to at most five ids.
async function queryWindowedFactRows(
  db: AppDb,
  userId: string,
  exerciseIds: readonly string[],
  startInstant: string,
  endExclusiveInstant: string,
): Promise<FactRow[]> {
  if (exerciseIds.length === 0) return [];
  return db
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
    .orderBy(
      asc(sessionExercises.exerciseId),
      asc(workoutSessions.startedAt),
      asc(sessionExercises.position),
      asc(setLogs.setNumber),
    );
}

function groupByExercise(
  rows: readonly FactRow[],
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
    if (row.setNumber === null) continue;
    entry.sets.push({
      setNumber: row.setNumber,
      isWarmup: row.isWarmup ?? false,
      weightKg: row.weightKg ?? 0,
      reps: row.reps ?? 0,
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

function stateFor(
  eligible: boolean,
  refusalCode: string | undefined,
  currentE1rmKg: number | null,
): EstimateIndexRowState {
  if (!eligible)
    return refusalCode === "EXERCISE_ESTIMATE_DISABLED" ? "turned_off" : "not_available";
  return currentE1rmKg !== null ? "estimate" : "no_current_estimate";
}

async function toSelectionRowDtos(
  db: AppDb,
  userId: string,
  rows: readonly SelectionMetadataRow[],
  timezone: string,
  asOfLocalDate: string,
): Promise<SelectionRowDto[]> {
  const windowStartInstant = localDateToUtcInstant(
    addDays(asOfLocalDate, -(STRENGTH_WINDOW_DAYS - 1)),
    timezone,
  ).toISOString();
  const futureGuardInstant = localDateToUtcInstant(
    addDays(asOfLocalDate, 1),
    timezone,
  ).toISOString();
  const sessionsByExerciseId = groupByExercise(
    await queryWindowedFactRows(
      db,
      userId,
      rows.map((row) => row.exerciseId),
      windowStartInstant,
      futureGuardInstant,
    ),
    timezone,
  );
  return rows.map((row) => {
    const report = deriveStrengthReport({
      exercise: {
        equipment: row.equipment,
        strengthEstimate: row.strengthEstimate as StrengthEstimateMode,
        loadStepKg: row.loadStepKg,
      },
      sessions: sessionsByExerciseId.get(row.exerciseId) ?? [],
      asOfLocalDate,
    });
    return {
      exerciseId: row.exerciseId,
      name: row.name,
      archived: row.archivedAt !== null,
      position: row.position,
      state: stateFor(
        report.eligible,
        report.estimate.reasonCodes[0],
        report.estimate.currentE1rmKg,
      ),
    };
  });
}

async function queryCandidates(
  db: AppDb,
  userId: string,
  excludeExerciseIds: ReadonlySet<string>,
): Promise<CandidateDto[]> {
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      equipment: exercises.equipment,
      strengthEstimate: exercises.strengthEstimate,
      archivedAt: exercises.archivedAt,
    })
    .from(exercises)
    .where(eq(exercises.userId, userId));

  return rows
    .filter((row) => row.archivedAt === null)
    .filter((row) => !excludeExerciseIds.has(row.id))
    .filter((row) =>
      isSelectionEligible({
        equipment: row.equipment,
        strengthEstimate: row.strengthEstimate as StrengthEstimateMode,
      }),
    )
    .map((row) => ({ exerciseId: row.id, name: row.name, equipment: row.equipment }))
    .sort((a, b) => {
      const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return byName !== 0 ? byName : a.exerciseId.localeCompare(b.exerciseId);
    });
}

export async function getSelection(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<MetricsSelectionResponseDto> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = user?.timezone ?? "UTC";
  const asOfLocalDate = userLocalDateString(timezone, now);

  const metadataRows = await querySelectionMetadata(db, userId);
  const selection = await toSelectionRowDtos(db, userId, metadataRows, timezone, asOfLocalDate);
  const candidates = await queryCandidates(
    db,
    userId,
    new Set(metadataRows.map((row) => row.exerciseId)),
  );

  return { selection, candidates };
}

// §11.5 — a fixed metrics namespace integer, distinct from
// `userVolumeLockKeys`'s scheme, so the two features can never contend on
// the same lock pair (that helper derives BOTH ints from the user id).
const METRICS_SELECTION_LOCK_NAMESPACE = 0x4d455443; // 'METC', arbitrary and stable
function metricsSelectionLockKey(userId: string): number {
  const hex = userId.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error("Expected a UUID user id for the metrics selection lock");
  }
  return Number.parseInt(hex.slice(24, 32), 16) | 0;
}

export async function replaceSelection(
  db: AppDb,
  userId: string,
  exerciseIds: readonly string[],
  now: Date = new Date(),
): Promise<SelectionRowDto[]> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${METRICS_SELECTION_LOCK_NAMESPACE}, ${metricsSelectionLockKey(userId)})`,
    );

    const uniqueIds = [...new Set(exerciseIds)];
    const [ownedExercises, currentSelectionRows] = await Promise.all([
      uniqueIds.length > 0
        ? tx
            .select({
              id: exercises.id,
              equipment: exercises.equipment,
              strengthEstimate: exercises.strengthEstimate,
              archivedAt: exercises.archivedAt,
            })
            .from(exercises)
            .where(and(inArray(exercises.id, uniqueIds), eq(exercises.userId, userId)))
        : Promise.resolve([]),
      tx
        .select({ exerciseId: dashboardEstimateSelections.exerciseId })
        .from(dashboardEstimateSelections)
        .where(eq(dashboardEstimateSelections.userId, userId)),
    ]);

    const byId = new Map(ownedExercises.map((row) => [row.id, row]));
    const alreadySelected = new Set(currentSelectionRows.map((row) => row.exerciseId));

    for (const exerciseId of exerciseIds) {
      const exercise = byId.get(exerciseId);
      // RL-10 — a foreign id is indistinguishable from a missing one.
      if (!exercise) throw new InvalidSelectionExerciseError(exerciseId);

      // §11.5 — "An already-stored exercise is accepted even if it has
      // since been archived, switched off, or had its equipment changed":
      // eligibility and the archived check both apply only to an exercise
      // NOT already in the caller's stored selection.
      if (alreadySelected.has(exerciseId)) continue;

      if (
        !isSelectionEligible({
          equipment: exercise.equipment,
          strengthEstimate: exercise.strengthEstimate as StrengthEstimateMode,
        })
      ) {
        throw new InvalidSelectionExerciseError(exerciseId);
      }
      if (exercise.archivedAt !== null) {
        throw new InvalidSelectionExerciseError(exerciseId);
      }
    }

    // L-12 — §11.5 says a replayed identical body differs only in
    // `updated_at`; because this is a delete-then-insert (the design §11.5
    // itself mandates, so no swap can ever violate the unique position
    // index mid-transaction), `created_at` is re-defaulted too. Neither
    // column appears in any read DTO, so nothing observable changes — the
    // binding text is simply imprecise on this point.
    await tx
      .delete(dashboardEstimateSelections)
      .where(eq(dashboardEstimateSelections.userId, userId));
    if (exerciseIds.length > 0) {
      await tx
        .insert(dashboardEstimateSelections)
        .values(
          exerciseIds.map((exerciseId, index) => ({ userId, exerciseId, position: index + 1 })),
        );
    }

    const metadataRows = await querySelectionMetadata(tx, userId);
    const [user] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    const timezone = user?.timezone ?? "UTC";
    const asOfLocalDate = userLocalDateString(timezone, now);
    return toSelectionRowDtos(tx, userId, metadataRows, timezone, asOfLocalDate);
  });
}
