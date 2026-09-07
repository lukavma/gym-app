import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE,
  DEFAULT_MEASUREMENT_PROFILE,
  dimensionsOf,
  loadBasisRequired,
  LOAD_BASES,
  MEASUREMENT_PROFILES,
  VOLUME_COUNTING_MODES,
  type FieldRequirement,
  type MeasurementProfile,
  type ProfileDimensions,
} from "@/domain/measurement/profile";

// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §6.2
// (the field/profile matrix, A-1's exhaustiveness) and §7.1 (load basis
// presence).

// §6.2, transcribed exactly as the table reads (R/O/– per cell), keyed the
// same way `dimensionsOf` is, so a mismatch on any single cell fails loudly
// rather than only on an aggregate diff.
const EXPECTED_MATRIX: Record<MeasurementProfile, Record<string, FieldRequirement>> = {
  load_reps: {
    weight: "required",
    reps: "required",
    rir: "optional",
    distance: "forbidden",
    duration: "forbidden",
  },
  reps: {
    weight: "forbidden",
    reps: "required",
    rir: "optional",
    distance: "forbidden",
    duration: "forbidden",
  },
  load_distance: {
    weight: "required",
    reps: "forbidden",
    rir: "forbidden",
    distance: "required",
    duration: "optional",
  },
  distance_time: {
    weight: "forbidden",
    reps: "forbidden",
    rir: "forbidden",
    distance: "required",
    duration: "required",
  },
  duration: {
    weight: "forbidden",
    reps: "forbidden",
    rir: "forbidden",
    distance: "forbidden",
    duration: "required",
  },
  load_duration: {
    weight: "required",
    reps: "forbidden",
    rir: "forbidden",
    distance: "forbidden",
    duration: "required",
  },
};

describe("MEASUREMENT_PROFILES / LOAD_BASES / VOLUME_COUNTING_MODES", () => {
  it("is the closed §5.3 vocabulary, in order", () => {
    expect(MEASUREMENT_PROFILES).toEqual([
      "load_reps",
      "reps",
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ]);
  });

  it("is the closed §7.1 load-basis vocabulary", () => {
    expect(LOAD_BASES).toEqual(["total", "per_hand", "assistance", "unspecified"]);
  });

  it("is the closed §11.4 volume-counting vocabulary", () => {
    expect(VOLUME_COUNTING_MODES).toEqual(["auto", "off"]);
  });

  it("defaults to load_reps / unspecified (§6.3 non-reinterpretation)", () => {
    expect(DEFAULT_MEASUREMENT_PROFILE).toBe("load_reps");
    expect(DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE).toBe("unspecified");
  });
});

describe("dimensionsOf — exhaustive over every profile × field cell (A-1)", () => {
  it("has an entry for every declared profile (completeness guard)", () => {
    expect(Object.keys(EXPECTED_MATRIX).sort()).toEqual([...MEASUREMENT_PROFILES].sort());
  });

  for (const profile of MEASUREMENT_PROFILES) {
    it(`reproduces §6.2's row for ${profile}`, () => {
      expect(dimensionsOf(profile)).toEqual(EXPECTED_MATRIX[profile]);
    });
  }

  it("type-level: ProfileDimensions covers exactly the five fields (a sixth or a typo'd key fails `pnpm typecheck`, not this assertion)", () => {
    const dims = dimensionsOf("load_reps");
    const rebuilt = {
      weight: dims.weight,
      reps: dims.reps,
      rir: dims.rir,
      distance: dims.distance,
      duration: dims.duration,
    } satisfies ProfileDimensions;
    expect(rebuilt).toEqual(dims);
  });
});

describe("loadBasisRequired — §7.1 presence rule", () => {
  it("is true for every profile with a load field", () => {
    expect(loadBasisRequired("load_reps")).toBe(true);
    expect(loadBasisRequired("load_distance")).toBe(true);
    expect(loadBasisRequired("load_duration")).toBe(true);
  });

  it("is false for every profile without a load field", () => {
    expect(loadBasisRequired("reps")).toBe(false);
    expect(loadBasisRequired("distance_time")).toBe(false);
    expect(loadBasisRequired("duration")).toBe(false);
  });

  it("agrees with dimensionsOf's own weight column for every profile (no drift between the two tables)", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      const hasLoadField = dimensionsOf(profile).weight !== "forbidden";
      expect(loadBasisRequired(profile)).toBe(hasLoadField);
    }
  });
});
