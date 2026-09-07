// Metrics dashboard v1 — A-25's performance fixture generator
// (docs/reviews/metrics-dashboard-architecture-evaluation.md §11.3, §20
// step 2, A-25). Inserts ~3 years of heavy-user rows (completed sessions,
// bodyweight, recovery) into a throwaway local database, sets a 5-exercise
// dashboard selection, then measures `getMetricsDashboard`'s server time.
//
// NOT checked in as a dump — this script regenerates the fixture on demand
// against a disposable database. Refuses to run against a database that
// already has any user, so it can never touch the shared dev database by
// accident.
//
// Usage (PowerShell):
//   $env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_metricsperf"
//   pnpm exec tsx scripts/metricsPerformanceFixture.ts

import { getDb } from "@/db/client";
import {
  bodyweightEntries,
  recoveryEntries,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
} from "@/db/schema";
import { newId } from "@/domain/ids/uuidv7";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { replaceSelection } from "@/server/metrics/selectionService";
import { getMetricsDashboard } from "@/server/metrics/service";

const YEARS = 3;
const DAYS = YEARS * 365;
const MS_PER_DAY = 86_400_000;
const EXERCISE_COUNT = 8;
const SESSIONS_PER_WEEK = 5;
// L-10 remediation — §20 step 2's stated shape is "≈ 5 sessions/week x 8
// exercises x 5 sets"; this was 2, producing a fixture ~4x lighter than
// specified (7,800 set rows over 3 years instead of the ~31,200 the spec's
// own shape implies). Every session now logs all 8 exercises.
const EXERCISES_PER_SESSION = 8;
const SETS_PER_EXERCISE = 5;

const MUSCLE_GROUPS_BY_INDEX = [
  "quads",
  "chest",
  "back",
  "hamstrings",
  "biceps",
  "triceps",
  "glutes",
  "abs",
] as const;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function main() {
  const db = getDb();

  const existingUsers = await db.select({ id: users.id }).from(users);
  if (existingUsers.length !== 0) {
    throw new Error(
      `metricsPerformanceFixture expects DATABASE_URL to point at an empty-of-users database, found ` +
        `${existingUsers.length}. Point it at a dedicated disposable database, not a shared dev database.`,
    );
  }

  await seedMuscleGroups(db);
  const [user] = await db
    .insert(users)
    .values({ email: `metricsperf-${Date.now()}@example.com`, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert fixture user");
  const userId = user.id;

  const exerciseIds: string[] = [];
  for (let i = 0; i < EXERCISE_COUNT; i++) {
    const exercise = await createExercise(db, userId, {
      name: `Perf Fixture Exercise ${i}`,
      equipment: i % 2 === 0 ? "barbell" : "dumbbell",
      mechanics: "compound",
      laterality: "bilateral",
      loadStepKg: 2.5,
      contributions: [
        {
          muscleGroupId: MUSCLE_GROUPS_BY_INDEX[i % MUSCLE_GROUPS_BY_INDEX.length]!,
          role: "primary",
          weight: 1,
        },
      ],
    });
    exerciseIds.push(exercise.id);
  }
  await replaceSelection(db, userId, exerciseIds.slice(0, 5));

  const now = new Date();
  const sessionRows: (typeof workoutSessions.$inferInsert)[] = [];
  const sessionExerciseRows: (typeof sessionExercises.$inferInsert)[] = [];
  const setLogRows: (typeof setLogs.$inferInsert)[] = [];

  let sessionCount = 0;
  const totalWeeks = Math.floor(DAYS / 7);
  for (let week = 0; week < totalWeeks; week++) {
    for (let s = 0; s < SESSIONS_PER_WEEK; s++) {
      const daysAgo = DAYS - week * 7 - s;
      const startedAt = new Date(now.getTime() - daysAgo * MS_PER_DAY + 10 * 3_600_000); // ~10:00
      const sessionId = newId();
      sessionRows.push({
        id: sessionId,
        userId,
        templateName: "Perf Fixture",
        weekIndex: 1,
        isDeload: week % 8 === 7, // one deload-flagged week in every 8
        status: "completed",
        startedAt,
        completedAt: new Date(startedAt.getTime() + 3_600_000),
      });
      for (let e = 0; e < EXERCISES_PER_SESSION; e++) {
        const exerciseId = exerciseIds[(week * SESSIONS_PER_WEEK + s + e) % exerciseIds.length]!;
        const sessionExerciseId = newId();
        sessionExerciseRows.push({
          id: sessionExerciseId,
          sessionId,
          exerciseId,
          position: e,
          source: "adhoc",
        });
        for (let set = 0; set < SETS_PER_EXERCISE; set++) {
          setLogRows.push({
            id: newId(),
            sessionExerciseId,
            setNumber: set + 1,
            isWarmup: set === 0,
            weightKg: 80 + (week % 20),
            reps: 5,
            rir: 2,
            loggedAt: startedAt,
          });
        }
      }
      sessionCount++;
    }
  }

  console.log(
    `Generating ${sessionCount} sessions, ${sessionExerciseRows.length} session_exercises, ${setLogRows.length} set_logs...`,
  );
  for (const batch of chunk(sessionRows, 500)) await db.insert(workoutSessions).values(batch);
  for (const batch of chunk(sessionExerciseRows, 500))
    await db.insert(sessionExercises).values(batch);
  for (const batch of chunk(setLogRows, 1000)) await db.insert(setLogs).values(batch);

  const bodyweightRows: (typeof bodyweightEntries.$inferInsert)[] = [];
  const recoveryRows: (typeof recoveryEntries.$inferInsert)[] = [];
  for (let d = 0; d < DAYS; d++) {
    const date = new Date(now.getTime() - d * MS_PER_DAY).toISOString().slice(0, 10);
    bodyweightRows.push({ id: newId(), userId, date, weightKg: 82 + (d % 10) * 0.1 });
    recoveryRows.push({
      id: newId(),
      userId,
      date,
      sleepHours: 6 + (d % 4),
      sleepQuality: 1 + (d % 5),
      readiness: 1 + ((d + 1) % 5),
      soreness: 1 + ((d + 2) % 5),
    });
  }
  console.log(
    `Generating ${bodyweightRows.length} bodyweight entries, ${recoveryRows.length} recovery entries...`,
  );
  for (const batch of chunk(bodyweightRows, 500)) await db.insert(bodyweightEntries).values(batch);
  for (const batch of chunk(recoveryRows, 500)) await db.insert(recoveryEntries).values(batch);

  console.log("Fixture inserted. Measuring getMetricsDashboard server time...");
  const ITERATIONS = 30;
  const timings: number[] = [];
  // Warm-up call (connection setup, query planning) excluded from the measured set.
  await getMetricsDashboard(db, userId, now);
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    await getMetricsDashboard(db, userId, now);
    const end = process.hrtime.bigint();
    timings.push(Number(end - start) / 1_000_000);
  }
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length * 0.5)]!;
  const p95 = timings[Math.floor(timings.length * 0.95)]!;
  const min = timings[0]!;
  const max = timings[timings.length - 1]!;
  console.log(
    `getMetricsDashboard server time over ${ITERATIONS} calls (ms): ` +
      `min=${min.toFixed(2)} p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} max=${max.toFixed(2)}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
