"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSyncStatusStore } from "@/sync/syncStatusStore";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { useIdbUpgradeStore } from "@/sync/idbUpgradeStore";

const POLL_MS = 5000;

// BLOCKER-2/MEDIUM-7 — a persistent (non-auto-dismissing) strip surfacing
// what flushOutbox() can't fix by itself: permanently rejected ops
// (pwa-offline-strategy.md §6's dead-letter case) and ops retained because
// auth expired (§7's "sign in to sync" case). Renders nothing when there's
// nothing to report — "persistent" means it never silently disappears once
// shown, not that it's always-on chrome. Mounted once alongside
// SyncBootstrap so it's visible from every authenticated page.
//
// Phase 8 — the dead-letter line used to carry its own one-click bulk
// "Discard" button, which is exactly the un-double-confirmed bulk delete
// the phase's own requirements rule out ("never silently delete unsyncable
// data"). It now only links to the dedicated /sync-issues screen, which
// inspects each op individually and requires two taps to discard any one of
// them (never a bulk action) — see src/app/(app)/sync-issues/page.tsx.
// Also surfaces navigator.storage.persist()'s outcome (SyncBootstrap sets
// it) when it's anything other than "granted" — quiet in the common case,
// visible when storage durability can't be relied on.
export function SyncStatusBanner() {
  const deadLetterOps = useSyncStatusStore((s) => s.deadLetterOps);
  const authRequired = useSyncStatusStore((s) => s.authRequired);
  const storagePersist = useSyncStatusStore((s) => s.storagePersist);
  const refreshDeadLetters = useSyncStatusStore((s) => s.refreshDeadLetters);
  const refreshSessionBlocked = useActiveSessionStore((s) => s.refreshSessionBlocked);
  const idbBlocked = useIdbUpgradeStore((s) => s.blocked);

  useEffect(() => {
    void refreshDeadLetters();
    void refreshSessionBlocked();
    const interval = setInterval(() => {
      void refreshDeadLetters();
      void refreshSessionBlocked();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshDeadLetters, refreshSessionBlocked]);

  const showStoragePersistWarning = storagePersist === "denied" || storagePersist === "unavailable";

  if (!authRequired && deadLetterOps.length === 0 && !showStoragePersistWarning && !idbBlocked) {
    return null;
  }

  return (
    <div className="mx-auto mb-4 flex w-full max-w-sm flex-col gap-2">
      {idbBlocked && (
        <p className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
          Waiting on another open tab of this app to update — close it to continue.
        </p>
      )}
      {authRequired && (
        <p className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
          Sign in to sync your changes.
        </p>
      )}
      {deadLetterOps.length > 0 && (
        <Link
          href="/sync-issues"
          className="flex items-center justify-between gap-2 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300"
        >
          <span>
            {deadLetterOps.length} change{deadLetterOps.length === 1 ? "" : "s"} couldn&apos;t sync
            {deadLetterOps[0]?.deadReason ? ` (${deadLetterOps[0].deadReason})` : ""}.
          </span>
          <span className="shrink-0 underline">Review</span>
        </Link>
      )}
      {showStoragePersistWarning && (
        <p className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400">
          {storagePersist === "unavailable"
            ? "This browser doesn't support persistent storage — offline data may be evicted under storage pressure."
            : "Persistent storage wasn't granted — offline data could be evicted under storage pressure."}
        </p>
      )}
    </div>
  );
}
