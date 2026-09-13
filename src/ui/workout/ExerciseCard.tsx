"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatScheme,
  isGroupsScheme,
  type GroupsScheme,
  type SetScheme,
} from "@/domain/schemes/setScheme";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";
import { schemeDefaultReps } from "@/domain/progression/workingTargets";
import { formatRestSeconds, formatSetLine, minutesSecondsLabel } from "@/domain/measurement/format";
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
import { describeGroupLink, groupPrefill, nextGroupSelection } from "./groupSelection";
import type { GroupLinkDescription } from "./groupSelection";

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
function formatGroupSetRange(group: { sets: { min: number; max: number } }): string {
  return group.sets.min === group.sets.max
    ? `${group.sets.min}`
    : `${group.sets.min}–${group.sets.max}`;
}

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

  const scheme = exercise.prescription?.snapshot.scheme ?? null;
  // set-groups-architecture-evaluation.md §11.4 — a grouped slot replaces
  // the single recommendation/prefill chain with a per-group selection.
  // `null` for every other profile/scheme (Set Groups is `load_reps`-only).
  const groupsScheme = scheme && isGroupsScheme(scheme) ? scheme : null;

  // §11.4 — derived on mount from the group's own chain (never React state
  // initialised once and left stale): the first group whose recorded count
  // is below its `max`, else the last group.
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(() =>
    groupsScheme ? nextGroupSelection(groupsScheme, exercise.sets) : null,
  );
  // True once the athlete has typed into weight/reps since the last
  // derivation; a chip tap replaces a dirty draft regardless (§11.4 table).
  const [dirty, setDirty] = useState(false);

  const groupRecommendations = isDeload ? [] : (exercise.recommendations ?? []);
  const selectedGroupRecommendation = selectedGroupKey
    ? (groupRecommendations.find((r) => r.groupKey === selectedGroupKey) ?? null)
    : null;

  const recommendation = groupsScheme
    ? selectedGroupRecommendation
    : recommendationForDeload(isDeload, exercise.recommendation);
  const prefill = groupsScheme
    ? (() => {
        const group = groupsScheme.groups.find((g) => g.key === selectedGroupKey);
        if (!group) return { loadKg: null, reps: null, distanceM: null, durationS: null };
        const derived = groupPrefill(
          group,
          exercise.sets,
          selectedGroupRecommendation,
          exercise.prescription?.snapshot.groupPrefills,
          exercise.loadStepKg,
        );
        return { loadKg: derived.loadKg, reps: derived.reps, distanceM: null, durationS: null };
      })()
    : derivePrefill(exercise, isDeload);
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

  // set-groups-architecture-evaluation.md §11.4 — "every selection change
  // re-derives the input row … no re-derivation happens on a render, a
  // recommendation decision, or a sync event." Keying the effect on
  // `selectedGroupKey` alone (never on `exercise`/`prefill`) is what makes
  // that true: only `setSelectedGroupKey` (mount, auto-advance, or a chip
  // tap) can trigger this reset, and it unconditionally overwrites a dirty
  // draft — "the athlete initiated the switch … preserving a draft across a
  // group change IS the hazard."
  useEffect(() => {
    if (!groupsScheme) return;
    setWeight(prefill.loadKg !== null ? String(prefill.loadKg) : "");
    setReps(prefill.reps !== null ? String(prefill.reps) : "");
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupKey]);

  // Stage B remediation F-1 (set-groups-stage-b-review.md) — the selection-
  // keyed effect above cannot follow a reference-set edit or deletion,
  // because the selection itself doesn't change (§6.2's two rows: "only the
  // prefill of not-yet-logged sets follows the edit" / "reference set
  // deleted: same as 'no sets yet' from that moment on"). This second,
  // narrowly-scoped effect re-derives the CURRENTLY SELECTED linked group's
  // weight whenever that derivation changes, while leaving every other
  // §11.4 rule intact:
  //   - only while `groupsScheme` and the selected group is linked;
  //   - only before the group's OWN first set is logged this session — once
  //     one exists, `groupPrefill`'s "last set logged in this group" rule
  //     already takes over and must not be disturbed (later sets copy the
  //     athlete's own log, never re-derive, §6.2's routine default);
  //   - never while `dirty` — read at the moment this effect actually runs
  //     (a real dependency change), not listed as a dependency itself, so a
  //     manual draft typed before or after the proposal last changed is
  //     never silently overwritten (§11.4's "type into weight/reps" rule).
  const selectedGroup = groupsScheme?.groups.find((g) => g.key === selectedGroupKey) ?? null;
  const selectedGroupHasOwnLog = selectedGroup
    ? exercise.sets.some((s) => !s.isWarmup && s.groupKey === selectedGroup.key)
    : false;
  const cleanLinkedProposalKg =
    selectedGroup?.link && !selectedGroupHasOwnLog ? prefill.loadKg : null;
  useEffect(() => {
    if (!selectedGroup?.link || selectedGroupHasOwnLog || dirty) return;
    setWeight(cleanLinkedProposalKg !== null ? String(cleanLinkedProposalKg) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanLinkedProposalKg]);

  const targetRir = exercise.prescription?.snapshot.targetRir ?? null;
  // workout-prescription-context-architecture-evaluation.md §5 — the two
  // PRESCRIPTION instructions, read from this slot's own frozen snapshot and
  // nowhere else: no path here consults the live `exercise_prescriptions`
  // row, so a program edit mid-workout cannot change what this card shows
  // (C-1), and a snapshot frozen before this feature shipped simply has
  // neither key (`undefined`) and renders nothing extra.
  const restSeconds = exercise.prescription?.snapshot.restSeconds ?? null;
  // §5.3 — the whitespace guard is defensive rather than load-bearing (the
  // write path already trims); it collapses "null", "key absent" and
  // "whitespace only" into the single "render nothing" branch. NOT to be
  // confused with `exercise.notes`, the editable session note rendered by
  // the "Add notes" textarea at the bottom of this card.
  const rawPrescriptionNotes = exercise.prescription?.snapshot.prescriptionNotes;
  const prescriptionNotes =
    typeof rawPrescriptionNotes === "string" && rawPrescriptionNotes.trim() !== ""
      ? rawPrescriptionNotes
      : null;

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
        groupKey: groupsScheme ? selectedGroupKey : undefined,
      });
      // §15.3's Copy-forward column: RIR always clears (every profile);
      // `s` additionally clears for `load_distance`/`distance_time` (the
      // two rows whose Copy-forward cell says "; s cleared"). Every other
      // field is left exactly as typed, which IS the carry-forward — the
      // athlete's own last entry stays in the box for the next round/set.
      setRir("");
      if (profile === "load_distance" || profile === "distance_time") setDuration("");

      // §11.4 R-4/D-8 — auto-advance at `max`: warm-ups never advance
      // (already excluded from `nextGroupSelection`'s recorded count), and
      // the effect above re-derives the input row the instant the selection
      // actually changes — never carrying this group's load into the next.
      // The store's `logSet` action commits the post-log session to the
      // store synchronously before its promise resolves (activeSession.ts),
      // so an imperative `getState()` read here is already authoritative —
      // no stale-closure risk from the `exercise` prop.
      if (groupsScheme && !isWarmup) {
        const updatedExercise = useActiveSessionStore
          .getState()
          .session?.exercises.find((e) => e.id === exercise.id);
        if (updatedExercise) {
          const next = nextGroupSelection(groupsScheme, updatedExercise.sets);
          if (next !== selectedGroupKey) setSelectedGroupKey(next);
        }
      }
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
  // set-groups-architecture-evaluation.md §11.4 — "prefilled only if that
  // group is the selected one and no set of that group is logged and not
  // `dirty` (extends the existing 'only while nothing is logged' rule per
  // group)". `groupKey` is `null` for the ungrouped card (unchanged rule).
  function handleDecide(decision: ExplicitDecisionInput, groupKey: string | null = null) {
    void decideRecommendation(exercise.id, decision, groupKey);
    if (groupKey !== null) {
      if (groupKey !== selectedGroupKey || dirty) return;
      if (exercise.sets.some((s) => s.groupKey === groupKey)) return;
      const base = exercise.prescription?.snapshot.groupPrefills?.[groupKey] ?? {
        loadKg: null,
        reps: null,
      };
      if (decision.status === "rejected") {
        setWeight(base.loadKg !== null ? String(base.loadKg) : "");
        setReps(base.reps !== null ? String(base.reps) : "");
      } else if (decision.status === "modified") {
        if (decision.chosen.loadKg !== undefined) setWeight(String(decision.chosen.loadKg));
        if (decision.chosen.reps !== undefined) setReps(String(decision.chosen.reps));
      } else {
        const target = groupRecommendations.find((r) => r.groupKey === groupKey)?.target;
        if (target?.loadKg !== undefined) setWeight(String(target.loadKg));
        if (target?.reps !== undefined) setReps(String(target.reps));
      }
      return;
    }
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
          {/* §5.1 — prescribed rest joins the existing subtitle rather than
              adding a line on a phone. Riding inside this `scheme` guard
              creates no dead branch: `scheme` is required in
              `prescriptionSnapshotDataSchema`, so a snapshot with rest and no
              scheme cannot exist. §5.3 — an absent value renders NOTHING, not
              a placeholder and not a stray separator, matching how the RIR
              clause already drops out entirely. */}
          {scheme && (
            <p className="text-xs text-slate-400">
              {formatScheme(scheme, targetRir)}
              {/* M-6 (independent review) — a grouped scheme now embeds each
                  group's OWN effective RIR band inline (formatScheme's
                  `groups` case); appending the SLOT band again here would be
                  the exact bug M-6 reported — one band, wrong for every
                  group whose own (or the slot's) differs. */}
              {!groupsScheme && targetRir ? ` @ RIR ${targetRir.min}-${targetRir.max}` : ""}
              {restSeconds !== null ? ` · Rest ${formatRestSeconds(restSeconds)}` : ""}
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

      {/*
        §5.2 — the program's own instruction for this slot, READ-ONLY and
        deliberately distinct from the editable session notes below: a
        different table (`exercise_prescriptions.notes` frozen into the
        snapshot, vs `session_exercises.notes`), a different lifecycle, and a
        label that states the origin. "Program note:" rather than
        "Prescribed:" — the scheme/RIR/rest line above is equally prescribed,
        so that label would not have distinguished anything.

        A sibling of the header flex row, not a child of it, so a long note
        gets the full card width instead of being squeezed against the Skip
        button. Outside the `!exercise.skipped` guard on purpose (like the
        scheme line): a skipped slot is one tap from being unskipped, and the
        instruction is what informs that tap.

        `whitespace-pre-wrap` keeps the athlete's own line breaks — they are
        part of the instruction — and `break-words` stops a long unbroken
        token from widening the card and giving the page a horizontal
        scrollbar. Not clamped: the whole point is that the instruction is
        visible BEFORE the set (§5.2's accepted trade-off).
      */}
      {prescriptionNotes !== null && (
        <p className="text-xs break-words whitespace-pre-wrap text-slate-400">
          <span className="text-slate-500">Program note: </span>
          {prescriptionNotes}
        </p>
      )}

      {/* set-groups-architecture-evaluation.md §11.2 — "one per group with a
          pending/decided record, labelled". Two cards on one phone card is a
          density cost judged at device acceptance, not a defect (§11.2). */}
      {groupsScheme && !exercise.skipped
        ? groupsScheme.groups.map((group) => {
            // Stage B remediation F-2 (set-groups-stage-b-review.md) — a
            // linked group must NEVER render a decision surface, even if a
            // stale recommendation predates the link (a group linked after
            // already progressing independently) or survives from a bundle
            // cached before the server-side fix below. Checking `group.link`
            // FIRST, unconditionally, is the client-side half of the fix —
            // the server-side half (`resolveGroupRecommendation` in
            // server/progression/service.ts) is what keeps such a stale
            // record out of `exercise.recommendations` in the first place;
            // this is defence in depth, not the only layer.
            if (!group.link) {
              const rec = groupRecommendations.find((r) => r.groupKey === group.key);
              return rec ? (
                <RecommendationCard
                  key={group.key}
                  recommendation={rec}
                  disabled={disabled}
                  groupLabel={group.label}
                  onDecide={(decision) => handleDecide(decision, group.key)}
                />
              ) : null;
            }
            // Stage B (set-groups-architecture-evaluation.md §6.3) — a
            // percent-linked group always resolves to `manual` (L-1); this
            // note is descriptive only, never an Accept/Keep/Custom decision
            // surface, which is exactly the "no competing recommendation"
            // requirement (D-4).
            const link = describeGroupLink(
              group,
              groupsScheme,
              exercise.sets,
              exercise.loadStepKg,
              exercise.prescription?.snapshot.groupPrefills,
            );
            return link ? (
              <GroupLinkNote
                key={group.key}
                groupLabel={group.label}
                link={link}
                isDirtyDraft={group.key === selectedGroupKey && dirty}
              />
            ) : null;
          })
        : recommendation &&
          !exercise.skipped && (
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
              // set-groups-architecture-evaluation.md §7 "History" — the
              // set-row label prefix, e.g. "Top ·", alongside the existing
              // "W ·" warm-up prefix. `null` on an ungrouped slot or for an
              // unattributed set (§4.4 rule 3).
              groupLabel={
                groupsScheme && set.groupKey
                  ? (groupsScheme.groups.find((g) => g.key === set.groupKey)?.label ?? null)
                  : null
              }
              // §11.3 — the set row's own edit form gains the group-
              // reassignment chip in-session, the identical control (and
              // rule) History's correction chip already offers post-session.
              // `null` on an ungrouped slot, which renders no chip at all.
              groupsScheme={groupsScheme}
              disabled={disabled}
              refused={refusedSetLogIds.has(set.id)}
              onEdit={(patch) => void editSet(exercise.id, set.id, patch)}
              onDelete={() => void deleteSet(exercise.id, set.id)}
            />
          ))}
        </ul>
      )}

      {/* set-groups-architecture-evaluation.md §11.2/§11.4 — the group chip
          row. Tapping a chip re-derives the input row unconditionally (the
          effect above, keyed on `selectedGroupKey`), including a dirty
          draft, which is the whole point of a stored, athlete-controlled
          selection: "returning to Top after back-offs brings the top load
          back, so 'one more top set' is one tap plus Log." */}
      {groupsScheme && !exercise.skipped && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select group">
          {groupsScheme.groups.map((group) => {
            const count = exercise.sets.filter(
              (s) => !s.isWarmup && s.groupKey === group.key,
            ).length;
            const selected = group.key === selectedGroupKey;
            return (
              <button
                key={group.key}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedGroupKey(group.key)}
                className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
                  selected
                    ? "border-slate-100 bg-slate-100 text-slate-900"
                    : "border-slate-700 text-slate-300"
                }`}
              >
                {group.label} {count}/{formatGroupSetRange(group)}
              </button>
            );
          })}
        </div>
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
                  onChange={(e) => {
                    setWeight(sanitizeDecimalDraft(e.target.value));
                    setDirty(true);
                  }}
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
                  onChange={(e) => {
                    setReps(e.target.value);
                    setDirty(true);
                  }}
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

// set-groups-architecture-evaluation.md §6.2/§11.2 — the linked-group
// equivalent of a RecommendationCard: descriptive only (no Accept/Keep/
// Custom — D-4's "no competing recommendation"), explaining where the
// group's proposed first-set load came from, including the missing-
// reference fallback ("no <ref> set logged yet") the design requires to be
// visible, not silent.
function GroupLinkNote({
  groupLabel,
  link,
  isDirtyDraft,
}: {
  groupLabel: string;
  link: GroupLinkDescription;
  // Stage B remediation F-1 (set-groups-stage-b-review.md) — true only for
  // the currently-selected group's card, and only while its input holds a
  // manually-typed, not-yet-logged draft. The note must never present a
  // proposal number as if it's what the box currently holds once the
  // athlete has typed something else — "ensure the explanatory note
  // accurately distinguishes a proposal from a manual draft."
  isDirtyDraft: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {groupLabel}
      </p>
      {link.referenceLoadKg === null ? (
        <p className="text-xs text-slate-400">
          {link.percent}% of {link.refLabel} — no {link.refLabel} set logged yet this session
          {isDirtyDraft
            ? "; manual entry — logging as typed, not the linked proposal."
            : // Stage B remediation F-7 — the fallback claim shows its own
              // resolved number (true regardless of whether it came from
              // carry-forward or baseline) rather than unconditionally
              // asserting a carry-forward that may not exist.
              link.fallbackLoadKg !== null
              ? `; using this group's own prefill (${link.fallbackLoadKg} kg).`
              : ", and this group has no carry-forward or baseline yet."}
        </p>
      ) : link.supersededByOwnLog ? (
        <p className="text-xs text-slate-400">
          Linked to {link.percent}% of {link.refLabel} ({link.referenceLoadKg} kg).
        </p>
      ) : isDirtyDraft ? (
        <p className="text-xs text-slate-400">
          {link.percent}% of {link.refLabel} ({link.referenceLoadKg} kg) — manual entry; logging as
          typed, not the {link.proposedLoadKg} kg proposal.
        </p>
      ) : (
        <p className="text-xs text-slate-300">
          {link.percent}% of {link.refLabel} ({link.referenceLoadKg} kg) → {link.proposedLoadKg} kg
          proposed
        </p>
      )}
    </div>
  );
}

function SetRow({
  set,
  profile,
  loadBasis,
  noun,
  groupLabel = null,
  groupsScheme = null,
  disabled = false,
  refused,
  onEdit,
  onDelete,
}: {
  set: ActiveSessionSetDto;
  profile: MeasurementProfile;
  loadBasis: LoadBasis | null;
  noun: "Set" | "Round";
  // set-groups-architecture-evaluation.md §7 — this set's group label
  // ("Top", "Back-off"), or `null` on an ungrouped slot / an unattributed
  // set.
  groupLabel?: string | null;
  // §11.3 — the session's frozen scheme when it is `groups`, so this row can
  // offer the in-session group-reassignment chip; `null` for an ungrouped
  // slot, matching `HistoryDetail.tsx`'s `HistorySetRow` prop of the same
  // name and purpose.
  groupsScheme?: GroupsScheme | null;
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
  // §11.3 — seeded from the stored value the same way `isWarmup` is above;
  // an empty-string option ("Unattributed") clears attribution (§4.4 rule 3).
  const [groupKey, setGroupKey] = useState<string | null>(set.groupKey ?? null);
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
                // L-3 (independent review) — §4.4 rule 1: a warm-up set
                // carries no group. `logSet` already enforces this at
                // creation; this edit form could otherwise submit
                // `isWarmup: true` alongside the select's still-checked
                // group value, leaving a stored row that contradicts the
                // invariant even though no evaluation path is affected
                // (every one already filters warm-ups before partitioning).
                ...(groupsScheme ? { groupKey: isWarmup ? null : groupKey } : {}),
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
        {/* set-groups-architecture-evaluation.md §11.3 — "the set row's edit
            form gains the same chip [as History]; moving a set between
            groups is an evaluation-relevant edit." An empty option clears
            attribution (§4.4 rule 3's "unattributed" work set). */}
        {groupsScheme && (
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Group
            <select
              value={groupKey ?? ""}
              onChange={(e) => setGroupKey(e.target.value === "" ? null : e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-50"
            >
              <option value="">Unattributed</option>
              {groupsScheme.groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between text-sm text-slate-300">
      <span>
        {set.isWarmup ? <span className="text-slate-500">W · </span> : null}
        {!set.isWarmup && groupLabel && <span className="text-slate-500">{groupLabel} · </span>}
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
