"use client";

// Metrics dashboard v1 — `/metrics` (docs/reviews/metrics-dashboard-
// architecture-evaluation.md §3, §11.1, §14).
//
// READ-ONLY. Fetches on mount, on a Refresh tap, and on `visibilitychange`
// -> visible (§11.3, §14 — the visibility refetch is a new client
// behaviour, disclosed as such). Follows the house convention (plain
// `fetch`, no react-query) but — unlike the pre-existing read screens
// (F-11) — checks `res.ok` before parsing, so a 401/500 JSON body never
// reaches the render as data.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatLocalDate } from "@/ui/strength/format";
import type { MetricsDashboardDto } from "@/domain/metrics/types";
import { EstimatesCard } from "./EstimatesCard";
import { TrainingCard } from "./TrainingCard";
import { VolumeCard } from "./VolumeCard";
import { BodyweightCard } from "./BodyweightCard";
import { RecoveryCard } from "./RecoveryCard";
import { METRICS_PAGE_COPY } from "./copy";
import { formatUpdatedTime, formatWeekStartName } from "./format";

type Status = "loading" | "ready" | "error" | "offline_no_data" | "offline_with_data";

export function MetricsScreen() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<MetricsDashboardDto | null>(null);
  // L-4 — a non-network failure (a 401/500 on a *refetch*, not the first
  // load) must not discard an already-rendered dashboard with no way back;
  // the offline paths already keep the data, this makes the HTTP-error path
  // do the same instead of replacing the screen with one line.
  const [refetchError, setRefetchError] = useState(false);
  const hasDataRef = useRef(false);

  const load = useCallback(() => {
    setStatus((prev) => (prev === "loading" ? "loading" : prev));
    fetch("/api/metrics")
      .then(async (res) => {
        if (!res.ok) {
          if (hasDataRef.current) {
            setRefetchError(true);
            setStatus("ready");
          } else {
            setStatus("error");
          }
          return;
        }
        setRefetchError(false);
        const json: { metrics: MetricsDashboardDto } = await res.json();
        hasDataRef.current = true;
        setData(json.metrics);
        setStatus("ready");
      })
      .catch(() => {
        setStatus(hasDataRef.current ? "offline_with_data" : "offline_no_data");
      });
  }, []);

  useEffect(() => {
    load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  if (status === "loading" && !data) {
    return <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.loading}</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-red-400">{METRICS_PAGE_COPY.loadFailed}</p>;
  }
  if (status === "offline_no_data") {
    return (
      <p role="status" className="text-sm text-slate-400">
        {METRICS_PAGE_COPY.offlineNoData}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div data-testid="metrics-screen" className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-slate-50">{METRICS_PAGE_COPY.heading}</h1>
        <p role="status" aria-live="polite" className="text-xs text-slate-400">
          {status === "offline_with_data"
            ? `${METRICS_PAGE_COPY.offlineWithDataPrefix} ${formatUpdatedTime(data.generatedAt)}.`
            : `${METRICS_PAGE_COPY.updatedPrefix} ${formatUpdatedTime(data.generatedAt)} · ${METRICS_PAGE_COPY.numbersForPrefix} ${formatLocalDate(data.asOfLocalDate)}`}
        </p>
        <p className="text-xs text-slate-400">
          {METRICS_PAGE_COPY.weeksStartLabel} {formatWeekStartName(data.weekStartsOn)} ·{" "}
          {data.timezone}
        </p>
        {refetchError ? (
          <p role="alert" className="text-xs text-red-400">
            {METRICS_PAGE_COPY.refetchErrorBanner}
          </p>
        ) : null}
        <button
          type="button"
          onClick={load}
          className="min-h-11 w-fit rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 transition active:scale-[0.98]"
        >
          {METRICS_PAGE_COPY.refresh}
        </button>
      </header>

      <EstimatesCard selection={data.strength.selection} algorithm={data.strength.algorithm} />
      <TrainingCard weeks={data.training.weeks} />
      <VolumeCard weeks={data.volume.weeks} />
      <BodyweightCard bodyweight={data.bodyweight} asOfLocalDate={data.asOfLocalDate} />
      <RecoveryCard recovery={data.recovery} />
    </div>
  );
}
