import { and, desc, eq } from "drizzle-orm";
import { recoveryEntries, users } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type { LogRecoveryInput, UpdateRecoveryInput } from "@/domain/recovery/schema";
import { userLocalDateString } from "@/server/time/userLocalDate";

export class RecoveryEntryNotFoundError extends Error {
  constructor() {
    super("Recovery entry not found");
    this.name = "RecoveryEntryNotFoundError";
  }
}

// data-model.md §2.19 `ck_recovery_day`: "at least one metric column not
// null". Thrown when a log/edit's patch, merged onto whatever the row ends
// up holding, would clear every metric field (note doesn't count) — the DB
// constraint would otherwise surface as a raw, unmapped 500.
export class RecoveryEntryHasNoMetricError extends Error {
  constructor() {
    super(
      "A recovery entry needs at least one of sleep hours, sleep quality, readiness, or soreness",
    );
    this.name = "RecoveryEntryHasNoMetricError";
  }
}

export interface RecoveryEntryRecord {
  id: string;
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  readiness: number | null;
  soreness: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type RecoveryEntryRow = typeof recoveryEntries.$inferSelect;
type RecoveryEntryInsert = typeof recoveryEntries.$inferInsert;

function toRecord(row: RecoveryEntryRow): RecoveryEntryRecord {
  return {
    id: row.id,
    date: row.date,
    sleepHours: row.sleepHours,
    sleepQuality: row.sleepQuality,
    readiness: row.readiness,
    soreness: row.soreness,
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

// drizzle-orm wraps the raw pg driver error (which carries `.code`, the
// Postgres SQLSTATE) in a `DrizzleQueryError` and exposes it as `.cause`
// rather than on the thrown error itself — check both shapes. Same helper
// shape as every other service in this codebase (exercises, programs,
// blocks, templates, sync) — deliberately not shared, matching that
// convention.
function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && isPostgresErrorCode(err.cause, code);
}

const CHECK_VIOLATION = "23514";

export async function listRecoveryEntries(
  db: AppDb,
  userId: string,
): Promise<RecoveryEntryRecord[]> {
  const rows = await db
    .select()
    .from(recoveryEntries)
    .where(eq(recoveryEntries.userId, userId))
    .orderBy(desc(recoveryEntries.date));
  return rows.map(toRecord);
}

// phase-7-review.md HIGH-1 — "determine today using the user's server-side
// timezone" and give the UI something to read back before it renders a
// check-in form, so it never re-prompts an already-logged day with
// synthetic defaults. Returns `null` when nothing is logged for today yet
// (the ordinary "nothing to read back" case, not an error).
export async function getTodayRecoveryEntry(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<RecoveryEntryRecord | null> {
  const date = userLocalDateString(await resolveUserTimezone(db, userId), now);
  const [row] = await db
    .select()
    .from(recoveryEntries)
    .where(and(eq(recoveryEntries.userId, userId), eq(recoveryEntries.date, date)));
  return row ? toRecord(row) : null;
}

// phase-7-review.md MEDIUM-1 — presence-aware upsert: a field the caller
// omits from the payload (`undefined`) must preserve whatever the row
// already holds; a field explicitly sent as `null` deliberately clears it;
// a field with a value sets it. This is expressed entirely through what
// does or doesn't appear in the `ON CONFLICT ... DO UPDATE SET` clause —
// Drizzle's `onConflictDoUpdate({ set })` only touches the columns actually
// present in `set`, so an omitted field is never written on the update path
// (it keeps the existing row's value untouched), while the INSERT path
// (a genuinely new day, nothing to preserve) still needs a concrete value
// for every column, hence the separate `insertValues` object below.
//
// This keeps the single-statement `INSERT ... ON CONFLICT DO UPDATE` this
// codebase's independent review confirmed is race-free under 8 concurrent
// first-inserts (no read-then-write window) — presence semantics are
// entirely a matter of *which columns appear in the SET clause*, not an
// additional query. The "at least one metric survives" invariant
// (`ck_recovery_entries_has_metric`) is enforced by Postgres itself on both
// the insert and the update path; a violation is caught below and mapped to
// `RecoveryEntryHasNoMetricError` rather than propagating as a raw 500 —
// this also correctly handles the race the review flagged as a
// theoretical risk of any pre-read validation (two concurrent calls that
// would each individually clear the last metric): whichever commits second
// is the one Postgres actually rejects, not a stale in-memory guess.
// `id` — Phase 8: same client-generated-id-honored-only-on-insert contract
// as logBodyweight above (src/server/bodyweight/service.ts), for the
// offline outbox sync-apply path.
export async function logRecovery(
  db: AppDb,
  userId: string,
  input: LogRecoveryInput,
  now: Date = new Date(),
  id: string = newId(),
): Promise<RecoveryEntryRecord> {
  const date = input.date ?? userLocalDateString(await resolveUserTimezone(db, userId), now);

  const insertValues: Pick<
    RecoveryEntryInsert,
    "sleepHours" | "sleepQuality" | "readiness" | "soreness" | "note"
  > = {
    sleepHours: input.sleepHours !== undefined ? input.sleepHours : null,
    sleepQuality: input.sleepQuality !== undefined ? input.sleepQuality : null,
    readiness: input.readiness !== undefined ? input.readiness : null,
    soreness: input.soreness !== undefined ? input.soreness : null,
    note: input.note !== undefined ? input.note : null,
  };

  const updateSet: Partial<RecoveryEntryInsert> = { updatedAt: new Date() };
  if (input.sleepHours !== undefined) updateSet.sleepHours = input.sleepHours;
  if (input.sleepQuality !== undefined) updateSet.sleepQuality = input.sleepQuality;
  if (input.readiness !== undefined) updateSet.readiness = input.readiness;
  if (input.soreness !== undefined) updateSet.soreness = input.soreness;
  if (input.note !== undefined) updateSet.note = input.note;

  try {
    const [row] = await db
      .insert(recoveryEntries)
      .values({ id, userId, date, ...insertValues })
      .onConflictDoUpdate({
        target: [recoveryEntries.userId, recoveryEntries.date],
        set: updateSet,
      })
      .returning();
    if (!row) throw new Error("Failed to log recovery entry");
    return toRecord(row);
  } catch (err) {
    if (!isPostgresErrorCode(err, CHECK_VIOLATION)) throw err;

    // phase-8-review.md HIGH-1 — a note-only or explicit-clear-only op
    // (every metric field this call actually touches is null/omitted) makes
    // the single-statement upsert's PROPOSED INSERT TUPLE all-null, and
    // Postgres validates ck_recovery_entries_has_metric against that
    // proposed tuple even when the DO UPDATE branch is what runs
    // (independently verified against Postgres 16) — a false rejection when
    // the row's OTHER, untouched metrics are what actually keep it valid. A
    // plain UPDATE has no proposed-tuple check: Postgres validates it against
    // the real post-merge row, so retrying as one here — instead of
    // pre-reading and backfilling the whole insert tuple, which reopens a
    // read-then-write window — gets the correct result in one atomic
    // statement, using the SAME presence-aware `updateSet` built above (only
    // this call's own touched fields, so it can't clobber a concurrent
    // update to a different metric). Zero rows affected means there was no
    // existing row to merge onto (a genuinely empty fresh day); a second
    // CHECK_VIOLATION here means this row's other metrics really were
    // already all null, i.e. this op would clear the last one — both are
    // real rejections, not artifacts of the retry, and neither leaves the
    // row modified.
    let updated: RecoveryEntryRow | undefined;
    try {
      [updated] = await db
        .update(recoveryEntries)
        .set(updateSet)
        .where(and(eq(recoveryEntries.userId, userId), eq(recoveryEntries.date, date)))
        .returning();
    } catch (updateErr) {
      if (isPostgresErrorCode(updateErr, CHECK_VIOLATION))
        throw new RecoveryEntryHasNoMetricError();
      throw updateErr;
    }
    if (!updated) throw new RecoveryEntryHasNoMetricError();
    return toRecord(updated);
  }
}

export async function updateRecoveryEntry(
  db: AppDb,
  userId: string,
  id: string,
  input: UpdateRecoveryInput,
): Promise<RecoveryEntryRecord> {
  const [existing] = await db
    .select()
    .from(recoveryEntries)
    .where(and(eq(recoveryEntries.id, id), eq(recoveryEntries.userId, userId)));
  if (!existing) throw new RecoveryEntryNotFoundError();

  const merged = {
    sleepHours: input.sleepHours !== undefined ? input.sleepHours : existing.sleepHours,
    sleepQuality: input.sleepQuality !== undefined ? input.sleepQuality : existing.sleepQuality,
    readiness: input.readiness !== undefined ? input.readiness : existing.readiness,
    soreness: input.soreness !== undefined ? input.soreness : existing.soreness,
  };
  if (
    merged.sleepHours === null &&
    merged.sleepQuality === null &&
    merged.readiness === null &&
    merged.soreness === null
  ) {
    throw new RecoveryEntryHasNoMetricError();
  }

  const patch: Partial<RecoveryEntryInsert> = { ...merged, updatedAt: new Date() };
  if (input.note !== undefined) patch.note = input.note;

  const [row] = await db
    .update(recoveryEntries)
    .set(patch)
    .where(eq(recoveryEntries.id, id))
    .returning();
  if (!row) throw new Error("Failed to update recovery entry");
  return toRecord(row);
}

export async function deleteRecoveryEntry(db: AppDb, userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(recoveryEntries)
    .where(and(eq(recoveryEntries.id, id), eq(recoveryEntries.userId, userId)))
    .returning({ id: recoveryEntries.id });
  if (deleted.length === 0) throw new RecoveryEntryNotFoundError();
}
