import Link from "next/link";
import type { RecoverySummaryDto } from "@/domain/metrics/types";
import { METRICS_PAGE_COPY } from "./copy";
import { formatDayLabel } from "./format";

interface RecoveryCardProps {
  recovery: RecoverySummaryDto;
}

// Metrics dashboard v1 — the Recovery card (M-10, M-11, M-12, I-7). Last
// card, visually separated, captioned unconditionally.
export function RecoveryCard({ recovery }: RecoveryCardProps) {
  const { days, daysLogged, meanSleepHours } = recovery;
  const cell = (value: number | null) =>
    value === null ? METRICS_PAGE_COPY.recoveryEmptyCell : String(value);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">{METRICS_PAGE_COPY.recoveryHeading}</h2>
        <Link
          href="/recovery"
          className="flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-2"
        >
          {METRICS_PAGE_COPY.recoveryLogLink}
        </Link>
      </div>
      <p className="text-xs text-slate-400">{METRICS_PAGE_COPY.recoveryCaption}</p>

      <table className="w-full text-xs tabular-nums text-slate-300">
        <thead>
          <tr>
            <th scope="col" className="text-left font-medium text-slate-400">
              {METRICS_PAGE_COPY.recoveryColumnDay}
            </th>
            <th scope="col" className="text-right font-medium text-slate-400">
              {METRICS_PAGE_COPY.recoveryColumnSleep}
            </th>
            <th scope="col" className="text-right font-medium text-slate-400">
              {METRICS_PAGE_COPY.recoveryColumnQuality}
            </th>
            <th scope="col" className="text-right font-medium text-slate-400">
              {METRICS_PAGE_COPY.recoveryColumnReadiness}
            </th>
            <th scope="col" className="text-right font-medium text-slate-400">
              {METRICS_PAGE_COPY.recoveryColumnSoreness}
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row" className="text-left font-normal">
                {formatDayLabel(day.date)}
              </th>
              <td className="text-right">{cell(day.entry?.sleepHours ?? null)}</td>
              <td className="text-right">{cell(day.entry?.sleepQuality ?? null)}</td>
              <td className="text-right">{cell(day.entry?.readiness ?? null)}</td>
              <td className="text-right">{cell(day.entry?.soreness ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-slate-500">
        {METRICS_PAGE_COPY.recoveryLoggedPrefix} {daysLogged}{" "}
        {METRICS_PAGE_COPY.recoveryOfLastSevenDays}
        {meanSleepHours
          ? ` · ${METRICS_PAGE_COPY.recoveryMeanSleepPrefix} ${meanSleepHours.hours} h (${meanSleepHours.count} of 7 days)`
          : ""}
      </p>
    </section>
  );
}
