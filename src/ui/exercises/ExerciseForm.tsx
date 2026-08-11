"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { EQUIPMENT_TYPES, LATERALITY_TYPES, MECHANICS_TYPES } from "@/domain/exercises/schema";
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

export function ExerciseForm({ mode, exerciseId }: ExerciseFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState<(typeof EQUIPMENT_TYPES)[number]>("barbell");
  const [mechanics, setMechanics] = useState<(typeof MECHANICS_TYPES)[number]>("compound");
  const [laterality, setLaterality] = useState<(typeof LATERALITY_TYPES)[number]>("bilateral");
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

  function buildContributionsPayload() {
    return contributions
      .filter((row) => row.muscleGroupId !== "")
      .map((row) => ({
        muscleGroupId: row.muscleGroupId,
        role: row.role,
        weight: row.weight.trim() === "" ? undefined : Number(row.weight),
      }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload = {
      name,
      equipment,
      mechanics,
      laterality,
      notes: notes.trim() === "" ? undefined : notes,
      contributions: buildContributionsPayload(),
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

      if (res.status === 409) {
        setError("An active exercise with this name already exists.");
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
