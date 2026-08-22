"use client";

import { useEffect, useState, type FormEvent } from "react";
import { weekOverrideTypeSchema, type WeekOverrideType } from "@/domain/blocks/schema";
import type { WeekOverrideDto } from "./types";

type Status = "loading" | "ready" | "error";

interface WeekOverridesProps {
  blockId: string;
}

const TYPES = weekOverrideTypeSchema.options;

// domain-model.md §5 — "a manual deload is a WeekOverride inserted at any
// time": unlike schedule/deload editing this is never locked to a block
// status, so this component doesn't take or check one.
export function WeekOverrides({ blockId }: WeekOverridesProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [overrides, setOverrides] = useState<WeekOverrideDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [weekIndex, setWeekIndex] = useState("1");
  const [type, setType] = useState<WeekOverrideType>("deload");
  const [setMultiplier, setSetMultiplier] = useState("0.5");
  const [loadMultiplier, setLoadMultiplier] = useState("0.9");
  const [targetRirShift, setTargetRirShift] = useState("2");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch(`/api/blocks/${blockId}/week-overrides`)
      .then((res) => res.json())
      .then((data: { overrides: WeekOverrideDto[] }) => {
        setOverrides(data.overrides);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/blocks/${blockId}/week-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekIndex: Number(weekIndex),
          type,
          modifiers: {
            ...(setMultiplier.trim() !== "" ? { setMultiplier: Number(setMultiplier) } : {}),
            ...(loadMultiplier.trim() !== "" ? { loadMultiplier: Number(loadMultiplier) } : {}),
            ...(targetRirShift.trim() !== "" ? { targetRirShift: Number(targetRirShift) } : {}),
          },
          note: note.trim() === "" ? undefined : note,
        }),
      });
      if (res.ok) {
        setNote("");
        load();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        body?.error === "week_override_conflict"
          ? "An override already exists for that week."
          : body?.error === "invalid_input"
            ? "Check the values entered — multipliers must be greater than 0 and at most 2×, RIR shift between -10 and +10."
            : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/blocks/${blockId}/week-overrides/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-800 p-3">
      <h3 className="text-sm font-semibold text-slate-50">Week overrides</h3>
      <p className="text-xs text-slate-500">
        Make any specific week a deload or a modified week — takes precedence over a scheduled
        deload for the same week.
      </p>

      {status === "loading" && <p className="text-xs text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-xs text-red-400">Failed to load overrides.</p>}

      {status === "ready" && overrides.length > 0 && (
        <ul className="flex flex-col gap-1">
          {overrides.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between rounded bg-slate-900 px-2 py-1 text-xs text-slate-300"
            >
              <span>
                Week {o.weekIndex} · {o.type}
                {o.modifiers.setMultiplier !== undefined
                  ? ` · ${o.modifiers.setMultiplier}× sets`
                  : ""}
                {o.modifiers.loadMultiplier !== undefined
                  ? ` · ${o.modifiers.loadMultiplier}× load`
                  : ""}
                {o.modifiers.targetRirShift !== undefined
                  ? ` · RIR ${o.modifiers.targetRirShift >= 0 ? "+" : ""}${o.modifiers.targetRirShift}`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(o.id)}
                className="text-red-400 underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Week
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={weekIndex}
              onChange={(e) => setWeekIndex(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WeekOverrideType)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Sets ×
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min="0.05"
              max="2"
              value={setMultiplier}
              onChange={(e) => setSetMultiplier(e.target.value)}
              placeholder="none"
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Load ×
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min="0.05"
              max="2"
              value={loadMultiplier}
              onChange={(e) => setLoadMultiplier(e.target.value)}
              placeholder="none"
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            RIR shift
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="-10"
              max="10"
              value={targetRirShift}
              onChange={(e) => setTargetRirShift(e.target.value)}
              placeholder="none"
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
        />
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
        >
          + Add override
        </button>
      </form>
    </section>
  );
}
