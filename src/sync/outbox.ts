import { buildOutboxRecord, getIdb, type OutboxOpInput, type OutboxOpRecord } from "./db";

// pwa-offline-strategy.md §5 — exponential backoff with jitter, capped at
// 60s on the client.
const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 1000;

export function nextBackoffDelayMs(tries: number): number {
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** tries, MAX_BACKOFF_MS);
  const jitter = Math.random() * exp * 0.2;
  return Math.min(exp + jitter, MAX_BACKOFF_MS);
}

// Single-op convenience wrapper around buildOutboxRecord for callers that
// don't need the atomic activeSession+outbox transaction (currently just
// src/sync/corrections.ts, which enqueues post-completion corrections with
// no local aggregate to touch). Session mutators in activeSession.ts go
// through db.ts's commitSessionMutation instead, per HIGH-1.
export async function enqueueOp(input: OutboxOpInput): Promise<void> {
  const db = await getIdb();
  await db.put("outbox", buildOutboxRecord(input));
}

// Finding D — several ops that only make sense together (a set deletion plus
// the renumbering of its siblings) enqueued in one IndexedDB transaction, so
// a process death mid-write can't leave the queue holding the delete without
// the renumbering. Insertion order is preserved by createdAt/opId, both
// monotonic, which is what listPendingOps orders by.
export async function enqueueOps(inputs: readonly OutboxOpInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const db = await getIdb();
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all(inputs.map((input) => tx.store.put(buildOutboxRecord(input))));
  await tx.done;
}

// FIFO — `byCreatedAt` index returns rows in ascending creation order,
// matching pwa-offline-strategy.md §5's ordering requirement. MEDIUM-2:
// backoff is only meaningful if respected here — a pending op whose
// nextAttemptAt is still in the future must not be returned, or the
// exponential delay markTried() computes is never actually enforced.
export async function listPendingOps(limit = 50): Promise<OutboxOpRecord[]> {
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  const now = new Date().toISOString();
  return all.filter((op) => op.status === "pending" && op.nextAttemptAt <= now).slice(0, limit);
}

export async function listDeadLetterOps(): Promise<OutboxOpRecord[]> {
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.filter((op) => op.status === "dead");
}

export async function hasPendingOps(): Promise<boolean> {
  const pending = await listPendingOps(1);
  return pending.length > 0;
}

export async function removeApplied(opIds: readonly string[]): Promise<void> {
  if (opIds.length === 0) return;
  const db = await getIdb();
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all(opIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function markDeadLetter(opId: string, reason: string): Promise<void> {
  const db = await getIdb();
  const existing = await db.get("outbox", opId);
  if (!existing) return;
  await db.put("outbox", { ...existing, status: "dead", deadReason: reason });
}

// Lets the user explicitly clear a dead-lettered op from the sync-issues
// screen (pwa-offline-strategy.md §6) — never automatic.
export async function discardDeadLetter(opId: string): Promise<void> {
  const db = await getIdb();
  await db.delete("outbox", opId);
}

export async function markTried(opId: string): Promise<void> {
  const db = await getIdb();
  const existing = await db.get("outbox", opId);
  if (!existing) return;
  const tries = existing.tries + 1;
  const nextAttemptAt = new Date(Date.now() + nextBackoffDelayMs(tries)).toISOString();
  await db.put("outbox", { ...existing, tries, nextAttemptAt });
}
