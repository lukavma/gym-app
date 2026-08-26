// "Recovery remains optional ... and can be dismissed permanently"
// (implementation-plan.md Phase 7). This is a per-device UI preference, not
// a domain fact — nothing in data-model.md/domain-model.md reserves a column
// for it, so it lives in localStorage rather than a new table/user column.
// Wrapped in try/catch: private browsing or a cleared store must never
// throw, just fall back to "not dismissed".
const STORAGE_KEY = "gym-app:recovery-checkin-dismissed";

export function isRecoveryCheckInDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissRecoveryCheckInForever(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Best-effort only — nothing to fall back to if storage is unavailable.
  }
}
