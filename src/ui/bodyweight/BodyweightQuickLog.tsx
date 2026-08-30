"use client";

import { useState } from "react";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { logBodyweightToday, UnknownAccountTimezoneError } from "@/sync/dailyLogs";
import type { BodyweightEntryDto } from "./types";

interface BodyweightQuickLogProps {
  onLogged?: (entry: BodyweightEntryDto) => void;
}

// mvp-scope.md F10 — "Logging bodyweight is ≤2 interactions from Today."
// This form is embedded directly on Today (TodaySection.tsx) and reused on
// /bodyweight (BodyweightScreen.tsx). Phase 8: goes through the offline
// outbox (src/sync/dailyLogs.ts) instead of a bare fetch — the day-grain
// upsert semantics (data-model.md §2.18 uq_bodyweight_day) are unchanged,
// just applied by the sync-apply path once synced instead of immediately.
// Unlike RecoveryCheckIn, there's no read-before-write ambiguity to resolve
// here: a bodyweight log is always a single required field the user just
// typed, so an offline "second log today" is a deliberate correction either
// way, online or off — never a fabricated/guessed value.
export function BodyweightQuickLog({ onLogged }: BodyweightQuickLogProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setError(null);
    const weightKg = parseDecimalInput(draft);
    if (weightKg === null || weightKg < 20 || weightKg > 400) {
      setError("Enter a weight between 20 and 400 kg.");
      return;
    }

    setSaving(true);
    try {
      const { id, date } = await logBodyweightToday({ weightKg });
      setDraft("");
      setSavedAt(Date.now());
      onLogged?.({ id, date, weightKg, note: null });
    } catch (err) {
      setError(
        err instanceof UnknownAccountTimezoneError
          ? "Can't save yet — this device hasn't learned the account's timezone. Connect online once, then try again."
          : "Couldn't save — try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
      <span className="text-sm font-medium text-slate-50">Log bodyweight</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="kg"
          aria-label="Bodyweight (kg)"
          value={draft}
          onChange={(e) => {
            setDraft(sanitizeDecimalDraft(e.target.value));
            setSavedAt(null);
          }}
          className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || draft.trim() === ""}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {savedAt && !error && <p className="text-xs text-emerald-400">Saved.</p>}
    </div>
  );
}
