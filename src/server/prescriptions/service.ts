import { and, asc, eq, inArray } from "drizzle-orm";
import { exercisePrescriptions, exercises, programs, workoutTemplates } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type { SetSchemeEnvelope } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";
import { resolveProgression, type ResolvedProgression } from "@/domain/progression/registry";
import {
  checkPrescriptionCompatibility,
  type CreatePrescriptionInput,
  type UpdatePrescriptionInput,
} from "@/domain/prescriptions/schema";

export class PrescriptionNotFoundError extends Error {
  constructor() {
    super("Prescription not found");
    this.name = "PrescriptionNotFoundError";
  }
}

export class PrescriptionExerciseNotFoundError extends Error {
  constructor() {
    super("Referenced exercise not found");
    this.name = "PrescriptionExerciseNotFoundError";
  }
}

// domain-model.md §10 invariant 4 — exercises are archivable, never
// deletable; new prescriptions may not target an archived exercise
// (existing prescriptions are unaffected — archiving an exercise never
// touches prescriptions that already reference it).
export class PrescriptionExerciseArchivedError extends Error {
  constructor() {
    super("Referenced exercise is archived");
    this.name = "PrescriptionExerciseArchivedError";
  }
}

// prescription-model.md §2/§6 compatibility rules (e.g. repCap required for
// rep-progression + fixed schemes) — carries the failed checks so the API
// can surface them.
export class PrescriptionCompatibilityError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "PrescriptionCompatibilityError";
    this.issues = issues;
  }
}

export class PrescriptionReorderMismatchError extends Error {
  constructor() {
    super("Submitted prescription ids do not match the template's current prescriptions");
    this.name = "PrescriptionReorderMismatchError";
  }
}

export interface PrescriptionRecord {
  id: string;
  templateId: string;
  exerciseId: string;
  position: number;
  scheme: SetSchemeEnvelope;
  targetRir: RirBand | null;
  baselineLoadKg: number | null;
  restSeconds: number | null;
  progression: ResolvedProgression;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type PrescriptionRow = typeof exercisePrescriptions.$inferSelect;

function toRecord(row: PrescriptionRow): PrescriptionRecord {
  return {
    id: row.id,
    templateId: row.templateId,
    exerciseId: row.exerciseId,
    position: row.position,
    scheme: row.scheme as SetSchemeEnvelope,
    targetRir: row.targetRir as RirBand | null,
    baselineLoadKg: row.baselineLoadKg,
    restSeconds: row.restSeconds,
    progression: row.progression as ResolvedProgression,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Ownership-chain check: exercise_prescriptions -> workout_templates ->
// programs.user_id is the root (data-model.md §2.6-§2.8).
async function templateBelongsToUser(
  db: AppDb,
  userId: string,
  templateId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(workoutTemplates.id, templateId), eq(programs.userId, userId)));
  return row !== undefined;
}

interface OwnedExercise {
  id: string;
  loadStepKg: number;
  archivedAt: Date | null;
}

async function getOwnedExercise(
  db: AppDb,
  userId: string,
  exerciseId: string,
): Promise<OwnedExercise | null> {
  const [row] = await db
    .select({
      id: exercises.id,
      loadStepKg: exercises.loadStepKg,
      archivedAt: exercises.archivedAt,
    })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)));
  return row ?? null;
}

function assertExerciseUsable(exercise: OwnedExercise | null): asserts exercise is OwnedExercise {
  if (!exercise) throw new PrescriptionExerciseNotFoundError();
  if (exercise.archivedAt) throw new PrescriptionExerciseArchivedError();
}

export async function listPrescriptions(
  db: AppDb,
  userId: string,
  templateId: string,
): Promise<PrescriptionRecord[] | null> {
  if (!(await templateBelongsToUser(db, userId, templateId))) return null;

  const rows = await db
    .select()
    .from(exercisePrescriptions)
    .where(eq(exercisePrescriptions.templateId, templateId))
    .orderBy(asc(exercisePrescriptions.position));
  return rows.map(toRecord);
}

export async function getPrescription(
  db: AppDb,
  userId: string,
  id: string,
): Promise<PrescriptionRecord | null> {
  const [row] = await db
    .select({ prescription: exercisePrescriptions })
    .from(exercisePrescriptions)
    .innerJoin(workoutTemplates, eq(exercisePrescriptions.templateId, workoutTemplates.id))
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(exercisePrescriptions.id, id), eq(programs.userId, userId)));
  return row ? toRecord(row.prescription) : null;
}

export async function createPrescription(
  db: AppDb,
  userId: string,
  templateId: string,
  input: CreatePrescriptionInput,
): Promise<PrescriptionRecord | null> {
  if (!(await templateBelongsToUser(db, userId, templateId))) return null;

  const exercise = await getOwnedExercise(db, userId, input.exerciseId);
  assertExerciseUsable(exercise);

  const progression = resolveProgression(
    input.progression.strategyId,
    input.progression.config,
    input.scheme.scheme,
    { loadStepKg: exercise.loadStepKg },
  );
  const issues = checkPrescriptionCompatibility(input.scheme.scheme, progression);
  if (issues.length > 0) throw new PrescriptionCompatibilityError(issues);

  return db.transaction(async (tx) => {
    const siblings = await tx
      .select({ position: exercisePrescriptions.position })
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.templateId, templateId));
    const nextPosition = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1;

    const [row] = await tx
      .insert(exercisePrescriptions)
      .values({
        id: newId(),
        templateId,
        exerciseId: input.exerciseId,
        position: nextPosition,
        scheme: input.scheme,
        targetRir: input.targetRir ?? null,
        baselineLoadKg: input.baselineLoadKg ?? null,
        restSeconds: input.restSeconds ?? null,
        progression,
        notes: input.notes ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create prescription");
    return toRecord(row);
  });
}

export async function updatePrescription(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdatePrescriptionInput,
): Promise<PrescriptionRecord> {
  const [existingRow] = await db
    .select({ prescription: exercisePrescriptions })
    .from(exercisePrescriptions)
    .innerJoin(workoutTemplates, eq(exercisePrescriptions.templateId, workoutTemplates.id))
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(exercisePrescriptions.id, id), eq(programs.userId, userId)));
  if (!existingRow) throw new PrescriptionNotFoundError();
  const existing = existingRow.prescription;

  const effectiveExerciseId = input.exerciseId ?? existing.exerciseId;
  const exercise = await getOwnedExercise(db, userId, effectiveExerciseId);
  assertExerciseUsable(exercise);

  const effectiveScheme = (input.scheme ?? existing.scheme) as SetSchemeEnvelope;

  const effectiveProgression: ResolvedProgression =
    input.progression !== undefined
      ? resolveProgression(
          input.progression.strategyId,
          input.progression.config,
          effectiveScheme.scheme,
          { loadStepKg: exercise.loadStepKg },
        )
      : (existing.progression as ResolvedProgression);

  const issues = checkPrescriptionCompatibility(effectiveScheme.scheme, effectiveProgression);
  if (issues.length > 0) throw new PrescriptionCompatibilityError(issues);

  const patch: Partial<typeof exercisePrescriptions.$inferInsert> = { updatedAt: new Date() };
  if (input.exerciseId !== undefined) patch.exerciseId = input.exerciseId;
  if (input.scheme !== undefined) patch.scheme = input.scheme;
  if (input.targetRir !== undefined) patch.targetRir = input.targetRir;
  if (input.baselineLoadKg !== undefined) patch.baselineLoadKg = input.baselineLoadKg;
  if (input.restSeconds !== undefined) patch.restSeconds = input.restSeconds;
  if (input.progression !== undefined) patch.progression = effectiveProgression;
  if (input.notes !== undefined) patch.notes = input.notes;

  const [row] = await db
    .update(exercisePrescriptions)
    .set(patch)
    .where(eq(exercisePrescriptions.id, id))
    .returning();
  if (!row) throw new Error("Failed to update prescription");
  return toRecord(row);
}

export async function deletePrescription(db: AppDb, userId: string, id: string): Promise<void> {
  const [existing] = await db
    .select({ id: exercisePrescriptions.id })
    .from(exercisePrescriptions)
    .innerJoin(workoutTemplates, eq(exercisePrescriptions.templateId, workoutTemplates.id))
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(exercisePrescriptions.id, id), eq(programs.userId, userId)));
  if (!existing) throw new PrescriptionNotFoundError();

  await db.delete(exercisePrescriptions).where(eq(exercisePrescriptions.id, id));
}

export async function reorderPrescriptions(
  db: AppDb,
  userId: string,
  templateId: string,
  prescriptionIds: string[],
): Promise<PrescriptionRecord[] | null> {
  if (!(await templateBelongsToUser(db, userId, templateId))) return null;

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: exercisePrescriptions.id })
      .from(exercisePrescriptions)
      .where(eq(exercisePrescriptions.templateId, templateId));

    const existingIds = new Set(existing.map((row) => row.id));
    const submittedIds = new Set(prescriptionIds);
    if (
      existingIds.size !== submittedIds.size ||
      [...existingIds].some((id) => !submittedIds.has(id))
    ) {
      throw new PrescriptionReorderMismatchError();
    }

    // uq_prescriptions_position is DEFERRABLE INITIALLY DEFERRED, so
    // Postgres only validates uniqueness at COMMIT — these per-row updates
    // can freely pass through intermediate duplicate positions.
    for (const [index, id] of prescriptionIds.entries()) {
      await tx
        .update(exercisePrescriptions)
        .set({ position: index, updatedAt: new Date() })
        .where(eq(exercisePrescriptions.id, id));
    }

    const rows = await tx
      .select()
      .from(exercisePrescriptions)
      .where(inArray(exercisePrescriptions.id, prescriptionIds))
      .orderBy(asc(exercisePrescriptions.position));
    return rows.map(toRecord);
  });
}
