import { and, asc, eq, ilike, inArray, isNull } from "drizzle-orm";
import {
  exerciseMuscleContributions,
  exercisePrescriptions,
  exercises,
  sessionExercises,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import {
  resolveLoadBasis,
  type ArchiveAction,
  type ContributionRole,
  type CreateExerciseInput,
  type Equipment,
  type Laterality,
  type LoadBasis,
  type Mechanics,
  type MeasurementProfile,
  type ResolvedContribution,
  type StrengthEstimateMode,
  type UpdateExerciseInput,
  type VolumeCounting,
} from "@/domain/exercises/schema";
import { DEFAULT_MEASUREMENT_PROFILE, loadBasisRequired } from "@/domain/measurement/profile";
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

// athletic-measurement-profiles-architecture-evaluation.md §10.3 — a
// measurementProfile change is refused once any `session_exercises` or
// `exercise_prescriptions` row references the exercise. The `session_exercises`
// half is also a database guarantee via `fk_session_exercises_exercise_profile`
// (§8.2, O-14); its raw `23503` is mapped to this same error below as a
// backstop for when the service check here is bypassed or races.
export class MeasurementProfileLockedError extends Error {
  constructor() {
    super("Measurement profile is locked once the exercise is used in history or a template");
    this.name = "MeasurementProfileLockedError";
  }
}

// §7.1 / §8.1's presence rule for a `loadBasis` edit against an unchanged
// profile that has no load field — `ck_exercises_load_basis_presence`'s
// application-layer equivalent for the one case `updateExerciseSchema`'s
// `.superRefine` cannot see (it has no access to the exercise's current
// profile).
export class LoadBasisNotSupportedError extends Error {
  constructor(public readonly measurementProfile: string) {
    super(`loadBasis is not supported for measurement profile "${measurementProfile}"`);
    this.name = "LoadBasisNotSupportedError";
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
  measurementProfile: MeasurementProfile;
  loadBasis: LoadBasis | null;
  volumeCounting: VolumeCounting;
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
    measurementProfile: row.measurementProfile as MeasurementProfile,
    loadBasis: row.loadBasis as LoadBasis | null,
    volumeCounting: row.volumeCounting as VolumeCounting,
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

// Like `isPostgresErrorCode`, but additionally requires the violated
// constraint (the pg driver's `.constraint` field on a `DatabaseError`,
// confirmed present on `23503`/`23505` errors) to match `constraintName`.
// Needed wherever a single SQLSTATE (e.g. `23503`) is shared by more than
// one constraint this function's transaction can violate — mapping on the
// code alone would misattribute a different constraint's violation to the
// wrong domain error.
function isPostgresConstraintViolation(
  err: unknown,
  code: string,
  constraintName: string,
): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) {
    return "constraint" in err && err.constraint === constraintName;
  }
  return "cause" in err && isPostgresConstraintViolation(err.cause, code, constraintName);
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
// The mirror FK backing the §10.3 measurement-profile lock (O-14) — see the
// comment on `MeasurementProfileLockedError` and on the catch-block mapping
// in `updateExercise` below.
const MEASUREMENT_PROFILE_LOCK_FK = "fk_session_exercises_exercise_profile";

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

// `measurementProfile` / `loadBasis` are optional here even though
// `CreateExerciseInput` (the `createExerciseSchema` output every route call
// already carries) always resolves them — this is the pre-existing seam
// every test fixture in this codebase calls `createExercise` through
// directly, bypassing the route's Zod parse (data-model.md's phase-1 test
// convention). Defaulting them again here, identically to the schema's
// `.transform()`, keeps every such fixture compiling and behaving as if it
// had gone through the route with today's body (I-9).
export type CreateExerciseServiceInput = Omit<
  CreateExerciseInput,
  "measurementProfile" | "loadBasis"
> &
  Partial<Pick<CreateExerciseInput, "measurementProfile" | "loadBasis">>;

export async function createExercise(
  db: AppDb,
  userId: string,
  input: CreateExerciseServiceInput,
): Promise<ExerciseRecord> {
  try {
    return await db.transaction(async (tx) => {
      const id = newId();
      const measurementProfile: MeasurementProfile =
        input.measurementProfile ?? DEFAULT_MEASUREMENT_PROFILE;
      const loadBasis: LoadBasis | null =
        input.loadBasis !== undefined
          ? input.loadBasis
          : resolveLoadBasis(measurementProfile, undefined);
      // §11.4 (O-4(i)/(ii)) — the service, not the column default, applies
      // the profile-dependent default: `'auto'` for `load_reps`, `'off'`
      // for every other profile (intent isn't modelled, so anything that
      // isn't `load_reps` defaults to not counting). `createExerciseSchema`
      // deliberately has no `volumeCounting` key for the caller to override.
      const volumeCounting: VolumeCounting = measurementProfile === "load_reps" ? "auto" : "off";
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
          measurementProfile,
          loadBasis,
          volumeCounting,
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
        .select({ id: exercises.id, measurementProfile: exercises.measurementProfile })
        .from(exercises)
        .where(and(eq(exercises.id, id), eq(exercises.userId, userId)));
      if (!existing) throw new ExerciseNotFoundError();

      const currentProfile = existing.measurementProfile as MeasurementProfile;

      if (input.measurementProfile !== undefined && input.measurementProfile !== currentProfile) {
        // §10.3 — blocked once the exercise is referenced by any
        // `session_exercises` or `exercise_prescriptions` row. The
        // `session_exercises` half is also a DB guarantee via the mirror FK
        // (caught in the `catch` block below as a `23503` backstop); the
        // `exercise_prescriptions` half has no such FK, so it's checked here.
        const [sessionRef] = await tx
          .select({ id: sessionExercises.id })
          .from(sessionExercises)
          .where(eq(sessionExercises.exerciseId, id))
          .limit(1);
        const [prescriptionRef] = await tx
          .select({ id: exercisePrescriptions.id })
          .from(exercisePrescriptions)
          .where(eq(exercisePrescriptions.exerciseId, id))
          .limit(1);
        if (sessionRef || prescriptionRef) throw new MeasurementProfileLockedError();
      } else if (input.loadBasis !== undefined && !loadBasisRequired(currentProfile)) {
        // §7.1 / §8.1's presence rule for a `loadBasis`-only edit against an
        // unchanged, load-less profile — `updateExerciseSchema`'s
        // `.superRefine` can only catch this when `measurementProfile` is
        // also in the same patch, since Zod has no access to `currentProfile`.
        throw new LoadBasisNotSupportedError(currentProfile);
      }

      const patch: Partial<typeof exercises.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.equipment !== undefined) patch.equipment = input.equipment;
      if (input.movementPattern !== undefined) patch.movementPattern = input.movementPattern;
      if (input.mechanics !== undefined) patch.mechanics = input.mechanics;
      if (input.laterality !== undefined) patch.laterality = input.laterality;
      if (input.loadStepKg !== undefined) patch.loadStepKg = input.loadStepKg;
      if (input.strengthEstimate !== undefined) patch.strengthEstimate = input.strengthEstimate;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.measurementProfile !== undefined) {
        patch.measurementProfile = input.measurementProfile;
        // Profile changed (and cleared the lock check above) — re-derive
        // `loadBasis` the same way `createExerciseSchema` does, unless the
        // caller also supplied one in this same patch (already validated
        // consistent by `updateExerciseSchema`'s `.superRefine`).
        patch.loadBasis = resolveLoadBasis(input.measurementProfile, input.loadBasis);
      } else if (input.loadBasis !== undefined) {
        patch.loadBasis = input.loadBasis;
      }
      if (input.volumeCounting !== undefined) patch.volumeCounting = input.volumeCounting;

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
    if (err instanceof MeasurementProfileLockedError) throw err;
    if (err instanceof LoadBasisNotSupportedError) throw err;
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new ExerciseNameConflictError();
    // §10.3 backstop — scoped to the mirror FK specifically
    // (`fk_session_exercises_exercise_profile`), which fires if the lock
    // check above is ever bypassed or races with a concurrent
    // session-exercise insert. A metadata PATCH can violate a *different*
    // `23503` too — e.g. `exercise_muscle_contributions`'s FK to
    // `muscle_groups` when `input.contributions` names a slug missing from
    // an incomplete taxonomy — and that must NOT be mis-mapped to this
    // error; it falls through to the generic `throw err` below instead,
    // same as any other FK this function has no specific mapping for.
    if (isPostgresConstraintViolation(err, FOREIGN_KEY_VIOLATION, MEASUREMENT_PROFILE_LOCK_FK)) {
      throw new MeasurementProfileLockedError();
    }
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
