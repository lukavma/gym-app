"use client";

import { useEffect, useState } from "react";
import { OFFLINE_SHELL_PATH } from "@/domain/pwa/offlineShell";
import { TodaySection } from "@/ui/today/TodaySection";
import { WorkoutExecution } from "@/ui/workout/WorkoutExecution";

const TODAY_PATH = "/today";
const WORKOUT_PATH = "/today/workout";

// Inside the fallback shell the App Router's client-side navigation is not
// usable: a `router.push("/today/workout")` fetches that route's RSC payload,
// which offline has no cache to answer it (pwa-offline-strategy.md §8 caches
// RSC responses NetworkFirst, and a cold process has none). A full document
// navigation is what works — it re-enters the service worker, gets this same
// precached shell back, and the shell then derives the requested view from
// the new URL. Only the shell passes this down; the real routes keep using
// the router.
function hardNavigate(href: string): void {
  window.location.assign(href);
}

// The app shell served for any document request that fails offline.
//
// The view is chosen from `window.location.pathname` — NOT from Next's
// router — and only after mount. Next's initial canonical URL comes from the
// flight payload baked into this route's prerendered HTML, so it always says
// `/~offline` even when the address bar (and the request the service worker
// intercepted) says `/today/workout`. Deferring the read to an effect also
// keeps the server-rendered markup and the first client render identical, so
// React never reports a hydration mismatch for a URL only the client knows.
export function OfflineShell() {
  const [pathname, setPathname] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    sync();
    // Back/forward inside the shell changes the URL without a new document,
    // so the view has to be re-derived. Every other in-shell navigation is a
    // hardNavigate, which reloads the shell from scratch.
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (pathname === null) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }
  if (pathname.startsWith(WORKOUT_PATH)) {
    return <WorkoutExecution navigate={hardNavigate} />;
  }
  if (pathname === TODAY_PATH || pathname === "/" || pathname === OFFLINE_SHELL_PATH) {
    return <TodaySection navigate={hardNavigate} />;
  }
  return <OfflineRouteNotice pathname={pathname} />;
}

// History, Exercises and Programs are online-only by design
// (pwa-offline-strategy.md §8 — only the today bundle and the active session
// are available offline), so say so instead of rendering a broken screen.
function OfflineRouteNotice({ pathname }: { pathname: string }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold text-slate-50">Offline</h1>
      <p className="text-sm text-slate-400">
        <span className="text-slate-300">{pathname}</span> needs a connection. Today&apos;s workout
        and everything already logged on this device stay available offline.
      </p>
      <a
        href={TODAY_PATH}
        className="w-full rounded-lg bg-slate-100 px-4 py-3 text-center text-base font-medium text-slate-900"
      >
        Go to Today
      </a>
    </div>
  );
}
