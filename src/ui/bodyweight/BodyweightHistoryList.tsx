"use client";

import { useEffect, useState } from "react";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import type { BodyweightEntryDto } from "./types";

type Status = "loading" | "ready" | "error";

// Simple history list with edit/delete (mvp-scope.md F10). Fetches its own
// data independently of BodyweightQuickLog so the Today card and this page
// never need to share client state — each just re-lists after its own
// mutation.
export function BodyweightHistoryList() {
  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<BodyweightEntryDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    setStatus("loading");
    fetch("/api/bodyweight")
      .then((res) => res.json())
      .then((data: { entries: BodyweightEntryDto[] }) => {
        setEntries(data.entries);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(load, []);

  async function remove(id: string) {
    const res = await fetch(`/api/bodyweight/${id}`, { method: "DELETE" });
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
              <span className="text-base font-medium text-slate-50">{entry.weightKg} kg</span>
              <span className="text-xs text-slate-400">
                {entry.date}
                {entry.note ? ` · ${entry.note}` : ""}
              </span>
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

function EditRow({
  entry,
  onDone,
  onCancel,
}: {
  entry: BodyweightEntryDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(String(entry.weightKg));
  const [note, setNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const weightKg = parseDecimalInput(draft);
    if (weightKg === null || weightKg < 20 || weightKg > 400) {
      setError("Enter a weight between 20 and 400 kg.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/bodyweight/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightKg, note: note.trim() === "" ? null : note.trim() }),
      });
      if (!res.ok) {
        setError("Save failed.");
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
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          aria-label="Edit bodyweight (kg)"
          value={draft}
          onChange={(e) => setDraft(sanitizeDecimalDraft(e.target.value))}
          className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
        />
        <input
          type="text"
          placeholder="note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
        />
      </div>
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
