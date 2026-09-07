import Link from "next/link";
import { formatWeekRangeLabel } from "@/ui/volume/volumeDisplay";
import type { TrainingWeekDto } from "@/domain/metrics/types";
import { DeloadBadge } from "./DeloadBadge";
import { METRICS_PAGE_COPY } from "./copy";
import { pluralize } from "./format";

interface TrainingCardProps {
  weeks: readonly TrainingWeekDto[];
}

// Metrics dashboard v1 — the Training card (M-1, M-2, M-3, O-2).
export function TrainingCard({ weeks }: TrainingCardProps) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">{METRICS_PAGE_COPY.trainingHeading}</h2>
        <Link
          href="/history"
          className="flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-2"
        >
          {METRICS_PAGE_COPY.fullHistoryLink}
        </Link>
      </div>
      <ul className="flex flex-col gap-1">
        {weeks.map((week, index) => (
          <li
            key={week.startDate}
            className={`text-xs text-slate-300 ${week.isDeload ? "opacity-60" : ""}`}
          >
            {formatWeekRangeLabel(week.startDate, week.endDateExclusive)}
            {index === 0 ? ` ${METRICS_PAGE_COPY.trainingSoFarSuffix}` : ""}
            {week.isDeload ? (
              <span className="ml-1 inline-block">
                <DeloadBadge />
              </span>
            ) : null}
            {" · "}
            {week.sessionsCompleted}{" "}
            {pluralize(
              week.sessionsCompleted,
              METRICS_PAGE_COPY.sessionWord,
              METRICS_PAGE_COPY.sessionsWord,
            )}
            {" · "}
            {week.workSets}{" "}
            {pluralize(
              week.workSets,
              METRICS_PAGE_COPY.workSetWord,
              METRICS_PAGE_COPY.workSetsWord,
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">{METRICS_PAGE_COPY.trainingCaption}</p>
    </section>
  );
}
