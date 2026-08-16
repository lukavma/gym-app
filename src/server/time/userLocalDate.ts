// domain-model.md §5 — "Weeks are derived, not persisted", computed "in the
// user's timezone". This is the one place that turns a wall-clock instant
// into the YYYY-MM-DD calendar-date string the pure domain `weekIndex()`
// function (src/domain/scheduling/weekIndex.ts) operates on — kept at the
// server boundary per architecture-plan.md's "clock passed in" rule.
export function userLocalDateString(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
