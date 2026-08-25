"use client";

import { useCallback, useEffect, useState } from "react";
import { LEAF_MUSCLE_GROUPS, MUSCLE_GROUP_DISPLAY_NAMES } from "@/domain/exercises/muscleGroups";
import { MuscleRow } from "./MuscleRow";
import { formatWeekRangeLabel } from "./volumeDisplay";
import type { WeeklyVolumeReportResponse } from "./types";

type Status = "loading" | "ready" | "error";

export function VolumeScreen() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<WeeklyVolumeReportResponse | null>(null);

  const load = useCallback(() => {
    setStatus((prev) => (prev === "ready" ? "ready" : "loading"));
    fetch("/api/volume")
      .then((res) => res.json())
      .then((json: WeeklyVolumeReportResponse) => {
        setData(json);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading" && !data) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-red-400">Failed to load volume.</p>;
  }
  if (!data) return null;

  const landmarksFor = (muscleGroupId: string) =>
    data.activePreset?.landmarks.filter((l) => l.muscleGroupId === muscleGroupId) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">Volume</h1>

      {/* volume-model.md §3 — contribution weights are never snapshotted;
          every displayed week is re-interpreted under the current
          convention whenever a contribution edit changes. */}
      <p className="text-xs text-slate-400">
        Editing a muscle contribution reinterprets every week shown here under the current
        convention — these numbers always reflect each exercise&rsquo;s current contribution
        weights, not what they were when a set was logged.
      </p>

      {data.activePreset ? (
        <p className="text-xs text-slate-500">
          RP General is a coaching preset (heuristic), not established science.
          {data.activePreset.name !== "RP General" && " Values below are your edited copy of it."}
        </p>
      ) : (
        <p className="text-xs text-slate-500">No active reference preset — showing volume only.</p>
      )}

      {data.weeks.map((week) => {
        const back = week.rollups.back;
        const lats = week.leaves.lats;
        const upperBack = week.leaves.upper_back;
        return (
          <section
            key={week.startDate}
            className={`flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 ${
              week.isDeload ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">
                {formatWeekRangeLabel(week.startDate, week.endDateExclusive)}
              </span>
              {week.isDeload && (
                <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
                  Deload
                </span>
              )}
            </div>

            {back && (
              <div className="rounded border border-slate-800 p-2">
                <MuscleRow
                  muscleGroupId="back"
                  displayName="Back"
                  effective={back.effective}
                  raw={back.raw}
                  landmarks={landmarksFor("back")}
                  onLandmarkSaved={load}
                />
                {/* pre-phase-6-muscle-taxonomy-architecture-review.md M-3 —
                    this equation holds for effective sets only; raw Back is
                    a per-set deduplicated count and may be lower than the
                    sum of its raw member-leaf counts (a set primary on both
                    Lats and Upper Back counts once in raw Back, twice across
                    the two leaves). This is an accounting identity about how
                    sets are counted, not an anatomical claim. */}
                <p className="mt-1 text-xs text-slate-500">
                  Back {back.effective} = Lats {lats?.effective ?? 0} + Upper Back{" "}
                  {upperBack?.effective ?? 0}
                  {back.unclassified > 0 ? ` + Unclassified Back ${back.unclassified}` : ""}{" "}
                  (effective sets). Raw Back ({back.raw}) is a deduplicated per-set count and may be
                  lower than the sum of raw Lats + Upper Back.
                </p>
              </div>
            )}

            <div className="flex flex-col">
              {LEAF_MUSCLE_GROUPS.map((group) => {
                const totals = week.leaves[group.slug];
                if (!totals) return null;
                return (
                  <MuscleRow
                    key={group.slug}
                    muscleGroupId={group.slug}
                    displayName={MUSCLE_GROUP_DISPLAY_NAMES[group.slug]}
                    effective={totals.effective}
                    raw={totals.raw}
                    landmarks={landmarksFor(group.slug)}
                    onLandmarkSaved={load}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
