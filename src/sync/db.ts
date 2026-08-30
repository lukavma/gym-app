import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SyncEntity, SyncOperation } from "@/domain/sync/schema";
import type { ActiveSessionDto, RecoveryEntrySnapshot, TodayBundleDto } from "./types";
import { useIdbUpgradeStore } from "./idbUpgradeStore";

// pwa-offline-strategy.md §3 — one IndexedDB database. Three stores from
// Phase 3: activeSession (the in-progress session aggregate), outbox
// (append-only mutation queue), bundleCache (last-fetched today-bundle for
// offline Today). Dead-lettered ops are not a fourth store — they're outbox
// rows with status "dead", kept for the sync-issues screen (Phase 8, §6).
//
// Phase 8 adds a fifth store, dailyLogCache: the last CONFIRMED (server- or
// cache-verified, never merely locally-guessed) bodyweight/recovery
// read-per-day, so a same-day offline reload of the recovery quick-log card
// can tell "no entry yet" from "an entry exists with these values" without
// risking the fabricate/overwrite failure mode a wrong guess would cause —
// see src/sync/dailyLogs.ts.
const DB_NAME = "gym-app";
const DB_VERSION = 2;

const ACTIVE_SESSION_KEY = "current";
const BUNDLE_CACHE_KEY = "current";

export type OutboxOpStatus = "pending" | "dead";

export interface OutboxOpRecord {
  opId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  createdAt: string;
  tries: number;
  status: OutboxOpStatus;
  deadReason?: string;
}

// What a caller supplies to enqueue an op — the bookkeeping fields
// (createdAt/tries/status) are filled in by buildOutboxRecord, never by the
// caller, so every enqueued op starts pending.
//
// phase-8-review.md B-1 — this record used to also carry a per-op
// `nextAttemptAt`, computed independently for every op on every failure and
// used by listPendingOps to decide eligibility. That made "pending" an
// arbitrary, re-sorted subset instead of a queue — see outbox.ts's
// listPendingOps and flush.ts's batch-level `nextFlushAllowedAt` gate,
// which now owns backoff timing instead. `tries` remains — purely
// informational (shown on the dead-letter screen), never used to decide
// what gets sent or when.
export interface OutboxOpInput {
  opId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}

export function buildOutboxRecord(input: OutboxOpInput): OutboxOpRecord {
  const now = new Date().toISOString();
  return {
    opId: input.opId,
    entity: input.entity,
    operation: input.operation,
    payload: input.payload,
    createdAt: now,
    tries: 0,
    status: "pending",
  };
}

export interface BundleCacheRecord {
  bundle: TodayBundleDto;
  fetchedAt: string;
}

// Only ever written from a CONFIRMED read (a successful /api/recovery/today
// fetch, or a save made from an already-confirmed state) — never from a
// merely-guessed/ambiguous offline state. `entry: null` is itself a
// confirmed fact ("today has no entry"), distinct from "no cache row at
// all" (unknown). Keyed by a fixed string per kind; only "recoveryToday" is
// used today (bodyweight's quick-log has no read-before-write ambiguity to
// resolve — see src/sync/dailyLogs.ts).
export interface DailyLogCacheRecord {
  date: string;
  entry: RecoveryEntrySnapshot | null;
  fetchedAt: string;
}

interface GymAppDBSchema extends DBSchema {
  activeSession: {
    key: string;
    value: ActiveSessionDto;
  };
  outbox: {
    key: string;
    value: OutboxOpRecord;
    indexes: { byCreatedAt: string };
  };
  bundleCache: {
    key: string;
    value: BundleCacheRecord;
  };
  dailyLogCache: {
    key: string;
    value: DailyLogCacheRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<GymAppDBSchema>> | undefined;

// phase-8-review.md MEDIUM-4 — without `blocked`/`blocking`, a second
// connection left open on an older schema version (another tab that hasn't
// reloaded since an app update bumped DB_VERSION) made a new connection's
// upgrade transaction block forever with no error, no timeout, and nothing
// observable — every IndexedDB read/write via getIdb() just silently never
// resolved. `blocked` fires on the (this) NEW connection's own open request
// when some other, already-open, older connection is what's in its way —
// surfaced via idbUpgradeStore so the UI can tell the user to close other
// tabs rather than watch what looks like a hang. `blocking` fires on an
// EXISTING open connection when IT is the one standing in a newer version's
// way elsewhere — closing it here is what actually unblocks that other
// connection's upgrade (and, per the idb/IndexedDB contract, is the
// expected response to receive `blocking` at all).
export function getIdb(): Promise<IDBPDatabase<GymAppDBSchema>> {
  if (!dbPromise) {
    // Captured synchronously once the connection opens, so `blocking` below
    // (which can only ever fire on an already-open connection — never
    // before `.then()` here has run) can close it directly rather than
    // going through `dbPromise` a second time, whose `.then()` would add an
    // extra microtask of delay before the close actually happens.
    let resolvedDb: IDBPDatabase<GymAppDBSchema> | undefined;
    dbPromise = openDB<GymAppDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Guarded so this same upgrade callback correctly handles both a
        // fresh install (jumps straight to DB_VERSION=2, nothing exists
        // yet) and an in-place upgrade from the Phase 3 v1 database (the
        // first three stores already exist and must be left untouched).
        if (!db.objectStoreNames.contains("activeSession")) {
          db.createObjectStore("activeSession");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "opId" });
          outbox.createIndex("byCreatedAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("bundleCache")) {
          db.createObjectStore("bundleCache");
        }
        if (!db.objectStoreNames.contains("dailyLogCache")) {
          db.createObjectStore("dailyLogCache");
        }
      },
      blocked() {
        useIdbUpgradeStore.getState().setBlocked(true);
      },
      blocking() {
        resolvedDb?.close();
        // A future getIdb() call in this tab must reopen fresh rather than
        // keep returning this now-closed connection.
        dbPromise = undefined;
      },
    }).then((db) => {
      resolvedDb = db;
      useIdbUpgradeStore.getState().setBlocked(false);
      return db;
    });
  }
  return dbPromise;
}

export interface SessionMutationWrite {
  // undefined = leave the activeSession store untouched (e.g. discarding a
  // foreign session this device never held locally); null = delete the
  // local aggregate (complete/discard of the local session); a DTO = put it.
  session?: ActiveSessionDto | null;
  ops: OutboxOpInput[];
}

// HIGH-1 — the local aggregate write and every outbox append it implies
// must commit together in one IndexedDB transaction, so a process death
// between them can never leave a set that's visible in the UI (because
// activeSession was written) but will never sync (because outbox wasn't).
// All seven session mutators in this file route through this.
export async function commitSessionMutation(write: SessionMutationWrite): Promise<void> {
  const db = await getIdb();
  const tx = db.transaction(["activeSession", "outbox"], "readwrite");
  const writes: Promise<unknown>[] = [];
  if (write.session !== undefined) {
    writes.push(
      write.session === null
        ? tx.objectStore("activeSession").delete(ACTIVE_SESSION_KEY)
        : tx.objectStore("activeSession").put(write.session, ACTIVE_SESSION_KEY),
    );
  }
  for (const op of write.ops) {
    writes.push(tx.objectStore("outbox").put(buildOutboxRecord(op)));
  }
  await Promise.all(writes);
  await tx.done;
}

export { ACTIVE_SESSION_KEY, BUNDLE_CACHE_KEY };
