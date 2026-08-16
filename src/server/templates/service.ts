import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { blocks, blockScheduleEntries, programs, workoutTemplates } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type {
  CreateTemplateInput,
  TemplateArchiveAction,
  UpdateTemplateInput,
} from "@/domain/templates/schema";

export class TemplateNotFoundError extends Error {
  constructor() {
    super("Template not found");
    this.name = "TemplateNotFoundError";
  }
}

export class TemplateNameConflictError extends Error {
  constructor() {
    super("An active template with this name already exists in this program");
    this.name = "TemplateNameConflictError";
  }
}

// domain-model.md §4 — "Archiving is blocked while the template is
// referenced by an active block's schedule."
export class TemplateReferencedError extends Error {
  constructor() {
    super("Template is scheduled in an active block and cannot be archived");
    this.name = "TemplateReferencedError";
  }
}

// Thrown by reorderTemplates when the submitted id list doesn't exactly
// match the program's current (non-archived) template ids — a stale client
// view, not a not-found or ownership problem, so it maps to 400 not 404.
export class TemplateReorderMismatchError extends Error {
  constructor() {
    super("Submitted template ids do not match the program's current templates");
    this.name = "TemplateReorderMismatchError";
  }
}

export interface TemplateRecord {
  id: string;
  programId: string;
  name: string;
  position: number;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type TemplateRow = typeof workoutTemplates.$inferSelect;

function toRecord(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    programId: row.programId,
    name: row.name,
    position: row.position,
    notes: row.notes,
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

// Ownership-chain check (programs.user_id is the root — data-model.md §2.6
// / §2.7). Returns true iff `programId` exists and belongs to `userId`.
async function programBelongsToUser(
  db: AppDb,
  userId: string,
  programId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.userId, userId)));
  return row !== undefined;
}

export interface ListTemplatesOptions {
  includeArchived?: boolean;
}

export async function listTemplates(
  db: AppDb,
  userId: string,
  programId: string,
  options: ListTemplatesOptions = {},
): Promise<TemplateRecord[] | null> {
  if (!(await programBelongsToUser(db, userId, programId))) return null;

  const conditions = [eq(workoutTemplates.programId, programId)];
  if (!options.includeArchived) {
    conditions.push(isNull(workoutTemplates.archivedAt));
  }
  const rows = await db
    .select()
    .from(workoutTemplates)
    .where(and(...conditions))
    .orderBy(asc(workoutTemplates.position));
  return rows.map(toRecord);
}

export async function getTemplate(
  db: AppDb,
  userId: string,
  id: string,
): Promise<TemplateRecord | null> {
  const [row] = await db
    .select({ template: workoutTemplates })
    .from(workoutTemplates)
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(workoutTemplates.id, id), eq(programs.userId, userId)));
  return row ? toRecord(row.template) : null;
}

export async function createTemplate(
  db: AppDb,
  userId: string,
  programId: string,
  input: CreateTemplateInput,
): Promise<TemplateRecord | null> {
  if (!(await programBelongsToUser(db, userId, programId))) return null;

  try {
    return await db.transaction(async (tx) => {
      const siblings = await tx
        .select({ position: workoutTemplates.position })
        .from(workoutTemplates)
        .where(eq(workoutTemplates.programId, programId));
      const nextPosition = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1;

      const [row] = await tx
        .insert(workoutTemplates)
        .values({
          id: newId(),
          programId,
          name: input.name,
          position: nextPosition,
          notes: input.notes ?? null,
        })
        .returning();
      if (!row) throw new Error("Failed to create template");
      return toRecord(row);
    });
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new TemplateNameConflictError();
    throw err;
  }
}

export async function updateTemplate(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdateTemplateInput,
): Promise<TemplateRecord> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workoutTemplates.id })
        .from(workoutTemplates)
        .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
        .where(and(eq(workoutTemplates.id, id), eq(programs.userId, userId)));
      if (!existing) throw new TemplateNotFoundError();

      const patch: Partial<typeof workoutTemplates.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.notes !== undefined) patch.notes = input.notes;

      const [row] = await tx
        .update(workoutTemplates)
        .set(patch)
        .where(eq(workoutTemplates.id, id))
        .returning();
      if (!row) throw new Error("Failed to update template");
      return toRecord(row);
    });
  } catch (err) {
    if (err instanceof TemplateNotFoundError) throw err;
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new TemplateNameConflictError();
    throw err;
  }
}

export async function setTemplateArchived(
  db: AppDb,
  userId: string,
  id: string,
  action: TemplateArchiveAction,
): Promise<TemplateRecord> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: workoutTemplates.id })
      .from(workoutTemplates)
      .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
      .where(and(eq(workoutTemplates.id, id), eq(programs.userId, userId)));
    if (!existing) throw new TemplateNotFoundError();

    if (action === "archive") {
      const [scheduled] = await tx
        .select({ id: blockScheduleEntries.id })
        .from(blockScheduleEntries)
        .innerJoin(blocks, eq(blockScheduleEntries.blockId, blocks.id))
        .where(and(eq(blockScheduleEntries.templateId, id), eq(blocks.status, "active")));
      if (scheduled) throw new TemplateReferencedError();
    }

    const archivedAt = action === "archive" ? new Date() : null;
    const [row] = await tx
      .update(workoutTemplates)
      .set({ archivedAt, updatedAt: new Date() })
      .where(eq(workoutTemplates.id, id))
      .returning();
    if (!row) throw new Error("Failed to update template");
    return toRecord(row);
  });
}

export async function reorderTemplates(
  db: AppDb,
  userId: string,
  programId: string,
  templateIds: string[],
): Promise<TemplateRecord[] | null> {
  if (!(await programBelongsToUser(db, userId, programId))) return null;

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: workoutTemplates.id })
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.programId, programId), isNull(workoutTemplates.archivedAt)));

    const existingIds = new Set(existing.map((row) => row.id));
    const submittedIds = new Set(templateIds);
    if (
      existingIds.size !== submittedIds.size ||
      [...existingIds].some((id) => !submittedIds.has(id))
    ) {
      throw new TemplateReorderMismatchError();
    }

    for (const [index, id] of templateIds.entries()) {
      await tx
        .update(workoutTemplates)
        .set({ position: index, updatedAt: new Date() })
        .where(eq(workoutTemplates.id, id));
    }

    const rows = await tx
      .select()
      .from(workoutTemplates)
      .where(inArray(workoutTemplates.id, templateIds))
      .orderBy(asc(workoutTemplates.position));
    return rows.map(toRecord);
  });
}
