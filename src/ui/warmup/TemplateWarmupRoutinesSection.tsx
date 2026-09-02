"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TemplateWarmupRoutineLinkDto, WarmupRoutineDto } from "./types";

type Status = "loading" | "ready" | "error";

interface TemplateWarmupRoutinesSectionProps {
  templateId: string;
}

// Warm-up Routines v1, owner decisions O-1/O-2 — the curated association
// editor for one workout template.
//
// The whole set is saved in ONE atomic PUT (order, membership and the
// default together), never as per-link calls: "the default must be one of
// the linked routines" is then impossible to violate by interleaving, and
// the server writes it inside a single transaction. `linked` order IS the
// link order the in-workout switcher will use.
export function TemplateWarmupRoutinesSection({ templateId }: TemplateWarmupRoutinesSectionProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [library, setLibrary] = useState<WarmupRoutineDto[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [defaultRoutineId, setDefaultRoutineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/warmup-routines").then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<{ routines: WarmupRoutineDto[] }>;
      }),
      fetch(`/api/templates/${templateId}/warmup-routines`).then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<{ links: TemplateWarmupRoutineLinkDto[] }>;
      }),
    ])
      .then(([libraryData, linkData]) => {
        if (cancelled) return;
        setLibrary(libraryData.routines);
        setLinked(linkData.links.map((link) => link.routineId));
        setDefaultRoutineId(linkData.links.find((link) => link.isDefault)?.routineId ?? null);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const nameById = new Map(library.map((routine) => [routine.id, routine.name]));
  const unlinked = library.filter((routine) => !linked.includes(routine.id));

  function link(routineId: string) {
    setSaved(false);
    setLinked((current) => (current.includes(routineId) ? current : [...current, routineId]));
  }

  function unlink(routineId: string) {
    setSaved(false);
    setLinked((current) => current.filter((id) => id !== routineId));
    // Clearing the default alongside its link is what keeps the local draft
    // in the same state the server would enforce anyway (a default must be
    // one of the linked routines) instead of submitting a request that can
    // only be rejected.
    setDefaultRoutineId((current) => (current === routineId ? null : current));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= linked.length) return;
    const reordered = linked.slice();
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    setSaved(false);
    setLinked(reordered);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/templates/${templateId}/warmup-routines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineIds: linked, defaultRoutineId }),
      });
      if (res.ok) {
        const data: { links: TemplateWarmupRoutineLinkDto[] } = await res.json();
        setLinked(data.links.map((l) => l.routineId));
        setDefaultRoutineId(data.links.find((l) => l.isDefault)?.routineId ?? null);
        setSaved(true);
        return;
      }
      if (res.status === 404) {
        setError("This template no longer exists.");
      } else if (res.status === 400) {
        setError("One of the selected warm-up routines is no longer available.");
      } else {
        setError("Failed to save warm-up routines.");
      }
    } catch {
      setError("Network error. Warm-up links can only be edited online.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-50">Warm-up routines</h2>
        <Link href="/warmup-routines/new" className="text-xs text-slate-400 underline">
          Manage
        </Link>
      </header>
      <p className="text-xs text-slate-500">
        Only the routines linked here are offered during this workout. Marking one as default shows
        it automatically; leaving the default empty shows a chooser instead.
      </p>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && (
        <p className="text-sm text-red-400">Failed to load warm-up routines.</p>
      )}

      {status === "ready" && library.length === 0 && (
        <p className="text-sm text-slate-400">
          You have no warm-up routines yet.{" "}
          <Link href="/warmup-routines/new" className="underline">
            Create one
          </Link>{" "}
          to link it here.
        </p>
      )}

      {status === "ready" && library.length > 0 && (
        <>
          {linked.length === 0 ? (
            <p className="text-sm text-slate-400">No warm-up routines linked to this template.</p>
          ) : (
            // Named so "what is linked" is distinguishable from "what could
            // be linked" (the select below still lists every unlinked
            // routine) for screen readers and assertions alike.
            <ul aria-label="Linked warm-up routines" className="flex flex-col gap-2">
              {linked.map((routineId, index) => (
                <li
                  key={routineId}
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-base font-medium text-slate-50">
                      {nameById.get(routineId) ?? "Unknown routine"}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="radio"
                        name="warmup-default"
                        aria-label={`Make ${nameById.get(routineId) ?? "routine"} the default`}
                        checked={defaultRoutineId === routineId}
                        onChange={() => {
                          setSaved(false);
                          setDefaultRoutineId(routineId);
                        }}
                        className="h-4 w-4"
                      />
                      Default
                    </label>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${nameById.get(routineId) ?? "routine"} up`}
                      className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === linked.length - 1}
                      aria-label={`Move ${nameById.get(routineId) ?? "routine"} down`}
                      className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => unlink(routineId)}
                    aria-label={`Unlink ${nameById.get(routineId) ?? "routine"}`}
                    className="text-xs text-red-400 underline"
                  >
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}

          {linked.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setDefaultRoutineId(null);
              }}
              disabled={defaultRoutineId === null}
              className="self-start text-xs text-slate-400 underline disabled:opacity-30"
            >
              Clear default
            </button>
          )}

          {unlinked.length > 0 && (
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Link a routine
              <select
                aria-label="Link a warm-up routine"
                value=""
                onChange={(e) => {
                  if (e.target.value !== "") link(e.target.value);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              >
                <option value="">Choose a routine…</option>
                {unlinked.map((routine) => (
                  <option key={routine.id} value={routine.id}>
                    {routine.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {saved && <p className="text-xs text-emerald-400">Warm-up routines saved.</p>}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save warm-up routines"}
          </button>
        </>
      )}
    </section>
  );
}
