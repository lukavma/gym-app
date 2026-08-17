"use client";

import { useEffect } from "react";
import { installFlushTriggers } from "@/sync/flush";

// Mounted once from the authenticated layout so outbox flush triggers
// (foreground, reconnect, timer — pwa-offline-strategy.md §5) run across
// every page, not just whichever one happens to touch the sync layer.
export function SyncBootstrap() {
  useEffect(() => installFlushTriggers(), []);

  useEffect(() => {
    // MEDIUM-4 (pwa-offline-strategy.md §3): "On app start:
    // navigator.storage.persist() requested." Best-effort — feature-detected
    // (Safari/older browsers may lack it), fire-and-forget (a denied or
    // rejected request must not block anything else at app start), and the
    // browser may prompt or auto-grant/deny without any action needed here.
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      void navigator.storage.persist();
    }
  }, []);

  return null;
}
