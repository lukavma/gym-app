// PI-007 §4.1 (validation copy), §4.2 (anchors), §4.3 (rename map) — the
// recovery UI's own user-facing strings, gathered here (the
// src/ui/metrics/copy.ts precedent) so RecoveryCheckIn.tsx,
// RecoveryHistoryList.tsx and SleepHoursField.tsx cannot drift on the same
// label, anchor or error text.

export const RECOVERY_COPY = {
  sleepHoursLabel: "Sleep hours",
  sleepHoursEditLabel: "Edit sleep hours",
  sleepHoursRangeError: "Enter sleep hours between 0 and 24, to at most 2 decimals.",
  sorenessLabel: "Muscle soreness",
  sorenessAnchors: ["None", "Moderate", "Very high"] as [string, string, string],
  atLeastOneMetricRequired:
    "At least one of sleep hours, sleep quality, readiness, or muscle soreness is required.",
  setAtLeastOneMetricFirst:
    "Set at least one of sleep hours, sleep quality, readiness, or muscle soreness first.",
} as const;
