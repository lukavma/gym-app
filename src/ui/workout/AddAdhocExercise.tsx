"use client";

import { useEffect, useState } from "react";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import type { ExerciseDto } from "@/ui/exercises/types";

export function AddAdhocExercise({ disabled = false }: { disabled?: boolean }) {
  const addAdhocExercise = useActiveSessionStore((s) => s.addAdhocExercise);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ExerciseDto[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    const timeout = setTimeout(() => {
      fetch(`/api/exercises?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { exercises: ExerciseDto[] }) => {
          if (!cancelled) setResults(data.exercises.filter((e) => !e.archivedAt));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [open, search]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
      >
        + Add exercise
      </button>
    );
  }

  async function handleAdd(exercise: ExerciseDto) {
    setBusy(true);
    try {
      await addAdhocExercise(exercise.id, exercise.name);
      setOpen(false);
      setSearch("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-50">Add exercise</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">
          Cancel
        </button>
      </div>
      <input
        type="search"
        autoFocus
        placeholder="Search exercises…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
      />
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleAdd(exercise)}
              className="w-full rounded px-2 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              {exercise.name}
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-2 py-2 text-xs text-slate-500">No matches.</li>}
      </ul>
    </div>
  );
}
