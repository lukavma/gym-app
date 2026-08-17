"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/ui/LogoutButton";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { getCachedBundle, setCachedBundle } from "@/sync/bundleCache";
import { formatScheme } from "@/domain/schemes/setScheme";
import type { TodayBundleDto } from "@/sync/types";

type Status = "loading" | "ready" | "offline" | "error";

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

export function TodaySection() {
  const router = useRouter();
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

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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

  if (status === "loading" || !hydrated) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-red-400">Couldn&apos;t load today&apos;s workout.</p>;
  }

  const remote = bundle?.activeSession ?? null;
  const local = session;
  // A session exists server-side that this device doesn't hold locally
  // (different id, or no local session at all — cold client) — never
  // silently merge or discard; always surface resume-vs-takeover.
  const hasForeignActive = remote !== null && (local === null || local.id !== remote.id);
  const inProgress = local !== null && !hasForeignActive;

  async function handleStart() {
    if (!bundle || bundle.today.kind !== "scheduled") return;
    setBusy(true);
    try {
      await start({
        blockId: bundle.today.blockId,
        templateId: bundle.today.templateId,
        templateName: bundle.today.templateName,
        weekIndex: bundle.today.weekIndex,
        isDeload: bundle.today.isDeload,
        exercises: bundle.today.exercises,
      });
      router.push("/today/workout");
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeCached() {
    if (!remote) return;
    setBusy(true);
    try {
      await adoptRemote(remote);
      router.push("/today/workout");
    } finally {
      setBusy(false);
    }
  }

  async function handleTakeover() {
    if (!remote) return;
    setBusy(true);
    try {
      await discard(remote.id);
      setBundle((b) => (b ? { ...b, activeSession: null } : b));
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

      {hasForeignActive && remote && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-800 bg-amber-950 px-4 py-4">
          <p className="text-sm text-amber-200">
            A workout is already in progress{remote.templateName ? ` (${remote.templateName})` : ""}
            .
          </p>
          <button
            type="button"
            onClick={handleResumeCached}
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
            onClick={() => router.push("/today/workout")}
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
          <p className="text-xs text-slate-400">Week {today.weekIndex}</p>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {today.exercises.map((entry) => (
          <li
            key={entry.prescriptionId}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
          >
            <p className="text-base font-medium text-slate-50">{entry.exerciseName}</p>
            <p className="text-xs text-slate-400">
              {formatScheme(entry.scheme)}
              {entry.targetRir ? ` @ RIR ${entry.targetRir.min}-${entry.targetRir.max}` : ""}
            </p>
          </li>
        ))}
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
