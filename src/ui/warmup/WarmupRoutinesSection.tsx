"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WarmupRoutineDto } from "./types";

type Status = "loading" | "ready" | "error";

// Warm-up Routines v1, owner decision O-4 — routine management is reached
// from the Programs area, NOT from an eighth top-level nav link. The app's
// nav already wraps to two rows at seven links (phase-7-review.md BLOCKER-1,
// PI-004 pending), and warm-up routines are planning-world definitions like
// programs and templates, so this section sits beneath the program list.
//
// Online-only, deliberately (evaluation §8.3): this is definition CRUD, the
// same capability-matrix row as programs/templates/exercises. Only workout
// EXECUTION is offline-capable.
export function WarmupRoutinesSection() {
  const [status, setStatus] = useState<Status>("loading");
  const [routines, setRoutines] = useState<WarmupRoutineDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/warmup-routines")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<{ routines: WarmupRoutineDto[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setRoutines(data.routines);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-50">Warm-up routines</h2>
        <Link
          href="/warmup-routines/new"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
        >
          + New
        </Link>
      </header>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && (
        <p className="text-sm text-red-400">Failed to load warm-up routines.</p>
      )}
      {status === "ready" && routines.length === 0 && (
        <p className="text-sm text-slate-400">
          No warm-up routines yet. Create one, then link it to a workout template.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {routines.map((routine) => (
          <li key={routine.id}>
            <Link
              href={`/warmup-routines/${routine.id}`}
              className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <span className="text-base font-medium text-slate-50">{routine.name}</span>
              <span className="text-xs text-slate-400">
                {routine.items.length} {routine.items.length === 1 ? "item" : "items"}
                {routine.linkedTemplateCount > 0
                  ? ` · linked to ${routine.linkedTemplateCount} ${
                      routine.linkedTemplateCount === 1 ? "template" : "templates"
                    }`
                  : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
