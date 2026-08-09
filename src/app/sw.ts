import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Phase 0 scope only: precache the app shell so it opens offline. No
// offline execution logic beyond this yet (that's Phase 3+).
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Never auto-activate a new SW mid-session — activation is user-triggered
  // via the SKIP_WAITING message below (pwa-offline-strategy.md §8).
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && (event.data as { type?: string }).type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
