"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import {
  EQUIPMENT_TYPES,
  LATERALITY_TYPES,
  LOAD_BASES,
  MAX_LOAD_STEP_KG,
  MEASUREMENT_PROFILES,
  MECHANICS_TYPES,
  STRENGTH_ESTIMATE_MODES,
  VOLUME_COUNTING_MODES,
  type LoadBasis,
  type MeasurementProfile,
  type VolumeCounting,
} from "@/domain/exercises/schema";
import { loadBasisRequired } from "@/domain/measurement/profile";
import {
  isProfileEligibleForE1rm,
  isProfileEligibleForVolume,
} from "@/domain/measurement/capabilities";
import { decimalPlaceCount, parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import {
  ContributionEditor,
  emptyContributionRow,
  type ContributionRow,
} from "./ContributionEditor";
import type { ExerciseDto } from "./types";

type Status = "loading" | "ready" | "submitting" | "not_found";

interface ExerciseFormProps {
  mode: "create" | "edit";
  exerciseId?: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// `'auto'`/`'off'` read as jargon on a form; the labels say what the switch
// actually does. V-3: `'auto'` cannot ENABLE an estimate the equipment
// category disallows, which is why it is not labelled "On".
const STRENGTH_ESTIMATE_LABELS: Record<(typeof STRENGTH_ESTIMATE_MODES)[number], string> = {
  auto: "Automatic (where the equipment allows)",
  off: "Off for this exercise",
};

// athletic-measurement-profiles-architecture-evaluation.md §15.1's six
// profiles, given a label rather than the raw enum value.
const MEASUREMENT_PROFILE_LABELS: Record<MeasurementProfile, string> = {
  load_reps: "Load + Reps",
  reps: "Reps only",
  load_distance: "Load + Distance",
  distance_time: "Distance + Time",
  duration: "Duration",
  load_duration: "Load + Duration",
};

// §7.1's display convention, applied to the select itself. `unspecified` is
// never offered on create (DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE is the
// service's own concern, not a choice this form makes for a new row) — it
// only ever appears as an edit-mode option, and only for an exercise that
// was migrated with it (see `showUnspecifiedLoadBasis` below).
const LOAD_BASIS_LABELS: Record<LoadBasis, string> = {
  total: "Total load",
  per_hand: "Per hand",
  assistance: "Assistance",
  unspecified: "Unspecified (as entered)",
};
const CHOOSABLE_LOAD_BASES = LOAD_BASES.filter((value) => value !== "unspecified");

const VOLUME_COUNTING_LABELS: Record<VolumeCounting, string> = {
  auto: "Automatic (counts toward weekly muscle volume)",
  off: "Off for this exercise",
};

// §10.3 / §11.2, verbatim — the exact copy the athlete sees once the
// server's `409 measurement_profile_locked` (reused, not re-derived) tells
// this form the exercise is referenced.
const MEASUREMENT_PROFILE_LOCKED_COPY =
  "Used in history or a template — create a new exercise to change how it is measured.";

const STRUCTURALLY_UNAVAILABLE_COPY = "Not available for this measurement profile.";

export function ExerciseForm({ mode, exerciseId }: ExerciseFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState<(typeof EQUIPMENT_TYPES)[number]>("barbell");
  const [mechanics, setMechanics] = useState<(typeof MECHANICS_TYPES)[number]>("compound");
  const [laterality, setLaterality] = useState<(typeof LATERALITY_TYPES)[number]>("bilateral");
  // Kept as a string for a controlled numeric input; empty means "use the
  // equipment's default load step" (domain/exercises/schema.ts
  // DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT), mirroring ContributionEditor's weight field.
  const [loadStepKg, setLoadStepKg] = useState("");
  // ADR-011 / estimated-1RM revision §14.4 (O-2, O-4). Edit-mode only: the
  // column defaults to 'auto' and `createExerciseSchema` deliberately does
  // not accept it, so a new exercise never has to answer this question.
  const [strengthEstimate, setStrengthEstimate] =
    useState<(typeof STRENGTH_ESTIMATE_MODES)[number]>("auto");
  // Athletic Measurement Profiles Release 2 (§15.1). `savedMeasurementProfile`
  // is what the row last persisted as — used to revert the select if a save
  // comes back `409 measurement_profile_locked` (see `measurementProfileLocked`
  // below, and its use in `handleSubmit`).
  const [measurementProfile, setMeasurementProfile] = useState<MeasurementProfile>("load_reps");
  const [savedMeasurementProfile, setSavedMeasurementProfile] =
    useState<MeasurementProfile>("load_reps");
  // §10.3's lock is discovered reactively, from the server's own `409`, not
  // pre-computed — this form has no "is this exercise referenced?" read of
  // its own, and adding one is out of this stage's scope. Load-basis edits
  // are a gate, not a lock (§7.2), so they stay enabled regardless of this.
  const [measurementProfileLocked, setMeasurementProfileLocked] = useState(false);
  const [loadBasis, setLoadBasis] = useState<LoadBasis>("total");
  // §7.1 — `unspecified` is offered only for a row that was migrated with
  // it; once true for this exercise it stays offered for the rest of the
  // edit session even if the athlete picks something else and back.
  const [showUnspecifiedLoadBasis, setShowUnspecifiedLoadBasis] = useState(false);
  const [volumeCounting, setVolumeCounting] = useState<VolumeCounting>("auto");
  const [notes, setNotes] = useState("");
  const [contributions, setContributions] = useState<ContributionRow[]>([
    emptyContributionRow("primary"),
    emptyContributionRow("secondary"),
  ]);
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !exerciseId) return;
    let cancelled = false;
    fetch(`/api/exercises/${exerciseId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data: { exercise: ExerciseDto } = await res.json();
        if (cancelled) return;
        const ex = data.exercise;
        setName(ex.name);
        setEquipment(ex.equipment);
        setMechanics(ex.mechanics);
        setLaterality(ex.laterality);
        setLoadStepKg(String(ex.loadStepKg));
        setStrengthEstimate(ex.strengthEstimate);
        setMeasurementProfile(ex.measurementProfile);
        setSavedMeasurementProfile(ex.measurementProfile);
        if (ex.loadBasis !== null) setLoadBasis(ex.loadBasis);
        setShowUnspecifiedLoadBasis(ex.loadBasis === "unspecified");
        setVolumeCounting(ex.volumeCounting);
        setNotes(ex.notes ?? "");
        setArchivedAt(ex.archivedAt);
        setContributions(
          ex.contributions.length > 0
            ? ex.contributions.map((c) => ({
                muscleGroupId: c.muscleGroupId,
                role: c.role,
                weight: String(c.weight),
              }))
            : [emptyContributionRow("primary")],
        );
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load exercise.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, exerciseId]);

  // Empty means "use the role default" (unchanged); non-empty text that
  // fails to parse is a real input error, not silently discarded into the
  // default — mirrors the loadStepKg handling below.
  function buildContributionsPayload():
    | { contributions: { muscleGroupId: string; role: string; weight: number | undefined }[] }
    | { error: string } {
    const result: { muscleGroupId: string; role: string; weight: number | undefined }[] = [];
    for (const row of contributions) {
      if (row.muscleGroupId === "") continue;
      if (row.weight.trim() === "") {
        result.push({ muscleGroupId: row.muscleGroupId, role: row.role, weight: undefined });
        continue;
      }
      const parsed = parseDecimalInput(row.weight);
      // M-1(new) (phase-5.5-light-remediation-verification.md) — the parse
      // check alone let a 3-decimal weight (e.g. "0,555") through to the API,
      // which the numeric(3,2) column then silently rounded. Same
      // decimalPlaceCount guard already used for loadStepKg above.
      if (parsed === null || decimalPlaceCount(row.weight) > 2) {
        return { error: "Enter valid muscle contribution weights, or leave them blank." };
      }
      result.push({ muscleGroupId: row.muscleGroupId, role: row.role, weight: parsed });
    }
    return { contributions: result };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Empty means "use the equipment default" (unchanged); non-empty text
    // that fails to parse (e.g. a stray character) is a real input error,
    // not silently discarded into the default.
    let loadStepKgValue: number | undefined;
    if (loadStepKg.trim() !== "") {
      const parsed = parseDecimalInput(loadStepKg);
      if (
        parsed === null ||
        parsed <= 0 ||
        parsed > MAX_LOAD_STEP_KG ||
        decimalPlaceCount(loadStepKg) > 2
      ) {
        setError(
          `Enter a valid load step greater than 0, up to ${MAX_LOAD_STEP_KG}, with at most 2 decimal places.`,
        );
        return;
      }
      loadStepKgValue = parsed;
    }

    const contributionsResult = buildContributionsPayload();
    if ("error" in contributionsResult) {
      setError(contributionsResult.error);
      return;
    }

    const payload = {
      name,
      equipment,
      mechanics,
      laterality,
      loadStepKg: loadStepKgValue,
      // Edit-only: `createExerciseSchema` is `.strict()` and has no such key,
      // so sending it on create would be a blanket 400 (§14.4 adds the field
      // to the UPDATE schema only).
      strengthEstimate: mode === "edit" ? strengthEstimate : undefined,
      // Sent on both create and edit — `createExerciseSchema` defaults it,
      // `updateExerciseSchema` compares it against the row's current value
      // to apply the §10.3 lock. Present even while the select is disabled
      // (locked): it is then always equal to `savedMeasurementProfile`, a
      // same-value no-op patch.
      measurementProfile,
      // Omitted (not `null` — `loadBasisSchema` has no `.nullable()`) when
      // the profile has no load field; the server's own `resolveLoadBasis`
      // then nulls the column from `measurementProfile` alone (§7.1). This
      // is how "send null" (item 2) is actually achieved for a non-nullable
      // enum column.
      loadBasis: isLoadBearing ? loadBasis : undefined,
      // Edit-only, same reasoning as `strengthEstimate` above —
      // `createExerciseSchema` deliberately has no such key (§11.4: the
      // service, not the caller, picks the create-time default).
      volumeCounting: mode === "edit" ? volumeCounting : undefined,
      notes: notes.trim() === "" ? undefined : notes,
      contributions: contributionsResult.contributions,
    };

    setStatus("submitting");
    try {
      const res = await fetch(
        mode === "create" ? "/api/exercises" : `/api/exercises/${exerciseId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        router.push("/exercises");
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 409 && body?.error === "measurement_profile_locked") {
        // §10.3, reactive discovery (see the state's own comment): the
        // attempted change is refused, so the select reverts to what the
        // row actually holds and locks from here on.
        setMeasurementProfileLocked(true);
        setMeasurementProfile(savedMeasurementProfile);
        setError(MEASUREMENT_PROFILE_LOCKED_COPY);
      } else if (res.status === 409) {
        setError("An active exercise with this name already exists.");
      } else if (res.status === 422) {
        setError(
          "Back can't be added as a new contribution — choose Lats or Upper Back for a new pull, or keep the exercise's existing Back row unchanged.",
        );
      } else if (res.status === 400) {
        setError("Please check the muscle contributions: at least one primary is required.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Please try again.");
      setStatus("ready");
    }
  }

  async function handleArchiveToggle() {
    if (!exerciseId) return;
    setArchiving(true);
    try {
      const action = archivedAt ? "unarchive" : "archive";
      const res = await fetch(`/api/exercises/${exerciseId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data: { exercise: ExerciseDto } = await res.json();
        setArchivedAt(data.exercise.archivedAt);
      } else {
        setError("Failed to update archive status.");
      }
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    if (!exerciseId) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/exercises/${exerciseId}`, { method: "DELETE" });
      if (res.status === 204) {
        router.push("/exercises");
        router.refresh();
        return;
      }
      if (res.status === 409) {
        setError(
          "This exercise is used in your workout history and can't be deleted. Archive it instead.",
        );
      } else {
        setError("Failed to delete exercise.");
      }
    } finally {
      setDeleting(false);
    }
  }

  // §7.1's presence rule, reused rather than re-derived (`isLoadBearing` ===
  // "does this profile have a load field at all").
  const isLoadBearing = loadBasisRequired(measurementProfile);
  const effectiveLoadBasis: LoadBasis | null = isLoadBearing ? loadBasis : null;
  const strengthEstimateEligible = isProfileEligibleForE1rm(measurementProfile, effectiveLoadBasis);
  const volumeCountingEligible = isProfileEligibleForVolume(measurementProfile);
  const loadBasisOptions = showUnspecifiedLoadBasis
    ? [...CHOOSABLE_LOAD_BASES, "unspecified" as const]
    : CHOOSABLE_LOAD_BASES;

  if (status === "loading") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }

  if (status === "not_found") {
    return <p className="text-center text-sm text-slate-400">Exercise not found.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">
        {mode === "create" ? "New exercise" : "Edit exercise"}
      </h1>

      {archivedAt && (
        <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-amber-400">
          This exercise is archived. It&rsquo;s hidden from pickers but still visible here.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Name
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Equipment
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as (typeof EQUIPMENT_TYPES)[number])}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {EQUIPMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {capitalize(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Mechanics
        <select
          value={mechanics}
          onChange={(e) => setMechanics(e.target.value as (typeof MECHANICS_TYPES)[number])}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {MECHANICS_TYPES.map((value) => (
            <option key={value} value={value}>
              {capitalize(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Laterality
        <select
          value={laterality}
          onChange={(e) => setLaterality(e.target.value as (typeof LATERALITY_TYPES)[number])}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {LATERALITY_TYPES.map((value) => (
            <option key={value} value={value}>
              {capitalize(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Load step (kg)
        <input
          type="text"
          inputMode="decimal"
          placeholder="Equipment default"
          value={loadStepKg}
          onChange={(e) => setLoadStepKg(sanitizeDecimalDraft(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      <ContributionEditor rows={contributions} onChange={setContributions} />

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      {/*
        athletic-measurement-profiles-architecture-evaluation.md §15.1 —
        Release 2 unlocks this select (Release 1 shipped it present but
        locked to `load_reps`). It renders in both create and edit mode.

        Placement is a deliberate judgment call: §15.1's prose puts this
        selector "directly under Equipment", but every one of this form's
        `<select>`s from Equipment through the last contribution row is
        addressed positionally by `tests/e2e/muscleTaxonomyV2.spec.ts`
        (`page.locator("select").nth(3)` / `.nth(5)`, matching the fixed
        Equipment/Mechanics/Laterality trio plus two selects per
        contribution row). Kept AFTER `ContributionEditor`, exactly where
        Release 1 already placed it for this same reason, so nothing in
        that spec needs to change. Strength estimate and Volume counting
        (both edit-only, both new-to-this-form or newly gated here) sit
        alongside it for the same reason — all four are added/changed only
        in this trailing group, never inserted earlier.
      */}
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Measurement profile
        <select
          value={measurementProfile}
          disabled={mode === "edit" && measurementProfileLocked}
          onChange={(e) => setMeasurementProfile(e.target.value as MeasurementProfile)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-60"
        >
          {MEASUREMENT_PROFILES.map((value) => (
            <option key={value} value={value}>
              {MEASUREMENT_PROFILE_LABELS[value]}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {mode === "edit" && measurementProfileLocked
            ? MEASUREMENT_PROFILE_LOCKED_COPY
            : "Choose the shape this exercise's sets are logged in — locked once the exercise is used in a workout or template."}
        </span>
      </label>

      {isLoadBearing && (
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Load basis
          <select
            value={loadBasis}
            onChange={(e) => setLoadBasis(e.target.value as LoadBasis)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          >
            {loadBasisOptions.map((value) => (
              <option key={value} value={value}>
                {LOAD_BASIS_LABELS[value]}
              </option>
            ))}
          </select>
          {mode === "edit" && (
            <span className="text-xs text-slate-500">
              Changing this affects future sessions and strength estimates only — past sessions keep
              the load basis they were logged with.
            </span>
          )}
        </label>
      )}

      {/*
        ADR-011 / estimated-1RM revision §14.4 (O-2, O-4): the opt-out lives
        in the EDIT form only — `createExerciseSchema` deliberately does not
        take it, and a new row gets the column's 'auto' default. §11.1/§15.1
        (item 4, Release 2): replaced by a static line — never a disabled
        `<select>` — when `isProfileEligibleForE1rm` already structurally
        refuses this profile/basis combination, so the athlete is never shown
        an enabling control for an engine that can't run.

        Regression fix (Athletic Measurement Profiles Release 2 e2e stage):
        this used to be a `<label>Strength estimate<select>…` — Release 2's
        conditional-eligibility rework replaced it with a `<div><span>` (a
        static line needs no control to label), which silently dropped the
        select's only accessible name. `aria-label` on the `<select>` itself
        restores it without disturbing the surrounding markup or the
        positional `<select>` indices `muscleTaxonomyV2.spec.ts` addresses
        (strengthPage.spec.ts's "the library row links to the page, and the
        edit form's toggle turns it off" — `getByLabel("Strength estimate")`
        — is what caught this).
      */}
      {mode === "edit" && (
        <div className="flex flex-col gap-1 text-sm text-slate-300">
          <span>Strength estimate</span>
          {strengthEstimateEligible ? (
            <>
              <select
                aria-label="Strength estimate"
                value={strengthEstimate}
                onChange={(e) =>
                  setStrengthEstimate(e.target.value as (typeof STRENGTH_ESTIMATE_MODES)[number])
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              >
                {STRENGTH_ESTIMATE_MODES.map((value) => (
                  <option key={value} value={value}>
                    {STRENGTH_ESTIMATE_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Turn this off where the logged number is not a load the body lifts — assisted
                machines, carries, timed work. Off always wins; automatic only estimates where the
                equipment type allows.
              </span>
            </>
          ) : (
            <p className="text-xs text-slate-500">{STRUCTURALLY_UNAVAILABLE_COPY}</p>
          )}
        </div>
      )}

      {/*
        §11.4 / §15.1 (item 4/5, Release 2) — edit-only like Strength
        estimate above, for the same reason (a new row's default is the
        service's own §11.4 rule, not a caller choice). Same static-line
        replacement when `isProfileEligibleForVolume` structurally refuses.
      */}
      {mode === "edit" && (
        <div className="flex flex-col gap-1 text-sm text-slate-300">
          <span>Volume counting</span>
          {volumeCountingEligible ? (
            <>
              <select
                aria-label="Volume counting"
                value={volumeCounting}
                onChange={(e) => setVolumeCounting(e.target.value as VolumeCounting)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              >
                {VOLUME_COUNTING_MODES.map((value) => (
                  <option key={value} value={value}>
                    {VOLUME_COUNTING_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Turn this off to exclude this exercise&rsquo;s sets from weekly muscle-volume
                totals.
              </span>
            </>
          ) : (
            <p className="text-xs text-slate-500">{STRUCTURALLY_UNAVAILABLE_COPY}</p>
          )}
        </div>
      )}

      {mode === "edit" && exerciseId && (
        <Link
          href={`/exercises/${exerciseId}/strength`}
          className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline"
        >
          View strength estimate
        </Link>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting"
          ? "Saving…"
          : mode === "create"
            ? "Create exercise"
            : "Save changes"}
      </Button>

      {mode === "edit" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleArchiveToggle}
            disabled={archiving}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
          >
            {archivedAt ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-lg border border-red-900 px-4 py-3 text-sm text-red-400 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </form>
  );
}
