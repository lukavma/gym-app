// domain-model.md §5 — "Weeks are derived, not persisted":
// weekIndex(date) = floor((date - startDate) / 7) + 1, computed in the
// user's timezone. This function is deliberately pure and operates only on
// YYYY-MM-DD calendar-date strings — no Date objects, no timezone logic.
// Deriving "today" as a local date string for the user's timezone happens
// at the server boundary (architecture-plan.md's "clock passed in" rule),
// not here.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(date: string): number {
  const parts = date.split("-").map(Number);
  const [year, month, day] = parts as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

export function weekIndex(startDate: string, currentDate: string): number {
  const diffDays = Math.floor((parseDateOnly(currentDate) - parseDateOnly(startDate)) / MS_PER_DAY);
  return Math.floor(diffDays / 7) + 1;
}

export type BlockLifecycleStatus = "planned" | "active" | "completed" | "abandoned";

// domain-model.md §5 — "Weeks are derived, not persisted" plus "A block
// that runs past weeksPlanned stays active (calendar shows overdue) until
// the user completes or extends it": an active block is deliberately never
// clamped above weeksPlanned, that's the "overdue" signal. What the raw
// weekIndex() arithmetic gets wrong on its own, per status:
//  - planned:            hasn't started yet — there is no "current" week.
//  - active:              a future startDate (or one activated early) can
//                          make weekIndex() go to 0 or negative; floor at 1.
//  - completed/abandoned: weekIndex() against "today" grows forever after
//                          the block stopped running — freeze it at the
//                          date the block actually ended (completedAt), not
//                          the caller's clock.
export function currentWeekIndex(
  status: BlockLifecycleStatus,
  startDate: string,
  today: string,
  completedDate: string | null,
): number | null {
  if (status === "planned") return null;
  const referenceDate = status === "active" ? today : (completedDate ?? today);
  return Math.max(1, weekIndex(startDate, referenceDate));
}
