import { parseDateOnly } from "@/domain/scheduling/weekIndex";

// volume-model.md §2 — "Two bucketing modes, both derived": calendar week
// (dashboard, user timezone, configurable week start) and block week
// (`[startDate + 7(n-1), startDate + 7n)`). Both operate purely on
// YYYY-MM-DD local calendar-date strings — same "clock passed in" / no
// timezone logic discipline as weekIndex.ts. Converting a window's date
// strings into actual UTC instants for querying `startedAt` happens at the
// server boundary (`@/server/time/userLocalDate`), not here — calendar-day
// arithmetic itself is timezone-agnostic (a "week" is 7 wall-clock calendar
// days regardless of any DST transition inside it).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnlyString(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  return toDateOnlyString(parseDateOnly(date) + days * MS_PER_DAY);
}

// 0 = Sunday .. 6 = Saturday — matches `users.week_starts_on`'s own
// `ck_users_week_starts_on` range (data-model.md §2.1), which is the JS
// `Date#getDay()` convention, not the 1-7 ISO convention `isoWeekday.ts`
// uses for `block_schedule_entries.weekdays`.
function dateOnlyWeekday(date: string): number {
  return new Date(parseDateOnly(date)).getUTCDay();
}

export interface WeekWindow {
  // The window's start date also identifies it — stable, sortable, and
  // human-readable as a report key.
  startDate: string;
  endDateExclusive: string;
}

// The calendar week (half-open [start, end)) containing `date`, anchored on
// the most recent day whose weekday equals `weekStartsOn`.
export function calendarWeekStart(date: string, weekStartsOn: number): string {
  const weekday = dateOnlyWeekday(date);
  const daysSinceStart = (weekday - weekStartsOn + 7) % 7;
  return addDays(date, -daysSinceStart);
}

export function calendarWeekWindow(date: string, weekStartsOn: number): WeekWindow {
  const startDate = calendarWeekStart(date, weekStartsOn);
  return { startDate, endDateExclusive: addDays(startDate, 7) };
}

// implementation-plan.md Phase 6 — "current week plus the previous four
// weeks". Index 0 is the window containing `date` (current week); each
// subsequent index goes one week further into the past.
export function calendarWeekWindows(
  date: string,
  weekStartsOn: number,
  count: number,
): WeekWindow[] {
  const currentStart = calendarWeekStart(date, weekStartsOn);
  return Array.from({ length: count }, (_, i) => {
    const startDate = addDays(currentStart, -7 * i);
    return { startDate, endDateExclusive: addDays(startDate, 7) };
  });
}

// volume-model.md §2 — block week n (1-indexed): [startDate + 7(n-1), startDate + 7n).
export function blockWeekWindow(blockStartDate: string, weekIndex: number): WeekWindow {
  const startDate = addDays(blockStartDate, 7 * (weekIndex - 1));
  return { startDate, endDateExclusive: addDays(startDate, 7) };
}

// The block-week analogue of calendarWeekWindows: block week `weekIndex`
// plus the (count-1) block weeks before it (floored at week 1).
export function blockWeekWindows(
  blockStartDate: string,
  weekIndex: number,
  count: number,
): WeekWindow[] {
  const windows: WeekWindow[] = [];
  for (let i = 0; i < count; i++) {
    const n = weekIndex - i;
    if (n < 1) break;
    windows.push(blockWeekWindow(blockStartDate, n));
  }
  return windows;
}
