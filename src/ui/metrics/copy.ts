// Metrics dashboard v1 — every user-facing string on the metrics surface.
//
// Binding source: `docs/reviews/metrics-dashboard-architecture-evaluation.md`
// §15 (copy rules, enforced by `tests/unit/metricsCopy.test.ts`), §9 (the
// Current estimates card's reused footer), §12.2 (the wireframe's exact
// wording). Every sentence the athlete can read lives here as data, the
// strength convention (`@/ui/strength/copy.ts`), so the copy rules are
// checkable in one place.
//
// Reused sentences are imported and re-exported BY VALUE, never re-typed —
// `allCopyStrings()` must include them so the substring scanner can see them.

import { STRENGTH_PAGE_COPY, STRENGTH_REASON_COPY } from "@/ui/strength/copy";

export const METRICS_PAGE_COPY = {
  heading: "Metrics",
  loading: "Loading…",
  loadFailed: "Failed to load metrics.",
  refresh: "Refresh",
  weeksStartLabel: "Weeks start",
  updatedPrefix: "Updated",
  numbersForPrefix: "numbers for",

  // --- Current estimates (§9) ---
  estimatesHeading: "Current estimates",
  chooseExercisesLink: "Choose exercises",
  selectionEmptyState: "No exercises selected. Choose up to five compatible exercises.",
  noCurrentEstimate: "No current estimate",
  unitLine: "In the numbers you log for each exercise — per hand, per stack, as entered.",
  deloadLine: "Deload sessions are not counted.",
  algorithmPrefix: "Algorithm",

  // --- Training (§4 M-1/M-2/M-3, O-2) ---
  trainingHeading: "Training",
  fullHistoryLink: "Full history",
  trainingSoFarSuffix: "(so far)",
  // O-6 (Release 2) — "Every exercise type counts as a set" appended so the
  // athlete isn't surprised when a non-load_reps attempt (a duration hold, a
  // distance/time round) shows up in the Training card's work-set count:
  // `aggregateTrainingWeeks` counts every non-warm-up attempt regardless of
  // measurement profile (no profile filter, §21.2).
  trainingCaption:
    "Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set.",
  sessionsWord: "sessions",
  sessionWord: "session",
  workSetsWord: "work sets",
  workSetWord: "work set",
  deloadBadge: "Deload",

  // --- Weekly volume (§4 M-5) ---
  volumeHeading: "Weekly volume",
  volumeScreenLink: "Volume screen",
  volumeThisWeek: "This week",
  volumeLastWeek: "Last week",
  volumeSoFarSuffix: "(so far)",
  volumeEmptyState: "No work sets this week or last week.",
  volumeCaptionContribution: "Under current contribution weights.",
  volumeCaptionInProgress: "Includes the workout in progress.",
  volumeCaptionRanges: "Reference ranges are on the Volume screen.",
  volumeColumnHeading: "Effective sets",
  volumeBackRow: "Back",
  volumeUnclassifiedBack: "Unclassified Back",

  // --- Bodyweight (§4 M-6/M-7/M-8/M-9) ---
  bodyweightHeading: "Bodyweight",
  bodyweightLogLink: "Bodyweight log",
  bodyweightLatestLabel: "latest",
  bodyweightAverageLabel: "7-day average",
  bodyweightChangeLabel: "change of 7-day averages, 30 days apart",
  bodyweightEmptyState: "No bodyweight logged in the last 90 days.",
  bodyweightSparklineSummaryPrefix: "90 days",
  bodyweightSummaryNoEntries: "no entries",
  bodyweightSummaryEntriesWord: "entries",
  bodyweightSummaryFirst: "first",
  bodyweightSummaryLowest: "lowest",
  bodyweightSummaryHighest: "highest",

  // --- Recovery (§4 M-10/M-11/M-12, I-7) ---
  recoveryHeading: "Recovery",
  recoveryLogLink: "Recovery log",
  recoveryCaption:
    "Your own check-ins, as entered. Not used by the progression engine or any suggestion, and not compared with training here. The Soreness column is muscle soreness: 1 = none, 3 = moderate, 5 = very high.",
  recoveryLoggedPrefix: "Logged",
  recoveryOfLastSevenDays: "of the last 7 days",
  recoveryMeanSleepPrefix: "mean sleep",
  recoveryColumnDay: "Day",
  recoveryColumnSleep: "Sleep h",
  recoveryColumnQuality: "Quality",
  recoveryColumnReadiness: "Readiness",
  recoveryColumnSoreness: "Soreness",
  recoveryEmptyCell: "—",

  // --- Offline / staleness (§14) ---
  offlineNoData: "Offline — metrics need a connection.",
  offlineWithDataPrefix: "Offline — showing metrics as of",
  refetchErrorBanner: "Couldn't refresh — showing the last loaded numbers.",

  // --- Editor (/metrics/exercises, §9, §12.2, §13) ---
  editorHeading: "Dashboard exercises",
  editorCaption: "Up to five compatible exercises, in the order you want them.",
  editorAddLabel: "Add an exercise",
  editorAddButton: "Add",
  editorSaveButton: "Save",
  editorCancelLink: "Cancel",
  editorLimitMessage: "Five exercises is the limit.",
  editorOfflineSaveError: "Couldn't save — you're offline.",
  editorSaveGenericError: "Couldn't save that selection.",
  editorEmptyCandidates:
    "No compatible exercises yet. Estimates are available for barbell, dumbbell, cable and machine exercises.",
  editorMoveUp: "Move up",
  editorMoveDown: "Move down",
  editorRemove: "Remove",
  editorArchivedBadge: "Archived",
} as const;

// The reused sentences, re-exported by value so this module's own scan
// surface can see them (§15) and so a card can import them from one place.
export const freshness = STRENGTH_PAGE_COPY.freshness;
export const estimateDisclaimer = STRENGTH_PAGE_COPY.estimateDisclaimer;
export const bandNote = STRENGTH_PAGE_COPY.bandNote;
export const footer = STRENGTH_PAGE_COPY.footer;
export const notAvailableCopy = STRENGTH_REASON_COPY.EXERCISE_CATEGORY_UNSUPPORTED;
export const turnedOffCopy = STRENGTH_REASON_COPY.EXERCISE_ESTIMATE_DISABLED;

export function refusalCopyForState(state: "not_available" | "turned_off"): string {
  return state === "turned_off" ? turnedOffCopy : notAvailableCopy;
}

// Every user-facing string this module can produce, for the copy test —
// exactly the strength convention.
export function allCopyStrings(): string[] {
  return [
    ...Object.values(METRICS_PAGE_COPY),
    freshness,
    estimateDisclaimer,
    bandNote,
    footer,
    notAvailableCopy,
    turnedOffCopy,
  ];
}
