"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProgramDto } from "./types";

type Status = "loading" | "ready" | "error";

export function ProgramList() {
  const [status, setStatus] = useState<Status>("loading");
  const [programs, setPrograms] = useState<ProgramDto[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const params = new URLSearchParams();
    if (includeArchived) params.set("includeArchived", "true");

    fetch(`/api/programs?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { programs: ProgramDto[] }) => {
        if (cancelled) return;
        setPrograms(data.programs);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [includeArchived]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-50">Programs</h1>
        <Link
          href="/programs/new"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
        >
          + New
        </Link>
      </header>

      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        Show archived
      </label>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-sm text-red-400">Failed to load programs.</p>}

      {status === "ready" && programs.length === 0 && (
        <p className="text-sm text-slate-400">No programs yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {programs.map((program) => (
          <li key={program.id}>
            <Link
              href={`/programs/${program.id}`}
              className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-slate-50">{program.name}</span>
                {program.status === "archived" && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    Archived
                  </span>
                )}
              </div>
              {program.description && (
                <span className="text-xs text-slate-400">{program.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
