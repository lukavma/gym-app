"use client";

import { useEffect, useState } from "react";
import { formatScheme } from "@/domain/schemes/setScheme";
import { planSetDeletion } from "@/domain/sync/setNumbering";
import type { WeekModifiers } from "@/domain/blocks/schema";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import {
  correctHistorySet,
  deleteHistorySet,
  type HistorySetCorrectionPatch,
} from "@/sync/corrections";
import type { HistorySessionDetail, HistorySetDetail } from "./types";

type Status = "loading" | "ready" | "error" | "not_found";

// prescription-model.md §5 — "history is self-explaining": renders which of
// the three modifier axes were applied to this exercise's frozen snapshot.
function formatAppliedModifiers(modifiers: WeekModifiers): string {
  const parts: string[] = [];
  if (modifiers.setMultiplier !== undefined) parts.push(`${modifiers.setMultiplier}× sets`);
  if (modifiers.loadMultiplier !== undefined) parts.push(`${modifiers.loadMultiplier}× load`);
  if (modifiers.targetRirShift !== undefined) {
    const sign = modifiers.targetRirShift >= 0 ? "+" : "";
    parts.push(`RIR ${sign}${modifiers.targetRirShift}`);
  }
  return parts.length > 0 ? `Modified: ${parts.join(", ")}` : "Modified";
}

export function HistoryDetail({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<HistorySessionDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error("not_found");
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ session: HistorySessionDetail }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSession(data.session);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof Error && err.message === "not_found" ? "not_found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "loading") return <p className="text-sm text-slate-400">Loading…</p>;
  if (status === "not_found") return <p className="text-sm text-slate-400">Workout not found.</p>;
  if (status === "error" || !session)
    return <p className="text-sm text-red-400">Failed to load workout.</p>;

  function updateLocalSet(
    sessionExerciseId: string,
    setId: string,
    patch: HistorySetCorrectionPatch,
  ) {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.id !== sessionExerciseId
            ? ex
            : { ...ex, sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) },
        ),
      };
    });
  }

  // Finding D — the optimistic local update applies the same renumbering the
  // enqueued ops will apply server-side, so what the screen shows after a
  // delete is what PostgreSQL will hold once the outbox drains.
  function removeLocalSet(sessionExerciseId: string, setId: string) {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.id !== sessionExerciseId
            ? ex
            : { ...ex, sets: planSetDeletion(ex.sets, setId).remaining },
        ),
      };
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">{session.templateName ?? "Workout"}</h1>
        <p className="text-xs text-slate-400">
          {new Date(session.startedAt).toLocaleString()}
          {session.weekIndex !== null ? ` · Week ${session.weekIndex}` : ""}
          {session.isDeload ? " · deload" : ""}
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {session.exercises
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((exercise) => (
            <li
              key={exercise.id}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <p className="text-base font-medium text-slate-50">{exercise.exerciseName}</p>
              {exercise.prescription && (
                <p className="text-xs text-slate-400">
                  {formatScheme(exercise.prescription.snapshot.scheme)}
                </p>
              )}
              {exercise.prescription?.snapshot.appliedModifiers && (
                <p className="text-xs text-amber-400">
                  {formatAppliedModifiers(exercise.prescription.snapshot.appliedModifiers)}
                </p>
              )}
              {exercise.skipped && <p className="text-xs text-amber-400">Skipped</p>}
              <ul className="mt-2 flex flex-col gap-1">
                {exercise.sets.map((set) => (
                  <HistorySetRow
                    key={set.id}
                    set={set}
                    onSave={(patch) => {
                      updateLocalSet(exercise.id, set.id, patch);
                      void correctHistorySet(set.id, exercise.id, patch);
                    }}
                    onDelete={() => {
                      // `exercise.sets` here is the pre-deletion list, which
                      // is what deleteHistorySet needs to plan renumbering.
                      void deleteHistorySet(exercise.id, set.id, exercise.sets);
                      removeLocalSet(exercise.id, set.id);
                    }}
                  />
                ))}
                {exercise.sets.length === 0 && (
                  <li className="text-xs text-slate-500">No sets logged.</li>
                )}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}

function HistorySetRow({
  set,
  onSave,
  onDelete,
}: {
  set: HistorySetDetail;
  onSave: (patch: {
    weightKg: number;
    reps: number;
    rir: number | null;
    isWarmup: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(String(set.weightKg));
  const [reps, setReps] = useState(String(set.reps));
  const [rir, setRir] = useState(set.rir === null ? "" : String(set.rir));
  // Seeded from the actual stored value every time edit mode opens (this
  // component remounts per set via `key={set.id}` in the parent list, so a
  // fresh `useState(set.isWarmup)` always reflects what's persisted — never
  // fabricated or defaulted while the athlete is only touching weight/reps/rir).
  const [isWarmup, setIsWarmup] = useState(set.isWarmup);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <li className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={isWarmup}
            onChange={(e) => setIsWarmup(e.target.checked)}
            className="h-5 w-5 rounded border-slate-700 bg-slate-950 accent-slate-100"
          />
          Warm-up set
        </label>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="text"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(sanitizeDecimalDraft(e.target.value))}
            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
          />
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
          />
          <input
            type="number"
            inputMode="numeric"
            value={rir}
            onChange={(e) => setRir(e.target.value)}
            className="w-12 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
          />
          <button
            type="button"
            onClick={() => {
              // M-1 remediation — a comma-typed or otherwise unparseable
              // correction must never silently become 0 kg on a completed
              // set; an explicitly typed 0 stays valid (bodyweight sets).
              const weightKg = parseDecimalInput(weight);
              if (weightKg === null) {
                setError("Weight is required.");
                return;
              }
              setError(null);
              onSave({
                weightKg,
                reps: Number(reps),
                rir: rir.trim() === "" ? null : Number(rir),
                isWarmup,
              });
              setEditing(false);
            }}
            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-900"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(false);
            }}
            className="text-xs text-slate-500"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between text-sm text-slate-300">
      <span>
        {set.isWarmup ? <span className="text-slate-500">W · </span> : null}
        {set.weightKg} kg × {set.reps}
        {set.rir !== null ? ` @ RIR ${set.rir}` : ""}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-slate-500 underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Delete this set?")) onDelete();
          }}
          className="text-xs text-red-400 underline"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
