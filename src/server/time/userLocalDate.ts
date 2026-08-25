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

// The reverse direction of `userLocalDateString`: how many ms `timeZone` is
// ahead of UTC at the instant `date`, computed by formatting that instant in
// the zone and reading the wall-clock components back as if they were UTC.
// No timezone database ships with Node — this leans on the ICU data behind
// `Intl`, the same mechanism `userLocalDateString` already depends on.
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wallClockAsUtc - date.getTime();
}

// Companion to `weekBuckets.ts` (`@/domain/volume`), which computes calendar-
// and block-week boundaries as plain YYYY-MM-DD local date strings — pure,
// deliberately timezone-agnostic. This is the one place those boundaries
// become actual `timestamptz` query bounds: the UTC instant of local
// midnight on `date` in `timeZone`. Two passes converge correctly across a
// DST transition (the offset at the initial guess may differ from the
// offset at the true target instant); local midnight essentially never
// falls inside a spring-forward gap or fall-back overlap in practice (those
// occur at 2-3am local in every zone this app is likely to see), so a
// second pass is sufficient without a full disambiguation policy.
export function localDateToUtcInstant(date: string, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00.000Z`);
  const firstOffset = timeZoneOffsetMs(guess, timeZone);
  const refined = new Date(guess.getTime() - firstOffset);
  const secondOffset = timeZoneOffsetMs(refined, timeZone);
  return new Date(guess.getTime() - secondOffset);
}
