import { OfflineShell } from "@/ui/OfflineShell";

// Precached at service-worker install time and served by the SW for any
// document request that can't be satisfied offline — see
// src/domain/pwa/offlineShell.ts. Lives inside the (app) route group on
// purpose: the shell needs the same layout chrome, SyncBootstrap (outbox
// flush triggers) and SyncStatusBanner as the routes it stands in for.
export default function OfflinePage() {
  return (
    <>
      {/* Marks the served document as the precached shell rather than a live
          response for the route in the address bar. The two are deliberately
          indistinguishable to the eye — same chrome, same section, same URL —
          so this is the only thing that lets a test (or a device console) tell
          whether an offline navigation was answered from Cache Storage or
          quietly reached the network after all. */}
      <span hidden data-app-shell="offline" />
      <OfflineShell />
    </>
  );
}
