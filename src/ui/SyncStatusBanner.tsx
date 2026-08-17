"use client";

import { useEffect } from "react";
import { useSyncStatusStore } from "@/sync/syncStatusStore";
import { useActiveSessionStore } from "@/sync/activeSessionStore";

const POLL_MS = 5000;

// BLOCKER-2/MEDIUM-7 — a persistent (non-auto-dismissing) strip surfacing
// what flushOutbox() can't fix by itself: permanently rejected ops
// (pwa-offline-strategy.md §6's dead-letter case) and ops retained because
// auth expired (§7's "sign in to sync" case). Renders nothing when there's
// nothing to report — "persistent" means it never silently disappears once
// shown, not that it's always-on chrome. Mounted once alongside
// SyncBootstrap so it's visible from every authenticated page.
export function SyncStatusBanner() {
  const deadLetterOps = useSyncStatusStore((s) => s.deadLetterOps);
  const authRequired = useSyncStatusStore((s) => s.authRequired);
  const refreshDeadLetters = useSyncStatusStore((s) => s.refreshDeadLetters);
  const discardAllDeadLetters = useSyncStatusStore((s) => s.discardAllDeadLetters);
  const refreshSessionBlocked = useActiveSessionStore((s) => s.refreshSessionBlocked);

  useEffect(() => {
    void refreshDeadLetters();
    void refreshSessionBlocked();
    const interval = setInterval(() => {
      void refreshDeadLetters();
      void refreshSessionBlocked();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshDeadLetters, refreshSessionBlocked]);

  if (!authRequired && deadLetterOps.length === 0) return null;

  return (
    <div className="mx-auto mb-4 flex w-full max-w-sm flex-col gap-2">
      {authRequired && (
        <p className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
          Sign in to sync your changes.
        </p>
      )}
      {deadLetterOps.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
          <span>
            {deadLetterOps.length} change{deadLetterOps.length === 1 ? "" : "s"} couldn&apos;t sync
            {deadLetterOps[0]?.deadReason ? ` (${deadLetterOps[0].deadReason})` : ""}.
          </span>
          <button
            type="button"
            onClick={() => void discardAllDeadLetters()}
            className="shrink-0 rounded border border-red-700 px-2 py-1 text-red-200"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
