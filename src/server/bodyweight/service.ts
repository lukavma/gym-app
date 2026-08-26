import { and, desc, eq } from "drizzle-orm";
import { bodyweightEntries, users } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type { LogBodyweightInput, UpdateBodyweightInput } from "@/domain/bodyweight/schema";
import { userLocalDateString } from "@/server/time/userLocalDate";

export class BodyweightEntryNotFoundError extends Error {
  constructor() {
    super("Bodyweight entry not found");
    this.name = "BodyweightEntryNotFoundError";
  }
}

export interface BodyweightEntryRecord {
  id: string;
  date: string;
  weightKg: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type BodyweightEntryRow = typeof bodyweightEntries.$inferSelect;

function toRecord(row: BodyweightEntryRow): BodyweightEntryRecord {
  return {
    id: row.id,
    date: row.date,
    weightKg: row.weightKg,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveUserTimezone(db: AppDb, userId: string): Promise<string> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  return user?.timezone ?? "UTC";
}

export async function listBodyweightEntries(
  db: AppDb,
  userId: string,
): Promise<BodyweightEntryRecord[]> {
  const rows = await db
    .select()
    .from(bodyweightEntries)
    .where(eq(bodyweightEntries.userId, userId))
    .orderBy(desc(bodyweightEntries.date));
  return rows.map(toRecord);
}

// data-model.md §2.18 `uq_bodyweight_day` — a second log call for the same
// user-local day updates the existing row in place (mvp-scope.md F10 /
// implementation-plan.md Phase 7: "a second entry for the same user-local
// day must update the existing entry rather than create a duplicate or
// return a conflict"). `date` defaults to today in the user's timezone when
// the caller doesn't supply one (the quick-log path never does).
export async function logBodyweight(
  db: AppDb,
  userId: string,
  input: LogBodyweightInput,
  now: Date = new Date(),
): Promise<BodyweightEntryRecord> {
  const date = input.date ?? userLocalDateString(await resolveUserTimezone(db, userId), now);
  const note = input.note ?? null;

  const [row] = await db
    .insert(bodyweightEntries)
    .values({ id: newId(), userId, date, weightKg: input.weightKg, note })
    .onConflictDoUpdate({
      target: [bodyweightEntries.userId, bodyweightEntries.date],
      set: { weightKg: input.weightKg, note, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Failed to log bodyweight entry");
  return toRecord(row);
}

export async function updateBodyweightEntry(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdateBodyweightInput,
): Promise<BodyweightEntryRecord> {
  const patch: Partial<typeof bodyweightEntries.$inferInsert> = { updatedAt: new Date() };
  if (input.weightKg !== undefined) patch.weightKg = input.weightKg;
  if (input.note !== undefined) patch.note = input.note;

  const [row] = await db
    .update(bodyweightEntries)
    .set(patch)
    .where(and(eq(bodyweightEntries.id, id), eq(bodyweightEntries.userId, userId)))
    .returning();
  if (!row) throw new BodyweightEntryNotFoundError();
  return toRecord(row);
}

export async function deleteBodyweightEntry(db: AppDb, userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(bodyweightEntries)
    .where(and(eq(bodyweightEntries.id, id), eq(bodyweightEntries.userId, userId)))
    .returning({ id: bodyweightEntries.id });
  if (deleted.length === 0) throw new BodyweightEntryNotFoundError();
}
