"use client";

import { useEffect, useState } from "react";
import { formatScheme } from "@/domain/schemes/setScheme";
import { planSetDeletion } from "@/domain/sync/setNumbering";
import { formatSetLine, minutesSecondsLabel } from "@/domain/measurement/format";
import {
  dimensionsOf,
  type LoadBasis,
  type MeasurementProfile,
} from "@/domain/measurement/profile";
import type { WeekModifiers } from "@/domain/blocks/schema";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { validateSetInput } from "@/ui/workout/validateSetInput";
import type { HistorySetCorrectionPatch } from "@/sync/corrections";
import {
  submitHistorySetCorrection,
  submitHistorySetDeletion,
} from "@/ui/history/correctionSubmit";
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
  // L-8 remediation — keyed by setId, so a reverted correction/deletion has
  // somewhere visible to say so once `submitHistorySetCorrection` /
  // `submitHistorySetDeletion` (src/ui/history/correctionSubmit.ts) reverts
  // the optimistic update. `HistorySetRow`'s editing branch has already
  // closed by the time either promise settles (Save/Delete complete
  // synchronously from the athlete's point of view), so this can't live in
  // that component's own local `error` state.
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});

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

  // L-8 remediation — the inverse of `removeLocalSet`: restores an exercise's
  // full, pre-deletion `sets` array. Used to undo the optimistic renumbering
  // above when `deleteHistorySet` rejects (submitHistorySetDeletion's
  // `revertOptimistic`), so a failed delete never leaves the screen showing
  // the renumbered survivors with no corresponding outbox ops.
  function restoreLocalSets(sessionExerciseId: string, sets: HistorySetDetail[]) {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) => (ex.id !== sessionExerciseId ? ex : { ...ex, sets })),
      };
    });
  }

  function setSyncError(setId: string, message: string) {
    setSyncErrors((prev) => ({ ...prev, [setId]: message }));
  }

  function clearSyncError(setId: string) {
    setSyncErrors((prev) => {
      if (!(setId in prev)) return prev;
      const next = { ...prev };
      delete next[setId];
      return next;
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
                    profile={exercise.measurement.profile}
                    loadBasis={exercise.measurement.loadBasis}
                    syncError={syncErrors[set.id]}
                    onSave={(patch) => {
                      // L-8 remediation — `set` here is this render's
                      // pre-edit row, so it's exactly what a failed
                      // correction must revert back to. `updateLocalSet`
                      // (the optimistic apply) and the revert both go
                      // through `submitHistorySetCorrection`
                      // (src/ui/history/correctionSubmit.ts), which awaits
                      // `correctHistorySet` and reverts + surfaces an error
                      // if it rejects (O-13's schema `.parse()` made that
                      // reachable) instead of leaving an unhandled
                      // rejection alongside a phantom edit.
                      const previous: HistorySetCorrectionPatch = {
                        weightKg: set.weightKg,
                        reps: set.reps,
                        rir: set.rir,
                        distanceM: set.distanceM,
                        durationS: set.durationS,
                        isWarmup: set.isWarmup,
                      };
                      clearSyncError(set.id);
                      void submitHistorySetCorrection(set.id, exercise.id, patch, {
                        applyOptimistic: () => updateLocalSet(exercise.id, set.id, patch),
                        revertOptimistic: () => updateLocalSet(exercise.id, set.id, previous),
                        onError: (message) => setSyncError(set.id, message),
                      });
                    }}
                    onDelete={() => {
                      // `exercise.sets` here is the pre-deletion list, which
                      // is what deleteHistorySet needs to plan renumbering,
                      // and (L-8) exactly what a failed delete must restore.
                      // `exercise.measurement.profile` (O-13, §12.3) decides
                      // which keys the renumber upserts carry.
                      const previousSets = exercise.sets;
                      clearSyncError(set.id);
                      void submitHistorySetDeletion(
                        exercise.id,
                        set.id,
                        exercise.sets,
                        exercise.measurement.profile,
                        {
                          applyOptimistic: () => removeLocalSet(exercise.id, set.id),
                          revertOptimistic: () => restoreLocalSets(exercise.id, previousSets),
                          onError: (message) => setSyncError(set.id, message),
                        },
                      );
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

// Exported (only) so the Release 2 wiring test can render this read-mode
// row directly — HistoryDetail itself gates it behind a fetch effect that
// never runs under a plain (non-`act`) render.
export function HistorySetRow({
  set,
  profile,
  loadBasis,
  onSave,
  onDelete,
  syncError,
}: {
  set: HistorySetDetail;
  profile: MeasurementProfile;
  loadBasis: LoadBasis | null;
  onSave: (patch: HistorySetCorrectionPatch) => void;
  onDelete: () => void;
  // L-8 remediation — set once a correction or deletion for THIS row was
  // reverted after `correctHistorySet`/`deleteHistorySet` rejected. Rendered
  // in the read-mode branch below because by the time either promise
  // settles, `editing` has already gone back to `false` (Save/Delete both
  // resolve synchronously from the athlete's point of view).
  syncError?: string;
}) {
  const dims = dimensionsOf(profile);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(set.weightKg !== null ? String(set.weightKg) : "");
  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : "");
  const [rir, setRir] = useState(set.rir === null ? "" : String(set.rir));
  const [distance, setDistance] = useState(set.distanceM !== null ? String(set.distanceM) : "");
  const [duration, setDuration] = useState(set.durationS !== null ? String(set.durationS) : "");
  // Seeded from the actual stored value every time edit mode opens (this
  // component remounts per set via `key={set.id}` in the parent list, so a
  // fresh `useState(set.isWarmup)` always reflects what's persisted — never
  // fabricated or defaulted while the athlete is only touching the profile's
  // own fields).
  const [isWarmup, setIsWarmup] = useState(set.isWarmup);
  const [error, setError] = useState<string | null>(null);

  const parsedDuration = parseDecimalInput(duration);
  const durationMmss = parsedDuration !== null ? minutesSecondsLabel(parsedDuration) : null;

  if (editing) {
    // M-1 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md
    // §5.3) — same fix as ExerciseCard.tsx's SetRow edit branch: `load_distance`
    // is the only profile whose edit row carries all three `w-16` inputs
    // (weight, distance, duration) plus Save/Cancel, which measured 329px
    // against the 320px budget with the default `gap-2`; every other
    // profile's edit row already fits at `gap-2` today and must stay
    // pixel-identical, so the tighter spacing is scoped to this one
    // profile only.
    const editRowGapClass = profile === "load_distance" ? "gap-1" : "gap-2";
    return (
      <li className="flex flex-col gap-1">
        {/* Same field set, same validation, and the same visual order —
            weight, reps, distance, duration, RIR — as ExerciseCard.tsx's
            SetRow edit mode (src/ui/workout/ExerciseCard.tsx), both driven by
            `dimensionsOf(profile)` and `validateSetInput` (§15.3) so a
            history correction can never accept a value the live workout card
            would reject. */}
        <div className={`flex items-center ${editRowGapClass} text-sm`}>
          {dims.weight !== "forbidden" && (
            <input
              aria-label="Weight in kilograms"
              type="text"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(sanitizeDecimalDraft(e.target.value))}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          )}
          {dims.reps !== "forbidden" && (
            <input
              aria-label="Repetitions"
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          )}
          {dims.distance !== "forbidden" && (
            <input
              aria-label="Distance in metres"
              type="text"
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(sanitizeDecimalDraft(e.target.value))}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          )}
          {dims.duration !== "forbidden" && (
            <span className="flex items-center gap-1">
              <input
                aria-label="Time in seconds"
                type="text"
                inputMode="decimal"
                placeholder={dims.duration === "optional" ? "—" : undefined}
                value={duration}
                onChange={(e) => setDuration(sanitizeDecimalDraft(e.target.value))}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
              />
              {/* M-1 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md
                  §5.3) — same fix as ExerciseCard.tsx's SetRow edit branch:
                  `load_distance` is the one profile whose edit row carries
                  all three `w-16` inputs (weight, distance, duration) plus
                  this `m:ss` sibling, pushing it to 329px against the
                  320px budget. Every other profile with a duration field
                  already fits at 320px with the sibling inline, so it
                  stays inline for them; only `load_distance` drops it to
                  its own line below. */}
              {durationMmss && profile !== "load_distance" && (
                <span className="text-[10px] text-slate-500">{durationMmss}</span>
              )}
            </span>
          )}
          {dims.rir !== "forbidden" && (
            <input
              aria-label="Reps in reserve"
              type="number"
              inputMode="numeric"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              className="w-12 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            />
          )}
          <button
            type="button"
            onClick={() => {
              const weightKg = dims.weight === "forbidden" ? null : parseDecimalInput(weight);
              const repsValue =
                dims.reps === "forbidden" ? null : reps.trim() === "" ? null : Number(reps);
              const rirValue =
                dims.rir === "forbidden" ? null : rir.trim() === "" ? null : Number(rir);
              const distanceMValue =
                dims.distance === "forbidden" ? null : parseDecimalInput(distance);
              const durationSValue =
                dims.duration === "forbidden" ? null : parseDecimalInput(duration);
              const validationError = validateSetInput(profile, {
                weightKg,
                reps: repsValue,
                rir: rirValue,
                distanceM: distanceMValue,
                durationS: durationSValue,
                distanceMRaw: distance,
                durationSRaw: duration,
              });
              if (validationError) {
                setError(validationError);
                return;
              }
              setError(null);
              onSave({
                weightKg,
                reps: repsValue,
                rir: rirValue,
                distanceM: distanceMValue,
                durationS: durationSValue,
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
        {/* M-1 remediation — the `m:ss` label for `load_distance` only,
            moved off the main row (see the comment above the duration
            input) so the row fits the 320px budget. */}
        {durationMmss && profile === "load_distance" && (
          <span className="text-[10px] text-slate-500">{durationMmss}</span>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={isWarmup}
            onChange={(e) => setIsWarmup(e.target.checked)}
            className="h-5 w-5 rounded border-slate-700 bg-slate-950 accent-slate-100"
          />
          Warm-up set
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>
          {set.isWarmup ? <span className="text-slate-500">W · </span> : null}
          {formatSetLine(profile, loadBasis, set)}
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
      </div>
      {/* L-8 remediation — visible only after a correction/deletion for this
          row was reverted (see `syncError` above). */}
      {syncError && <p className="text-xs text-red-400">{syncError}</p>}
    </li>
  );
}
