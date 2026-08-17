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
      await Promise.all(pending.map((op) => markTried(op.opId)));
      scheduleRetry(nextBackoffDelayMs(pending[0]!.tries + 1));
      return { attempted: pending.length, applied: 0, rejected: 0 };
    }

    if (response.status === 401) {
      // Auth expired: ops stay queued exactly as-is until re-auth
      // (pwa-offline-strategy.md §7) — do not mark tried, do not dead-letter.
      // MEDIUM-7: surface this so the UI can show "sign in to sync" instead
      // of silently retrying every 30s with no visible state.
      scheduleRetry(30_000);
      useSyncStatusStore.getState().setAuthRequired(true);
      return { attempted: pending.length, applied: 0, rejected: 0 };
    }

    if (!response.ok) {
      await Promise.all(pending.map((op) => markTried(op.opId)));
      scheduleRetry(nextBackoffDelayMs(1));
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
    await Promise.all(untouched.map((op) => markTried(op.opId)));

    if (pending.length === BATCH_SIZE || untouched.length > 0) scheduleRetry(0);

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
