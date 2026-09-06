"use client";

import { useState } from "react";
import Link from "next/link";
import { formatScheme } from "@/domain/schemes/setScheme";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import type { ExplicitDecisionInput } from "@/sync/activeSession";
import type { ActiveSessionExerciseDto, ActiveSessionSetDto } from "@/sync/types";
import { RecommendationCard } from "./RecommendationCard";

interface ExerciseCardProps {
  exercise: ActiveSessionExerciseDto;
  // H-1 remediation — the session's own isDeload, not derived from
  // `exercise`: gates the prefill and the recommendation card so a deload
  // workout never shows or acts on a recommendation, even a stale pre-fix
  // session that still carries one on `exercise.recommendation`.
  isDeload: boolean;
  disabled?: boolean;
}

// MEDIUM-3 — mirrors src/domain/sync/schema.ts's setLogUpsertPayloadSchema
// bounds exactly, so an out-of-range value is caught here instead of
// dead-lettering silently after a round trip to the sync API.
const MAX_WEIGHT_KG = 9999.99;
const MAX_REPS = 100;
const MAX_RIR = 10;

function validateSetInput(weightKg: number, reps: number, rir: number | null): string | null {
  if (!Number.isFinite(weightKg) || weightKg < 0) return "Weight must be 0 or more.";
  if (weightKg > MAX_WEIGHT_KG) return `Weight must be ${MAX_WEIGHT_KG} kg or less.`;
  if (!Number.isInteger(reps) || reps < 1) return "Reps must be a whole number of 1 or more.";
  if (reps > MAX_REPS) return `Reps must be ${MAX_REPS} or less.`;
  if (rir !== null) {
    if (!Number.isInteger(rir) || rir < 0) return "RIR must be a whole number of 0 or more.";
    if (rir > MAX_RIR) return `RIR must be ${MAX_RIR} or less.`;
  }
  return null;
}

// V-1 remediation (docs/reviews/warmup-set-classification-remediation-verification.md)
// — a plain `useState(false)` reset to "off" on any remount of the same
// exercise (a reload, a PWA relaunch, a takeover), silently turning the next
// ramp set into a work set mid-warm-up. Deriving the initial value from the
// last logged set's own `isWarmup` instead makes a remount resume exactly
// where the athlete left off, using data that is already synced and
// rendered — no new persisted field, no sync-contract change. A fresh
// exercise (no sets yet) still starts at false.
function deriveWarmupToggleDefault(exercise: ActiveSessionExerciseDto): boolean {
  return exercise.sets.at(-1)?.isWarmup ?? false;
}

// Prefill priority: the last set logged this session for this exercise →
// the recommendation's target while it is pending or accepted
// (progression-engine.md §7: "the recommendation shows as the prefilled
// target" — the zero-extra-taps happy path that makes the implicit accept
// work) → the chosen values after an explicit modify → the snapshot's
// working-target prefill (also the fallback after an explicit reject).
function derivePrefill(
  exercise: ActiveSessionExerciseDto,
  isDeload: boolean,
): {
  loadKg: number | null;
  reps: number | null;
} {
  const lastSet = exercise.sets.at(-1);
  if (lastSet) return { loadKg: lastSet.weightKg, reps: lastSet.reps };
  const base = exercise.prescription?.snapshot.prefill ?? { loadKg: null, reps: null };
  const rec = recommendationForDeload(isDeload, exercise.recommendation);
  if (rec) {
    const status = rec.decision.status;
    if ((status === "pending" || status === "accepted") && rec.target) {
      return { loadKg: rec.target.loadKg ?? base.loadKg, reps: rec.target.reps ?? base.reps };
    }
    if (status === "modified" && rec.decision.chosen) {
      return {
        loadKg: rec.decision.chosen.loadKg ?? base.loadKg,
        reps: rec.decision.chosen.reps ?? base.reps,
      };
    }
  }
  return base;
}

export function ExerciseCard({ exercise, isDeload, disabled = false }: ExerciseCardProps) {
  const logSet = useActiveSessionStore((s) => s.logSet);
  const editSet = useActiveSessionStore((s) => s.editSet);
  const deleteSet = useActiveSessionStore((s) => s.deleteSet);
  const setSkipped = useActiveSessionStore((s) => s.setExerciseSkipped);
  const setNotes = useActiveSessionStore((s) => s.setExerciseNotes);
  const decideRecommendation = useActiveSessionStore((s) => s.decideRecommendation);

  const recommendation = recommendationForDeload(isDeload, exercise.recommendation);
  const prefill = derivePrefill(exercise, isDeload);
  const [weight, setWeight] = useState(prefill.loadKg !== null ? String(prefill.loadKg) : "");
  const [reps, setReps] = useState(prefill.reps !== null ? String(prefill.reps) : "");
  const [rir, setRir] = useState("");
  // Defaults to false for a fresh exercise, and — since ExerciseCard is
  // keyed by exercise.id — resets on a genuinely different exercise. Within
  // the SAME exercise, it survives a remount by deriving from the last
  // logged set (V-1) and, unlike rir, deliberately does NOT reset after a
  // successful log — a warm-up ramp is consecutive sets, so the toggle
  // stays on until the athlete turns it off themselves.
  const [isWarmup, setIsWarmup] = useState(() => deriveWarmupToggleDefault(exercise));
  const [notesOpen, setNotesOpen] = useState(Boolean(exercise.notes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheme = exercise.prescription?.snapshot.scheme ?? null;
  const targetRir = exercise.prescription?.snapshot.targetRir ?? null;

  async function handleLogSet() {
    const weightKg = parseDecimalInput(weight);
    if (weightKg === null) {
      setError("Weight is required.");
      return;
    }
    const repsValue = Number(reps);
    const rirValue = rir.trim() === "" ? null : Number(rir);

    const validationError = validateSetInput(weightKg, repsValue, rirValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await logSet({
        sessionExerciseId: exercise.id,
        weightKg,
        reps: repsValue,
        rir: rirValue,
        isWarmup,
      });
      setRir("");
    } finally {
      setBusy(false);
    }
  }

  // Explicit decision from the card. The input prefill follows the outcome
  // (only while nothing is logged yet — a typed-in value with sets already
  // logged is the athlete's, not ours to overwrite).
  function handleDecide(decision: ExplicitDecisionInput) {
    void decideRecommendation(exercise.id, decision);
    if (exercise.sets.length > 0) return;
    const base = exercise.prescription?.snapshot.prefill ?? { loadKg: null, reps: null };
    if (decision.status === "rejected") {
      setWeight(base.loadKg !== null ? String(base.loadKg) : "");
      setReps(base.reps !== null ? String(base.reps) : "");
    } else if (decision.status === "modified") {
      if (decision.chosen.loadKg !== undefined) setWeight(String(decision.chosen.loadKg));
      if (decision.chosen.reps !== undefined) setReps(String(decision.chosen.reps));
    } else {
      const target = recommendation?.target;
      if (target?.loadKg !== undefined) setWeight(String(target.loadKg));
      if (target?.reps !== undefined) setReps(String(target.reps));
    }
  }

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3 ${exercise.skipped ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-medium text-slate-50">{exercise.exerciseName}</p>
          {scheme && (
            <p className="text-xs text-slate-400">
              {formatScheme(scheme)}
              {targetRir ? ` @ RIR ${targetRir.min}-${targetRir.max}` : ""}
            </p>
          )}
          {exercise.source === "adhoc" && <p className="text-xs text-slate-500">Ad-hoc</p>}
          {/*
            ADR-011 §15.1 — the strength page is "linked from the library row
            and the workout card". Release A adds this LINK only: no starting
            suggestion, no Use action, no line under the prescription, and no
            bundle field. The page it opens is read-only, so following it can
            neither change nor lose the in-progress session (which lives in
            IndexedDB, not in this component).

            `prefetch={false}` on purpose: a workout is the one screen that
            routinely runs offline, and a background route prefetch failing
            there is a known source of spurious navigations (see the
            `TRANSIENT_READ_FAILURE` note in tests/e2e/helpers.ts).
          */}
          <Link
            href={`/exercises/${exercise.exerciseId}/strength`}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-sm text-slate-400 underline"
          >
            Strength estimate
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void setSkipped(exercise.id, !exercise.skipped)}
          disabled={disabled}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-50"
        >
          {exercise.skipped ? "Unskip" : "Skip"}
        </button>
      </div>

      {recommendation && !exercise.skipped && (
        <RecommendationCard
          recommendation={recommendation}
          disabled={disabled}
          onDecide={handleDecide}
        />
      )}

      {exercise.sets.length > 0 && (
        <ul className="flex flex-col gap-1">
          {exercise.sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              disabled={disabled}
              onEdit={(patch) => void editSet(exercise.id, set.id, patch)}
              onDelete={() => void deleteSet(exercise.id, set.id)}
            />
          ))}
        </ul>
      )}

      {!exercise.skipped && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isWarmup}
              onChange={(e) => setIsWarmup(e.target.checked)}
              disabled={disabled}
              className="h-5 w-5 rounded border-slate-700 bg-slate-950 accent-slate-100 disabled:opacity-50"
            />
            Warm-up set
          </label>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-slate-400">kg</span>
              <input
                type="text"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(sanitizeDecimalDraft(e.target.value))}
                disabled={disabled}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-slate-400">reps</span>
              <input
                type="number"
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                disabled={disabled}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </label>
            <label className="flex w-16 flex-col gap-1">
              <span className="text-xs text-slate-400">RIR</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={rir}
                onChange={(e) => setRir(e.target.value)}
                disabled={disabled}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              onClick={handleLogSet}
              disabled={busy || disabled}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            >
              Log
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          disabled={disabled}
          className="text-xs text-slate-500 underline disabled:opacity-50"
        >
          {notesOpen ? "Hide notes" : "Add notes"}
        </button>
        {notesOpen && (
          <textarea
            defaultValue={exercise.notes ?? ""}
            disabled={disabled}
            onBlur={(e) =>
              void setNotes(exercise.id, e.target.value.trim() === "" ? null : e.target.value)
            }
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
            rows={2}
          />
        )}
      </div>
    </li>
  );
}

function SetRow({
  set,
  disabled = false,
  onEdit,
  onDelete,
}: {
  set: ActiveSessionSetDto;
  disabled?: boolean;
  onEdit: (patch: {
    weightKg?: number;
    reps?: number;
    rir?: number | null;
    isWarmup?: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(String(set.weightKg));
  const [reps, setReps] = useState(String(set.reps));
  const [rir, setRir] = useState(set.rir === null ? "" : String(set.rir));
  // V-2 remediation — seeded from the actual stored value every time edit
  // mode opens (this row remounts per set via `key={set.id}` in the parent
  // list), so a set mislogged as warm-up/work mid-session can be corrected
  // in place instead of only after completion via History.
  const [isWarmup, setIsWarmup] = useState(set.isWarmup);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <li className="flex flex-col gap-1">
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
              const weightKg = parseDecimalInput(weight);
              if (weightKg === null) {
                setError("Weight is required.");
                return;
              }
              const repsValue = Number(reps);
              const rirValue = rir.trim() === "" ? null : Number(rir);
              const validationError = validateSetInput(weightKg, repsValue, rirValue);
              if (validationError) {
                setError(validationError);
                return;
              }
              setError(null);
              onEdit({ weightKg, reps: repsValue, rir: rirValue, isWarmup });
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
        {/* Placed after the weight/reps/rir inputs, not before: three e2e
            specs address this row's inputs positionally by index since they
            carry no aria-labels — offline-set-edit-delete.spec.ts,
            reconnect-batch-idempotence.spec.ts, and
            transient-failure-fifo.spec.ts (each `.nth(0)`/`.nth(1)` for
            weight/reps) — inserting this checkbox earlier would silently
            shift those indices in all three (W-3, second verification). */}
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
          disabled={disabled}
          className="text-xs text-slate-500 underline disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (window.confirm("Delete this set?")) onDelete();
          }}
          className="text-xs text-red-400 underline disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
