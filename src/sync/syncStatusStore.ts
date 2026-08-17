import { create } from "zustand";
import { listDeadLetterOps, discardDeadLetter } from "./outbox";
import type { OutboxOpRecord } from "./db";

// BLOCKER-2/MEDIUM-7 — a reactive mirror of the two sync conditions the
// outbox can't resolve on its own: ops the server permanently rejected
// (dead letters, pwa-offline-strategy.md §6) and ops retained because auth
// expired (§7). flush.ts updates this on every flush cycle; SyncStatusBanner
// renders it. IndexedDB (via outbox.ts) remains the source of truth for
// dead letters — this store is just what the UI polls/reads.
interface SyncStatusState {
  deadLetterOps: OutboxOpRecord[];
  authRequired: boolean;
  refreshDeadLetters: () => Promise<void>;
  setAuthRequired: (authRequired: boolean) => void;
  discardAllDeadLetters: () => Promise<void>;
}

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  deadLetterOps: [],
  authRequired: false,
  refreshDeadLetters: async () => {
    const deadLetterOps = await listDeadLetterOps();
    set({ deadLetterOps });
  },
  setAuthRequired: (authRequired) => set({ authRequired }),
  discardAllDeadLetters: async () => {
    const ops = get().deadLetterOps;
    await Promise.all(ops.map((op) => discardDeadLetter(op.opId)));
    set({ deadLetterOps: [] });
  },
}));
