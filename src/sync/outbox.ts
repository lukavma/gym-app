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
// matching pwa-offline-strategy.md §5's ordering requirement.
//
// phase-8-review.md B-1 — this used to ALSO filter on a per-op
// `nextAttemptAt`, so after any failed flush the "pending" set became
// whichever ops' own independently-jittered deadlines happened to have
// elapsed: a later op could become eligible while an earlier one was still
// backing off, and since every op is a full-row upsert or an
// idempotent-by-absence delete, sending them out of order is not
// idempotent — an insert arriving after its own edit reverts the edit; a
// delete arriving before its insert lets the insert resurrect it. Backoff
// is now enforced at the BATCH level instead (src/sync/flush.ts's
// `nextFlushAllowedAt` gate, checked before this function is ever called),
// so this function has exactly one job — return every pending op, oldest
// first — and never reorders or drops a subset of them.
export async function listPendingOps(limit = 50): Promise<OutboxOpRecord[]> {
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.filter((op) => op.status === "pending").slice(0, limit);
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

// Phase 8 sync-issues screen — "retry without altering its payload":
// flips the op back to pending, touching nothing else. `payload` is never
// rewritten here, and `tries` is deliberately left as-is (not reset to 0)
// — it's a record of how many times this exact op has already failed, which
// resetting it on every manual retry would quietly erase. `createdAt` is
// also left as-is: FIFO position is meaningful for ops still in the normal
// flow, but a dead-lettered op already left that flow (it was rejected, not
// merely delayed) — re-queuing it at its original chronological position is
// a deliberate, narrow exception the batch-level FIFO gate in flush.ts
// doesn't need to reason about, since a manual retry is a rare, explicit
// user action, not part of the automatic flush cycle.
export async function retryDeadLetterOp(opId: string): Promise<void> {
  const db = await getIdb();
  const existing = await db.get("outbox", opId);
  if (!existing) return;
  await db.put("outbox", {
    opId: existing.opId,
    entity: existing.entity,
    operation: existing.operation,
    payload: existing.payload,
    createdAt: existing.createdAt,
    tries: existing.tries,
    status: "pending",
  });
}

// Purely informational (shown as "N attempts" on the dead-letter screen) —
// see the B-1 comment on OutboxOpInput in db.ts for why this no longer
// computes a per-op retry deadline.
export async function markTried(opId: string): Promise<void> {
  const db = await getIdb();
  const existing = await db.get("outbox", opId);
  if (!existing) return;
  await db.put("outbox", { ...existing, tries: existing.tries + 1 });
}
