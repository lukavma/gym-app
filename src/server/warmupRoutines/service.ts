import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  programs,
  warmupRoutineItems,
  warmupRoutines,
  workoutTemplates,
  workoutTemplateWarmupRoutines,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import { isUuid } from "@/domain/warmup/schema";
import type {
  CreateWarmupRoutineInput,
  ReplaceWarmupRoutineInput,
  SetTemplateWarmupRoutinesInput,
} from "@/domain/warmup/schema";

// Warm-up Routines v1 — planning-world CRUD plus the curated per-template
// association set (owner decisions O-1/O-2 in
// docs/reviews/warmup-routines-architecture-evaluation.md).
//
// This service writes only definition tables. It never touches
// `workout_sessions`, `session_exercises`, `set_logs` or `recommendations`,
// and it is not reachable from the sync write path (I-1/I-2). Execution
// state (selection, ticks, dismissal) lives exclusively in the device-local
// IndexedDB active-session aggregate and is never persisted here.

export class WarmupRoutineNotFoundError extends Error {
  constructor() {
    super("Warm-up routine not found");
    this.name = "WarmupRoutineNotFoundError";
  }
}

export class WarmupRoutineNameConflictError extends Error {
  constructor() {
    super("A warm-up routine with this name already exists");
    this.name = "WarmupRoutineNameConflictError";
  }
}

// Raised when a template association list references a routine that does not
// exist or belongs to somebody else. Distinct from
// WarmupRoutineNotFoundError so the route can map it to 400 (the request
// body is wrong) rather than 404 (the addressed template is missing).
export class WarmupRoutineLinkTargetNotFoundError extends Error {
  constructor() {
    super("One or more warm-up routines in this association list do not exist");
    this.name = "WarmupRoutineLinkTargetNotFoundError";
  }
}

// The database's partial unique index guarantees "at most one default per
// template"; this guarantees the other half of the invariant — that the
// default is one of the routines actually linked to that template.
export class WarmupRoutineDefaultNotLinkedError extends Error {
  constructor() {
    super("The default warm-up routine must be one of the template's linked routines");
    this.name = "WarmupRoutineDefaultNotLinkedError";
  }
}

// warmup-routines-review.md MEDIUM-1 — a retryable conflict on the
// association write path, mapped by the route to 409.
//
// With the anchor-row lock in setTemplateWarmupRoutines this should be
// unreachable for the replacement-vs-replacement race it was introduced for.
// It stays as a defensive mapping for two reasons: one race is genuinely
// outside the lock's reach (a routine hard-deleted between this
// transaction's ownership read and its INSERT raises `23503`, because
// deleting a routine does not touch the template anchor row), and every peer
// service in this repo maps its SQLSTATEs rather than letting an unmapped
// driver error become an unhandled 500 — `blocks`, `exercises`, `programs`,
// `recovery`, `sync`, and this file's own create/replace paths.
export class WarmupRoutineAssociationConflictError extends Error {
  constructor() {
    super("The template's warm-up routines changed concurrently — please retry");
    this.name = "WarmupRoutineAssociationConflictError";
  }
}

// Signals "template missing or not this user's" out of a transaction body,
// where returning `null` is not available. Deliberately NOT exported: the
// public contract is still `Promise<… | null>`, exactly as before.
class TemplateNotOwnedSignal extends Error {
  constructor() {
    super("Template not found");
    this.name = "TemplateNotOwnedSignal";
  }
}

export interface WarmupRoutineItemRecord {
  id: string;
  position: number;
  label: string;
  instruction: string | null;
}

export interface WarmupRoutineRecord {
  id: string;
  userId: string;
  name: string;
  items: WarmupRoutineItemRecord[];
  // How many workout templates currently link this routine — one cheap
  // grouped count, so the delete confirmation can say what it will unwire
  // (evaluation §9) instead of asking the user to guess.
  linkedTemplateCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateWarmupRoutineLink {
  routineId: string;
  name: string;
  position: number;
  isDefault: boolean;
  items: WarmupRoutineItemRecord[];
}

// See the identical helper + rationale in src/server/exercises/service.ts —
// drizzle wraps the pg driver error and exposes SQLSTATE on `.cause`.
function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && isPostgresErrorCode(err.cause, code);
}

const UNIQUE_VIOLATION = "23505";
// Raised when a routine is hard-deleted between this transaction's ownership
// read and its INSERT — the one association race the template anchor lock
// cannot cover, since deleting a routine never touches the template row.
const FOREIGN_KEY_VIOLATION = "23503";

type ItemRow = typeof warmupRoutineItems.$inferSelect;

function toItemRecord(row: ItemRow): WarmupRoutineItemRecord {
  return {
    id: row.id,
    position: row.position,
    label: row.label,
    instruction: row.instruction,
  };
}

async function itemsByRoutineId(
  db: AppDb,
  routineIds: string[],
): Promise<Map<string, WarmupRoutineItemRecord[]>> {
  const byRoutine = new Map<string, WarmupRoutineItemRecord[]>();
  if (routineIds.length === 0) return byRoutine;

  const rows = await db
    .select()
    .from(warmupRoutineItems)
    .where(inArray(warmupRoutineItems.routineId, routineIds))
    .orderBy(asc(warmupRoutineItems.position));

  for (const row of rows) {
    const list = byRoutine.get(row.routineId) ?? [];
    list.push(toItemRecord(row));
    byRoutine.set(row.routineId, list);
  }
  return byRoutine;
}

async function linkCountsByRoutineId(
  db: AppDb,
  routineIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (routineIds.length === 0) return counts;

  const rows = await db
    .select({
      routineId: workoutTemplateWarmupRoutines.routineId,
      count: sql<number>`count(*)::int`,
    })
    .from(workoutTemplateWarmupRoutines)
    .where(inArray(workoutTemplateWarmupRoutines.routineId, routineIds))
    .groupBy(workoutTemplateWarmupRoutines.routineId);

  for (const row of rows) counts.set(row.routineId, Number(row.count));
  return counts;
}

// Ownership-chain check for a workout template: `programs.user_id` is the
// root (data-model.md §2.6/§2.7), exactly as src/server/templates/service.ts
// resolves it. Returns false for a malformed id rather than letting
// PostgreSQL reject it as SQLSTATE 22P02 (an unmapped 500).
async function templateBelongsToUser(
  db: AppDb,
  userId: string,
  templateId: string,
): Promise<boolean> {
  if (!isUuid(templateId)) return false;
  const [row] = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
    .where(and(eq(workoutTemplates.id, templateId), eq(programs.userId, userId)));
  return row !== undefined;
}

export async function listWarmupRoutines(
  db: AppDb,
  userId: string,
): Promise<WarmupRoutineRecord[]> {
  const rows = await db
    .select()
    .from(warmupRoutines)
    .where(eq(warmupRoutines.userId, userId))
    .orderBy(sql`lower(${warmupRoutines.name}) asc`);

  const ids = rows.map((row) => row.id);
  const [items, counts] = await Promise.all([
    itemsByRoutineId(db, ids),
    linkCountsByRoutineId(db, ids),
  ]);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    items: items.get(row.id) ?? [],
    linkedTemplateCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getWarmupRoutine(
  db: AppDb,
  userId: string,
  id: string,
): Promise<WarmupRoutineRecord | null> {
  if (!isUuid(id)) return null;

  const [row] = await db
    .select()
    .from(warmupRoutines)
    .where(and(eq(warmupRoutines.id, id), eq(warmupRoutines.userId, userId)));
  if (!row) return null;

  const [items, counts] = await Promise.all([
    itemsByRoutineId(db, [row.id]),
    linkCountsByRoutineId(db, [row.id]),
  ]);

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    items: items.get(row.id) ?? [],
    linkedTemplateCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Routine + items are one consistency boundary (B-3): both are written
// inside a single transaction, so a routine can never exist with a partially
// written item list.
export async function createWarmupRoutine(
  db: AppDb,
  userId: string,
  input: CreateWarmupRoutineInput,
): Promise<WarmupRoutineRecord> {
  const routineId = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(warmupRoutines).values({ id: routineId, userId, name: input.name });
      await tx.insert(warmupRoutineItems).values(
        input.items.map((item, index) => ({
          id: newId(),
          routineId,
          position: index,
          label: item.label,
          instruction: item.instruction,
        })),
      );
    });
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new WarmupRoutineNameConflictError();
    throw err;
  }

  const created = await getWarmupRoutine(db, userId, routineId);
  if (!created) throw new Error("Failed to create warm-up routine");
  return created;
}

// Full replacement of name + item list, transactionally (B-3). Items are
// deleted and reinserted rather than diffed: nothing anywhere references an
// item id (execution state is a frozen copy in the device-local aggregate),
// so regenerating them is harmless, and delete-then-insert never transiently
// duplicates a `(routine_id, position)` pair — which is why that constraint
// needs no DEFERRABLE hand-patch.
export async function replaceWarmupRoutine(
  db: AppDb,
  userId: string,
  id: string,
  input: ReplaceWarmupRoutineInput,
): Promise<WarmupRoutineRecord> {
  if (!isUuid(id)) throw new WarmupRoutineNotFoundError();

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: warmupRoutines.id })
        .from(warmupRoutines)
        .where(and(eq(warmupRoutines.id, id), eq(warmupRoutines.userId, userId)));
      if (!existing) throw new WarmupRoutineNotFoundError();

      await tx
        .update(warmupRoutines)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(warmupRoutines.id, id));

      await tx.delete(warmupRoutineItems).where(eq(warmupRoutineItems.routineId, id));
      await tx.insert(warmupRoutineItems).values(
        input.items.map((item, index) => ({
          id: newId(),
          routineId: id,
          position: index,
          label: item.label,
          instruction: item.instruction,
        })),
      );
    });
  } catch (err) {
    if (err instanceof WarmupRoutineNotFoundError) throw err;
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new WarmupRoutineNameConflictError();
    throw err;
  }

  const updated = await getWarmupRoutine(db, userId, id);
  if (!updated) throw new WarmupRoutineNotFoundError();
  return updated;
}

// Hard delete (X-8). `warmup_routine_items` and every
// `workout_template_warmup_routines` row referencing this routine cascade
// away with it; no completed-session history references routines, so there
// is nothing to preserve and no archive state to carry.
export async function deleteWarmupRoutine(db: AppDb, userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new WarmupRoutineNotFoundError();

  const deleted = await db
    .delete(warmupRoutines)
    .where(and(eq(warmupRoutines.id, id), eq(warmupRoutines.userId, userId)))
    .returning({ id: warmupRoutines.id });
  if (deleted.length === 0) throw new WarmupRoutineNotFoundError();
}

// Owner decision O-2 — the curated set for one template, in link order.
// `null` means the template does not exist or is not this user's (the same
// null-for-not-found convention listPrescriptions/listTemplates use).
export async function listTemplateWarmupRoutines(
  db: AppDb,
  userId: string,
  templateId: string,
): Promise<TemplateWarmupRoutineLink[] | null> {
  if (!(await templateBelongsToUser(db, userId, templateId))) return null;

  const rows = await db
    .select({
      routineId: workoutTemplateWarmupRoutines.routineId,
      position: workoutTemplateWarmupRoutines.position,
      isDefault: workoutTemplateWarmupRoutines.isDefault,
      name: warmupRoutines.name,
    })
    .from(workoutTemplateWarmupRoutines)
    .innerJoin(warmupRoutines, eq(workoutTemplateWarmupRoutines.routineId, warmupRoutines.id))
    .where(eq(workoutTemplateWarmupRoutines.templateId, templateId))
    .orderBy(asc(workoutTemplateWarmupRoutines.position));

  const items = await itemsByRoutineId(
    db,
    rows.map((row) => row.routineId),
  );

  return rows.map((row) => ({
    routineId: row.routineId,
    name: row.name,
    position: row.position,
    isDefault: row.isDefault,
    items: items.get(row.routineId) ?? [],
  }));
}

// Atomic replacement of a template's entire association set (the task's
// "template association replacement must be atomic"): the old links are
// deleted and the new ones inserted inside one transaction, so no reader
// ever sees a half-applied curation, and positions are assigned 0..n-1 from
// the submitted order.
//
// Every id is ownership-checked before anything is written: the template
// through the program chain, and every routine against
// `warmup_routines.user_id`. A routine belonging to another user is
// indistinguishable from one that does not exist.
//
// warmup-routines-review.md MEDIUM-1 / LOW-1 — the first statement in the
// transaction locks the owned `workout_templates` row with `FOR UPDATE OF
// workout_templates`, and that lock is what makes concurrent replacements
// coherent.
//
// Why it is needed: under PostgreSQL's default READ COMMITTED, each
// statement takes its own snapshot. Without the lock, two replacements can
// both take their `DELETE`'s snapshot before either commits, so the second
// one's `DELETE` cannot see the first one's freshly inserted rows, deletes
// nothing, and then collides with them at `position 0`
// (`uq_template_warmup_routine_position`, SQLSTATE 23505 → an unhandled
// 500). The mirror case is LOW-1: a later-committing "clear all" deletes
// nothing, inserts nothing, and silently reports success while the earlier
// writer's links survive.
//
// Why it works: the second transaction blocks on the anchor row until the
// first commits. When it resumes, every subsequent statement takes a FRESH
// snapshot, so its `DELETE` now sees and removes the winner's rows before
// inserting its own. The outcome is honest last-writer-wins — including a
// clear, which really clears.
//
// Why `workout_templates` is the anchor: it is the one row every replacement
// for this template must consult and no other operation writes, and the
// ownership check has to read it anyway, so the lock costs no extra
// round-trip. `replaceWarmupRoutine` needs no equivalent because its
// `UPDATE warmup_routines … WHERE id = $1` already serialises on the routine
// row. `FOR UPDATE OF workout_templates` restricts the lock to the template
// row: the joined `programs` row is deliberately NOT locked, so replacements
// on two different templates of the same program never block each other.
export async function setTemplateWarmupRoutines(
  db: AppDb,
  userId: string,
  templateId: string,
  input: SetTemplateWarmupRoutinesInput,
): Promise<TemplateWarmupRoutineLink[] | null> {
  // Cheap pre-checks that need no transaction. A malformed id can never be a
  // real row, and a default outside the submitted set is a bad request
  // regardless of what the database holds.
  if (!isUuid(templateId)) return null;

  if (input.defaultRoutineId !== null && !input.routineIds.includes(input.defaultRoutineId)) {
    throw new WarmupRoutineDefaultNotLinkedError();
  }

  try {
    await db.transaction(async (tx) => {
      // The anchor lock AND the ownership check, in one statement — so the
      // template is proven to be this user's under the same lock that
      // serialises the write, not in an earlier, unlocked read.
      const [anchor] = await tx
        .select({ id: workoutTemplates.id })
        .from(workoutTemplates)
        .innerJoin(programs, eq(workoutTemplates.programId, programs.id))
        .where(and(eq(workoutTemplates.id, templateId), eq(programs.userId, userId)))
        .for("update", { of: workoutTemplates });
      if (!anchor) throw new TemplateNotOwnedSignal();

      if (input.routineIds.length > 0) {
        const owned = await tx
          .select({ id: warmupRoutines.id })
          .from(warmupRoutines)
          .where(
            and(eq(warmupRoutines.userId, userId), inArray(warmupRoutines.id, input.routineIds)),
          );
        if (owned.length !== input.routineIds.length) {
          throw new WarmupRoutineLinkTargetNotFoundError();
        }
      }

      await tx
        .delete(workoutTemplateWarmupRoutines)
        .where(eq(workoutTemplateWarmupRoutines.templateId, templateId));

      if (input.routineIds.length > 0) {
        await tx.insert(workoutTemplateWarmupRoutines).values(
          input.routineIds.map((routineId, index) => ({
            id: newId(),
            templateId,
            routineId,
            position: index,
            isDefault: routineId === input.defaultRoutineId,
          })),
        );
      }
    });
  } catch (err) {
    if (err instanceof TemplateNotOwnedSignal) return null;
    if (err instanceof WarmupRoutineLinkTargetNotFoundError) throw err;
    if (err instanceof WarmupRoutineDefaultNotLinkedError) throw err;
    // Defensive, per MEDIUM-1: any residual uniqueness (23505) or
    // foreign-key (23503) violation on this path is a concurrent-change
    // conflict the caller can retry, never an unhandled 500.
    if (
      isPostgresErrorCode(err, UNIQUE_VIOLATION) ||
      isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)
    ) {
      throw new WarmupRoutineAssociationConflictError();
    }
    throw err;
  }

  return listTemplateWarmupRoutines(db, userId, templateId);
}
