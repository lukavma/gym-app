"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatScheme } from "@/domain/schemes/setScheme";
import type { ExerciseDto } from "@/ui/exercises/types";
import type { PrescriptionDto } from "./types";

type Status = "loading" | "ready" | "error";

interface PrescriptionsSectionProps {
  templateId: string;
}

export function PrescriptionsSection({ templateId }: PrescriptionsSectionProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [prescriptions, setPrescriptions] = useState<PrescriptionDto[]>([]);
  const [exercisesById, setExercisesById] = useState<Map<string, ExerciseDto>>(new Map());
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/templates/${templateId}/prescriptions`).then((res) => res.json()) as Promise<{
        prescriptions: PrescriptionDto[];
      }>,
      fetch(`/api/exercises?includeArchived=true`).then((res) => res.json()) as Promise<{
        exercises: ExerciseDto[];
      }>,
    ])
      .then(([prescriptionsData, exercisesData]) => {
        if (cancelled) return;
        setPrescriptions(prescriptionsData.prescriptions);
        setExercisesById(new Map(exercisesData.exercises.map((e) => [e.id, e])));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= prescriptions.length) return;
    const reordered = prescriptions.slice();
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    setPrescriptions(reordered);
    setReordering(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/prescriptions/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescriptionIds: reordered.map((p) => p.id) }),
      });
      if (res.ok) {
        const data: { prescriptions: PrescriptionDto[] } = await res.json();
        setPrescriptions(data.prescriptions);
      }
    } finally {
      setReordering(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-50">Exercises</h2>
        <Link
          href={`/templates/${templateId}/prescriptions/new`}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
        >
          + Add
        </Link>
      </header>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-sm text-red-400">Failed to load exercises.</p>}
      {status === "ready" && prescriptions.length === 0 && (
        <p className="text-sm text-slate-400">No exercises prescribed yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {prescriptions.map((prescription, index) => {
          const exercise = exercisesById.get(prescription.exerciseId);
          return (
            <li
              key={prescription.id}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <Link href={`/prescriptions/${prescription.id}/edit`} className="flex-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-medium text-slate-50">
                    {exercise?.name ?? "Unknown exercise"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatScheme(prescription.scheme.scheme)}
                    {prescription.targetRir &&
                      ` · RIR ${prescription.targetRir.min}-${prescription.targetRir.max}`}
                  </span>
                </div>
              </Link>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={reordering || index === 0}
                  aria-label="Move up"
                  className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={reordering || index === prescriptions.length - 1}
                  aria-label="Move down"
                  className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
