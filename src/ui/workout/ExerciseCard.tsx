"use client";

import { useState } from "react";
import Link from "next/link";
import { formatScheme, type SetScheme } from "@/domain/schemes/setScheme";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";
import { schemeDefaultReps } from "@/domain/progression/workingTargets";
import { formatSetLine, minutesSecondsLabel } from "@/domain/measurement/format";
import {
  dimensionsOf,
  type LoadBasis,
  type MeasurementProfile,
} from "@/domain/measurement/profile";
import { isProfileEligibleForE1rm } from "@/domain/measurement/capabilities";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { validateSetInput } from "./validateSetInput";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import type { EditSetPatch, ExplicitDecisionInput } from "@/sync/activeSession";
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

// §15.3's Noun column — the only two user-facing places the pre-Release-2
// UI hardcoded the word "set": the warm-up toggle's label and the delete
// confirmation. `load_reps`/`reps` count reps against a Set; every
// distance/duration profile counts a Round instead (a round of sled pushes,
// a round of sprints, a round of planks).
const ROUND_NOUN_PROFILES: ReadonlySet<MeasurementProfile> = new Set([
  "load_distance",
  "distance_time",
  "duration",
  "load_duration",
]);

function nounForProfile(profile: MeasurementProfile): "Set" | "Round" {
  return ROUND_NOUN_PROFILES.has(profile) ? "Round" : "Set";
}

// §9.1's two athletic scheme variants carry the round target on `distanceM`/
// `durationS` directly (no reps dimension at all — schemeDefaultReps already
// returns null for both). Small, profile-card-local wrappers rather than
// additions to `workingTargets.ts`: that module is domain/progression's
// load/rep prefill chain (decision → carry-forward → baseline), which this
// stage must not extend with athletic logic of its own (HARD BOUNDARIES).
function schemeDistanceM(scheme: SetScheme | null): number | null {
  return scheme?.type === "distanceRounds" ? scheme.distanceM : null;
}

function schemeDurationS(scheme: SetScheme | null): number | null {
  return scheme?.type === "durationRounds" ? scheme.durationS : null;
}

interface SetFieldPrefill {
  loadKg: number | null;
  reps: number | null;
  distanceM: number | null;
  durationS: number | null;
}

// §15.3's Copy-forward / Prefill columns, generalising the pre-Release-2
// derivePrefill (load_reps only: last set's kg+reps, or the recommendation/
// snapshot-prefill chain while nothing is logged yet) to every profile.
//
// Copy-forward (a set already exists this exercise): each profile carries
// forward exactly the fields its own §15.3 row names, and the rest of this
// function's return value stays null — RIR is handled separately (its own
// state, always cleared, never part of this prefill) and `s` is explicitly
// cleared for `load_distance`/`distance_time` by NOT carrying it forward
// here.
//
// Prefill (nothing logged yet): only `load_reps` consults the
// recommendation → snapshot-prefill chain (unchanged) — no non-`load_reps`
// profile has a progression engine in this release (§9.2: only `manual`
// supports them, and `manual` never proposes a recommendation), so the
// other five profiles prefill straight from the frozen scheme
// (`schemeDefaultReps`/`schemeDistanceM`/`schemeDurationS`) or, for a load
// dimension, the snapshot's own `prefill.loadKg`.
function derivePrefill(exercise: ActiveSessionExerciseDto, isDeload: boolean): SetFieldPrefill {
  const profile = exercise.measurement.profile;
  const lastSet = exercise.sets.at(-1);

  if (lastSet) {
    switch (profile) {
      case "load_reps":
        return { loadKg: lastSet.weightKg, reps: lastSet.reps, distanceM: null, durationS: null };
      case "reps":
        return { loadKg: null, reps: lastSet.reps, distanceM: null, durationS: null };
      case "load_distance":
        return {
          loadKg: lastSet.weightKg,
          reps: null,
          distanceM: lastSet.distanceM,
          durationS: null,
        };
      case "distance_time":
        return { loadKg: null, reps: null, distanceM: lastSet.distanceM, durationS: null };
      case "duration":
        return { loadKg: null, reps: null, distanceM: null, durationS: lastSet.durationS };
      case "load_duration":
        return {
          loadKg: lastSet.weightKg,
          reps: null,
          distanceM: null,
          durationS: lastSet.durationS,
        };
    }
  }

  const scheme = exercise.prescription?.snapshot.scheme ?? null;
  const base = exercise.prescription?.snapshot.prefill ?? { loadKg: null, reps: null };

  if (profile === "load_reps") {
    const rec = recommendationForDeload(isDeload, exercise.recommendation);
    if (rec) {
      const status = rec.decision.status;
      if ((status === "pending" || status === "accepted") && rec.target) {
        return {
          loadKg: rec.target.loadKg ?? base.loadKg,
          reps: rec.target.reps ?? base.reps,
          distanceM: null,
          durationS: null,
        };
      }
      if (status === "modified" && rec.decision.chosen) {
        return {
          loadKg: rec.decision.chosen.loadKg ?? base.loadKg,
          reps: rec.decision.chosen.reps ?? base.reps,
          distanceM: null,
          durationS: null,
        };
      }
    }
    return { loadKg: base.loadKg, reps: base.reps, distanceM: null, durationS: null };
  }

  switch (profile) {
    case "reps":
      return {
        loadKg: null,
        reps: scheme ? schemeDefaultReps(scheme) : null,
        distanceM: null,
        durationS: null,
      };
    case "load_distance":
      return {
        loadKg: base.loadKg,
        reps: null,
        distanceM: schemeDistanceM(scheme),
        durationS: null,
      };
    case "distance_time":
      return { loadKg: null, reps: null, distanceM: schemeDistanceM(scheme), durationS: null };
    case "duration":
      return { loadKg: null, reps: null, distanceM: null, durationS: schemeDurationS(scheme) };
    case "load_duration":
      return {
        loadKg: base.loadKg,
        reps: null,
        distanceM: null,
        durationS: schemeDurationS(scheme),
      };
    default:
      return { loadKg: null, reps: null, distanceM: null, durationS: null };
  }
}

// O-16 (§13.4/§15.3) — the exact, non-paraphrased copy for a set or slot
// whose sync op dead-lettered. Shared by the set-row marker below and the
// slot-level (sessionExercise) marker on the card header, and by
// WorkoutExecution's completion-confirmation copy, so the wording can never
// drift between the two sites.
export const NOT_SAVED_COPY = "Not saved - see Sync issues.";

export function ExerciseCard({ exercise, isDeload, disabled = false }: ExerciseCardProps) {
  const logSet = useActiveSessionStore((s) => s.logSet);
  const editSet = useActiveSessionStore((s) => s.editSet);
  const deleteSet = useActiveSessionStore((s) => s.deleteSet);
  const setSkipped = useActiveSessionStore((s) => s.setExerciseSkipped);
  const setNotes = useActiveSessionStore((s) => s.setExerciseNotes);
  const decideRecommendation = useActiveSessionStore((s) => s.decideRecommendation);
  const refusedSetLogIds = useActiveSessionStore((s) => s.refusedSetLogIds);
  const refusedSessionExerciseIds = useActiveSessionStore((s) => s.refusedSessionExerciseIds);
  const slotRefused = refusedSessionExerciseIds.has(exercise.id);

  const profile = exercise.measurement.profile;
  const dims = dimensionsOf(profile);
  const noun = nounForProfile(profile);

  const recommendation = recommendationForDeload(isDeload, exercise.recommendation);
  const prefill = derivePrefill(exercise, isDeload);
  const [weight, setWeight] = useState(prefill.loadKg !== null ? String(prefill.loadKg) : "");
  const [reps, setReps] = useState(prefill.reps !== null ? String(prefill.reps) : "");
  const [rir, setRir] = useState("");
  const [distance, setDistance] = useState(
    prefill.distanceM !== null ? String(prefill.distanceM) : "",
  );
  const [duration, setDuration] = useState(
    prefill.durationS !== null ? String(prefill.durationS) : "",
  );
  // Defaults to false for a fresh exercise, and — since ExerciseCard is
  // keyed by exercise.id — resets on a genuinely different exercise. Within
  // the SAME exercise, it survives a remount by deriving from the last
  // logged set (V-1) and, unlike rir, deliberately does NOT reset after a
  // successful log — a warm-up ramp is consecutive sets, so the toggle
  // stays on until the athlete turns it off themselves. Available in every
  // profile (§15.3: "do not restrict it" — a light sled push is a warm-up
  // round too).
  const [isWarmup, setIsWarmup] = useState(() => deriveWarmupToggleDefault(exercise));
  const [notesOpen, setNotesOpen] = useState(Boolean(exercise.notes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheme = exercise.prescription?.snapshot.scheme ?? null;
  const targetRir = exercise.prescription?.snapshot.targetRir ?? null;

  // O-8 — a prefilled or currently-typed duration >= 60 s additionally shows
  // as `m:ss` beside the seconds figure; reuses format.ts's
  // `minutesSecondsLabel` rather than re-deriving the floor/divide math.
  const parsedDuration = parseDecimalInput(duration);
  const durationMmss = parsedDuration !== null ? minutesSecondsLabel(parsedDuration) : null;

  async function handleLogSet() {
    const weightKg = dims.weight === "forbidden" ? null : parseDecimalInput(weight);
    const repsValue = dims.reps === "forbidden" ? null : reps.trim() === "" ? null : Number(reps);
    const rirValue = dims.rir === "forbidden" ? null : rir.trim() === "" ? null : Number(rir);
    const distanceMValue = dims.distance === "forbidden" ? null : parseDecimalInput(distance);
    const durationSValue = dims.duration === "forbidden" ? null : parseDecimalInput(duration);

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
    setBusy(true);
    try {
      await logSet({
        sessionExerciseId: exercise.id,
        weightKg,
        reps: repsValue,
        rir: rirValue,
        distanceM: distanceMValue,
        durationS: durationSValue,
        isWarmup,
      });
      // §15.3's Copy-forward column: RIR always clears (every profile);
      // `s` additionally clears for `load_distance`/`distance_time` (the
      // two rows whose Copy-forward cell says "; s cleared"). Every other
      // field is left exactly as typed, which IS the carry-forward — the
      // athlete's own last entry stays in the box for the next round/set.
      setRir("");
      if (profile === "load_distance" || profile === "distance_time") setDuration("");
    } finally {
      setBusy(false);
    }
  }

  // Explicit decision from the card. The input prefill follows the outcome
  // (only while nothing is logged yet — a typed-in value with sets already
  // logged is the athlete's, not ours to overwrite). Only ever reachable for
  // `load_reps`: `recommendation` is non-null only when the server (or the
  // offline client evaluator) computed one, and both gate on
  // `profile === "load_reps"` (evaluateSession.ts, NC-9) — no non-`load_reps`
  // profile has a progression engine in this release (§9.2).
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
          {/* O-16 — this slot's own sessionExercise op dead-lettered (e.g. a
              skip/notes/ad-hoc-add the server rejected). The set-level
              marker below covers individual setLog dead letters; this one
              covers the slot itself, per §13.4's "that set / slot". */}
          {slotRefused && <p className="text-xs text-red-400">{NOT_SAVED_COPY}</p>}
          {/*
            ADR-011 §15.1 — the strength page is "linked from the library row
            and the workout card". §15.3 (this stage) additionally gates the
            link on the structural compatibility gate: it renders only for a
            profile/basis combination `isProfileEligibleForE1rm` (the shared
            `domain/measurement/capabilities` structural check the tracker's
            own `evaluateExerciseEligibility` is built from and documents as
            equivalent to its own first two checks) accepts, so a distance or
            duration exercise — which the page itself would just report as
            ineligible — never shows a dead-end link on the card. Equipment
            and the `strength_estimate` switch stay the page's own job, as
            before: this card has neither in its data (see judgmentCalls).

            `prefetch={false}` on purpose: a workout is the one screen that
            routinely runs offline, and a background route prefetch failing
            there is a known source of spurious navigations (see the
            `TRANSIENT_READ_FAILURE` note in tests/e2e/helpers.ts).
          */}
          {isProfileEligibleForE1rm(profile, exercise.measurement.loadBasis) && (
            <Link
              href={`/exercises/${exercise.exerciseId}/strength`}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-sm text-slate-400 underline"
            >
              Strength estimate
            </Link>
          )}
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
              profile={profile}
              loadBasis={exercise.measurement.loadBasis}
              noun={noun}
              disabled={disabled}
              refused={refusedSetLogIds.has(set.id)}
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
            Warm-up {noun.toLowerCase()}
          </label>
          <div className="flex items-end gap-2">
            {dims.weight !== "forbidden" && (
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-400">kg</span>
                <input
                  aria-label="Weight in kilograms"
                  type="text"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(sanitizeDecimalDraft(e.target.value))}
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
            )}
            {dims.reps !== "forbidden" && (
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-400">reps</span>
                <input
                  aria-label="Repetitions"
                  type="number"
                  inputMode="numeric"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
            )}
            {dims.distance !== "forbidden" && (
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-400">m</span>
                <input
                  aria-label="Distance in metres"
                  type="text"
                  inputMode="decimal"
                  value={distance}
                  onChange={(e) => setDistance(sanitizeDecimalDraft(e.target.value))}
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
            )}
            {dims.duration !== "forbidden" && (
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-400">s</span>
                <input
                  aria-label="Time in seconds"
                  type="text"
                  inputMode="decimal"
                  // §15.3 — the em-dash placeholder is the existing RIR
                  // convention, reused verbatim, and only where `s` is
                  // itself optional (`load_distance`); every other profile
                  // that carries `s` requires it.
                  placeholder={dims.duration === "optional" ? "—" : undefined}
                  value={duration}
                  onChange={(e) => setDuration(sanitizeDecimalDraft(e.target.value))}
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
                {durationMmss && <span className="text-[10px] text-slate-500">{durationMmss}</span>}
              </label>
            )}
            {dims.rir !== "forbidden" && (
              <label className="flex w-16 flex-col gap-1">
                <span className="text-xs text-slate-400">RIR</span>
                <input
                  aria-label="Reps in reserve"
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={rir}
                  onChange={(e) => setRir(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
            )}
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

function SetRow({
  set,
  profile,
  loadBasis,
  noun,
  disabled = false,
  refused,
  onEdit,
  onDelete,
}: {
  set: ActiveSessionSetDto;
  profile: MeasurementProfile;
  loadBasis: LoadBasis | null;
  noun: "Set" | "Round";
  disabled?: boolean;
  // O-16 (§13.4/§15.3) — true when this row's own setLog op dead-lettered
  // for the active session (ExerciseCard matches `refusedSetLogIds` from
  // useActiveSessionStore by `set.id` before passing this down).
  refused?: boolean;
  onEdit: (patch: EditSetPatch) => void;
  onDelete: () => void;
}) {
  const dims = dimensionsOf(profile);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(set.weightKg !== null ? String(set.weightKg) : "");
  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : "");
  const [rir, setRir] = useState(set.rir === null ? "" : String(set.rir));
  const [distance, setDistance] = useState(set.distanceM !== null ? String(set.distanceM) : "");
  const [duration, setDuration] = useState(set.durationS !== null ? String(set.durationS) : "");
  // V-2 remediation — seeded from the actual stored value every time edit
  // mode opens (this row remounts per set via `key={set.id}` in the parent
  // list), so a set mislogged as warm-up/work mid-session can be corrected
  // in place instead of only after completion via History.
  const [isWarmup, setIsWarmup] = useState(set.isWarmup);
  const [error, setError] = useState<string | null>(null);

  const parsedDuration = parseDecimalInput(duration);
  const durationMmss = parsedDuration !== null ? minutesSecondsLabel(parsedDuration) : null;

  if (editing) {
    // M-1 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md
    // §5.3) — `load_distance` is the only profile whose edit row carries
    // all three `w-16` inputs (weight, distance, duration) plus Save/
    // Cancel, which measured 329px against the 320px budget with the
    // default `gap-2`; every other profile's edit row already fits at
    // `gap-2` today and must stay pixel-identical, so the tighter spacing
    // is scoped to this one profile only.
    const editRowGapClass = profile === "load_distance" ? "gap-1" : "gap-2";
    return (
      <li className="flex flex-col gap-1">
        <div className={`flex items-center ${editRowGapClass} text-sm`}>
          {/* Placed in this exact order — weight, reps, distance, duration,
              RIR — not before it: three e2e specs address this row's
              `load_reps` inputs positionally by index since they carry no
              visible unit labels — offline-set-edit-delete.spec.ts,
              reconnect-batch-idempotence.spec.ts, and
              transient-failure-fifo.spec.ts (each `.nth(0)`/`.nth(1)` for
              weight/reps) — and `load_reps` never renders the distance/
              duration inputs (`dims.distance`/`dims.duration` are both
              "forbidden" for it), so its weight/reps/RIR positions are
              unchanged (W-3, second verification). */}
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
                  §5.3) — `load_distance` is the one profile whose edit row
                  carries all three `w-16` inputs (weight, distance,
                  duration) plus this `m:ss` sibling, which is what pushed it
                  to 329px against the 320px budget. Every other profile
                  with a duration field (`distance_time`, `duration`,
                  `load_duration`) already fits at 320px with the sibling
                  inline, so it stays inline for them unchanged; only
                  `load_distance` drops it to its own line below. */}
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
              onEdit({
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
          Warm-up {noun.toLowerCase()}
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between text-sm text-slate-300">
      <span>
        {set.isWarmup ? <span className="text-slate-500">W · </span> : null}
        {formatSetLine(profile, loadBasis, set)}
        {refused && (
          <span className="ml-2 rounded border border-red-800 px-1 text-[10px] text-red-400">
            {NOT_SAVED_COPY}
          </span>
        )}
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
            if (window.confirm(`Delete this ${noun.toLowerCase()}?`)) onDelete();
          }}
          className="text-xs text-red-400 underline disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
