import { newId } from "@/domain/ids/uuidv7";
import { userLocalDateString } from "@/domain/time/localDate";
import { getAccountTimezone } from "./accountTimezone";
import { enqueueOp } from "./outbox";
import { flushOutbox } from "./flush";
import { getIdb } from "./db";
import type { RecoveryEntrySnapshot } from "./types";

const RECOVERY_TODAY_CACHE_KEY = "recoveryToday";

// phase-8-review.md B-3 — thrown instead of ever falling back to the
// device's own resolved zone: writing to a device-guessed day can silently
// land on the wrong calendar day whenever the device and account zones
// disagree, exactly the defect this remediates. Callers must surface this,
// not swallow it into a generic save failure.
export class UnknownAccountTimezoneError extends Error {
  constructor() {
    super(
      "This device doesn't know the account's timezone yet — connect online once before logging offline.",
    );
    this.name = "UnknownAccountTimezoneError";
  }
}

async function resolveTodayDate(): Promise<string> {
  const timezone = await getAccountTimezone();
  if (timezone === null) throw new UnknownAccountTimezoneError();
  return userLocalDateString(timezone);
}

// pwa-offline-strategy.md §2 capability matrix — "Log bodyweight/recovery:
// same outbox mechanism, trivial payloads". Scoped deliberately narrow: only
// the day-upsert quick-log widgets (BodyweightQuickLog, RecoveryCheckIn —
// shared between the Today card and the /bodyweight and /recovery screens)
// go through the outbox. The separate BodyweightHistoryList/
// RecoveryHistoryList screens (arbitrary-past-date edit/delete by id) stay
// plain online REST — see docs/reviews/phase-8-implementation.md for the
// rationale.
//
// Local commit + outbox enqueue, same invariant as session facts
// (activeSession.ts): both must be durable before the caller's UI shows
// success. Since there's no local aggregate analogous to activeSession for
// these two entities, "local commit" is the dailyLogCache write a caller
// performs itself after a known-state save (see RecoveryCheckIn.tsx) — this
// module only owns the outbox half.

export async function logBodyweightToday(input: { weightKg: number; note?: string }): Promise<{
  id: string;
  date: string;
}> {
  const date = await resolveTodayDate();
  const id = newId();
  const payload: Record<string, unknown> = { id, date, weightKg: input.weightKg };
  if (input.note !== undefined) payload.note = input.note;

  await enqueueOp({ opId: newId(), entity: "bodyweightEntry", operation: "upsert", payload });
  void flushOutbox();
  return { id, date };
}

export interface LogRecoveryTodayInput {
  sleepQuality?: number | null;
  readiness?: number | null;
  soreness?: number | null;
  note?: string | null;
}

// Only fields actually present on `input` are sent (undefined = omit =
// "preserve whatever this day's row already holds", per the presence-aware
// contract recoveryEntryUpsertPayloadSchema/logRecovery already implement) —
// callers (RecoveryCheckIn.tsx) build this object to include only what the
// user actually touched, which is what makes the ambiguous-offline case
// (§ dailyLogCache below) safe: an untouched field is never fabricated or
// dropped, because it's never in the payload at all.
export async function logRecoveryToday(input: LogRecoveryTodayInput): Promise<{
  id: string;
  date: string;
}> {
  const date = await resolveTodayDate();
  const id = newId();
  const payload: Record<string, unknown> = { id, date };
  if (input.sleepQuality !== undefined) payload.sleepQuality = input.sleepQuality;
  if (input.readiness !== undefined) payload.readiness = input.readiness;
  if (input.soreness !== undefined) payload.soreness = input.soreness;
  if (input.note !== undefined) payload.note = input.note;

  await enqueueOp({ opId: newId(), entity: "recoveryEntry", operation: "upsert", payload });
  void flushOutbox();
  return { id, date };
}

// dailyLogCache — see src/sync/db.ts's DailyLogCacheRecord doc comment.
// Only ever written from a confirmed read or a save made from a confirmed
// state (never from the ambiguous-offline path), and only ever trusted back
// when its `date` matches today — a stale (yesterday's) cache is treated as
// "unknown", not silently reused.
export async function getCachedRecoveryToday(
  date: string,
): Promise<RecoveryEntrySnapshot | null | undefined> {
  const db = await getIdb();
  const record = await db.get("dailyLogCache", RECOVERY_TODAY_CACHE_KEY);
  if (!record || record.date !== date) return undefined;
  return record.entry;
}

export async function setCachedRecoveryToday(
  date: string,
  entry: RecoveryEntrySnapshot | null,
): Promise<void> {
  const db = await getIdb();
  await db.put(
    "dailyLogCache",
    { date, entry, fetchedAt: new Date().toISOString() },
    RECOVERY_TODAY_CACHE_KEY,
  );
}
