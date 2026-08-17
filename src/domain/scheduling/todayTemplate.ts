// domain-model.md §5 describes a block's schedule as either weekday-mode
// (each ScheduleEntry carries fixed `weekdays`) or rotation-mode (no
// weekdays — "the block runs as rotation"), but doesn't spell out the exact
// resolution algorithm for "what is today's template" — that's an
// implementation detail this module fills in:
//
//  - Weekday mode (any entry has weekdays set): today's template is the
//    entry whose weekdays include today's ISO weekday. If none match,
//    today is a rest day — deliberately not an error, no session starts.
//  - Rotation mode (no entry has weekdays): the next entry in position
//    order after however many sessions already completed for this block,
//    cyclically — session 1 -> entry 0, session 2 -> entry 1, wrapping
//    around. An in-progress (not yet completed) session doesn't advance
//    the rotation until it's completed.
//
// A block mixing weekday-mode and rotation-mode entries is not a supported
// shape (block_schedule_entries doesn't enforce this at the DB level, but
// nothing in the UI creates a mixed schedule) — if it ever happens, this
// resolves as weekday mode (any entry with weekdays wins).
export interface ScheduleEntryForResolution {
  templateId: string;
  position: number;
  weekdays: number[] | null;
}

export type TodayResolution =
  { kind: "scheduled"; templateId: string } | { kind: "rest" } | { kind: "no_schedule" };

export function resolveTodayTemplate(
  schedule: readonly ScheduleEntryForResolution[],
  completedSessionCountForBlock: number,
  todayIsoWeekday: number,
): TodayResolution {
  if (schedule.length === 0) return { kind: "no_schedule" };

  const sorted = schedule.slice().sort((a, b) => a.position - b.position);
  const isWeekdayMode = sorted.some(
    (entry) => entry.weekdays !== null && entry.weekdays.length > 0,
  );

  if (isWeekdayMode) {
    const match = sorted.find((entry) => entry.weekdays?.includes(todayIsoWeekday));
    return match ? { kind: "scheduled", templateId: match.templateId } : { kind: "rest" };
  }

  const index = completedSessionCountForBlock % sorted.length;
  const entry = sorted[index];
  return entry ? { kind: "scheduled", templateId: entry.templateId } : { kind: "no_schedule" };
}
