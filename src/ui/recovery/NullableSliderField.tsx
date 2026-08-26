"use client";

// phase-7-review.md MEDIUM-2 / phase-7-remediation-verification.md — shared
// between RecoveryHistoryList's EditRow and RecoveryCheckInForm (Today's
// "Edit today's check-in" path) so a metric that is genuinely `null` on the
// stored entry is never silently seeded to a neutral default in either
// place. A metric already null renders "Not set" until the user explicitly
// taps "Set" (a deliberate action, not a fabrication); any set metric can be
// explicitly cleared back to null with "Clear".

export function ClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`Clear ${label}`}
      className="text-xs text-slate-500 underline"
    >
      Clear
    </button>
  );
}

export function UnsetField({ label, onSet }: { label: string; onSet: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-slate-400">
      <span>{label}: not set</span>
      <button
        type="button"
        onClick={onSet}
        aria-label={`Set ${label}`}
        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
      >
        Set
      </button>
    </div>
  );
}

export function NullableSliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  if (value === null) {
    return <UnsetField label={label} onSet={() => onChange(3)} />;
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-slate-200">{value}</span>
          <ClearButton label={label} onClear={() => onChange(null)} />
        </span>
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        // Bare label (not "Edit {label}") — matches the plain, non-nullable
        // SliderField used for a brand-new check-in (RecoveryCheckIn.tsx),
        // so a test or assistive technology addressing "Sleep quality"
        // finds the editable slider whether the entry is new or existing.
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-100"
      />
    </label>
  );
}
