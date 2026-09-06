import { and, asc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { exerciseMuscleContributions, exercises } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type {
  ArchiveAction,
  ContributionRole,
  CreateExerciseInput,
  Equipment,
  Laterality,
  Mechanics,
  ResolvedContribution,
  StrengthEstimateMode,
  UpdateExerciseInput,
} from "@/domain/exercises/schema";
import { isRollupMuscleGroupSlug, type MuscleGroupSlug } from "@/domain/exercises/muscleGroups";

export class ExerciseNotFoundError extends Error {
  constructor() {
    super("Exercise not found");
    this.name = "ExerciseNotFoundError";
  }
}

// Thrown when an update's contribution list introduces a rollup slug (e.g.
// `back`) that the exercise didn't already carry before this update
// (ADR-010: "leaf-only for new rows... update accepts a rollup slug only as
// carry-through of a row that already exists on that exercise").
export class RollupContributionNotCarriedError extends Error {
  constructor(public readonly muscleGroupId: string) {
    super(`Contribution "${muscleGroupId}" cannot be added — it is not a leaf muscle group`);
    this.name = "RollupContributionNotCarriedError";
  }
}

export class ExerciseNameConflictError extends Error {
  constructor() {
    super("An active exercise with this name already exists");
    this.name = "ExerciseNameConflictError";
  }
}

// Thrown when a hard delete is refused because something references this
// exercise (data-model.md §1 soft-delete policy: FK RESTRICT backstop).
// Nothing in Phase 1 itself creates such a reference — Phase 3's set_logs
// will — so this is only reachable today via a test fixture, per
// implementation-plan.md's Phase 1 test note.
export class ExerciseReferencedError extends Error {
  constructor() {
    super("Exercise is referenced by history and cannot be deleted");
    this.name = "ExerciseReferencedError";
  }
}

export interface ExerciseRecord {
  id: string;
  userId: string;
  name: string;
  equipment: Equipment;
  movementPattern: string | null;
  mechanics: Mechanics;
  laterality: Laterality;
  loadStepKg: number;
  strengthEstimate: StrengthEstimateMode;
  isSeeded: boolean;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contributions: ResolvedContribution[];
}

type ExerciseRow = typeof exercises.$inferSelect;

function toRecord(row: ExerciseRow, contributions: ResolvedContribution[]): ExerciseRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    equipment: row.equipment as Equipment,
    movementPattern: row.movementPattern,
    mechanics: row.mechanics as Mechanics,
    laterality: row.laterality as Laterality,
    loadStepKg: row.loadStepKg,
    strengthEstimate: row.strengthEstimate as StrengthEstimateMode,
    isSeeded: row.isSeeded,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contributions,
  };
}

async function contributionsByExerciseId(
  db: AppDb,
  exerciseIds: string[],
): Promise<Map<string, ResolvedContribution[]>> {
  const byExercise = new Map<string, ResolvedContribution[]>();
  if (exerciseIds.length === 0) return byExercise;

  const rows = await db
    .select()
    .from(exerciseMuscleContributions)
    .where(inArray(exerciseMuscleContributions.exerciseId, exerciseIds));

  for (const row of rows) {
    const list = byExercise.get(row.exerciseId) ?? [];
    list.push({
      muscleGroupId: row.muscleGroupId as MuscleGroupSlug,
      role: row.role as ContributionRole,
      weight: row.weight,
    });
    byExercise.set(row.exerciseId, list);
  }
  return byExercise;
}

async function attachContributions(db: AppDb, rows: ExerciseRow[]): Promise<ExerciseRecord[]> {
  const byExercise = await contributionsByExerciseId(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toRecord(row, byExercise.get(row.id) ?? []));
}

// drizzle-orm wraps the raw pg driver error (which carries `.code`, the
// Postgres SQLSTATE) in a `DrizzleQueryError` and exposes it as `.cause`
// rather than on the thrown error itself — check both shapes.
function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && isPostgresErrorCode(err.cause, code);
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export interface ListExercisesOptions {
  search?: string;
  includeArchived?: boolean;
}

export async function listExercises(
  db: AppDb,
  userId: string,
  options: ListExercisesOptions = {},
): Promise<ExerciseRecord[]> {
  const conditions = [eq(exercises.userId, userId)];
  if (!options.includeArchived) {
    conditions.push(isNull(exercises.archivedAt));
  }
  if (options.search) {
    conditions.push(ilike(exercises.name, `%${options.search}%`));
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(asc(exercises.name));
  return attachContributions(db, rows);
}

export async function getExercise(
  db: AppDb,
  userId: string,
  id: string,
): Promise<ExerciseRecord | null> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)));
  if (!row) return null;
  const [record] = await attachContributions(db, [row]);
  return record ?? null;
}

export async function createExercise(
  db: AppDb,
  userId: string,
  input: CreateExerciseInput,
): Promise<ExerciseRecord> {
  try {
    return await db.transaction(async (tx) => {
      const id = newId();
      const [row] = await tx
        .insert(exercises)
        .values({
          id,
          userId,
          name: input.name,
          equipment: input.equipment,
          movementPattern: input.movementPattern ?? null,
          mechanics: input.mechanics,
          laterality: input.laterality,
          loadStepKg: input.loadStepKg,
          notes: input.notes ?? null,
        })
        .returning();
      if (!row) throw new Error("Failed to create exercise");

      await tx.insert(exerciseMuscleContributions).values(
        input.contributions.map((c) => ({
          exerciseId: id,
          muscleGroupId: c.muscleGroupId,
          role: c.role,
          weight: c.weight,
        })),
      );

      return toRecord(row, input.contributions);
    });
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new ExerciseNameConflictError();
    throw err;
  }
}

export async function updateExercise(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdateExerciseInput,
): Promise<ExerciseRecord> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(eq(exercises.id, id), eq(exercises.userId, userId)));
      if (!existing) throw new ExerciseNotFoundError();

      const patch: Partial<typeof exercises.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.equipment !== undefined) patch.equipment = input.equipment;
      if (input.movementPattern !== undefined) patch.movementPattern = input.movementPattern;
      if (input.mechanics !== undefined) patch.mechanics = input.mechanics;
      if (input.laterality !== undefined) patch.laterality = input.laterality;
      if (input.loadStepKg !== undefined) patch.loadStepKg = input.loadStepKg;
      if (input.strengthEstimate !== undefined) patch.strengthEstimate = input.strengthEstimate;
      if (input.notes !== undefined) patch.notes = input.notes;

      const [row] = await tx.update(exercises).set(patch).where(eq(exercises.id, id)).returning();
      if (!row) throw new Error("Failed to update exercise");

      if (input.contributions !== undefined) {
        // ADR-010 carry-through rule: a submitted rollup slug (e.g. `back`)
        // is only valid if this exercise already had that exact row before
        // this update — never as a newly introduced contribution. Checked
        // before any mutation below, so a rejection leaves the whole
        // transaction (including the metadata patch above) rolled back.
        const submittedRollupSlugs = input.contributions
          .map((c) => c.muscleGroupId)
          .filter(isRollupMuscleGroupSlug);

        if (submittedRollupSlugs.length > 0) {
          const priorContributions = await tx
            .select({ muscleGroupId: exerciseMuscleContributions.muscleGroupId })
            .from(exerciseMuscleContributions)
            .where(eq(exerciseMuscleContributions.exerciseId, id));
          const priorSlugs = new Set(priorContributions.map((c) => c.muscleGroupId));

          for (const slug of submittedRollupSlugs) {
            if (!priorSlugs.has(slug)) throw new RollupContributionNotCarriedError(slug);
          }
        }

        await tx
          .delete(exerciseMuscleContributions)
          .where(eq(exerciseMuscleContributions.exerciseId, id));
        await tx.insert(exerciseMuscleContributions).values(
          input.contributions.map((c) => ({
            exerciseId: id,
            muscleGroupId: c.muscleGroupId,
            role: c.role,
            weight: c.weight,
          })),
        );
      }

      const contributions =
        input.contributions ?? (await contributionsByExerciseId(tx, [id])).get(id) ?? [];
      return toRecord(row, contributions);
    });
  } catch (err) {
    if (err instanceof ExerciseNotFoundError) throw err;
    if (err instanceof RollupContributionNotCarriedError) throw err;
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new ExerciseNameConflictError();
    throw err;
  }
}

export async function setExerciseArchived(
  db: AppDb,
  userId: string,
  id: string,
  action: ArchiveAction,
): Promise<ExerciseRecord> {
  const archivedAt = action === "archive" ? new Date() : null;
  try {
    const [row] = await db
      .update(exercises)
      .set({ archivedAt, updatedAt: new Date() })
      .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
      .returning();
    if (!row) throw new ExerciseNotFoundError();
    const [record] = await attachContributions(db, [row]);
    return record ?? toRecord(row, []);
  } catch (err) {
    if (err instanceof ExerciseNotFoundError) throw err;
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new ExerciseNameConflictError();
    throw err;
  }
}

export async function deleteExercise(db: AppDb, userId: string, id: string): Promise<void> {
  try {
    const deleted = await db
      .delete(exercises)
      .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
      .returning({ id: exercises.id });
    if (deleted.length === 0) throw new ExerciseNotFoundError();
  } catch (err) {
    if (err instanceof ExerciseNotFoundError) throw err;
    if (isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)) throw new ExerciseReferencedError();
    throw err;
  }
}
