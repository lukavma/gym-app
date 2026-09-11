"use client";

import { useState } from "react";
import { decimalPlaceCount, parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { ClearButton, UnsetField } from "./NullableSliderField";
import { RECOVERY_COPY } from "./copy";

// PI-007 §4.1 — exact reuse of the delivered RecoveryHistoryList.EditRow
// sleep-hours control, extracted so Today's three forms and History cannot
// drift on labels, draft handling or the Set/Clear affordances. An emptied
// or unparseable draft resolves to `null` = "not set" — a clear, not an
// error — so the draft always resets to "" whenever the value resolves to
// null, and retained text can never desync from the rendered state.
//
// Validation is deliberately NOT part of this shared surface (§4.1
// "ownership"): `sleepHoursError` below is exported for Today's three
// `save()` handlers to call themselves. History does not call it — its
// PATCH already gets a synchronous 400 from the server (§1 boundary), so
// this extraction changes nothing about History's validation behaviour.
export function sleepHoursError(value: number | null, draft: string): string | null {
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

  if (value === null) {
    return (
      <UnsetField
        label={RECOVERY_COPY.sleepHoursLabel}
        onSet={() => {
          setDraft("7");
          onChange(7, "7");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="flex items-center justify-between">
        <span>{RECOVERY_COPY.sleepHoursLabel}</span>
        <ClearButton
          label={RECOVERY_COPY.sleepHoursLabel}
          onClear={() => {
            setDraft("");
            onChange(null, "");
          }}
        />
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder="hours"
        value={draft}
        onChange={(e) => {
          const sanitized = sanitizeDecimalDraft(e.target.value);
          const parsed = parseDecimalInput(sanitized);
          const nextDraft = parsed === null ? "" : sanitized;
          setDraft(nextDraft);
          onChange(parsed, nextDraft);
        }}
        className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-50 outline-none focus:border-slate-400"
      />
      <span className="text-[11px] text-slate-500">e.g. 7.5</span>
    </div>
  );
}
