import Link from "next/link";
import { LEAF_MUSCLE_GROUPS, MUSCLE_GROUP_DISPLAY_NAMES } from "@/domain/exercises/muscleGroups";
import type { LeafMuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import type { WeekVolumeReport } from "@/domain/volume/aggregate";
import { DeloadBadge } from "./DeloadBadge";
import { METRICS_PAGE_COPY } from "./copy";

interface VolumeCardProps {
  weeks: readonly WeekVolumeReport[]; // exactly [thisWeek, lastWeek]
}

// Metrics dashboard v1 — the Weekly volume card (M-5), reusing
// `getWeeklyVolumeReport` verbatim (I-3); no landmark bands here (O-6).
export function VolumeCard({ weeks }: VolumeCardProps) {
  const thisWeek = weeks[0];
  const lastWeek = weeks[1];

  const groups = LEAF_MUSCLE_GROUPS.filter((group) => {
    const slug = group.slug as LeafMuscleGroupSlug;
    const a = thisWeek?.leaves[slug]?.effective ?? 0;
    const b = lastWeek?.leaves[slug]?.effective ?? 0;
    return a > 0 || b > 0;
  });
  const back = thisWeek?.rollups.back;
  const backLastWeek = lastWeek?.rollups.back;
  const showBack = (back?.effective ?? 0) > 0 || (backLastWeek?.effective ?? 0) > 0;

  const isEmpty = groups.length === 0 && !showBack;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">{METRICS_PAGE_COPY.volumeHeading}</h2>
        <Link
          href="/volume"
          className="flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-2"
        >
          {METRICS_PAGE_COPY.volumeScreenLink}
        </Link>
      </div>

      {isEmpty ? (
        <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.volumeEmptyState}</p>
      ) : (
        <table className="w-full text-xs tabular-nums text-slate-300">
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium text-slate-400">
                {METRICS_PAGE_COPY.volumeColumnHeading}
              </th>
              <th scope="col" className="text-right font-medium text-slate-400">
                <span className="flex items-center justify-end gap-1">
                  {METRICS_PAGE_COPY.volumeThisWeek} {METRICS_PAGE_COPY.volumeSoFarSuffix}
                  {/* M-1 — §4 M-5 / §8: `weeks[0].isDeload` badges the
                      CURRENT week's own column, the exact case an
                      in-progress or future-dated deload session needs; the
                      shared amber badge markup, not appended text, matches
                      the Training card and the Volume screen. */}
                  {thisWeek?.isDeload ? <DeloadBadge /> : null}
                </span>
              </th>
              <th scope="col" className="text-right font-medium text-slate-400">
                <span className="flex items-center justify-end gap-1">
                  {METRICS_PAGE_COPY.volumeLastWeek}
                  {lastWeek?.isDeload ? <DeloadBadge /> : null}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showBack ? (
              <tr>
                <th scope="row" className="text-left font-normal">
                  {METRICS_PAGE_COPY.volumeBackRow}
                </th>
                <td className="text-right">{back?.effective ?? 0}</td>
                <td className="text-right">{backLastWeek?.effective ?? 0}</td>
              </tr>
            ) : null}
            {groups.map((group) => (
              <tr key={group.slug}>
                <th scope="row" className="text-left font-normal">
                  {MUSCLE_GROUP_DISPLAY_NAMES[group.slug]}
                </th>
                <td className="text-right">
                  {thisWeek?.leaves[group.slug as LeafMuscleGroupSlug]?.effective ?? 0}
                </td>
                <td className="text-right">
                  {lastWeek?.leaves[group.slug as LeafMuscleGroupSlug]?.effective ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showBack && (back?.unclassified ?? 0) > 0 ? (
        <p className="text-xs text-slate-500">
          {METRICS_PAGE_COPY.volumeUnclassifiedBack} {back?.unclassified}
        </p>
      ) : null}
      <p className="text-xs text-slate-500">{METRICS_PAGE_COPY.volumeCaptionContribution}</p>
      <p className="text-xs text-slate-500">{METRICS_PAGE_COPY.volumeCaptionInProgress}</p>
      <p className="text-xs text-slate-500">{METRICS_PAGE_COPY.volumeCaptionRanges}</p>
    </section>
  );
}
