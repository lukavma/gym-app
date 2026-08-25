"use client";

import { useState } from "react";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";

interface LandmarkKeyEditorProps {
  muscleGroupId: string;
  keyName: string;
  initial: { valueMin: number | null; valueMax: number | null; openEnded: boolean } | null;
  onSaved: () => void;
}

// One (muscleGroupId, key) reference-value row — mv/mev/mav/mrv are the
// standard RP keys, but this works for any free-string key since
// data-model.md §2.17 doesn't constrain it. PATCH /api/volume/landmarks
// upserts in place, so this component doesn't distinguish "create" from
// "update" — a blank `initial` just starts the fields empty.
export function LandmarkKeyEditor({
  muscleGroupId,
  keyName,
  initial,
  onSaved,
}: LandmarkKeyEditorProps) {
  const [minDraft, setMinDraft] = useState(
    initial?.valueMin !== null ? String(initial?.valueMin ?? "") : "",
  );
  const [maxDraft, setMaxDraft] = useState(
    initial &&
      !initial.openEnded &&
      initial.valueMax !== null &&
      initial.valueMax !== initial.valueMin
      ? String(initial.valueMax)
      : "",
  );
  const [openEnded, setOpenEnded] = useState(initial?.openEnded ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const min = parseDecimalInput(minDraft);
    if (min === null || min < 0) {
      setError("Enter a value ≥ 0.");
      return;
    }
    // No explicit max typed -> single-value convention (valueMin ===
    // valueMax, volume-model.md §4); open-ended sends only the floor.
    const maxParsed = parseDecimalInput(maxDraft);
    const max = maxParsed === null ? min : maxParsed;
    if (!openEnded && max < min) {
      setError("Upper value must be ≥ lower value.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/volume/landmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muscleGroupId,
          key: keyName,
          valueMin: min,
          ...(openEnded ? { openEnded: true } : { valueMax: max }),
        }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error === "no_active_preset" ? "No active preset to edit." : "Save failed.");
        return;
      }
      onSaved();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-slate-700 p-2">
      <span className="text-xs uppercase tracking-wide text-slate-400">{keyName}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="min"
          aria-label={`${keyName} minimum`}
          value={minDraft}
          onChange={(e) => setMinDraft(sanitizeDecimalDraft(e.target.value))}
          className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
        />
        {!openEnded && (
          <>
            <span className="text-slate-500">–</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="max"
              aria-label={`${keyName} maximum`}
              value={maxDraft}
              onChange={(e) => setMaxDraft(sanitizeDecimalDraft(e.target.value))}
              className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
            />
          </>
        )}
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={openEnded}
            onChange={(e) => setOpenEnded(e.target.checked)}
          />
          open-ended
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          aria-label={`Save ${keyName} reference value`}
          className="ml-auto rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-900 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
