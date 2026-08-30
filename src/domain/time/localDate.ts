// Pure (Intl-only) local-date formatting, usable both server-side
// (src/server/time/userLocalDate.ts re-derives the same value from the
// user's stored timezone) and client-side (src/sync/dailyLogs.ts — Phase 8
// offline bodyweight/recovery logging). Kept in `domain` because it's
// exactly that: no Node/DB/React, isomorphic per architecture-plan.md's
// boundary rules.
//
// phase-8-review.md B-3 — this file used to also export
// `deviceLocalDateString`, which resolved "today" from the DEVICE's own IANA
// zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) rather than the
// account's `users.timezone`, and every quick-log call site used it
// unconditionally, online and offline. Measured cases (Pacific/Kiritimati,
// Pacific/Niue, plain UTC at 22:30) showed this silently attributing a log
// to the wrong calendar day even while fully online. Quick-logs now resolve
// the account's own timezone via src/sync/accountTimezone.ts (backed by the
// Today bundle, src/server/today/service.ts) and call `userLocalDateString`
// with THAT — and surface an explicit "don't know today's date yet" state
// (src/ui/recovery/RecoveryCheckIn.tsx's unknown-timezone phase) rather than
// falling back to the device's zone when no account timezone is cached yet.
export function userLocalDateString(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
