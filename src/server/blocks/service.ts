import { and, asc, eq, inArray } from "drizzle-orm";
import { blocks, blockScheduleEntries, programs, users, workoutTemplates } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import { currentWeekIndex as deriveCurrentWeekIndex } from "@/domain/scheduling/weekIndex";
import { userLocalDateString } from "@/server/time/userLocalDate";
import type {
  BlockGoal,
  CreateBlockInput,
  DeloadConfig,
  ScheduleEntryInput,
  UpdateBlockInput,
} from "@/domain/blocks/schema";

export class BlockNotFoundError extends Error {
  constructor() {
    super("Block not found");
    this.name = "BlockNotFoundError";
  }
}

// domain-model.md §5 — at most one active block per program
// (uq_blocks_one_active).
export class BlockActiveConflictError extends Error {
  constructor() {
    super("An active block already exists for this program");
    this.name = "BlockActiveConflictError";
  }
}

// domain-model.md §5 lifecycle: planned -> active -> completed | abandoned.
export class BlockInvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockInvalidTransitionError";
  }
}

// Schedule/deload are only editable while the block hasn't started
// (status === 'planned') — domain-model.md §9 treats schedule/deload as
// snapshotted into sessions once a block is running.
export class BlockScheduleLockedError extends Error {
  constructor() {
    super("Schedule and deload can only be edited while the block is planned");
    this.name = "BlockScheduleLockedError";
  }
}

export class BlockScheduleTemplateNotFoundError extends Error {
  constructor() {
    super("A scheduled template does not belong to this program");
    this.name = "BlockScheduleTemplateNotFoundError";
  }
}

export class BlockScheduleTemplateArchivedError extends Error {
  constructor() {
    super("A scheduled template is archived");
    this.name = "BlockScheduleTemplateArchivedError";
  }
}

export type BlockStatus = "planned" | "active" | "completed" | "abandoned";

export interface ScheduleEntryRecord {
  id: string;
  templateId: string;
  position: number;
  weekdays: number[] | null;
}

export interface BlockRecord {
  id: string;
  programId: string;
  name: string;
  sequence: number;
  goal: BlockGoal;
  startDate: string;
  weeksPlanned: number;
  status: BlockStatus;
  volumePresetId: string | null;
  deload: DeloadConfig | null;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  schedule: ScheduleEntryRecord[];
  // domain-model.md §5 — "Weeks are derived, not persisted"; computed from
  // startDate against the user's local date at read time. `null` while
  // `planned` (the block hasn't started); frozen at `completedAt` once
  // `completed`/`abandoned` so it stops advancing after the block stopped
  // running (M2 remediation — see domain/scheduling/weekIndex.ts).
  currentWeekIndex: number | null;
}

type BlockRow = typeof blocks.$inferSelect;
type ScheduleRow = typeof blockScheduleEntries.$inferSelect;

function toScheduleRecord(row: ScheduleRow): ScheduleEntryRecord {
  return {
    id: row.id,
    templateId: row.templateId,
    position: row.position,
    weekdays: row.weekdays,
  };
}

function toRecord(
  row: BlockRow,
  schedule: ScheduleRow[],
  timezone: string,
  now: Date,
): BlockRecord {
  return {
    id: row.id,
    programId: row.programId,
    name: row.name,
    sequence: row.sequence,
    goal: row.goal as BlockGoal,
    startDate: row.startDate,
    weeksPlanned: row.weeksPlanned,
    status: row.status as BlockStatus,
    volumePresetId: row.volumePresetId,
    deload: row.deload as DeloadConfig | null,
    notes: row.notes,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    schedule: schedule
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toScheduleRecord),
    currentWeekIndex: deriveCurrentWeekIndex(
      row.status as BlockStatus,
      row.startDate,
      userLocalDateString(timezone, now),
      row.completedAt ? userLocalDateString(timezone, row.completedAt) : null,
    ),
  };
}

// See identical helper + rationale in src/server/exercises/service.ts.
function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && isPostgresErrorCode(err.cause, code);
}

const UNIQUE_VIOLATION = "23505";

interface OwnedProgram {
  id: string;
  timezone: string;
}

// Ownership-chain check: blocks -> programs.user_id is the root
// (data-model.md §2.6 / §2.9). Also returns the user's timezone, needed for
// `currentWeekIndex` — joined here rather than queried separately.
async function getOwnedProgram(
  db: AppDb,
  userId: string,
  programId: string,
): Promise<OwnedProgram | null> {
  const [row] = await db
    .select({ id: programs.id, timezone: users.timezone })
    .from(programs)
    .innerJoin(users, eq(programs.userId, users.id))
    .where(and(eq(programs.id, programId), eq(programs.userId, userId)));
  return row ?? null;
}

async function scheduleEntriesByBlockId(
  db: AppDb,
  blockIds: string[],
): Promise<Map<string, ScheduleRow[]>> {
  const byBlock = new Map<string, ScheduleRow[]>();
  if (blockIds.length === 0) return byBlock;
  const rows = await db
    .select()
    .from(blockScheduleEntries)
    .where(inArray(blockScheduleEntries.blockId, blockIds));
  for (const row of rows) {
    const list = byBlock.get(row.blockId) ?? [];
    list.push(row);
    byBlock.set(row.blockId, list);
  }
  return byBlock;
}

async function assertScheduleTemplatesValid(
  db: AppDb,
  programId: string,
  entries: ScheduleEntryInput[],
): Promise<void> {
  const templateIds = entries.map((e) => e.templateId);
  const rows = await db
    .select({
      id: workoutTemplates.id,
      programId: workoutTemplates.programId,
      archivedAt: workoutTemplates.archivedAt,
    })
    .from(workoutTemplates)
    .where(inArray(workoutTemplates.id, templateIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const templateId of templateIds) {
    const row = byId.get(templateId);
    if (!row || row.programId !== programId) throw new BlockScheduleTemplateNotFoundError();
    if (row.archivedAt) throw new BlockScheduleTemplateArchivedError();
  }
}

export async function listBlocks(
  db: AppDb,
  userId: string,
  programId: string,
  now: Date = new Date(),
): Promise<BlockRecord[] | null> {
  const program = await getOwnedProgram(db, userId, programId);
  if (!program) return null;

  const rows = await db
    .select()
    .from(blocks)
    .where(eq(blocks.programId, programId))
    .orderBy(asc(blocks.sequence));
  const scheduleByBlock = await scheduleEntriesByBlockId(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toRecord(row, scheduleByBlock.get(row.id) ?? [], program.timezone, now));
}

export async function getBlock(
  db: AppDb,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<BlockRecord | null> {
  const [row] = await db
    .select({ block: blocks, timezone: users.timezone })
    .from(blocks)
    .innerJoin(programs, eq(blocks.programId, programs.id))
    .innerJoin(users, eq(programs.userId, users.id))
    .where(and(eq(blocks.id, id), eq(programs.userId, userId)));
  if (!row) return null;

  const schedule = await db
    .select()
    .from(blockScheduleEntries)
    .where(eq(blockScheduleEntries.blockId, id));
  return toRecord(row.block, schedule, row.timezone, now);
}

export async function createBlock(
  db: AppDb,
  userId: string,
  programId: string,
  input: CreateBlockInput,
): Promise<BlockRecord | null> {
  const program = await getOwnedProgram(db, userId, programId);
  if (!program) return null;

  await assertScheduleTemplatesValid(db, programId, input.schedule);

  // New blocks always start 'planned' (never 'active'), so
  // uq_blocks_one_active can't be hit here — only uq_blocks_sequence could
  // theoretically collide, which the transactional next-sequence read
  // above already prevents in practice. No unique-violation mapping needed.
  return db.transaction(async (tx) => {
    const siblings = await tx
      .select({ sequence: blocks.sequence })
      .from(blocks)
      .where(eq(blocks.programId, programId));
    const nextSequence = siblings.reduce((max, s) => Math.max(max, s.sequence), -1) + 1;

    const [row] = await tx
      .insert(blocks)
      .values({
        id: newId(),
        programId,
        name: input.name,
        sequence: nextSequence,
        goal: input.goal,
        startDate: input.startDate,
        weeksPlanned: input.weeksPlanned,
        deload: input.deload ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create block");

    const scheduleRows = await tx
      .insert(blockScheduleEntries)
      .values(
        input.schedule.map((entry, index) => ({
          id: newId(),
          blockId: row.id,
          templateId: entry.templateId,
          position: index,
          weekdays: entry.weekdays ?? null,
        })),
      )
      .returning();

    return toRecord(row, scheduleRows, program.timezone, new Date());
  });
}

export async function updateBlock(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdateBlockInput,
): Promise<BlockRecord> {
  const [existingRow] = await db
    .select({ block: blocks, timezone: users.timezone })
    .from(blocks)
    .innerJoin(programs, eq(blocks.programId, programs.id))
    .innerJoin(users, eq(programs.userId, users.id))
    .where(and(eq(blocks.id, id), eq(programs.userId, userId)));
  if (!existingRow) throw new BlockNotFoundError();
  const existing = existingRow.block;

  const touchesSchedule = input.schedule !== undefined || input.deload !== undefined;
  if (touchesSchedule && existing.status !== "planned") {
    throw new BlockScheduleLockedError();
  }
  if (input.schedule !== undefined) {
    await assertScheduleTemplatesValid(db, existing.programId, input.schedule);
  }

  return db.transaction(async (tx) => {
    const patch: Partial<typeof blocks.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.goal !== undefined) patch.goal = input.goal;
    if (input.weeksPlanned !== undefined) patch.weeksPlanned = input.weeksPlanned;
    if (input.deload !== undefined) patch.deload = input.deload;
    if (input.notes !== undefined) patch.notes = input.notes;

    const [row] = await tx.update(blocks).set(patch).where(eq(blocks.id, id)).returning();
    if (!row) throw new Error("Failed to update block");

    if (input.schedule !== undefined) {
      await tx.delete(blockScheduleEntries).where(eq(blockScheduleEntries.blockId, id));
    }
    const scheduleRows =
      input.schedule !== undefined
        ? input.schedule.length > 0
          ? await tx
              .insert(blockScheduleEntries)
              .values(
                input.schedule.map((entry, index) => ({
                  id: newId(),
                  blockId: id,
                  templateId: entry.templateId,
                  position: index,
                  weekdays: entry.weekdays ?? null,
                })),
              )
              .returning()
          : []
        : await tx.select().from(blockScheduleEntries).where(eq(blockScheduleEntries.blockId, id));

    return toRecord(row, scheduleRows, existingRow.timezone, new Date());
  });
}

async function transitionBlock(
  db: AppDb,
  userId: string,
  id: string,
  fromStatuses: BlockStatus[],
  toStatus: BlockStatus,
  setCompletedAt: boolean,
): Promise<BlockRecord> {
  const [existingRow] = await db
    .select({ block: blocks, timezone: users.timezone })
    .from(blocks)
    .innerJoin(programs, eq(blocks.programId, programs.id))
    .innerJoin(users, eq(programs.userId, users.id))
    .where(and(eq(blocks.id, id), eq(programs.userId, userId)));
  if (!existingRow) throw new BlockNotFoundError();
  const existing = existingRow.block;

  if (!fromStatuses.includes(existing.status as BlockStatus)) {
    throw new BlockInvalidTransitionError(
      `Cannot transition block from '${existing.status}' to '${toStatus}'`,
    );
  }

  try {
    const [row] = await db
      .update(blocks)
      .set({
        status: toStatus,
        completedAt: setCompletedAt ? new Date() : existing.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(blocks.id, id))
      .returning();
    if (!row) throw new Error("Failed to transition block");

    const schedule = await db
      .select()
      .from(blockScheduleEntries)
      .where(eq(blockScheduleEntries.blockId, id));
    return toRecord(row, schedule, existingRow.timezone, new Date());
  } catch (err) {
    if (isPostgresErrorCode(err, UNIQUE_VIOLATION)) throw new BlockActiveConflictError();
    throw err;
  }
}

export async function activateBlock(db: AppDb, userId: string, id: string): Promise<BlockRecord> {
  return transitionBlock(db, userId, id, ["planned"], "active", false);
}

// domain-model.md §5 — "Completing a block never touches its sessions."
export async function completeBlock(db: AppDb, userId: string, id: string): Promise<BlockRecord> {
  return transitionBlock(db, userId, id, ["active"], "completed", true);
}

export async function abandonBlock(db: AppDb, userId: string, id: string): Promise<BlockRecord> {
  return transitionBlock(db, userId, id, ["planned", "active"], "abandoned", true);
}
