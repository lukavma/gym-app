import { describe, expect, it } from "vitest";
import {
  isProfileEligibleForE1rm,
  isProfileEligibleForProgression,
  isProfileEligibleForVolume,
} from "@/domain/measurement/capabilities";
import { MEASUREMENT_PROFILES } from "@/domain/measurement/profile";

// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §11.2
// — the structural half of each consumer row (equipment and per-exercise
// switches are the caller's concern, not this module's; see O-17's
// "profile → basis → equipment → switch" order).

describe("isProfileEligibleForE1rm — §11.2's e1RM row, structural half only", () => {
  it("true for load_reps with any basis but assistance", () => {
    expect(isProfileEligibleForE1rm("load_reps", "total")).toBe(true);
    expect(isProfileEligibleForE1rm("load_reps", "per_hand")).toBe(true);
    expect(isProfileEligibleForE1rm("load_reps", "unspecified")).toBe(true);
    expect(isProfileEligibleForE1rm("load_reps", null)).toBe(true);
  });

  it("false for load_reps with assistance basis (structurally ineligible, §7.1)", () => {
    expect(isProfileEligibleForE1rm("load_reps", "assistance")).toBe(false);
  });

  it("false for every other profile regardless of basis", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      if (profile === "load_reps") continue;
      expect(isProfileEligibleForE1rm(profile, "total")).toBe(false);
      expect(isProfileEligibleForE1rm(profile, null)).toBe(false);
    }
  });
});

describe("isProfileEligibleForVolume — §11.2's muscle-volume row, structural half only", () => {
  it("true for load_reps and reps", () => {
    expect(isProfileEligibleForVolume("load_reps")).toBe(true);
    expect(isProfileEligibleForVolume("reps")).toBe(true);
  });

  it("false for every athletic profile", () => {
    for (const profile of [
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ] as const) {
      expect(isProfileEligibleForVolume(profile)).toBe(false);
    }
  });
});

describe("isProfileEligibleForProgression — delegates to profileSupportsScheme (§9.2)", () => {
  it("agrees with the load_reps/fixed case", () => {
    expect(isProfileEligibleForProgression("load_reps", "fixed")).toBe(true);
  });

  it("agrees with an incompatible pairing", () => {
    expect(isProfileEligibleForProgression("duration", "fixed")).toBe(false);
    expect(isProfileEligibleForProgression("load_reps", "distanceRounds")).toBe(false);
  });
});
