"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { contributionMuscleLabel } from "./muscleGroupDisplay";
import type { ExerciseDto } from "./types";

type Status = "loading" | "ready" | "error";

export function ExerciseLibrary() {
  const [status, setStatus] = useState<Status>("loading");
  const [exercises, setExercises] = useState<ExerciseDto[]>([]);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (includeArchived) params.set("includeArchived", "true");

    const timeout = setTimeout(() => {
      fetch(`/api/exercises?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { exercises: ExerciseDto[] }) => {
          if (cancelled) return;
          setExercises(data.exercises);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, includeArchived]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-50">Exercises</h1>
        <Link
          href="/exercises/new"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
        >
          + New
        </Link>
      </header>

      <input
        type="search"
        placeholder="Search exercises…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
      />

      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        Show archived
      </label>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-sm text-red-400">Failed to load exercises.</p>}

      {status === "ready" && exercises.length === 0 && (
        <p className="text-sm text-slate-400">No exercises found.</p>
      )}

      <ul className="flex flex-col gap-2">
        {exercises.map((exercise) => (
          // ADR-011 §15.1 — the strength page is "linked from the library
          // row". The row's own <Link> cannot wrap a second one (nested
          // anchors are invalid), so the card is a plain container holding
          // the edit link and the strength link side by side.
          <li
            key={exercise.id}
            className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
          >
            <Link href={`/exercises/${exercise.id}`} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-slate-50">{exercise.name}</span>
                {exercise.archivedAt && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    Archived
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {exercise.contributions
                  .filter((c) => c.role === "primary")
                  .map((c) => contributionMuscleLabel(c.muscleGroupId))
                  .join(", ")}
              </span>
            </Link>
            {/*
              The accessible name is deliberately just "Strength estimate" and
              does NOT repeat the exercise name: several existing specs locate
              a row with `getByRole("link", { name })` where `name` is the
              exercise, and Playwright matches an accessible name by SUBSTRING
              — a per-row label like "Strength estimate for Back Squat" would
              make every one of those a strict-mode violation. The link's
              purpose is clear from its row (WCAG 2.4.4's "in context"), and
              the row's own link above carries the exercise name.
            */}
            <Link
              href={`/exercises/${exercise.id}/strength`}
              className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline"
            >
              Strength estimate
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
