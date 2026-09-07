import Link from "next/link";
import type { BodyweightSummaryDto } from "@/domain/metrics/types";
import { BodyweightSparkline } from "./Sparkline";
import { METRICS_PAGE_COPY } from "./copy";
import { bodyweightSummaryLine, formatDayLabel, formatSignedKg } from "./format";

interface BodyweightCardProps {
  bodyweight: BodyweightSummaryDto;
  asOfLocalDate: string;
}

// Metrics dashboard v1 — the Bodyweight card (M-6, M-7, M-8, M-9).
export function BodyweightCard({ bodyweight, asOfLocalDate }: BodyweightCardProps) {
  const { latest, sevenDayAverage, sevenDayEntryCount, thirtyDayChange, series } = bodyweight;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">
          {METRICS_PAGE_COPY.bodyweightHeading}
        </h2>
        <Link
          href="/bodyweight"
          className="flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-2"
        >
          {METRICS_PAGE_COPY.bodyweightLogLink}
        </Link>
      </div>

      {latest ? (
        <p className="text-base font-semibold text-slate-50">
          {latest.weightKg} kg{" "}
          <span className="text-xs font-normal text-slate-400">
            {METRICS_PAGE_COPY.bodyweightLatestLabel} · {formatDayLabel(latest.date)}
          </span>
        </p>
      ) : (
        <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.bodyweightEmptyState}</p>
      )}

      <p className="text-sm text-slate-300">
        {sevenDayAverage ? (
          <>
            {sevenDayAverage.kg} kg{" "}
            <span className="text-xs text-slate-400">
              {METRICS_PAGE_COPY.bodyweightAverageLabel} ({sevenDayAverage.entryCount} of 7 days)
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-400">— ({sevenDayEntryCount} of 7 days logged)</span>
        )}
      </p>

      <p className="text-sm text-slate-300">
        {thirtyDayChange ? (
          <>
            {formatSignedKg(thirtyDayChange.kg)}{" "}
            <span className="text-xs text-slate-400">
              {METRICS_PAGE_COPY.bodyweightChangeLabel} ({thirtyDayChange.currentEntryCount} of 7 vs{" "}
              {thirtyDayChange.priorEntryCount} of 7 days)
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </p>

      <BodyweightSparkline
        points={series}
        asOfLocalDate={asOfLocalDate}
        label={bodyweightSummaryLine(series)}
      />
    </section>
  );
}
