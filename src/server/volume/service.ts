import { and, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  blocks,
  exerciseMuscleContributions,
  programs,
  sessionExercises,
  setLogs,
  users,
  volumeLandmarks,
  volumePresets,
  workoutSessions,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type { MuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import type { ContributionRole } from "@/domain/exercises/schema";
import {
  aggregateVolume,
  type InstantWeekWindow,
  type WeekVolumeReport,
  type WorkSetContributionRow,
} from "@/domain/volume/aggregate";
import { calendarWeekWindows } from "@/domain/volume/weekBuckets";
import type { UpsertVolumeLandmarkInput, VolumePresetClassification } from "@/domain/volume/schema";
import { userLocalDateString, localDateToUtcInstant } from "@/server/time/userLocalDate";

// mvp-scope.md F8 / implementation-plan.md Phase 6 — current week plus the
// previous four.
const WEEK_COUNT = 5;

export class NoActivePresetError extends Error {
  constructor() {
    super("No active volume preset — nothing to edit");
    this.name = "NoActivePresetError";
  }
}

export interface VolumeLandmarkRecord {
  id: string;
  muscleGroupId: MuscleGroupSlug;
  key: string;
  valueMin: number | null;
  valueMax: number | null;
  openEnded: boolean;
  note: string | null;
}

export interface VolumePresetRecord {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  classification: VolumePresetClassification;
  sourceRef: string | null;
  evidenceRefs: string[] | null;
  isBuiltin: boolean;
  landmarks: VolumeLandmarkRecord[];
}

export interface WeeklyVolumeReportDto {
  weeks: WeekVolumeReport[];
  activePreset: VolumePresetRecord | null;
}

type VolumePresetRow = typeof volumePresets.$inferSelect;
type VolumeLandmarkRow = typeof volumeLandmarks.$inferSelect;

function toLandmarkRecord(row: VolumeLandmarkRow): VolumeLandmarkRecord {
  return {
    id: row.id,
    muscleGroupId: row.muscleGroupId as MuscleGroupSlug,
    key: row.key,
    valueMin: row.valueMin,
    valueMax: row.valueMax,
    openEnded: row.openEnded,
    note: row.note,
  };
}

function toPresetRecord(
  row: VolumePresetRow,
  landmarkRows: VolumeLandmarkRow[],
): VolumePresetRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    classification: row.classification as VolumePresetClassification,
    sourceRef: row.sourceRef,
    evidenceRefs: row.evidenceRefs,
    isBuiltin: row.isBuiltin,
    landmarks: landmarkRows.map(toLandmarkRecord),
  };
}

// Ownership-scoped: a builtin preset (`user_id is null`) is readable by
// anyone, a user-owned preset only by its owner — the same `or(isNull, eq)`
// shape used nowhere else in this codebase yet, but the direct analogue of
// every other "scope by userId" query here. Returns null (never throws) on
// a cross-user id, so callers can treat "not mine" and "doesn't exist"
// identically — no existence leakage.
async function getPresetWithLandmarks(
  db: AppDb,
  presetId: string,
  userId: string,
): Promise<VolumePresetRecord | null> {
  const [row] = await db
    .select()
    .from(volumePresets)
    .where(
      and(
        eq(volumePresets.id, presetId),
        or(isNull(volumePresets.userId), eq(volumePresets.userId, userId)),
      ),
    );
  if (!row) return null;
  const landmarkRows = await db
    .select()
    .from(volumeLandmarks)
    .where(eq(volumeLandmarks.presetId, presetId));
  return toPresetRecord(row, landmarkRows);
}

interface ResolvedPreset {
  preset: VolumePresetRecord;
  source: "block" | "default";
  blockId: string | null;
}

// PostgreSQL's two-int advisory-lock namespace is separate from the bigint
// namespace used by first-run account setup. The final 64 bits of the UUID
// give each user a stable transaction-scoped lock without holding a row lock
// across the preset-resolution queries (some users legitimately have no
// default row to lock yet).
function userVolumeLockKeys(userId: string): readonly [number, number] {
  const hex = userId.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error("Expected a UUID user id for the volume edit lock");
  }
  return [Number.parseInt(hex.slice(16, 24), 16) | 0, Number.parseInt(hex.slice(24, 32), 16) | 0];
}

// volume-model.md §4 — "A block may reference one preset for its volume
// view; absent that, the dashboard uses the user's default preset, or none."
// Mirrors today/service.ts's active-program -> active-block resolution
// exactly (at most one active program, at most one active block within it).
async function resolveActivePreset(db: AppDb, userId: string): Promise<ResolvedPreset | null> {
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")));

  if (program) {
    const [block] = await db
      .select({ id: blocks.id, volumePresetId: blocks.volumePresetId })
      .from(blocks)
      .where(and(eq(blocks.programId, program.id), eq(blocks.status, "active")));
    if (block?.volumePresetId) {
      const preset = await getPresetWithLandmarks(db, block.volumePresetId, userId);
      if (preset) return { preset, source: "block", blockId: block.id };
    }
  }

  const [user] = await db
    .select({ defaultVolumePresetId: users.defaultVolumePresetId })
    .from(users)
    .where(eq(users.id, userId));
  if (user?.defaultVolumePresetId) {
    const preset = await getPresetWithLandmarks(db, user.defaultVolumePresetId, userId);
    if (preset) return { preset, source: "default", blockId: null };
  }

  return null;
}

async function queryWorkSetContributionRows(
  db: AppDb,
  userId: string,
  startInstant: string,
  endInstant: string,
): Promise<WorkSetContributionRow[]> {
  const rows = await db
    .select({
      setId: setLogs.id,
      isWarmup: setLogs.isWarmup,
      sessionStartedAt: workoutSessions.startedAt,
      isDeload: workoutSessions.isDeload,
      muscleGroupId: exerciseMuscleContributions.muscleGroupId,
      role: exerciseMuscleContributions.role,
      weight: exerciseMuscleContributions.weight,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(setLogs.sessionExerciseId, sessionExercises.id))
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .innerJoin(
      exerciseMuscleContributions,
      eq(exerciseMuscleContributions.exerciseId, sessionExercises.exerciseId),
    )
    .where(
      and(
        eq(workoutSessions.userId, userId),
        // domain-model.md §7 — "discarded sessions are ... excluded from
        // ... volume." In-progress sessions' already-logged sets DO count
        // (only 'discarded' is excluded — volume-model.md §1's Work Set
        // definition is "a session that is not discarded", not "completed").
        ne(workoutSessions.status, "discarded"),
        gte(workoutSessions.startedAt, new Date(startInstant)),
        lt(workoutSessions.startedAt, new Date(endInstant)),
      ),
    );

  return rows.map((row) => ({
    setId: row.setId,
    sessionStartedAt: row.sessionStartedAt.toISOString(),
    isDeload: row.isDeload,
    isWarmup: row.isWarmup,
    muscleGroupId: row.muscleGroupId as MuscleGroupSlug,
    role: row.role as ContributionRole,
    weight: row.weight,
  }));
}

export async function getWeeklyVolumeReport(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<WeeklyVolumeReportDto> {
  const [user] = await db
    .select({ timezone: users.timezone, weekStartsOn: users.weekStartsOn })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = user?.timezone ?? "UTC";
  const weekStartsOn = user?.weekStartsOn ?? 1;

  const today = userLocalDateString(timezone, now);
  // Index 0 = current week (most recent); index WEEK_COUNT-1 = oldest.
  const dateWindows = calendarWeekWindows(today, weekStartsOn, WEEK_COUNT);
  const instantWindows: InstantWeekWindow[] = dateWindows.map((window) => ({
    startDate: window.startDate,
    endDateExclusive: window.endDateExclusive,
    startInstant: localDateToUtcInstant(window.startDate, timezone).toISOString(),
    endInstant: localDateToUtcInstant(window.endDateExclusive, timezone).toISOString(),
  }));

  const oldest = instantWindows[instantWindows.length - 1];
  const newest = instantWindows[0];
  const rows =
    oldest && newest
      ? await queryWorkSetContributionRows(db, userId, oldest.startInstant, newest.endInstant)
      : [];

  const weeks = aggregateVolume(rows, instantWindows);
  const resolved = await resolveActivePreset(db, userId);

  return { weeks, activePreset: resolved?.preset ?? null };
}

// implementation-plan.md Phase 6 — "editing builtin values must create or
// reuse a user-owned copy, then make that copy the governing preset for the
// current context; never mutate the builtin"; "editing an existing
// user-owned preset updates its landmark rows in place." "Current context"
// is whichever slot resolution actually used (block preset, else user
// default) — the same slot the duplicate is written back into, so the next
// read immediately sees it (volume-model.md §4's block/default semantics).
export async function upsertVolumeLandmark(
  db: AppDb,
  userId: string,
  input: UpsertVolumeLandmarkInput,
): Promise<VolumePresetRecord> {
  return db.transaction(async (tx) => {
    // The first edit of a builtin duplicates and repoints it. Resolve only
    // after serialising edits for this user so a concurrent request observes
    // and reuses that copy instead of creating an orphan and losing a value.
    const [lockKeyA, lockKeyB] = userVolumeLockKeys(userId);
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKeyA}, ${lockKeyB})`);

    const resolved = await resolveActivePreset(tx, userId);
    if (!resolved) throw new NoActivePresetError();
    const { preset, source, blockId } = resolved;
    let targetPresetId = preset.id;

    if (preset.isBuiltin) {
      const newPresetId = newId();
      await tx.insert(volumePresets).values({
        id: newPresetId,
        userId,
        name: `${preset.name} (edited)`,
        description: preset.description,
        classification: "user_defined",
        sourceRef: preset.sourceRef,
        evidenceRefs: preset.evidenceRefs,
        isBuiltin: false,
      });

      if (preset.landmarks.length > 0) {
        await tx.insert(volumeLandmarks).values(
          preset.landmarks.map((landmark) => ({
            id: newId(),
            presetId: newPresetId,
            muscleGroupId: landmark.muscleGroupId,
            key: landmark.key,
            valueMin: landmark.valueMin,
            valueMax: landmark.valueMax,
            openEnded: landmark.openEnded,
            note: landmark.note,
          })),
        );
      }

      targetPresetId = newPresetId;
      if (source === "block" && blockId) {
        await tx
          .update(blocks)
          .set({ volumePresetId: newPresetId, updatedAt: new Date() })
          .where(eq(blocks.id, blockId));
      } else {
        await tx
          .update(users)
          .set({ defaultVolumePresetId: newPresetId, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }
    }

    const valueMin = input.valueMin ?? null;
    const valueMax = input.valueMax ?? null;
    const openEnded = input.openEnded ?? false;
    const note = input.note ?? null;

    await tx
      .insert(volumeLandmarks)
      .values({
        id: newId(),
        presetId: targetPresetId,
        muscleGroupId: input.muscleGroupId,
        key: input.key,
        valueMin,
        valueMax,
        openEnded,
        note,
      })
      .onConflictDoUpdate({
        target: [volumeLandmarks.presetId, volumeLandmarks.muscleGroupId, volumeLandmarks.key],
        set: { valueMin, valueMax, openEnded, note },
      });

    const updated = await getPresetWithLandmarks(tx, targetPresetId, userId);
    if (!updated) throw new Error("Failed to load preset after landmark upsert");
    return updated;
  });
}
