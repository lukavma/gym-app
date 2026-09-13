// Athletic Measurement Profiles Release 2 — A-11b
// (docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.2, §21.2): "the scheme and strategy selects offer only compatible
// options". `checkPrescriptionCompatibility` already exhaustively tests the
// underlying tables (tests/unit/prescriptionSchema.test.ts); this proves
// the *editor's own derivation* (`schemeTypesForProfile`/
// `strategyIdsForProfile`, what `PrescriptionForm` actually renders options
// from) reuses them correctly — a couple of unlocked combinations, plus a
// negative check that an incompatible option is never offered.
import { describe, expect, it } from "vitest";
import { schemeTypesForProfile, strategyIdsForProfile } from "@/ui/prescriptions/formOptions";

describe("schemeTypesForProfile", () => {
  // set-groups-architecture-evaluation.md §8 — `groups` is additive for
  // `load_reps` (Stage A); every other Release 1 option is unchanged.
  it("offers fixed, repRange and groups for load_reps", () => {
    expect(schemeTypesForProfile("load_reps")).toEqual(["fixed", "repRange", "groups"]);
  });

  // Valid unlock: a load_distance exercise is offered distanceRounds, which
  // Release 1's fixed two-entry dropdown could never offer.
  it("unlocks distanceRounds for load_distance", () => {
    expect(schemeTypesForProfile("load_distance")).toEqual(["distanceRounds"]);
  });

  it("unlocks durationRounds for duration and load_duration", () => {
    expect(schemeTypesForProfile("duration")).toEqual(["durationRounds"]);
    expect(schemeTypesForProfile("load_duration")).toEqual(["durationRounds"]);
  });

  // Negative check: an incompatible option is never offered, in either
  // direction — a load_reps exercise never offers the athletic variants,
  // and an athletic exercise never offers fixed/repRange.
  it("never offers distanceRounds/durationRounds for load_reps or reps", () => {
    for (const profile of ["load_reps", "reps"] as const) {
      const options = schemeTypesForProfile(profile);
      expect(options).not.toContain("distanceRounds");
      expect(options).not.toContain("durationRounds");
    }
  });

  it("never offers fixed/repRange for an athletic profile", () => {
    for (const profile of [
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ] as const) {
      const options = schemeTypesForProfile(profile);
      expect(options).not.toContain("fixed");
      expect(options).not.toContain("repRange");
    }
  });
});

describe("strategyIdsForProfile", () => {
  it("offers every strategy for load_reps (unchanged Release 1 behaviour)", () => {
    expect(strategyIdsForProfile("load_reps")).toEqual([
      "load-progression",
      "rep-progression",
      "manual",
    ]);
  });

  // Negative check (O-11): a reps exercise is left with manual only —
  // load-progression/rep-progression must never be offered for it.
  it("reduces to manual only for reps", () => {
    expect(strategyIdsForProfile("reps")).toEqual(["manual"]);
  });

  it("reduces to manual only for every non-load_reps profile", () => {
    for (const profile of [
      "reps",
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ] as const) {
      expect(strategyIdsForProfile(profile)).toEqual(["manual"]);
    }
  });
});
