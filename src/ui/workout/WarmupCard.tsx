"use client";

import { useState } from "react";
import {
  isWarmupChecklistComplete,
  selectedWarmupRoutine,
  type WarmupSessionState,
} from "@/domain/warmup/session";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import type { ActiveSessionDto } from "@/sync/types";

// Warm-up Routines v1 — the inline, optional, dismissible card at the top of
// the workout screen (evaluation §5, M-3).
//
// What it deliberately is NOT: a pre-start modal, a selection gate, or an
// extra tap on the path to logging. "Start workout" is unchanged, this card
// renders after the session already exists, and every control on it is
// skippable. mvp-scope.md F5's "prefilled set confirmed in <=3 taps" budget
// is therefore untouched — nothing here sits between Today and the first
// `Log` press.
//
// Every interaction goes through the active-session store, whose warm-up
// mutators commit to the local IndexedDB aggregate with `ops: []`. Nothing
// on this card can enqueue an outbox op, write a set log, or reach the
// progression/volume pipelines.

interface WarmupCardProps {
  warmup: WarmupSessionState;
  // Whether any real work set has been logged this session. One of the two
  // auto-collapse triggers (R-7: the card must not push the logging controls
  // down the screen once the athlete is actually lifting). Warm-up SETS
  // (`is_warmup` set logs) deliberately don't count — they're a different
  // concept (I-8) and are part of warming up, not of working.
  hasLoggedWorkSet: boolean;
  disabled?: boolean;
}

export function WarmupCard({ warmup, hasLoggedWorkSet, disabled = false }: WarmupCardProps) {
  const selectWarmupRoutine = useActiveSessionStore((s) => s.selectWarmupRoutine);
  const toggleWarmupItem = useActiveSessionStore((s) => s.toggleWarmupItem);
  const setWarmupDismissed = useActiveSessionStore((s) => s.setWarmupDismissed);

  // null = "follow the auto rule"; a boolean = the athlete has said
  // otherwise for this render session. Collapsing is presentation only and
  // deliberately NOT persisted: what must survive a reload is the checklist
  // itself, and re-deriving expansion from the checked state after a reload
  // is more predictable than restoring a stale manual toggle.
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  const routine = selectedWarmupRoutine(warmup);
  const autoCollapsed = isWarmupChecklistComplete(warmup) || hasLoggedWorkSet;
  const expanded = manualExpanded ?? !autoCollapsed;

  if (warmup.routines.length === 0) return null;

  // Skipped: one quiet row, and the way back is right there. Reversible for
  // as long as the session is active, and remembered nowhere afterwards.
  if (warmup.dismissed) {
    return (
      <section className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
        <span className="text-sm text-slate-400">Warm-up skipped</span>
        <button
          type="button"
          onClick={() => void setWarmupDismissed(false)}
          disabled={disabled}
          className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
        >
          Undo skip
        </button>
      </section>
    );
  }

  // Linked routines but no default (O-1's "at most one" includes none): a
  // compact chooser, not an opinion. Zero intrusion until the athlete picks.
  if (!routine) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-200">Warm-up</span>
          <button
            type="button"
            onClick={() => void setWarmupDismissed(true)}
            disabled={disabled}
            className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
          >
            Skip warm-up
          </button>
        </div>
        <RoutineSelect
          warmup={warmup}
          disabled={disabled}
          onSelect={(id) => void selectWarmupRoutine(id)}
        />
      </section>
    );
  }

  const checkedCount = warmup.done.filter(Boolean).length;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setManualExpanded(!expanded)}
          className="flex flex-1 flex-col items-start gap-0.5 text-left"
          aria-expanded={expanded}
        >
          <span className="text-sm font-medium text-slate-200">
            {expanded ? "Hide warm-up" : "Show warm-up"}
          </span>
          <span className="text-xs text-slate-400">
            {routine.name} · {checkedCount}/{routine.items.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void setWarmupDismissed(true)}
          disabled={disabled}
          className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
        >
          Skip warm-up
        </button>
      </div>

      {expanded && (
        <>
          <ul className="flex flex-col">
            {routine.items.map((item, index) => (
              // Full-width, py-3 label rows — the whole row is the touch
              // target on the phone, not just the 16px checkbox.
              <li key={`${routine.id}-${index}`}>
                <label className="flex w-full items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={warmup.done[index] ?? false}
                    onChange={() => void toggleWarmupItem(index)}
                    disabled={disabled}
                    className="mt-0.5 h-5 w-5 shrink-0 disabled:opacity-50"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={`text-sm ${warmup.done[index] ? "text-slate-500 line-through" : "text-slate-100"}`}
                    >
                      {item.label}
                    </span>
                    {item.instruction && (
                      <span className="text-xs text-slate-400">{item.instruction}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {/* Only routines LINKED to this template, never the whole library
              (O-2). Hidden entirely when there is nothing to switch to. */}
          {warmup.routines.length > 1 && (
            <RoutineSelect
              warmup={warmup}
              disabled={disabled}
              onSelect={(id) => void selectWarmupRoutine(id)}
            />
          )}
        </>
      )}
    </section>
  );
}

function RoutineSelect({
  warmup,
  disabled,
  onSelect,
}: {
  warmup: WarmupSessionState;
  disabled: boolean;
  onSelect: (routineId: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">Routine</span>
      <select
        aria-label="Warm-up routine"
        value={warmup.selectedRoutineId ?? ""}
        onChange={(e) => onSelect(e.target.value === "" ? null : e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
      >
        <option value="">Choose a routine…</option>
        {warmup.routines.map((routine) => (
          <option key={routine.id} value={routine.id}>
            {routine.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// Derives the card's two inputs from the session aggregate, so
// WorkoutExecution stays a layout file and the "no warm-up data => no card"
// rule lives in exactly one place. Returns null for every absence case: a
// session started before this feature shipped, one adopted from another
// device (O-3), or a template that links no routines.
export function WarmupCardForSession({
  session,
  disabled,
}: {
  session: ActiveSessionDto;
  disabled: boolean;
}) {
  const warmup = session.warmup;
  if (!warmup) return null;
  const hasLoggedWorkSet = session.exercises.some((exercise) =>
    exercise.sets.some((set) => !set.isWarmup),
  );
  return <WarmupCard warmup={warmup} hasLoggedWorkSet={hasLoggedWorkSet} disabled={disabled} />;
}
