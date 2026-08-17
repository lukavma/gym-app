"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HistorySessionListItem } from "./types";

type Status = "loading" | "ready" | "error";

// Matches src/server/history/service.ts's DEFAULT_HISTORY_LIMIT — passed
// explicitly (rather than relying on the server default) so `hasMore` can
// be inferred from a full page coming back.
const PAGE_SIZE = 20;

export function HistoryList() {
  const [status, setStatus] = useState<Status>("loading");
  const [sessions, setSessions] = useState<HistorySessionListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history?limit=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then((data: { sessions: HistorySessionListItem[] }) => {
        if (cancelled) return;
        setSessions(data.sessions);
        setHasMore(data.sessions.length === PAGE_SIZE);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    const last = sessions.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), before: last.startedAt });
      const res = await fetch(`/api/history?${params.toString()}`);
      const data: { sessions: HistorySessionListItem[] } = await res.json();
      setSessions((prev) => [...prev, ...data.sessions]);
      setHasMore(data.sessions.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">History</h1>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-sm text-red-400">Failed to load history.</p>}
      {status === "ready" && sessions.length === 0 && (
        <p className="text-sm text-slate-400">No completed workouts yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/history/${s.id}`}
              className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-slate-50">
                  {s.templateName ?? "Workout"}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(s.startedAt).toLocaleDateString()}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {s.exerciseCount} exercises · {s.setCount} sets{s.isDeload ? " · deload" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {status === "ready" && hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="w-full rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
