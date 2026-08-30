import { create } from "zustand";
import { listDeadLetterOps } from "./outbox";
import type { OutboxOpRecord } from "./db";

// Phase 8 — navigator.storage.persist()'s result, surfaced (SyncBootstrap
// sets this once at app start; pwa-offline-strategy.md §3/MEDIUM-4 only
// required making the request, not showing what it returned). "unavailable"
// covers browsers with no Storage API (feature-detected, not thrown).
export type StoragePersistStatus = "checking" | "granted" | "denied" | "unavailable";

// BLOCKER-2/MEDIUM-7 — a reactive mirror of the two sync conditions the
// outbox can't resolve on its own: ops the server permanently rejected
// (dead letters, pwa-offline-strategy.md §6) and ops retained because auth
// expired (§7). flush.ts updates this on every flush cycle; SyncStatusBanner
// renders it. IndexedDB (via outbox.ts) remains the source of truth for
// dead letters — this store is just what the UI polls/reads. Per-op
// retry/discard (never a bulk one-click discard — "never silently delete
// unsyncable data") lives on the dedicated /sync-issues screen, not here.
interface SyncStatusState {
  deadLetterOps: OutboxOpRecord[];
  authRequired: boolean;
  storagePersist: StoragePersistStatus;
  refreshDeadLetters: () => Promise<void>;
  setAuthRequired: (authRequired: boolean) => void;
  setStoragePersist: (status: StoragePersistStatus) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  deadLetterOps: [],
  authRequired: false,
  storagePersist: "checking",
  refreshDeadLetters: async () => {
    const deadLetterOps = await listDeadLetterOps();
    set({ deadLetterOps });
  },
  setAuthRequired: (authRequired) => set({ authRequired }),
  setStoragePersist: (storagePersist) => set({ storagePersist }),
}));
