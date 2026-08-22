import { describe, expect, it } from "vitest";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";

// H-1 regression — every boundary that could carry a recommendation into a
// deload context (buildTodayBundle, getActiveSession, startSession, logSet,
// decideRecommendation, ExerciseCard) routes through this single function,
// so its own behaviour is the contract those callers rely on: a deload
// context reads null even when the value it was handed is a genuine,
// already-attached recommendation shape — exactly what a stale pre-fix
// cached bundle or session would still be carrying.

describe("recommendationForDeload", () => {
  const rec = { id: "rec-1", decision: { status: "pending" as const } };

  it("passes a non-deload recommendation through unchanged", () => {
    expect(recommendationForDeload(false, rec)).toBe(rec);
  });

  it("suppresses a recommendation carried into a deload context, including an already-attached (stale pre-fix) shape", () => {
    expect(recommendationForDeload(true, rec)).toBeNull();
  });

  it("stays null when there is nothing to suppress, deload or not", () => {
    expect(recommendationForDeload(true, null)).toBeNull();
    expect(recommendationForDeload(false, null)).toBeNull();
  });
});
