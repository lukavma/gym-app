"use client";

import { useState } from "react";
import { decimalPlaceCount, parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { RECOVERY_COPY } from "./copy";

// PI-007 device remediation (iPhone acceptance) — a directly tappable,
// persistent input, the same interaction model BodyweightQuickLog.tsx uses:
// no Set-gated activation, no fabricated default, and the same DOM `<input>`
// stays mounted and focused through every edit, including emptying it
// completely. The prior Set/UnsetField design fabricated no default either,
// but swapped the rendered element out from under the keyboard the instant
// the value resolved to `null` (e.g. select-all + delete) — that unmount is
// what closed the iOS keyboard mid-edit, and this component never does it.
//
// `draft` is the single source of truth for what's rendered: it holds
// exactly what `sanitizeDecimalDraft` lets through and is never force-reset
// to `""` just because it doesn't currently parse. A lone "," or "." is a
// mid-typing state, not an error — see `sleepHoursError` below for where
// "non-empty but unparseable" actually becomes a save-time error, instead
// of the silent clear the field used to resolve it to.
//
// Validation stays out of this shared surface (§4.1 "ownership", unchanged
// by this remediation): `sleepHoursError` is exported for Today's `save()`
// handlers to call themselves, enforcing range/precision as well. History
// does not call it for that part — its PATCH still gets a synchronous 400
// from the server for an out-of-range number. But a non-empty draft that
// never became a number at all (e.g. ",", ".", "1.2.3") never reaches the
// server as anything invalid — SleepHoursField already resolved it to a
// legal `null`, which the server correctly accepts as a deliberate clear.
// Only the client can tell "the athlete emptied this" apart from "the
// athlete typed something that isn't a number yet", so both Today and
// History must catch this one case themselves — see
// RecoveryHistoryList.tsx's own `isUnparseableSleepHoursDraft` check in
// `EditRow.save()`, which deliberately does NOT also enforce range/
// precision, keeping that part server-owned for History.
export function isUnparseableSleepHoursDraft(value: number | null, draft: string): boolean {
  return draft !== "" && value === null;
}

export function sleepHoursError(value: number | null, draft: string): string | null {
  if (isUnparseableSleepHoursDraft(value, draft)) {
    return RECOVERY_COPY.sleepHoursRangeError;
  }
  if (value !== null && (value > 24 || decimalPlaceCount(draft) > 2)) {
    return RECOVERY_COPY.sleepHoursRangeError;
  }
  return null;
}

export function SleepHoursField({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null, draft: string) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value !== null ? String(value) : "");

  return (
    <div className="flex flex-col gap-1 text-xs text-slate-400">
      <span>{RECOVERY_COPY.sleepHoursLabel}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder="hours"
        value={draft}
        onChange={(e) => {
          const sanitized = sanitizeDecimalDraft(e.target.value);
          setDraft(sanitized);
          onChange(parseDecimalInput(sanitized), sanitized);
        }}
        className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400"
      />
      <span className="text-[11px] text-slate-500">e.g. 7.5</span>
    </div>
  );
}
