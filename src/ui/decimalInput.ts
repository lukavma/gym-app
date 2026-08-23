// Native `<input type="number">` silently collapses `.value` to `""` when
// the typed text doesn't parse as a period-decimal float — including a
// comma decimal separator, which iOS presents by default under non-US
// locales (e.g. German). `type="text"` plus these two helpers keep the app
// in control of parsing so a valid keystroke is never dropped or misread.

const DECIMAL_DRAFT_PATTERN = /[^0-9.,]/g;

// Used in onChange: keeps the field feeling numeric while typing without
// relying on the browser's own (locale-fragile) number sanitization.
export function sanitizeDecimalDraft(raw: string): string {
  return raw.replace(DECIMAL_DRAFT_PATTERN, "");
}

// `null` means "nothing valid was entered" — distinct from a legitimately
// typed `0` (a valid domain value, e.g. a bodyweight-only set).
export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

// Counts decimal places on the raw draft rather than the parsed float, so a
// step-precision check (loadStepKg review L-7) can't be fooled by binary
// floating-point representation error (e.g. 1.005 * 100 !== 100.5 in IEEE
// 754). Assumes at most one separator, which parseDecimalInput already
// enforces (a second one makes the value unparseable, so this is only
// meaningful to call once parseDecimalInput has accepted the same string).
export function decimalPlaceCount(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  const separatorIndex = normalized.indexOf(".");
  return separatorIndex === -1 ? 0 : normalized.length - separatorIndex - 1;
}
