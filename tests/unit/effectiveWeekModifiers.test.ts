import { describe, expect, it } from "vitest";
import {
  resolveEffectiveWeekModifiers,
  type WeekOverrideForResolution,
} from "@/domain/scheduling/effectiveModifiers";
import type { DeloadConfig } from "@/domain/blocks/schema";

const scheduledDeload: DeloadConfig = {
  mode: "scheduled",
  weekIndex: 4,
  modifiers: { setMultiplier: 0.5 },
};

describe("resolveEffectiveWeekModifiers", () => {
  it("resolves no modifiers when nothing matches", () => {
    expect(resolveEffectiveWeekModifiers(1, 4, null, [])).toEqual({
      isDeload: false,
      modifiers: null,
    });
  });

  it("resolves a numeric scheduled deload on its exact week", () => {
    expect(resolveEffectiveWeekModifiers(4, 8, scheduledDeload, [])).toEqual({
      isDeload: true,
      modifiers: { setMultiplier: 0.5 },
    });
  });

  it("does not apply a scheduled deload on a different week", () => {
    expect(resolveEffectiveWeekModifiers(3, 8, scheduledDeload, [])).toEqual({
      isDeload: false,
      modifiers: null,
    });
  });

  it("resolves 'last' against the block's current weeksPlanned", () => {
    const lastWeekDeload: DeloadConfig = {
      mode: "scheduled",
      weekIndex: "last",
      modifiers: { loadMultiplier: 0.9 },
    };
    expect(resolveEffectiveWeekModifiers(8, 8, lastWeekDeload, [])).toEqual({
      isDeload: true,
      modifiers: { loadMultiplier: 0.9 },
    });
    // Extending weeksPlanned moves "last" without touching the config.
    expect(resolveEffectiveWeekModifiers(8, 10, lastWeekDeload, [])).toEqual({
      isDeload: false,
      modifiers: null,
    });
    expect(resolveEffectiveWeekModifiers(10, 10, lastWeekDeload, [])).toEqual({
      isDeload: true,
      modifiers: { loadMultiplier: 0.9 },
    });
  });

  it("a manual override for the week takes precedence over a scheduled deload for the same week", () => {
    const overrides: WeekOverrideForResolution[] = [
      { weekIndex: 4, type: "custom", modifiers: { loadMultiplier: 0.8 } },
    ];
    expect(resolveEffectiveWeekModifiers(4, 8, scheduledDeload, overrides)).toEqual({
      isDeload: false,
      modifiers: { loadMultiplier: 0.8 },
    });
  });

  it("an override of type 'deload' sets isDeload true", () => {
    const overrides: WeekOverrideForResolution[] = [
      { weekIndex: 2, type: "deload", modifiers: { setMultiplier: 0.5 } },
    ];
    expect(resolveEffectiveWeekModifiers(2, 8, null, overrides)).toEqual({
      isDeload: true,
      modifiers: { setMultiplier: 0.5 },
    });
  });

  it("an override on an unrelated week does not affect resolution for the current week", () => {
    const overrides: WeekOverrideForResolution[] = [
      { weekIndex: 6, type: "deload", modifiers: { setMultiplier: 0.5 } },
    ];
    expect(resolveEffectiveWeekModifiers(4, 8, scheduledDeload, overrides)).toEqual({
      isDeload: true,
      modifiers: { setMultiplier: 0.5 },
    });
  });
});
