"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { blockGoalSchema, type BlockGoal } from "@/domain/blocks/schema";
import type { TemplateDto } from "@/ui/templates/types";
import type { BlockDto } from "./types";

type Status = "loading" | "ready" | "submitting" | "not_found";

interface BlockFormProps {
  mode: "create" | "edit";
  programId?: string;
  blockId?: string;
}

interface ScheduleRow {
  templateId: string;
  weekdays: number[];
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GOALS = blockGoalSchema.options;

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function BlockForm({ mode, programId, blockId }: BlockFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [resolvedProgramId, setResolvedProgramId] = useState<string | undefined>(programId);
  const [blockStatus, setBlockStatus] = useState<BlockDto["status"]>("planned");
  const [currentWeekIndex, setCurrentWeekIndex] = useState<number | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState<BlockGoal>("hypertrophy");
  const [startDate, setStartDate] = useState(todayDateString());
  const [weeksPlanned, setWeeksPlanned] = useState("4");
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [deloadEnabled, setDeloadEnabled] = useState(false);
  const [deloadWeekIndex, setDeloadWeekIndex] = useState("last");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const locked = mode === "edit" && blockStatus !== "planned";

  useEffect(() => {
    if (!resolvedProgramId) return;
    fetch(`/api/programs/${resolvedProgramId}/templates`)
      .then((res) => res.json())
      .then((data: { templates: TemplateDto[] }) => setTemplates(data.templates))
      .catch(() => undefined);
  }, [resolvedProgramId]);

  useEffect(() => {
    if (mode !== "edit" || !blockId) return;
    let cancelled = false;
    fetch(`/api/blocks/${blockId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data: { block: BlockDto } = await res.json();
        if (cancelled) return;
        const b = data.block;
        setResolvedProgramId(b.programId);
        setName(b.name);
        setGoal(b.goal);
        setStartDate(b.startDate);
        setWeeksPlanned(String(b.weeksPlanned));
        setSchedule(
          b.schedule.map((e) => ({ templateId: e.templateId, weekdays: e.weekdays ?? [] })),
        );
        setDeloadEnabled(b.deload !== null);
        if (b.deload) setDeloadWeekIndex(String(b.deload.weekIndex));
        setNotes(b.notes ?? "");
        setBlockStatus(b.status);
        setCurrentWeekIndex(b.currentWeekIndex);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load block.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, blockId]);

  function addScheduleRow() {
    const first = templates[0];
    if (!first) return;
    setSchedule((rows) => [...rows, { templateId: first.id, weekdays: [] }]);
  }

  function removeScheduleRow(index: number) {
    setSchedule((rows) => rows.filter((_, i) => i !== index));
  }

  function updateScheduleTemplate(index: number, templateId: string) {
    setSchedule((rows) => rows.map((r, i) => (i === index ? { ...r, templateId } : r)));
  }

  function toggleWeekday(index: number, day: number) {
    setSchedule((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        const has = r.weekdays.includes(day);
        return {
          ...r,
          weekdays: has ? r.weekdays.filter((d) => d !== day) : [...r.weekdays, day].sort(),
        };
      }),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!locked && schedule.length === 0) {
      setError("Add at least one workout to the schedule.");
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      goal,
      weeksPlanned: Number(weeksPlanned),
      notes: notes.trim() === "" ? (mode === "create" ? undefined : null) : notes,
    };
    if (mode === "create") payload.startDate = startDate;
    if (!locked) {
      payload.schedule = schedule.map((row) => ({
        templateId: row.templateId,
        weekdays: row.weekdays.length > 0 ? row.weekdays : undefined,
      }));
      payload.deload = deloadEnabled
        ? {
            mode: "scheduled",
            weekIndex: deloadWeekIndex === "last" ? "last" : Number(deloadWeekIndex),
            modifiers: {},
          }
        : mode === "create"
          ? undefined
          : null;
    }

    setStatus("submitting");
    try {
      const res = await fetch(
        mode === "create" ? `/api/programs/${programId}/blocks` : `/api/blocks/${blockId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const data: { block: BlockDto } = await res.json();
        router.push(`/blocks/${data.block.id}`);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === "schedule_template_not_found") {
        setError("One of the scheduled templates doesn't belong to this program.");
      } else if (body?.error === "schedule_template_archived") {
        setError("One of the scheduled templates is archived.");
      } else if (body?.error === "schedule_locked") {
        setError("Schedule and deload can only be edited while the block is planned.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Please try again.");
      setStatus("ready");
    }
  }

  async function runAction(action: "activate" | "complete" | "abandon") {
    if (!blockId) return;
    setActionPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/blocks/${blockId}/${action}`, { method: "POST" });
      if (res.ok) {
        const data: { block: BlockDto } = await res.json();
        setBlockStatus(data.block.status);
        setCurrentWeekIndex(data.block.currentWeekIndex);
        router.refresh();
      } else if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          body?.error === "active_block_exists"
            ? "Another block is already active for this program."
            : "That action isn't valid for this block's current status.",
        );
      } else {
        setError("Failed to update block.");
      }
    } finally {
      setActionPending(false);
    }
  }

  if (status === "loading") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }

  if (status === "not_found") {
    return <p className="text-center text-sm text-slate-400">Block not found.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">
        {mode === "create" ? "Start block" : "Edit block"}
      </h1>

      {mode === "edit" && (
        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-sm">
          <span className="text-slate-300">
            Status: <span className="font-medium text-slate-50">{blockStatus}</span>
          </span>
          {(blockStatus === "active" || blockStatus === "completed") &&
            currentWeekIndex !== null && (
              <span className="text-slate-400">Week {currentWeekIndex}</span>
            )}
        </div>
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
        Goal
        <select
          value={goal}
          onChange={(e) => setGoal(e.target.value as BlockGoal)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>

      {mode === "create" && (
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Start date
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Weeks planned
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={16}
          required
          value={weeksPlanned}
          onChange={(e) => setWeeksPlanned(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-300">Schedule</span>
        {locked ? (
          <p className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-400">
            Schedule can only be edited while the block is planned.
          </p>
        ) : (
          <>
            {templates.length === 0 && (
              <p className="text-sm text-slate-400">
                This program has no templates to schedule yet.
              </p>
            )}
            {schedule.map((row, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 p-3"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={row.templateId}
                    onChange={(e) => updateScheduleTemplate(index, e.target.value)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeScheduleRow(index)}
                    className="rounded border border-red-900 px-2 py-2 text-xs text-red-400"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAY_LABELS.map((label, i) => {
                    const day = i + 1;
                    const active = row.weekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(index, day)}
                        className={`rounded px-2 py-1 text-xs ${active ? "bg-slate-100 text-slate-900" : "border border-slate-700 text-slate-300"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-slate-500">
                  {row.weekdays.length === 0
                    ? "No fixed days — rotates through the schedule order."
                    : ""}
                </span>
              </div>
            ))}
            {templates.length > 0 && (
              <button
                type="button"
                onClick={addScheduleRow}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"
              >
                + Add workout to schedule
              </button>
            )}
          </>
        )}
      </div>

      {locked ? null : (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={deloadEnabled}
              onChange={(e) => setDeloadEnabled(e.target.checked)}
            />
            Schedule a deload week
          </label>
          {deloadEnabled && (
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Deload week
              <select
                value={deloadWeekIndex}
                onChange={(e) => setDeloadWeekIndex(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              >
                <option value="last">Last week</option>
                {Array.from({ length: Number(weeksPlanned) || 0 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
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
        {status === "submitting" ? "Saving…" : mode === "create" ? "Start block" : "Save changes"}
      </Button>

      {mode === "edit" && (
        <div className="flex gap-2">
          {blockStatus === "planned" && (
            <button
              type="button"
              onClick={() => runAction("activate")}
              disabled={actionPending}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {blockStatus === "active" && (
            <button
              type="button"
              onClick={() => runAction("complete")}
              disabled={actionPending}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
            >
              Complete
            </button>
          )}
          {(blockStatus === "planned" || blockStatus === "active") && (
            <button
              type="button"
              onClick={() => runAction("abandon")}
              disabled={actionPending}
              className="flex-1 rounded-lg border border-red-900 px-4 py-3 text-sm text-red-400 disabled:opacity-50"
            >
              Abandon
            </button>
          )}
        </div>
      )}
    </form>
  );
}
