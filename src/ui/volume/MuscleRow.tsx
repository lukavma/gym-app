"use client";

import { useState } from "react";
import { LandmarkKeyEditor } from "./LandmarkKeyEditor";
import { formatLandmarkSummary } from "./volumeDisplay";
import type { VolumeLandmarkDto } from "./types";

// RP's own four-landmark vocabulary (volume-model.md §4) — the editor always
// offers these four, regardless of which ones the group currently has rows
// for, so adding a missing one (e.g. a landmark-less leaf) is the same
// per-row Save as editing an existing value.
const STANDARD_KEYS = ["mv", "mev", "mav", "mrv"];

interface MuscleRowProps {
  muscleGroupId: string;
  displayName: string;
  effective: number;
  raw: number;
  landmarks: VolumeLandmarkDto[];
  onLandmarkSaved: () => void;
}

export function MuscleRow({
  muscleGroupId,
  displayName,
  effective,
  raw,
  landmarks,
  onLandmarkSaved,
}: MuscleRowProps) {
  const [editing, setEditing] = useState(false);
  const summary = formatLandmarkSummary(landmarks);
  const byKey = new Map(landmarks.map((l) => [l.key, l]));
  const notes = [
    ...new Set(
      landmarks.map((landmark) => landmark.note).filter((note): note is string => note !== null),
    ),
  ];

  return (
    <div className="flex flex-col gap-1 border-b border-slate-800 py-2 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-50">{displayName}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-slate-50">{effective}</span>
          <span className="text-xs text-slate-400">{raw} direct</span>
        </div>
      </div>
      {summary ? (
        <>
          <span className="text-xs text-slate-400">Coaching heuristic · {summary}</span>
          {notes.map((note) => (
            <span key={note} className="text-xs text-slate-500">
              {note}
            </span>
          ))}
        </>
      ) : (
        <span className="text-xs text-slate-600">No reference range</span>
      )}
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="self-start text-xs text-slate-400 underline"
      >
        {editing ? "Close" : "Edit reference range"}
      </button>
      {editing && (
        <div className="mt-1 flex flex-col gap-2">
          {STANDARD_KEYS.map((key) => {
            const existing = byKey.get(key);
            return (
              <LandmarkKeyEditor
                key={key}
                muscleGroupId={muscleGroupId}
                keyName={key}
                initial={
                  existing
                    ? {
                        valueMin: existing.valueMin,
                        valueMax: existing.valueMax,
                        openEnded: existing.openEnded,
                      }
                    : null
                }
                onSaved={onLandmarkSaved}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
