import { describe, expect, it } from "vitest";
import { profileSupportsScheme, strategySupportsProfile } from "@/domain/measurement/compatibility";
import { MEASUREMENT_PROFILES, type MeasurementProfile } from "@/domain/measurement/profile";

// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §9.2
// (profile × scheme × strategy compatibility) — the domain half of A-3.
// The executable scheme-type strings "distanceRounds"/"durationRounds" are
// not yet real `SchemeType` literals (a later stage wires them into
// `src/domain/schemes/setScheme.ts`); this suite exercises them as plain
// string literals, exactly as `profileSupportsScheme`'s own signature does.

const ALL_SCHEMES = ["fixed", "repRange", "distanceRounds", "durationRounds"] as const;

// §9.2's table, transcribed: profile -> the schemes it supports.
const EXPECTED_SCHEMES: Record<MeasurementProfile, readonly string[]> = {
  load_reps: ["fixed", "repRange"],
  reps: ["fixed", "repRange"],
  load_distance: ["distanceRounds"],
  distance_time: ["distanceRounds"],
  duration: ["durationRounds"],
  load_duration: ["durationRounds"],
};

describe("profileSupportsScheme — §9.2's four scheme columns", () => {
  it("has an expectation for every declared profile (completeness guard)", () => {
    expect(Object.keys(EXPECTED_SCHEMES).sort()).toEqual([...MEASUREMENT_PROFILES].sort());
  });

  for (const profile of MEASUREMENT_PROFILES) {
    for (const scheme of ALL_SCHEMES) {
      const expected = EXPECTED_SCHEMES[profile].includes(scheme);
      it(`${profile} × ${scheme} -> ${expected}`, () => {
        expect(profileSupportsScheme(profile, scheme)).toBe(expected);
      });
    }
  }

  it("rejects an unknown scheme type for every profile (closed vocabulary, not vacuously permissive)", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      expect(profileSupportsScheme(profile, "perSet")).toBe(false);
      expect(profileSupportsScheme(profile, "fixedPlusAmrap")).toBe(false);
    }
  });
});

// §9.2's three strategy columns plus its "why rep-progression is
// load_reps-only" note (N-13: the reps profile is manual-only in v1).
describe("strategySupportsProfile — §9.2's strategy columns", () => {
  it("load-progression supports load_reps only", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      expect(strategySupportsProfile("load-progression", profile)).toBe(profile === "load_reps");
    }
  });

  it("rep-progression supports load_reps only (N-13: reps is manual-only in v1)", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      expect(strategySupportsProfile("rep-progression", profile)).toBe(profile === "load_reps");
    }
  });

  it("manual supports every profile", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      expect(strategySupportsProfile("manual", profile)).toBe(true);
    }
  });

  it("rejects an unregistered strategy id for every profile", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      expect(strategySupportsProfile("not-a-real-strategy", profile)).toBe(false);
    }
  });
});
