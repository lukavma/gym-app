"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { SCHEME_TYPES, type SchemeType } from "@/domain/schemes/setScheme";
import { DEFAULT_HYPERTROPHY_TARGET_RIR } from "@/domain/schemes/rirBand";
import {
  STRATEGY_DISPLAY_NAMES,
  STRATEGY_IDS,
  type StrategyId,
} from "@/domain/progression/registry";
import { MAX_BASELINE_LOAD_KG } from "@/domain/prescriptions/schema";
import type { ExerciseDto } from "@/ui/exercises/types";
import type { PrescriptionDto } from "./types";

type Status = "loading" | "ready" | "submitting" | "not_found";

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
        if (p.scheme.scheme.type === "fixed") {
          setSets(String(p.scheme.scheme.sets));
          setReps(String(p.scheme.scheme.reps));
        } else {
          setSets(String(p.scheme.scheme.sets));
          setMinReps(String(p.scheme.scheme.minReps));
          setMaxReps(String(p.scheme.scheme.maxReps));
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

  const needsRepCap = strategyId === "rep-progression" && schemeType === "fixed";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const scheme =
      schemeType === "fixed"
        ? { type: "fixed" as const, sets: Number(sets), reps: Number(reps) }
        : {
            type: "repRange" as const,
            sets: Number(sets),
            minReps: Number(minReps),
            maxReps: Number(maxReps),
          };

    const config: Record<string, unknown> = {};
    if (needsRepCap && repCap.trim() !== "") config.repCap = Number(repCap);

    const payload = {
      exerciseId,
      scheme: { v: 1 as const, scheme },
      targetRir: rirEnabled
        ? { min: Number(rirMin), max: Number(rirMax) }
        : mode === "create"
          ? undefined
          : null,
      baselineLoadKg: emptyOr(mode, baselineLoadKg, Number),
      restSeconds: emptyOr(mode, restSeconds, Number),
      progression: { strategyId, config },
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

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Scheme
        <select
          value={schemeType}
          onChange={(e) => setSchemeType(e.target.value as SchemeType)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {SCHEME_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "fixed" ? "Fixed sets × reps" : "Rep range"}
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
        {schemeType === "fixed" ? (
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
        ) : (
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
      </div>

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

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Baseline load (kg, optional)
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={MAX_BASELINE_LOAD_KG}
          step="0.25"
          value={baselineLoadKg}
          onChange={(e) => setBaselineLoadKg(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

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

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Progression strategy
        <select
          value={strategyId}
          onChange={(e) => setStrategyId(e.target.value as StrategyId)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {STRATEGY_IDS.map((id) => (
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
