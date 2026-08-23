"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { blockGoalSchema, type BlockGoal } from "@/domain/blocks/schema";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import type { TemplateDto } from "@/ui/templates/types";
import type { BlockDto } from "./types";
import { WeekOverrides } from "./WeekOverrides";
import { BlockSummary } from "./BlockSummary";

type Status = "loading" | "ready" | "submitting" | "not_found";

interface BlockFormProps {
  mode: "create" | "edit";
  programId?: string;
  blockId?: string;
  // Judgment call #2 (phase-5 plan) — "start next block": pre-fills
  // goal/schedule/weeksPlanned from a just-finished block. Every other
  // field (name, startDate, deload, notes) starts fresh; week overrides are
  // never referenced (a new block via createBlock never copies anything).
  fromBlockId?: string;
}

interface ScheduleRow {
  templateId: string;
  weekdays: number[];
}

// Active-schedule remediation — two explicit, mutually exclusive schedule
// modes (domain/blocks/schema.ts's `scheduleInputSchema` rejects a mix at
// save time). "mixed" only occurs right after loading a pre-existing block
// whose stored schedule already mixes the two shapes — it is surfaced for
// the user to correct, never auto-picked or silently normalized.
type ScheduleMode = "fixed" | "rotation" | "mixed";

function deriveScheduleMode(rows: ScheduleRow[]): ScheduleMode {
  if (rows.length === 0) return "rotation";
  const withDays = rows.filter((r) => r.weekdays.length > 0).length;
  if (withDays === 0) return "rotation";
  if (withDays === rows.length) return "fixed";
  return "mixed";
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GOALS = blockGoalSchema.options;

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// domain/blocks/schema.ts — setMultiplier/loadMultiplier are
// z.number().positive().max(2). Blank means "don't modify this axis";
// non-empty-but-unparseable is a real input error, not silently dropped.
const MAX_DELOAD_MULTIPLIER = 2;

function parseOptionalMultiplier(raw: string): number | null | "invalid" {
  if (raw.trim() === "") return null;
  const parsed = parseDecimalInput(raw);
  if (parsed === null || parsed <= 0 || parsed > MAX_DELOAD_MULTIPLIER) return "invalid";
  return parsed;
}

export function BlockForm({ mode, programId, blockId, fromBlockId }: BlockFormProps) {
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
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("rotation");
  const [deloadEnabled, setDeloadEnabled] = useState(false);
  const [deloadWeekIndex, setDeloadWeekIndex] = useState("last");
  // domain-model.md §5 — WeekModifiers heuristic examples (0.5 sets / 0.9
  // load / +2 RIR), editable per block; blank = that axis isn't applied.
  const [setMultiplier, setSetMultiplier] = useState("0.5");
  const [loadMultiplier, setLoadMultiplier] = useState("0.9");
  const [targetRirShift, setTargetRirShift] = useState("2");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Active-schedule remediation — schedule/deload stay editable through
  // 'planned' and 'active'; only a finished block ('completed'/'abandoned')
  // locks them (domain-model.md §9 — there are no more future weeks left to
  // apply an edit to). This replaced an earlier, stricter rule that treated
  // activation itself as the lock point.
  const locked = mode === "edit" && (blockStatus === "completed" || blockStatus === "abandoned");

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
        const loadedSchedule = b.schedule.map((e) => ({
          templateId: e.templateId,
          weekdays: e.weekdays ?? [],
        }));
        setSchedule(loadedSchedule);
        setScheduleMode(deriveScheduleMode(loadedSchedule));
        setDeloadEnabled(b.deload !== null);
        if (b.deload) {
          setDeloadWeekIndex(String(b.deload.weekIndex));
          setSetMultiplier(
            b.deload.modifiers.setMultiplier !== undefined
              ? String(b.deload.modifiers.setMultiplier)
              : "",
          );
          setLoadMultiplier(
            b.deload.modifiers.loadMultiplier !== undefined
              ? String(b.deload.modifiers.loadMultiplier)
              : "",
          );
          setTargetRirShift(
            b.deload.modifiers.targetRirShift !== undefined
              ? String(b.deload.modifiers.targetRirShift)
              : "",
          );
        }
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

  useEffect(() => {
    if (mode !== "create" || !fromBlockId) return;
    let cancelled = false;
    fetch(`/api/blocks/${fromBlockId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { block: BlockDto } | null) => {
        if (cancelled || !data) return;
        const b = data.block;
        setGoal(b.goal);
        setWeeksPlanned(String(b.weeksPlanned));
        const prefilledSchedule = b.schedule.map((e) => ({
          templateId: e.templateId,
          weekdays: e.weekdays ?? [],
        }));
        setSchedule(prefilledSchedule);
        setScheduleMode(deriveScheduleMode(prefilledSchedule));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode, fromBlockId]);

  function addScheduleRow() {
    const first = templates[0];
    if (!first) return;
    setSchedule((rows) => [...rows, { templateId: first.id, weekdays: [] }]);
  }

  function removeScheduleRow(index: number) {
    setSchedule((rows) => rows.filter((_, i) => i !== index));
  }

  // Reordering matters for rotation mode (position order is the sequence,
  // domain-model.md §5) but is offered regardless of mode — it's harmless in
  // fixed-weekday mode since resolution there keys on weekdays, not order.
  function moveScheduleRow(index: number, direction: -1 | 1) {
    setSchedule((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = rows.slice();
      const moved = next[index]!;
      next[index] = next[target]!;
      next[target] = moved;
      return next;
    });
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
      // Rotation mode is a deliberate, explicit choice (the mode toggle
      // below) — submitting it is the moment weekday assignments actually
      // stop applying, not a side effect of quietly clearing them earlier.
      // Anything still held in `schedule[].weekdays` survives in local
      // state if the user flips back to fixed mode before saving.
      payload.schedule = schedule.map((row) => ({
        templateId: row.templateId,
        weekdays:
          scheduleMode === "rotation" || row.weekdays.length === 0 ? undefined : row.weekdays,
      }));
      if (deloadEnabled) {
        // L-5 remediation — a comma-typed multiplier must never silently
        // collapse to "no override"; unsigned parsing only (targetRirShift
        // stays a signed Number(...) field below, untouched).
        const setMultiplierValue = parseOptionalMultiplier(setMultiplier);
        const loadMultiplierValue = parseOptionalMultiplier(loadMultiplier);
        if (setMultiplierValue === "invalid" || loadMultiplierValue === "invalid") {
          setError(
            "Enter valid deload multipliers (greater than 0, at most 2×), or leave them blank.",
          );
          return;
        }
        payload.deload = {
          mode: "scheduled",
          weekIndex: deloadWeekIndex === "last" ? "last" : Number(deloadWeekIndex),
          modifiers: {
            ...(setMultiplierValue !== null ? { setMultiplier: setMultiplierValue } : {}),
            ...(loadMultiplierValue !== null ? { loadMultiplier: loadMultiplierValue } : {}),
            ...(targetRirShift.trim() !== "" ? { targetRirShift: Number(targetRirShift) } : {}),
          },
        };
      } else {
        payload.deload = mode === "create" ? undefined : null;
      }
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

      const body = (await res.json().catch(() => null)) as {
        error?: string;
        issues?: { message: string }[];
      } | null;
      if (body?.error === "schedule_template_not_found") {
        setError("One of the scheduled templates doesn't belong to this program.");
      } else if (body?.error === "schedule_template_archived") {
        setError("One of the scheduled templates is archived.");
      } else if (body?.error === "schedule_immutable") {
        setError("Schedule and deload can only be edited while the block is planned or active.");
      } else if (body?.error === "invalid_input") {
        // The schema issues (schedule-mode conflicts, weekday overlaps,
        // duplicate templates, modifier bounds) already carry precise,
        // phone-readable text — surface them directly instead of a generic
        // message.
        const messages = [...new Set((body.issues ?? []).map((i) => i.message).filter(Boolean))];
        setError(
          messages.length > 0
            ? messages.join(" ")
            : "Check the values entered — deload multipliers must be greater than 0 and at most 2×, RIR shift between -10 and +10.",
        );
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

      {mode === "edit" && blockId && <WeekOverrides blockId={blockId} />}

      {mode === "edit" &&
        blockId &&
        resolvedProgramId &&
        (blockStatus === "completed" || blockStatus === "abandoned") && (
          <BlockSummary
            blockId={blockId}
            programId={resolvedProgramId}
            showSummary={blockStatus === "completed"}
          />
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

        {!locked && mode === "edit" && blockStatus === "active" && (
          <p className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-400">
            Changes apply to workouts from today onward. A workout already in progress keeps its
            original plan.
          </p>
        )}

        {locked ? (
          <p className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-400">
            Schedule can only be edited while the block is planned or active.
          </p>
        ) : (
          <>
            {templates.length === 0 && (
              <p className="text-sm text-slate-400">
                This program has no templates to schedule yet.
              </p>
            )}

            <div className="flex gap-2" role="group" aria-label="Schedule mode">
              <button
                type="button"
                onClick={() => setScheduleMode("fixed")}
                aria-pressed={scheduleMode === "fixed"}
                data-testid="schedule-mode-fixed"
                className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                  scheduleMode === "fixed"
                    ? "bg-slate-100 text-slate-900"
                    : "border border-slate-700 text-slate-300"
                }`}
              >
                Fixed weekdays
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("rotation")}
                aria-pressed={scheduleMode === "rotation"}
                data-testid="schedule-mode-rotation"
                className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                  scheduleMode === "rotation"
                    ? "bg-slate-100 text-slate-900"
                    : "border border-slate-700 text-slate-300"
                }`}
              >
                Rotation order
              </button>
            </div>

            {scheduleMode === "mixed" && (
              <p role="alert" className="rounded-lg bg-amber-950 px-3 py-2 text-xs text-amber-300">
                This schedule mixes fixed weekdays and rotation entries — choose Fixed weekdays or
                Rotation order above, then fix each entry below before saving.
              </p>
            )}
            {scheduleMode === "rotation" && (
              <p className="text-xs text-slate-500">
                Workouts run in the order below, one per session — no fixed days.
              </p>
            )}

            {schedule.map((row, index) => (
              <div
                key={index}
                data-testid={`schedule-row-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 p-3"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={row.templateId}
                    onChange={(e) => updateScheduleTemplate(index, e.target.value)}
                    data-testid={`schedule-row-${index}-template`}
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
                    onClick={() => moveScheduleRow(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                    data-testid={`schedule-row-${index}-move-up`}
                    className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveScheduleRow(index, 1)}
                    disabled={index === schedule.length - 1}
                    aria-label="Move down"
                    data-testid={`schedule-row-${index}-move-down`}
                    className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeScheduleRow(index)}
                    data-testid={`schedule-row-${index}-remove`}
                    className="rounded border border-red-900 px-2 py-2 text-xs text-red-400"
                  >
                    Remove
                  </button>
                </div>
                {(scheduleMode === "fixed" || scheduleMode === "mixed") && (
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAY_LABELS.map((label, i) => {
                      const day = i + 1;
                      const active = row.weekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWeekday(index, day)}
                          data-testid={`schedule-row-${index}-day-${day}`}
                          aria-pressed={active}
                          className={`rounded px-2 py-1 text-xs ${active ? "bg-slate-100 text-slate-900" : "border border-slate-700 text-slate-300"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {templates.length > 0 && (
              <button
                type="button"
                onClick={addScheduleRow}
                data-testid="schedule-add-row"
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
            <>
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
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Sets ×
                  <input
                    type="text"
                    inputMode="decimal"
                    value={setMultiplier}
                    onChange={(e) => setSetMultiplier(sanitizeDecimalDraft(e.target.value))}
                    placeholder="none"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Load ×
                  <input
                    type="text"
                    inputMode="decimal"
                    value={loadMultiplier}
                    onChange={(e) => setLoadMultiplier(sanitizeDecimalDraft(e.target.value))}
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
              <p className="text-xs text-slate-500">
                Heuristic defaults (0.5× sets, 0.9× load, +2 RIR) — editable, not required. Blank
                means that axis isn&apos;t modified. Multipliers must be greater than 0 and at most
                2×; RIR shift between -10 and +10.
              </p>
            </>
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
