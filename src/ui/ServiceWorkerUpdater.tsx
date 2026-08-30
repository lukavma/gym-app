"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and surfaces a manual "update available"
 * control. A new SW is never activated automatically mid-session — only a
 * tap here sends SKIP_WAITING (pwa-offline-strategy.md §8).
 */
export function ServiceWorkerUpdater() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(registration.waiting);
            }
          });
        });
      })
      .catch(() => {
        // Registration can fail transiently (e.g. first offline load);
        // the next successful load retries it.
      });

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}
        className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 shadow-lg"
      >
        Update available — tap to refresh
      </button>
    </div>
  );
}
