"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/ui/LogoutButton";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { getCachedBundle, setCachedBundle } from "@/sync/bundleCache";
import { fetchRemoteActiveSession } from "@/sync/remoteActiveSession";
import { formatScheme } from "@/domain/schemes/setScheme";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";
import { ACTION_COPY, formatTarget, reasonCopy } from "@/ui/recommendations/copy";
import type { ActiveSessionDto, TodayBundleDto } from "@/sync/types";

type Status = "loading" | "ready" | "offline" | "error";

// Finding C — remote active-session state is three-valued, and conflating the
// last two is the bug. `unavailable` (offline, timed out, 401) is NOT "no
// session in progress": it is "we don't know", and nothing that could adopt
// or discard a server-side session may be offered on that basis.
type RemoteActiveSessionState =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "fresh"; session: ActiveSessionDto | null };

// HIGH-5 remediation: the SW's NetworkFirst/3s strategy for
// `/api/today-bundle` can resolve the `fetch()` with a 200 even when it
// served the response from its own cache (network unreachable or slower
// than 3s) — the fetch never throws, so staleness can't be inferred from a
// caught error alone. `generatedAt` is set server-side at bundle-assembly
// time; anything older than this threshold on arrival is treated as
// SW-cache-served rather than a genuinely fresh network response. Well
// above the SW's own 3s cutoff plus normal request latency, so a real
// fresh fetch is never misclassified as stale.
const STALE_THRESHOLD_MS = 10_000;

function isStaleGeneratedAt(generatedAt: string): boolean {
  const generatedAtMs = Date.parse(generatedAt);
  return Number.isFinite(generatedAtMs) && Date.now() - generatedAtMs > STALE_THRESHOLD_MS;
}

interface TodaySectionProps {
  // Supplied only by the offline app shell (src/ui/OfflineShell.tsx), which
  // needs full document navigations rather than client-side router pushes.
  navigate?: (href: string) => void;
}

export function TodaySection({ navigate }: TodaySectionProps) {
  const router = useRouter();
  const go = useCallback(
    (href: string) => (navigate ? navigate(href) : router.push(href)),
    [navigate, router],
  );
  const session = useActiveSessionStore((s) => s.session);
  const hydrated = useActiveSessionStore((s) => s.hydrated);
  const hydrate = useActiveSessionStore((s) => s.hydrate);
  const start = useActiveSessionStore((s) => s.start);
  const adoptRemote = useActiveSessionStore((s) => s.adoptRemote);
  const discard = useActiveSessionStore((s) => s.discard);

  const [status, setStatus] = useState<Status>("loading");
  const [bundle, setBundle] = useState<TodayBundleDto | null>(null);
  // Set whenever the displayed bundle isn't known-fresh — either the fetch
  // itself threw (real offline, no SW cache entry survived to answer it) or
  // it resolved 200 but `generatedAt` shows the SW served its own cache.
  // Distinct from `status === "offline"` so the stale banner can also fire
  // on the "resolved but old" path without forcing every other branch below
  // to treat that case as if the network request had failed outright.
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remoteState, setRemoteState] = useState<RemoteActiveSessionState>({ kind: "checking" });
  const [remoteError, setRemoteError] = useState<string | null>(null);
  // M-1 remediation — startSession freezes the bundle's PrescriptionSnapshot
  // client-side (wrapPrescriptionSnapshot / buildSessionExerciseUpsertPayload
  // both validate); a scheme that still fails that validation throws instead
  // of leaving "Start workout" to silently re-enable with no feedback.
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Deliberately a second request, not a field of the bundle above: the
  // bundle is cacheable (SW + IndexedDB) and this must never be.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void fetchRemoteActiveSession().then((result) => {
        if (cancelled) return;
        setRemoteState(
          result.status === "fresh"
            ? { kind: "fresh", session: result.activeSession }
            : { kind: "unavailable" },
        );
      });
    };
    check();
    // Coming back online in the gym is the normal case, and the answer to
    // "is a session in progress on the server" changes with it.
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      window.removeEventListener("online", check);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/today-bundle")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<TodayBundleDto>;
      })
      .then((data) => {
        if (cancelled) return;
        void setCachedBundle(data);
        const isStale = isStaleGeneratedAt(data.generatedAt);
        setBundle(data);
        setStale(isStale);
        setCachedAt(isStale ? data.generatedAt : null);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        void getCachedBundle().then((cached) => {
          if (cancelled) return;
          if (cached) {
            setBundle(cached.bundle);
            setStale(true);
            setCachedAt(cached.bundle.generatedAt ?? cached.fetchedAt);
            setStatus("offline");
          } else {
            setStatus("error");
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The remote check is part of the loading gate so the screen never flashes
  // "Start workout" before finding out a session is already in progress. It
  // resolves fast when there is no network (the fetch rejects) and is bounded
  // by fetchRemoteActiveSession's own timeout otherwise.
  if (status === "loading" || !hydrated || remoteState.kind === "checking") {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-red-400">Couldn&apos;t load today&apos;s workout.</p>;
  }

  // Only ever a freshly-confirmed in-progress session — `unavailable` yields
  // null, so resume/takeover simply isn't offered while offline or stale.
  const remote = remoteState.kind === "fresh" ? remoteState.session : null;
  const local = session;
  // A session exists server-side that this device doesn't hold locally
  // (different id, or no local session at all — cold client) — never
  // silently merge or discard; always surface resume-vs-takeover.
  const hasForeignActive = remote !== null && (local === null || local.id !== remote.id);
  // A local IndexedDB session is resumable regardless of what the server can
  // be asked right now — that's the whole point of the offline outbox, and
  // Finding C's fix must not take it away.
  const inProgress = local !== null && !hasForeignActive;

  async function handleStart() {
    if (!bundle || bundle.today.kind !== "scheduled") return;
    setBusy(true);
    setStartError(null);
    try {
      await start({
        blockId: bundle.today.blockId,
        templateId: bundle.today.templateId,
        templateName: bundle.today.templateName,
        weekIndex: bundle.today.weekIndex,
        isDeload: bundle.today.isDeload,
        exercises: bundle.today.exercises,
      });
      go("/today/workout");
    } catch {
      setStartError(
        "Couldn't start the workout — one of today's prescriptions is invalid. Try reloading Today, or check the block's deload/override settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Finding C — `adoptRemote` re-reads the session from the server and only
  // writes it locally if it is still that session and still in progress. What
  // was on screen a moment ago never decides what gets hydrated.
  async function handleResumeRemote() {
    if (!remote) return;
    setBusy(true);
    setRemoteError(null);
    try {
      const outcome = await adoptRemote(remote.id);
      if (outcome === "adopted") {
        go("/today/workout");
        return;
      }
      if (outcome === "gone") {
        setRemoteState({ kind: "fresh", session: null });
        setRemoteError("That workout isn't in progress anymore — there's nothing to resume.");
        return;
      }
      setRemoteState({ kind: "unavailable" });
      setRemoteError("Couldn't reach the server to check that workout. Try again when online.");
    } finally {
      setBusy(false);
    }
  }

  // Same rule for the destructive branch: discard only what the server says
  // is in progress right now, never what a cached view claimed.
  async function handleTakeover() {
    if (!remote) return;
    setBusy(true);
    setRemoteError(null);
    try {
      const live = await fetchRemoteActiveSession();
      if (live.status !== "fresh") {
        setRemoteState({ kind: "unavailable" });
        setRemoteError("Couldn't reach the server to check that workout. Try again when online.");
        return;
      }
      if (live.activeSession === null) {
        setRemoteState({ kind: "fresh", session: null });
        return;
      }
      await discard(live.activeSession.id);
      setRemoteState({ kind: "fresh", session: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-50">Today</h1>
        <LogoutButton />
      </header>

      {(status === "offline" || stale) && (
        <p className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-300">
          {status === "offline" ? "Offline — showing cached data" : "Showing cached data"}
          {cachedAt ? ` as of ${new Date(cachedAt).toLocaleString()}` : ""}.
        </p>
      )}

      {remoteError && <p className="text-xs text-amber-300">{remoteError}</p>}
      {startError && (
        <p role="alert" className="text-xs text-red-400">
          {startError}
        </p>
      )}

      {hasForeignActive && remote && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-800 bg-amber-950 px-4 py-4">
          <p className="text-sm text-amber-200">
            A workout is already in progress{remote.templateName ? ` (${remote.templateName})` : ""}
            .
          </p>
          <button
            type="button"
            onClick={handleResumeRemote}
            disabled={busy}
            className="w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900 disabled:opacity-50"
          >
            Resume here
          </button>
          <button
            type="button"
            onClick={handleTakeover}
            disabled={busy}
            className="w-full rounded-lg border border-red-800 px-4 py-3 text-base font-medium text-red-300 disabled:opacity-50"
          >
            Discard it &amp; start fresh
          </button>
        </div>
      )}

      {inProgress && local && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm text-slate-300">
            Workout in progress{local.templateName ? `: ${local.templateName}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => go("/today/workout")}
            className="w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900"
          >
            Continue workout
          </button>
        </div>
      )}

      {!hasForeignActive && !inProgress && bundle && (
        <TodayResolutionView bundle={bundle} busy={busy} onStart={handleStart} />
      )}
    </div>
  );
}

function TodayResolutionView({
  bundle,
  busy,
  onStart,
}: {
  bundle: TodayBundleDto;
  busy: boolean;
  onStart: () => void;
}) {
  const { today } = bundle;
  if (today.kind === "rest") {
    return <p className="text-sm text-slate-400">Rest day.</p>;
  }
  if (today.kind === "no_schedule") {
    return <p className="text-sm text-slate-400">No program scheduled.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-50">{today.templateName}</h2>
        {today.weekIndex !== null && (
          <p className="text-xs text-slate-400">
            Week {today.weekIndex}
            {today.isDeload ? " · deload" : ""}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {today.exercises.map((entry) => {
          // H-1 remediation — buildTodayBundle already omits
          // pendingRecommendation for a deload week; this is the defensive
          // backstop against a stale cached bundle that still carries one
          // (see recommendationForDeload.ts).
          const pendingRecommendation = recommendationForDeload(
            today.isDeload,
            entry.pendingRecommendation,
          );
          return (
            <li
              key={entry.prescriptionId}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <p className="text-base font-medium text-slate-50">{entry.exerciseName}</p>
              <p className="text-xs text-slate-400">
                {formatScheme(entry.scheme)}
                {entry.targetRir ? ` @ RIR ${entry.targetRir.min}-${entry.targetRir.max}` : ""}
              </p>
              {/* Informational preview only — the decision (accept/modify/
                  reject, or implicit via the first work set) happens in the
                  workout itself (progression-engine.md §7). */}
              {pendingRecommendation && (
                <p className="mt-1 text-xs text-sky-300">
                  {ACTION_COPY[pendingRecommendation.action]}
                  {formatTarget(pendingRecommendation.target)
                    ? `: ${formatTarget(pendingRecommendation.target)}`
                    : ""}
                  {pendingRecommendation.reasonCodes[0]
                    ? ` — ${reasonCopy(pendingRecommendation.reasonCodes[0])}`
                    : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900 disabled:opacity-50"
      >
        Start workout
      </button>
    </div>
  );
}
