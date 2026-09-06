// Estimated 1RM tracker — server orchestration for the read-only surface.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §8.1 (V-10 account-timezone calendar days, resolved at the server
// boundary), §14.1 (read-only over the four fact tables; archived exercises
// are SERVED — O-15), §14.4 (the endpoint), §14.5 (module boundaries).
//
// This layer owns exactly four things: the ownership-scoped exercise lookup,
// the user's timezone, ONE explicitly projected query over the fact tables,
// and the instant -> local-date conversion. Every rule of the estimate lives
// in `@/domain/strength/**`, where a fixture can prove it (the volume
// precedent).
//
// §14.5, enforced by `tests/unit/strengthBoundary.test.ts`: nothing here
// imports `evaluateSession`, `loadProgression`, `repProgression`, or any
// progression module at all; nothing here queries `recommendations`; and
// nothing here writes anything. Release A is read-only apart from the
// exercise opt-out, which travels through the existing `updateExercise`.

import { and, asc, eq } from "drizzle-orm";
import { exercises, sessionExercises, setLogs, users, workoutSessions } from "@/db/schema";
import type { AppDb } from "@/db/client";
import type { Equipment, Laterality } from "@/domain/exercises/schema";
import { isStrengthExerciseId } from "@/domain/strength/query";
import { deriveStrengthReport } from "@/domain/strength/report";
import type {
  StrengthEstimateMode,
  StrengthReport,
  StrengthSessionInput,
  StrengthSetInput,
  StrengthWhatIfInput,
} from "@/domain/strength/types";
import { userLocalDateString } from "@/server/time/userLocalDate";

export interface StrengthExerciseSummary {
  id: string;
  name: string;
  equipment: Equipment;
  laterality: Laterality;
  loadStepKg: number;
  strengthEstimate: StrengthEstimateMode;
  archivedAt: Date | null;
}

export interface ExerciseStrengthReportDto extends StrengthReport {
  exercise: StrengthExerciseSummary;
  // The EFFECTIVE `asOf` — a future value is clamped to server now and echoed
  // here, so the caller can see what was actually used (§14.4, RM-2).
  asOf: string;
  asOfLocalDate: string;
  timezone: string;
}

export interface GetExerciseStrengthReportOptions {
  asOf?: Date;
  whatIf?: StrengthWhatIfInput | null;
}

interface FactRow {
  sessionId: string;
  startedAt: Date;
  isDeload: boolean;
  setNumber: number | null;
  isWarmup: boolean | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
}

// §6.3 / §14.4 — the query bounds by user, exercise and `status = 'completed'`
// ONLY. In-progress sessions are excluded here because the estimate must
// never move during a workout (N-5), and discarded ones because they are not
// facts. Everything else — warm-up, zero load, RIR, reps-to-failure,
// grouping, plausibility — is decided in the pure domain, so it stays
// fixture-provable rather than becoming a query-level side effect.
//
// The join starts at `session_exercises` with a LEFT JOIN to `set_logs` so a
// completed session that contains the exercise but logged no set still
// produces a row, and therefore still counts toward
// `sessionsWithoutEligibleSets` instead of vanishing.
//
// There is no time bound: `best` is all-time (O-14 keeps it off the Today
// bundle precisely so this all-time scan happens only on this detail
// endpoint), and `staleObservationCount` needs the observations the window
// excludes.
async function queryFactRows(db: AppDb, userId: string, exerciseId: string): Promise<FactRow[]> {
  const rows = await db
    .select({
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
        eq(sessionExercises.exerciseId, exerciseId),
        eq(workoutSessions.status, "completed"),
      ),
    )
    // A deterministic row order so the domain's stable sort by `setNumber`
    // resolves the one ambiguous case — the same exercise appearing twice in
    // one session — the same way on every request (I-5).
    .orderBy(
      asc(workoutSessions.startedAt),
      asc(sessionExercises.position),
      asc(setLogs.setNumber),
    );
  return rows;
}

export async function getExerciseStrengthReport(
  db: AppDb,
  userId: string,
  exerciseId: string,
  options: GetExerciseStrengthReportOptions = {},
  now: Date = new Date(),
): Promise<ExerciseStrengthReportDto | null> {
  // A malformed id is "not found", never a 500. Postgres rejects a non-UUID
  // against a `uuid` column with SQLSTATE 22P02, which no route here maps, so
  // the query has to be guarded before it is issued — the same shape and the
  // same reason as `getWarmupRoutine`'s `isUuid` guard (review F-5).
  if (!isStrengthExerciseId(exerciseId)) return null;

  // Ownership is enforced in the WHERE clause, never by a post-fetch check, so
  // a foreign-owned id is indistinguishable from a missing one -> 404
  // (`server/exercises/service.ts`'s pattern, review RL-10). `archivedAt` is
  // deliberately NOT filtered: history is archive-agnostic by design and O-15
  // serves the strength page for an archived exercise.
  const [exercise] = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      equipment: exercises.equipment,
      laterality: exercises.laterality,
      loadStepKg: exercises.loadStepKg,
      strengthEstimate: exercises.strengthEstimate,
      archivedAt: exercises.archivedAt,
    })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)));
  if (!exercise) return null;

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = user?.timezone ?? "UTC";

  // §14.4 — a future `asOf` is CLAMPED to server now rather than rejected, so
  // `?asOf=` can never be used to produce a `best` that no session supports.
  const requestedAsOf = options.asOf ?? now;
  const effectiveAsOf = requestedAsOf.getTime() > now.getTime() ? now : requestedAsOf;

  // V-10 — the pure module never sees an instant or a timezone. Both the
  // window edge and every observation's date are account-timezone calendar
  // days, resolved here with the same helpers `volume/service.ts` uses.
  const asOfLocalDate = userLocalDateString(timezone, effectiveAsOf);

  const rows = await queryFactRows(db, userId, exercise.id);

  const bySession = new Map<string, { session: StrengthSessionInput; sets: StrengthSetInput[] }>();
  for (const row of rows) {
    let entry = bySession.get(row.sessionId);
    if (!entry) {
      const sets: StrengthSetInput[] = [];
      entry = {
        sets,
        session: {
          sessionId: row.sessionId,
          // The SESSION's start is the day key, matching the volume
          // convention: a session spanning midnight stays in its start day.
          performedOn: userLocalDateString(timezone, row.startedAt),
          // Always `toISOString()` (UTC `Z`) — the module's stated
          // precondition; it compares epoch milliseconds, never strings.
          startedAt: row.startedAt.toISOString(),
          isDeload: row.isDeload,
          sets,
        },
      };
      bySession.set(row.sessionId, entry);
    }
    if (row.setNumber === null) continue; // LEFT JOIN miss: session with no sets
    entry.sets.push({
      setNumber: row.setNumber,
      isWarmup: row.isWarmup ?? false,
      weightKg: row.weightKg ?? 0,
      reps: row.reps ?? 0,
      rir: row.rir,
    });
  }

  const report = deriveStrengthReport({
    exercise: {
      equipment: exercise.equipment,
      strengthEstimate: exercise.strengthEstimate as StrengthEstimateMode,
      loadStepKg: exercise.loadStepKg,
    },
    sessions: [...bySession.values()].map((entry) => entry.session),
    asOfLocalDate,
    whatIf: options.whatIf ?? null,
  });

  return {
    ...report,
    exercise: {
      id: exercise.id,
      name: exercise.name,
      equipment: exercise.equipment as Equipment,
      laterality: exercise.laterality as Laterality,
      loadStepKg: exercise.loadStepKg,
      strengthEstimate: exercise.strengthEstimate as StrengthEstimateMode,
      archivedAt: exercise.archivedAt,
    },
    asOf: effectiveAsOf.toISOString(),
    asOfLocalDate,
    timezone,
  };
}
