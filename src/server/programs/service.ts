import { and, asc, eq, isNull } from "drizzle-orm";
import { programs } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type {
  CreateProgramInput,
  ProgramArchiveAction,
  UpdateProgramInput,
} from "@/domain/programs/schema";

export class ProgramNotFoundError extends Error {
  constructor() {
    super("Program not found");
    this.name = "ProgramNotFoundError";
  }
}

// domain-model.md §4 — at most one active program per user
// (uq_programs_one_active). Thrown on create, and on unarchiving into an
// existing active program (same 409 pattern as Phase 1's
// ExerciseNameConflictError).
export class ProgramActiveConflictError extends Error {
  constructor() {
    super("An active program already exists");
    this.name = "ProgramActiveConflictError";
  }
}

export type ProgramStatus = "active" | "archived";

export interface ProgramRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ProgramRow = typeof programs.$inferSelect;

function toRecord(row: ProgramRow): ProgramRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    status: row.status as ProgramStatus,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// See identical helper + rationale in src/server/exercises/service.ts.
function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && isPostgresErrorCode(err.cause, code);
}

const UNIQUE_VIOLATION = "23505";

export interface ListProgramsOptions {
  includeArchived?: boolean;
}

export async function listPrograms(
  db: AppDb,
  userId: string,
  options: ListProgramsOptions = {},
): Promise<ProgramRecord[]> {
  const conditions = [eq(programs.userId, userId)];
  if (!options.includeArchived) {
    conditions.push(isNull(programs.archivedAt));
  }
  const rows = await db
    .select()
    .from(programs)
    .where(and(...conditions))
    .orderBy(asc(programs.name));
  return rows.map(toRecord);
}

export async function getProgram(
  db: AppDb,
  userId: string,
  id: string,
): Promise<ProgramRecord | null> {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, id), eq(programs.userId, userId)));
  return row ? toRecord(row) : null;
}

export async function createProgram(
  db: AppDb,
  userId: string,
  input: CreateProgramInput,
): Promise<ProgramRecord> {
  try {
    const [row] = await db
      .insert(programs)
      .values({
        id: newId(),
        userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create program");
    return toRecord(row);
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new ProgramActiveConflictError();
    throw err;
  }
}

export async function updateProgram(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdateProgramInput,
): Promise<ProgramRecord> {
  const patch: Partial<typeof programs.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;

  const [row] = await db
    .update(programs)
    .set(patch)
    .where(and(eq(programs.id, id), eq(programs.userId, userId)))
    .returning();
  if (!row) throw new ProgramNotFoundError();
  return toRecord(row);
}

export async function setProgramArchived(
  db: AppDb,
  userId: string,
  id: string,
  action: ProgramArchiveAction,
): Promise<ProgramRecord> {
  const status: ProgramStatus = action === "archive" ? "archived" : "active";
  const archivedAt = action === "archive" ? new Date() : null;
  try {
    const [row] = await db
      .update(programs)
      .set({ status, archivedAt, updatedAt: new Date() })
      .where(and(eq(programs.id, id), eq(programs.userId, userId)))
      .returning();
    if (!row) throw new ProgramNotFoundError();
    return toRecord(row);
  } catch (err) {
    if (err instanceof ProgramNotFoundError) throw err;
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new ProgramActiveConflictError();
    throw err;
  }
}
