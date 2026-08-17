import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SyncEntity, SyncOperation } from "@/domain/sync/schema";
import type { ActiveSessionDto, TodayBundleDto } from "./types";

// pwa-offline-strategy.md §3 — one IndexedDB database, three stores:
// activeSession (the in-progress session aggregate), outbox (append-only
// mutation queue), bundleCache (last-fetched today-bundle for offline
// Today). Dead-lettered ops are not a fourth store — they're outbox rows
// with status "dead", kept for the sync-issues screen per §6.
const DB_NAME = "gym-app";
const DB_VERSION = 1;

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
  nextAttemptAt: string;
  status: OutboxOpStatus;
  deadReason?: string;
}

// What a caller supplies to enqueue an op — the bookkeeping fields
// (createdAt/tries/nextAttemptAt/status) are filled in by buildOutboxRecord,
// never by the caller, so every enqueued op starts pending and immediately
// eligible.
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
    nextAttemptAt: now,
    status: "pending",
  };
}

export interface BundleCacheRecord {
  bundle: TodayBundleDto;
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
}

let dbPromise: Promise<IDBPDatabase<GymAppDBSchema>> | undefined;

export function getIdb(): Promise<IDBPDatabase<GymAppDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<GymAppDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("activeSession");
        const outbox = db.createObjectStore("outbox", { keyPath: "opId" });
        outbox.createIndex("byCreatedAt", "createdAt");
        db.createObjectStore("bundleCache");
      },
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
