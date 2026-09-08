"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import type { SchemeType, SetScheme } from "@/domain/schemes/setScheme";
import { DEFAULT_HYPERTROPHY_TARGET_RIR } from "@/domain/schemes/rirBand";
import { STRATEGY_DISPLAY_NAMES, type StrategyId } from "@/domain/progression/registry";
import { MAX_BASELINE_LOAD_KG } from "@/domain/prescriptions/schema";
import { dimensionsOf } from "@/domain/measurement/profile";
import { decimalPlaceCount, parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import type { ExerciseDto } from "@/ui/exercises/types";
import { schemeTypesForProfile, strategyIdsForProfile } from "./formOptions";
import type { PrescriptionDto } from "./types";

type Status = "loading" | "ready" | "submitting" | "not_found";

// setScheme.ts's `distanceRoundsSchemeSchema` / `durationRoundsSchemeSchema`
// ceilings — column ceilings (`numeric(*, 2)`), not meaningful training
// values, same convention as `MAX_BASELINE_LOAD_KG` above.
const MAX_SCHEME_DISTANCE_M = 99999.99;
const MAX_SCHEME_DURATION_S = 86400;

const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  fixed: "Fixed sets × reps",
  repRange: "Rep range",
  distanceRounds: "Distance rounds",
  durationRounds: "Duration rounds",
};

interface PrescriptionFormProps {
  mode: "create" | "edit";
  templateId?: string;
  prescriptionId?: string;
}

function emptyOr<T>(
  mode: "create" | "edit",
  raw: string,
  parse: (v: string) => T,
): T | undefined | null {
  if (raw.trim() === "") return mode === "create" ? undefined : null;
  return parse(raw);
}

export function PrescriptionForm({ mode, templateId, prescriptionId }: PrescriptionFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [resolvedTemplateId, setResolvedTemplateId] = useState<string | undefined>(templateId);
  const [exercises, setExercises] = useState<ExerciseDto[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [schemeType, setSchemeType] = useState<SchemeType>("fixed");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [minReps, setMinReps] = useState("8");
  const [maxReps, setMaxReps] = useState("12");
  // Athletic Measurement Profiles Release 2 (A-11b, §15.2) — the
  // `distanceRounds` / `durationRounds` per-round targets, unlocked
  // alongside `fixed`/`repRange` above. Text + `inputMode="decimal"` through
  // `sanitizeDecimalDraft`/`parseDecimalInput`, same guard convention as
  // `baselineLoadKg` below (§15.2).
  const [schemeDistanceM, setSchemeDistanceM] = useState("");
  const [schemeDurationS, setSchemeDurationS] = useState("");
  const [rirEnabled, setRirEnabled] = useState(false);
  const [rirMin, setRirMin] = useState(String(DEFAULT_HYPERTROPHY_TARGET_RIR.min));
  const [rirMax, setRirMax] = useState(String(DEFAULT_HYPERTROPHY_TARGET_RIR.max));
  const [baselineLoadKg, setBaselineLoadKg] = useState("");
  const [restSeconds, setRestSeconds] = useState("");
  const [strategyId, setStrategyId] = useState<StrategyId>("load-progression");
  const [repCap, setRepCap] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/exercises?includeArchived=${mode === "edit"}`)
      .then((res) => res.json())
      .then((data: { exercises: ExerciseDto[] }) => setExercises(data.exercises))
      .catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !prescriptionId) return;
    let cancelled = false;
    fetch(`/api/prescriptions/${prescriptionId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data: { prescription: PrescriptionDto } = await res.json();
        if (cancelled) return;
        const p = data.prescription;
        setResolvedTemplateId(p.templateId);
        setExerciseId(p.exerciseId);
        setSchemeType(p.scheme.scheme.type);
        // Release 2 (A-11b): the editor now writes all four scheme types,
        // gated per exercise profile by `schemeTypesForProfile` below —
        // populate whichever this prescription actually holds.
        if (p.scheme.scheme.type === "fixed") {
          setSets(String(p.scheme.scheme.sets));
          setReps(String(p.scheme.scheme.reps));
        } else if (p.scheme.scheme.type === "repRange") {
          setSets(String(p.scheme.scheme.sets));
          setMinReps(String(p.scheme.scheme.minReps));
          setMaxReps(String(p.scheme.scheme.maxReps));
        } else if (p.scheme.scheme.type === "distanceRounds") {
          setSets(String(p.scheme.scheme.sets));
          setSchemeDistanceM(String(p.scheme.scheme.distanceM));
        } else if (p.scheme.scheme.type === "durationRounds") {
          setSets(String(p.scheme.scheme.sets));
          setSchemeDurationS(String(p.scheme.scheme.durationS));
        }
        if (p.targetRir) {
          setRirEnabled(true);
          setRirMin(String(p.targetRir.min));
          setRirMax(String(p.targetRir.max));
        }
        setBaselineLoadKg(p.baselineLoadKg === null ? "" : String(p.baselineLoadKg));
        setRestSeconds(p.restSeconds === null ? "" : String(p.restSeconds));
        setStrategyId(p.progression.strategyId);
        if (typeof p.progression.config.repCap === "number") {
          setRepCap(String(p.progression.config.repCap));
        }
        setNotes(p.notes ?? "");
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load prescription.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, prescriptionId]);

  // A-11b — every offered option, in both selects, is derived from the
  // target exercise's profile through the same tables the server-side gate
  // checks (`schemeTypesForProfile`/`strategyIdsForProfile`, reusing
  // `profileSupportsScheme`/`strategySupportsProfile`). A profile with no
  // exercise selected yet, or whose exercise hasn't loaded into `exercises`
  // yet, defaults to `load_reps` — the widest, most permissive set, so nothing
  // is ever hidden that a real selection wouldn't need. Derived rather than
  // stored so a mid-edit exercise switch can never leave `schemeType`/
  // `strategyId` pointing at a now-incompatible option: `effectiveSchemeType`/
  // `effectiveStrategyId` (not the raw state) drive the select's value, the
  // scheme fields shown, and what `handleSubmit` sends.
  const selectedExercise = exercises.find((ex) => ex.id === exerciseId);
  const profile = selectedExercise?.measurementProfile ?? "load_reps";
  const availableSchemeTypes = schemeTypesForProfile(profile);
  const availableStrategyIds = strategyIdsForProfile(profile);
  // The `as` casts document a guarantee `schemeTypesForProfile`/
  // `strategyIdsForProfile` already hold (every profile supports at least
  // one scheme type, §9.2, and `manual` supports every profile) — the same
  // "guaranteed non-empty" convention `domain/measurement/format.ts` uses
  // for its own array access under `noUncheckedIndexedAccess`.
  const effectiveSchemeType: SchemeType = availableSchemeTypes.includes(schemeType)
    ? schemeType
    : (availableSchemeTypes[0] as SchemeType);
  const effectiveStrategyId: StrategyId = availableStrategyIds.includes(strategyId)
    ? strategyId
    : (availableStrategyIds[0] as StrategyId);

  // §9.3 — the RIR-band checkbox and baseline load are hidden where the
  // profile has no such field, reusing `dimensionsOf` (the same table
  // `checkPrescriptionCompatibility`'s server-side gate reads) rather than a
  // second UI-side rule.
  const dims = dimensionsOf(profile);
  const rirSupported = dims.rir !== "forbidden";
  const baselineLoadSupported = dims.weight !== "forbidden";

  const needsRepCap = effectiveStrategyId === "rep-progression" && effectiveSchemeType === "fixed";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let scheme: SetScheme;
    if (effectiveSchemeType === "fixed") {
      scheme = { type: "fixed", sets: Number(sets), reps: Number(reps) };
    } else if (effectiveSchemeType === "repRange") {
      scheme = {
        type: "repRange",
        sets: Number(sets),
        minReps: Number(minReps),
        maxReps: Number(maxReps),
      };
    } else if (effectiveSchemeType === "distanceRounds") {
      const parsed = parseDecimalInput(schemeDistanceM);
      if (
        parsed === null ||
        parsed <= 0 ||
        parsed > MAX_SCHEME_DISTANCE_M ||
        decimalPlaceCount(schemeDistanceM) > 2
      ) {
        setError(
          `Enter a valid distance greater than 0, up to ${MAX_SCHEME_DISTANCE_M} m, with at most 2 decimal places.`,
        );
        return;
      }
      scheme = { type: "distanceRounds", sets: Number(sets), distanceM: parsed };
    } else {
      const parsed = parseDecimalInput(schemeDurationS);
      if (
        parsed === null ||
        parsed <= 0 ||
        parsed > MAX_SCHEME_DURATION_S ||
        decimalPlaceCount(schemeDurationS) > 2
      ) {
        setError(
          `Enter a valid duration greater than 0, up to ${MAX_SCHEME_DURATION_S} s, with at most 2 decimal places.`,
        );
        return;
      }
      scheme = { type: "durationRounds", sets: Number(sets), durationS: parsed };
    }

    const config: Record<string, unknown> = {};
    if (needsRepCap && repCap.trim() !== "") config.repCap = Number(repCap);

    // L-4 remediation — a comma-typed baseline must never silently clear an
    // existing one on edit; empty still means "no baseline" (unchanged).
    // §9.3 (item 2, Release 2) — when the profile has no weight field the
    // control is hidden entirely (`baselineLoadSupported` below), so the
    // text state is never read; same "unspecified" vs "explicitly cleared"
    // shape as before.
    let baselineLoadKgValue: number | null | undefined;
    if (!baselineLoadSupported) {
      baselineLoadKgValue = mode === "create" ? undefined : null;
    } else if (baselineLoadKg.trim() === "") {
      baselineLoadKgValue = mode === "create" ? undefined : null;
    } else {
      const parsed = parseDecimalInput(baselineLoadKg);
      // LOW-2 (phase-5.5-light-remediation-verification.md) — a raw
      // more-than-2-decimal draft (e.g. "1,005") is float-noise, not a
      // deliberate 0.25-grid value; the domain schema's `.multipleOf(0.25)`
      // catches it too, but rejecting it here avoids a round trip for the
      // common float-noise case.
      if (
        parsed === null ||
        parsed < 0 ||
        parsed > MAX_BASELINE_LOAD_KG ||
        decimalPlaceCount(baselineLoadKg) > 2
      ) {
        setError(
          `Enter a valid baseline load between 0 and ${MAX_BASELINE_LOAD_KG}, with at most 2 decimal places.`,
        );
        return;
      }
      baselineLoadKgValue = parsed;
    }

    const payload = {
      exerciseId,
      scheme: { v: 1 as const, scheme },
      targetRir:
        rirSupported && rirEnabled
          ? { min: Number(rirMin), max: Number(rirMax) }
          : mode === "create"
            ? undefined
            : null,
      baselineLoadKg: baselineLoadKgValue,
      restSeconds: emptyOr(mode, restSeconds, Number),
      progression: { strategyId: effectiveStrategyId, config },
      notes: emptyOr(mode, notes, (v) => v),
    };

    setStatus("submitting");
    try {
      const res = await fetch(
        mode === "create"
          ? `/api/templates/${templateId}/prescriptions`
          : `/api/prescriptions/${prescriptionId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        router.push(`/templates/${mode === "create" ? templateId : resolvedTemplateId}`);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: string;
        issues?: string[];
      } | null;
      if (body?.error === "incompatible_prescription") {
        setError(body.issues?.join("; ") ?? "This progression strategy doesn't fit this scheme.");
      } else if (body?.error === "exercise_archived") {
        setError("The selected exercise is archived and can't be prescribed.");
      } else if (body?.error === "exercise_not_found") {
        setError("The selected exercise could not be found.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Please try again.");
      setStatus("ready");
    }
  }

  async function handleDelete() {
    if (!prescriptionId) return;
    if (!window.confirm("Remove this exercise from the template?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, { method: "DELETE" });
      if (res.status === 204) {
        router.push(`/templates/${resolvedTemplateId}`);
        router.refresh();
        return;
      }
      setError("Failed to delete.");
    } finally {
      setDeleting(false);
    }
  }

  if (status === "loading") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }

  if (status === "not_found") {
    return <p className="text-center text-sm text-slate-400">Prescription not found.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">
        {mode === "create" ? "Add exercise" : "Edit prescription"}
      </h1>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Exercise
        <select
          required
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          <option value="" disabled>
            Select an exercise…
          </option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
              {ex.archivedAt ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/*
        A-11b (Release 2) — options are the exercise's own compatible set
        (`availableSchemeTypes`, derived above from `schemeTypesForProfile`),
        never a fixed two-entry list. For `load_reps`/`reps` this renders
        exactly as before (`Fixed sets × reps` / `Rep range`); a
        `load_distance`/`distance_time` exercise offers only `distanceRounds`
        ("Distance rounds"), a `duration`/`load_duration` exercise only
        `durationRounds` ("Duration rounds") — never both, and never
        `fixed`/`repRange`, matching §9.2.
      */}
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Scheme
        <select
          value={effectiveSchemeType}
          onChange={(e) => setSchemeType(e.target.value as SchemeType)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {availableSchemeTypes.map((t) => (
            <option key={t} value={t}>
              {SCHEME_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
          Sets
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            required
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>
        {effectiveSchemeType === "fixed" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Reps
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              required
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
        {effectiveSchemeType === "repRange" && (
          <>
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
              Min reps
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                value={minReps}
                onChange={(e) => setMinReps(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
              Max reps
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                value={maxReps}
                onChange={(e) => setMaxReps(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              />
            </label>
          </>
        )}
        {effectiveSchemeType === "distanceRounds" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Distance per round (m)
            <input
              type="text"
              inputMode="decimal"
              required
              value={schemeDistanceM}
              onChange={(e) => setSchemeDistanceM(sanitizeDecimalDraft(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
        {effectiveSchemeType === "durationRounds" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Duration per round (s)
            <input
              type="text"
              inputMode="decimal"
              required
              value={schemeDurationS}
              onChange={(e) => setSchemeDurationS(sanitizeDecimalDraft(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
      </div>

      {/* §9.3 (item 2, Release 2) — hidden where `dimensionsOf(profile).rir`
          is `"forbidden"` (every profile but `load_reps`/`reps`), reusing
          the same table the server-side gate reads. */}
      {rirSupported && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={rirEnabled}
              onChange={(e) => setRirEnabled(e.target.checked)}
            />
            Set target RIR band
          </label>
          {rirEnabled && (
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                Min RIR
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={rirMin}
                  onChange={(e) => setRirMin(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                Max RIR
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={rirMax}
                  onChange={(e) => setRirMax(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
                />
              </label>
            </div>
          )}
        </>
      )}

      {/* §9.3 (item 2, Release 2) — hidden where `dimensionsOf(profile).weight`
          is `"forbidden"` (`reps`/`distance_time`/`duration`); shown for
          `load_reps` (unchanged) and now also `load_distance`/`load_duration`. */}
      {baselineLoadSupported && (
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Baseline load (kg, optional)
          <input
            type="text"
            inputMode="decimal"
            value={baselineLoadKg}
            onChange={(e) => setBaselineLoadKg(sanitizeDecimalDraft(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Rest (seconds, optional)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={restSeconds}
          onChange={(e) => setRestSeconds(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      {/*
        A-11b (Release 2) — options are the exercise's compatible strategy
        set (`availableStrategyIds`, derived above from
        `strategyIdsForProfile`). For a `reps` exercise this reduces to
        `["manual"]` (O-11): `load-progression`/`rep-progression` are never
        offered, as a consequence of the same rule the server checks, not a
        `reps`-specific branch here.
      */}
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Progression strategy
        <select
          value={effectiveStrategyId}
          onChange={(e) => setStrategyId(e.target.value as StrategyId)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {availableStrategyIds.map((id) => (
            <option key={id} value={id}>
              {STRATEGY_DISPLAY_NAMES[id]}
            </option>
          ))}
        </select>
      </label>

      {needsRepCap && (
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Rep cap (required for rep progression on a fixed scheme)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={repCap}
            onChange={(e) => setRepCap(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving…" : mode === "create" ? "Add exercise" : "Save changes"}
      </Button>

      {mode === "edit" && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg border border-red-900 px-4 py-3 text-sm text-red-400 disabled:opacity-50"
        >
          Remove from template
        </button>
      )}
    </form>
  );
}
