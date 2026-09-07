import Link from "next/link";
import { confidenceCopy } from "@/ui/strength/copy";
import { formatEstimate, formatSessionAge } from "@/ui/strength/format";
import type { EstimateIndexRowDto } from "@/domain/metrics/types";
import {
  METRICS_PAGE_COPY,
  bandNote,
  estimateDisclaimer,
  freshness,
  footer,
  refusalCopyForState,
} from "./copy";

interface EstimatesCardProps {
  selection: readonly EstimateIndexRowDto[];
  algorithm: { id: string; version: number };
}

// Metrics dashboard v1 — the Current estimates card (M-4, §9, O-3, O-10).
// First because it is the only card whose content is not one nav tap away.
export function EstimatesCard({ selection, algorithm }: EstimatesCardProps) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">{METRICS_PAGE_COPY.estimatesHeading}</h2>
        <Link
          href="/metrics/exercises"
          className="flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-2"
        >
          {METRICS_PAGE_COPY.chooseExercisesLink}
        </Link>
      </div>

      {selection.length === 0 ? (
        <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.selectionEmptyState}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selection.map((row) => (
            <EstimateRow key={row.exerciseId} row={row} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1 border-t border-slate-800 pt-2">
        <p className="text-xs text-slate-400">{freshness}</p>
        <p className="text-xs text-slate-500">{estimateDisclaimer}</p>
        <p className="text-xs text-slate-500">{bandNote}</p>
        <p className="text-xs text-slate-500">{METRICS_PAGE_COPY.unitLine}</p>
        <p className="text-xs text-slate-500">{METRICS_PAGE_COPY.deloadLine}</p>
        <p className="text-xs text-slate-500">{footer}</p>
        <p className="text-xs text-slate-500">
          {METRICS_PAGE_COPY.algorithmPrefix} {algorithm.id} v{algorithm.version}
        </p>
      </div>
    </section>
  );
}

function EstimateRow({ row }: { row: EstimateIndexRowDto }) {
  let stateText: string;
  switch (row.state) {
    case "estimate": {
      const confidence = row.confidence ? confidenceCopy(row.confidence) : "";
      const age = row.latestPoolAgeDays !== null ? formatSessionAge(row.latestPoolAgeDays) : "";
      stateText =
        row.currentE1rmKg !== null
          ? `${formatEstimate(row.currentE1rmKg, row.loadStepKg)} · ${confidence}${age ? ` · ${age}` : ""}`
          : METRICS_PAGE_COPY.noCurrentEstimate;
      break;
    }
    case "no_current_estimate":
      stateText = METRICS_PAGE_COPY.noCurrentEstimate;
      break;
    case "not_available":
    case "turned_off":
      stateText = refusalCopyForState(row.state);
      break;
  }

  return (
    <li>
      <Link
        href={`/exercises/${row.exerciseId}/strength`}
        className="flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border border-slate-800 px-2 py-1"
      >
        <span className="flex items-center gap-2 text-sm text-slate-100">
          {row.name}
          {row.archived ? (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {METRICS_PAGE_COPY.editorArchivedBadge}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-slate-400">{stateText}</span>
      </Link>
    </li>
  );
}
