import { parseDateOnly } from "./weekIndex";

// Companion to weekIndex.ts — same "operates only on YYYY-MM-DD calendar
// date strings" discipline (domain-model.md §5's "clock passed in" rule).
// Returns ISO weekday: 1 = Monday ... 7 = Sunday, matching the range used
// by `block_schedule_entries.weekdays` (data-model.md §2.10).
export function isoWeekday(date: string): number {
  const jsDay = new Date(parseDateOnly(date)).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return jsDay === 0 ? 7 : jsDay;
}
