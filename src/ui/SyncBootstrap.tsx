"use client";

import { useEffect } from "react";
import { installFlushTriggers } from "@/sync/flush";
import { useSyncStatusStore } from "@/sync/syncStatusStore";

// Mounted once from the authenticated layout so outbox flush triggers
// (foreground, reconnect, timer — pwa-offline-strategy.md §5) run across
// every page, not just whichever one happens to touch the sync layer.
export function SyncBootstrap() {
  useEffect(() => installFlushTriggers(), []);

  useEffect(() => {
    // MEDIUM-4 (pwa-offline-strategy.md §3): "On app start:
    // navigator.storage.persist() requested." Best-effort — feature-detected
    // (Safari/older browsers may lack it), fire-and-forget in the sense that
    // a denied/rejected request must not block anything else at app start —
    // but Phase 8 requires surfacing the outcome (granted/denied/
    // unavailable), not just discarding it, so the result now updates
    // syncStatusStore for SyncStatusBanner to render.
    const setStoragePersist = useSyncStatusStore.getState().setStoragePersist;
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
      setStoragePersist("unavailable");
      return;
    }
    navigator.storage
      .persist()
      .then((granted) => setStoragePersist(granted ? "granted" : "denied"))
      .catch(() => setStoragePersist("denied"));
  }, []);

  return null;
}
