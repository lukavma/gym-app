import {
  listPendingOps,
  removeApplied,
  markDeadLetter,
  markTried,
  nextBackoffDelayMs,
} from "./outbox";
import { useSyncStatusStore } from "./syncStatusStore";
import type { SyncOpEnvelope } from "@/domain/sync/schema";

const BATCH_SIZE = 50;

export interface FlushResult {
  attempted: number;
  applied: number;
  rejected: number;
}

const IDLE_RESULT: FlushResult = { attempted: 0, applied: 0, rejected: 0 };

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

// phase-8-review.md B-1 — backoff is now a property of the QUEUE, not of
// any individual op: `queueTries` counts consecutive whole-batch failures
// (network throw, non-2xx, or the server leaving some op unclassified) and
// `nextFlushAllowedAt` is the single deadline every trigger (interval,
// `online`, mutation, manual) is gated on — checked once, at the very top
// of this function, before `listPendingOps` is even called. This makes
// "which ops are eligible" purely a function of FIFO order (oldest first,
// no per-op filtering), so a batch either goes out complete and in order or
// not at all; there is no way for a later op to become independently
// eligible while an earlier one is still backing off. A success (any
// response the server actually classified) resets the counter — the
// exponential delay only ever grows across genuinely consecutive failures.
let queueTries = 0;
let nextFlushAllowedAt = 0;

function backOffQueue(delayMs: number): void {
  queueTries += 1;
  nextFlushAllowedAt = Date.now() + delayMs;
  scheduleRetry(delayMs);
}

interface SyncApiResponse {
  applied: string[];
  rejected: { opId: string; entity: string; reason: string }[];
}

// pwa-offline-strategy.md §5/§6 — FIFO batched flush: POST pending ops,
// remove applied, dead-letter rejected (never silently dropped), retain
// anything the server didn't classify (network/5xx/401) for retry with
// backoff. One flush in flight at a time; callers fire-and-forget this.
export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return IDLE_RESULT;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return IDLE_RESULT;
  if (Date.now() < nextFlushAllowedAt) return IDLE_RESULT;

  flushing = true;
  try {
    const pending = await listPendingOps(BATCH_SIZE);
    if (pending.length === 0) return IDLE_RESULT;

    const ops: SyncOpEnvelope[] = pending.map((op) => ({
      opId: op.opId,
      entity: op.entity,
      operation: op.operation,
      payload: op.payload,
    }));

    let response: Response;
    try {
      response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops }),
      });
    } catch {
      // Informational only (see markTried's own comment) — never used to
      // decide what's sent or when; the whole BATCH backs off together.
      await Promise.all(pending.map((op) => markTried(op.opId)));
      backOffQueue(nextBackoffDelayMs(queueTries + 1));
      return { attempted: pending.length, applied: 0, rejected: 0 };
    }

    if (response.status === 401) {
      // Auth expired: ops stay queued exactly as-is until re-auth
      // (pwa-offline-strategy.md §7) — do not mark tried, do not dead-letter.
      // MEDIUM-7: surface this so the UI can show "sign in to sync" instead
      // of silently retrying every 30s with no visible state. A fixed
      // interval, not the exponential queue backoff — this isn't a failure
      // streak, it's "come back once the user has logged in".
      nextFlushAllowedAt = Date.now() + 30_000;
      scheduleRetry(30_000);
      useSyncStatusStore.getState().setAuthRequired(true);
      return { attempted: pending.length, applied: 0, rejected: 0 };
    }

    if (!response.ok) {
      await Promise.all(pending.map((op) => markTried(op.opId)));
      backOffQueue(nextBackoffDelayMs(queueTries + 1));
      return { attempted: pending.length, applied: 0, rejected: 0 };
    }

    // Reaching here means the server accepted the request (even if it then
    // rejected individual ops) — auth is good, clear any stale "sign in to
    // sync" state from an earlier 401.
    useSyncStatusStore.getState().setAuthRequired(false);

    const result = (await response.json()) as SyncApiResponse;
    await removeApplied(result.applied);
    await Promise.all(result.rejected.map((r) => markDeadLetter(r.opId, r.reason)));
    if (result.rejected.length > 0) void useSyncStatusStore.getState().refreshDeadLetters();

    const handledIds = new Set([...result.applied, ...result.rejected.map((r) => r.opId)]);
    const untouched = pending.filter((op) => !handledIds.has(op.opId));

    if (untouched.length > 0) {
      // The server responded but left some op unclassified — a genuine
      // anomaly, treated the same as any other whole-batch failure: back
      // off together rather than let the classified ops' success mask it.
      await Promise.all(untouched.map((op) => markTried(op.opId)));
      backOffQueue(nextBackoffDelayMs(queueTries + 1));
    } else {
      queueTries = 0;
      nextFlushAllowedAt = 0;
      if (pending.length === BATCH_SIZE) scheduleRetry(0);
    }

    return {
      attempted: pending.length,
      applied: result.applied.length,
      rejected: result.rejected.length,
    };
  } finally {
    flushing = false;
  }
}

function scheduleRetry(delayMs: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void flushOutbox(), delayMs);
}

let triggersInstalled = false;

// Wires the trigger points pwa-offline-strategy.md §5 specifies: app
// foreground, reconnect, a timer, plus an initial kick. Mutators
// additionally call flushOutbox() directly after enqueueing (post-mutation
// trigger) — see activeSession.ts.
export function installFlushTriggers(intervalMs = 5000): () => void {
  if (typeof window === "undefined" || triggersInstalled) return () => {};
  triggersInstalled = true;

  const onOnline = () => void flushOutbox();
  const onVisibility = () => {
    if (document.visibilityState === "visible") void flushOutbox();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  const interval = setInterval(() => void flushOutbox(), intervalMs);
  void flushOutbox();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(interval);
    triggersInstalled = false;
  };
}
