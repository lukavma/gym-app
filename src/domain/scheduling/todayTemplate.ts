// domain-model.md §5 describes a block's schedule as either weekday-mode
// (each ScheduleEntry carries fixed `weekdays`) or rotation-mode (no
// weekdays — "the block runs as rotation"), but doesn't spell out the exact
// resolution algorithm for "what is today's template" — that's an
// implementation detail this module fills in:
//
//  - Weekday mode (any entry has weekdays set): today's template is the
//    entry whose weekdays include today's ISO weekday. If none match,
//    today is a rest day — deliberately not an error, no session starts.
//    Overlapping weekday assignments across entries are rejected at the
//    write boundary (domain/blocks/schema.ts's `scheduleInputSchema`), so
//    this resolver never has to choose between two matches.
//  - Rotation mode (no entry has weekdays): today's template is the entry
//    *after* whichever entry the athlete's most recently completed session
//    in this block was for, cyclically by current `position` order. If that
//    template is no longer in the schedule (removed, or the entry's
//    template was changed to something else) — or no session has been
//    completed yet — today resolves to the first entry. This is
//    deliberately not `completedSessionCount % scheduleLength`: once an
//    active block's schedule can be edited (active-schedule remediation),
//    counting completed sessions against the *current* array length makes
//    "next workout" jump unpredictably whenever an entry is added or
//    removed. Anchoring on the last-performed template keeps the sequence
//    explainable regardless of when the schedule changed.
//
// Active-schedule remediation — a schedule mixing weekday-mode and
// rotation-mode entries can no longer be written (rejected by
// `scheduleInputSchema`); any pre-existing mixed schedule row is still
// resolved defensively as weekday mode (any entry with weekdays wins) so a
// legacy row never causes a request to fail — the block editor surfaces it
// for correction instead of this resolver trying to fix it silently.
export interface ScheduleEntryForResolution {
  templateId: string;
  position: number;
  weekdays: number[] | null;
}

export type TodayResolution =
  { kind: "scheduled"; templateId: string } | { kind: "rest" } | { kind: "no_schedule" };

export function resolveTodayTemplate(
  schedule: readonly ScheduleEntryForResolution[],
  latestCompletedTemplateId: string | null,
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

  const latestIndex = latestCompletedTemplateId
    ? sorted.findIndex((entry) => entry.templateId === latestCompletedTemplateId)
    : -1;
  const nextIndex = latestIndex === -1 ? 0 : (latestIndex + 1) % sorted.length;
  const entry = sorted[nextIndex];
  return entry ? { kind: "scheduled", templateId: entry.templateId } : { kind: "no_schedule" };
}
