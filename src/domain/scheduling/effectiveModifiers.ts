import type { DeloadConfig, WeekModifiers } from "../blocks/schema";

// domain-model.md §5 — "A scheduled deload is config; a manual deload is a
// WeekOverride inserted at any time" and "manual override takes precedence
// over the scheduled deload for that week" (implementation-plan.md Phase 5).
// This is the single place that precedence is decided — Today/bundle
// assembly (server) calls this once per build; nothing else re-derives it
// (the client freezes whatever the bundle already resolved).
export interface WeekOverrideForResolution {
  weekIndex: number;
  type: "deload" | "custom";
  modifiers: WeekModifiers;
}

export interface EffectiveWeekModifiers {
  // Only true for an actual deload (scheduled, or an override of type
  // 'deload') — a 'custom' override modifies targets without marking the
  // session a deload, so it is still evaluated/counted/carried-forward.
  isDeload: boolean;
  modifiers: WeekModifiers | null;
}

const NONE: EffectiveWeekModifiers = { isDeload: false, modifiers: null };

export function resolveEffectiveWeekModifiers(
  weekIndex: number,
  weeksPlanned: number,
  deload: DeloadConfig | null,
  overrides: readonly WeekOverrideForResolution[],
): EffectiveWeekModifiers {
  const override = overrides.find((o) => o.weekIndex === weekIndex);
  if (override) {
    return { isDeload: override.type === "deload", modifiers: override.modifiers };
  }

  if (deload) {
    const scheduledWeek = deload.weekIndex === "last" ? weeksPlanned : deload.weekIndex;
    if (scheduledWeek === weekIndex) {
      return { isDeload: true, modifiers: deload.modifiers };
    }
  }

  return NONE;
}
