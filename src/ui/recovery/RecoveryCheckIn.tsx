"use client";

import { useEffect, useState } from "react";
import { dismissRecoveryCheckInForever } from "./dismissedPreference";
import { NullableSliderField } from "./NullableSliderField";
import type { RecoveryEntryDto } from "./types";

interface RecoveryCheckInProps {
  // Only the Today card offers "dismiss forever" — the dedicated /recovery
  // page always lets the user check in regardless of that preference.
  onDismiss?: () => void;
  onLogged?: (entry: RecoveryEntryDto) => void;
}

const NEUTRAL = 3;

type Phase =
  | { kind: "loading" }
  | { kind: "summary"; entry: RecoveryEntryDto }
  | { kind: "form"; entry: RecoveryEntryDto | null };

// phase-7-review.md HIGH-1 — this card used to initialise every slider to a
// hardcoded neutral midpoint and submit wholesale on every save, with no
// idea whether today was already logged. A reload of an already-logged day
// re-prompted with 3/3/3 and one tap on Save replaced real observations
// with synthetic ones. It now reads back GET /api/recovery/today first
// (server-resolved via the user's own timezone — see
// src/server/recovery/service.ts's getTodayRecoveryEntry) and only ever
// shows a blank/neutral form for a day that genuinely has no entry yet. An
// already-logged day renders as a read-only summary of the *actual* stored
// values, with an explicit "Edit" tap required before any slider becomes
// editable — and editing pre-fills from the real entry, never from 3/3/3.
export function RecoveryCheckIn({ onDismiss, onLogged }: RecoveryCheckInProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recovery/today")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<{ entry: RecoveryEntryDto | null }>;
      })
      .then((data) => {
        if (cancelled) return;
        setPhase(
          data.entry ? { kind: "summary", entry: data.entry } : { kind: "form", entry: null },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissForever() {
    dismissRecoveryCheckInForever();
    onDismiss?.();
  }

  const header = (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-50">How are you feeling today?</span>
      {onDismiss && (
        <button type="button" onClick={dismissForever} className="text-xs text-slate-500 underline">
          Don&apos;t ask again
        </button>
      )}
    </div>
  );

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
        {header}
        {loadError ? (
          <p className="text-xs text-red-400">Couldn&apos;t check today&apos;s recovery entry.</p>
        ) : (
          <p className="text-xs text-slate-400">Checking today&apos;s entry…</p>
        )}
      </div>
    );
  }

  if (phase.kind === "summary") {
    const { entry } = phase;
    const parts = [
      entry.sleepHours !== null ? `Sleep ${entry.sleepHours}h` : null,
      entry.sleepQuality !== null ? `Sleep quality ${entry.sleepQuality}/5` : null,
      entry.readiness !== null ? `Readiness ${entry.readiness}/5` : null,
      entry.soreness !== null ? `Soreness ${entry.soreness}/5` : null,
    ].filter((part): part is string => part !== null);

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
        {header}
        <p className="text-sm text-emerald-400">Logged today: {parts.join(" · ")}</p>
        {entry.note && <p className="text-xs text-slate-400">{entry.note}</p>}
        <button
          type="button"
          onClick={() => setPhase({ kind: "form", entry })}
          className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300"
        >
          Edit today&apos;s check-in
        </button>
      </div>
    );
  }

  return (
    <RecoveryCheckInForm
      entry={phase.entry}
      header={header}
      onSaved={(entry) => {
        setPhase({ kind: "summary", entry });
        onLogged?.(entry);
      }}
      onCancel={phase.entry ? () => setPhase({ kind: "summary", entry: phase.entry! }) : undefined}
    />
  );
}

function RecoveryCheckInForm({
  entry,
  header,
  onSaved,
  onCancel,
}: {
  entry: RecoveryEntryDto | null;
  header: React.ReactNode;
  onSaved: (entry: RecoveryEntryDto) => void;
  onCancel?: () => void;
}) {
  const isNew = entry === null;
  // phase-7-remediation-verification.md MEDIUM-2 (recurrence) — a brand-new
  // check-in has nothing to preserve, so defaulting all three sliders to a
  // neutral midpoint is a starting point for a new observation, not a
  // stand-in for one that already exists. Editing an *existing* entry must
  // never coalesce a genuinely null metric to that default — `entry.x` is
  // read exactly as stored (`??` would treat a real `null` the same as
  // "absent" and reintroduce the fabrication bug this is fixing).
  const [sleepQuality, setSleepQuality] = useState<number | null>(
    isNew ? NEUTRAL : entry.sleepQuality,
  );
  const [readiness, setReadiness] = useState<number | null>(isNew ? NEUTRAL : entry.readiness);
  const [soreness, setSoreness] = useState<number | null>(isNew ? NEUTRAL : entry.soreness);
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);

    // Editing an existing entry: `sleepHours` is preserved untouched (this
    // card has no control for it), so "at least one metric" must account
    // for it too — a user could clear every slider this card shows and
    // still leave a perfectly valid row because sleepHours already
    // satisfies ck_recovery_entries_has_metric.
    if (
      !isNew &&
      entry.sleepHours === null &&
      sleepQuality === null &&
      readiness === null &&
      soreness === null
    ) {
      setError("At least one of sleep hours, sleep quality, readiness, or soreness is required.");
      return;
    }

    setSaving(true);
    try {
      const body = JSON.stringify({
        sleepQuality,
        readiness,
        soreness,
        // Always sent explicitly (never omitted) — this card fully
        // controls the note field, so an emptied field is a deliberate
        // clear, not "leave whatever's there". `sleepHours` is never
        // included here — this card has no control for it, and omitting
        // the key preserves whatever value the entry already has instead
        // of nulling it (POST) or leaving it untouched (PATCH).
        note: note.trim() === "" ? null : note.trim(),
      });
      // A brand-new day-log still goes through the day-upsert (POST,
      // create-or-update-by-date). Editing an existing entry goes through
      // PATCH-by-id instead of the day-upsert: `logRecoveryInputSchema`
      // requires at least one *numeric* metric in every POST payload (no
      // prior row to merge into on that path), which a clears-only edit —
      // e.g. every slider this card shows explicitly nulled, relying on an
      // already-preserved sleepHours to satisfy the DB constraint — would
      // fail even though the resulting row is valid. PATCH's own service
      // fetches the existing row and validates the *merged* result instead,
      // which is exactly what an edit of an already-existing entry needs.
      const res = isNew
        ? await fetch("/api/recovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch(`/api/recovery/${entry.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(
          data.error === "no_metric"
            ? "At least one of sleep hours, sleep quality, readiness, or soreness is required."
            : "Couldn't save — try again.",
        );
        return;
      }
      const data: { entry: RecoveryEntryDto } = await res.json();
      onSaved(data.entry);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
      {header}

      {isNew ? (
        <>
          <SliderField
            label="Sleep quality"
            value={sleepQuality ?? NEUTRAL}
            onChange={setSleepQuality}
          />
          <SliderField label="Readiness" value={readiness ?? NEUTRAL} onChange={setReadiness} />
          <SliderField label="Soreness" value={soreness ?? NEUTRAL} onChange={setSoreness} />
        </>
      ) : (
        <>
          <NullableSliderField
            label="Sleep quality"
            value={sleepQuality}
            onChange={setSleepQuality}
          />
          <NullableSliderField label="Readiness" value={readiness} onChange={setReadiness} />
          <NullableSliderField label="Soreness" value={soreness} onChange={setSoreness} />
        </>
      )}

      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
      />

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save check-in"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-slate-200">{value}</span>
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-100"
      />
    </label>
  );
}
