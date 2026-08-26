"use client";

import { useEffect, useState } from "react";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { ClearButton, NullableSliderField, UnsetField } from "./NullableSliderField";
import type { RecoveryEntryDto } from "./types";

type Status = "loading" | "ready" | "error";

export function RecoveryHistoryList() {
  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<RecoveryEntryDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    setStatus("loading");
    fetch("/api/recovery")
      .then((res) => res.json())
      .then((data: { entries: RecoveryEntryDto[] }) => {
        setEntries(data.entries);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(load, []);

  async function remove(id: string) {
    const res = await fetch(`/api/recovery/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 404) load();
  }

  if (status === "loading") return <p className="text-sm text-slate-400">Loading…</p>;
  if (status === "error") return <p className="text-sm text-red-400">Failed to load entries.</p>;
  if (entries.length === 0) return <p className="text-sm text-slate-400">No entries yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) =>
        editingId === entry.id ? (
          <EditRow
            key={entry.id}
            entry={entry}
            onDone={() => {
              setEditingId(null);
              load();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
          >
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">{entry.date}</span>
              <span className="text-sm text-slate-50">
                {entry.sleepHours !== null && `Sleep ${entry.sleepHours}h`}
                {entry.sleepQuality !== null && ` · Sleep quality ${entry.sleepQuality}/5`}
                {entry.readiness !== null && ` · Readiness ${entry.readiness}/5`}
                {entry.soreness !== null && ` · Soreness ${entry.soreness}/5`}
              </span>
              {entry.note && <span className="text-xs text-slate-400">{entry.note}</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(entry.id)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove(entry.id)}
                className="rounded border border-red-800 px-2 py-1 text-xs text-red-300"
              >
                Delete
              </button>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}

// phase-7-review.md MEDIUM-2 — this used to seed every slider with
// `entry.x ?? 3` and always submit all three, so editing an entry that
// legitimately had a null metric (data-model.md §2.19: every metric column
// is individually optional) silently fabricated a 3 for it. Every field
// here tracks `number | null` — a metric already null stays "Not set" until
// the user explicitly taps "Set", and any set metric can be explicitly
// cleared back to null with "Clear". `sleepHours` gets its own control
// (previously not editable here at all). The client also enforces "at
// least one metric" before submitting, matching `ck_recovery_entries_has_metric`.
function EditRow({
  entry,
  onDone,
  onCancel,
}: {
  entry: RecoveryEntryDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [sleepHours, setSleepHours] = useState<number | null>(entry.sleepHours);
  const [sleepHoursDraft, setSleepHoursDraft] = useState(
    entry.sleepHours !== null ? String(entry.sleepHours) : "",
  );
  const [sleepQuality, setSleepQuality] = useState<number | null>(entry.sleepQuality);
  const [readiness, setReadiness] = useState<number | null>(entry.readiness);
  const [soreness, setSoreness] = useState<number | null>(entry.soreness);
  const [note, setNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);

    if (sleepHours === null && sleepQuality === null && readiness === null && soreness === null) {
      setError("At least one of sleep hours, sleep quality, readiness, or soreness is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/recovery/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleepHours,
          sleepQuality,
          readiness,
          soreness,
          note: note.trim() === "" ? null : note.trim(),
        }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(
          data.error === "no_metric"
            ? "At least one of sleep hours, sleep quality, readiness, or soreness is required."
            : "Save failed.",
        );
        return;
      }
      onDone();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
      <span className="text-xs text-slate-400">{entry.date}</span>

      {sleepHours === null ? (
        <UnsetField
          label="Sleep hours"
          onSet={() => {
            setSleepHours(7);
            setSleepHoursDraft("7");
          }}
        />
      ) : (
        <div className="flex flex-col gap-1 text-xs text-slate-400">
          <span className="flex items-center justify-between">
            <span>Sleep hours</span>
            <ClearButton
              label="Sleep hours"
              onClear={() => {
                setSleepHours(null);
                setSleepHoursDraft("");
              }}
            />
          </span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Edit sleep hours"
            value={sleepHoursDraft}
            onChange={(e) => {
              const draft = sanitizeDecimalDraft(e.target.value);
              setSleepHoursDraft(draft);
              // phase-7-remediation-verification.md — clearing the field
              // must clear the value too. The old `if (parsed !== null)`
              // guard left the previous number in state while the input
              // displayed blank, so an unchanged Save silently kept the
              // old value the user believed they'd removed. An empty (or
              // otherwise unparseable) draft is treated the same as an
              // explicit "Clear" tap, subject to the same at-least-one-
              // metric rule enforced below.
              setSleepHours(parseDecimalInput(draft));
            }}
            className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
          />
        </div>
      )}

      <NullableSliderField label="Sleep quality" value={sleepQuality} onChange={setSleepQuality} />
      <NullableSliderField label="Readiness" value={readiness} onChange={setReadiness} />
      <NullableSliderField label="Soreness" value={soreness} onChange={setSoreness} />

      <input
        type="text"
        placeholder="note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
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
          className="rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}
