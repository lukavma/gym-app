import { describe, expect, it } from "vitest";
import {
  MAX_DISTANCE_M,
  MAX_DURATION_S,
  MAX_REPS,
  MAX_RIR,
  MAX_WEIGHT_KG,
  validateSetInput,
  type SetInputDraft,
} from "@/ui/workout/validateSetInput";
import { MEASUREMENT_PROFILES } from "@/domain/measurement/profile";

// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.3's binding input matrix — every profile's required/optional/
// forbidden field rule, plus the `m`/`s` decimal-place guard (reusing
// `src/ui/decimalInput.ts`'s existing `decimalPlaceCount`) and the numeric
// bounds mirrored from `setLogUpsertPayloadSchema` (§12.2).

const EMPTY: SetInputDraft = {
  weightKg: null,
  reps: null,
  rir: null,
  distanceM: null,
  durationS: null,
};

describe("validateSetInput — completeness guard", () => {
  it("is exercised by this file for every declared profile", () => {
    // Not a functional assertion — a completeness guard so a seventh
    // profile added later fails this file loudly (a missing describe
    // block below) rather than silently going untested.
    expect(MEASUREMENT_PROFILES).toEqual([
      "load_reps",
      "reps",
      "load_distance",
      "distance_time",
      "duration",
      "load_duration",
    ]);
  });
});

describe("load_reps — kg + reps required, RIR optional, distance/duration forbidden", () => {
  it("accepts a valid set without RIR", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80, reps: 8 })).toBeNull();
  });

  it("accepts a valid set with RIR", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80, reps: 8, rir: 2 })).toBeNull();
  });

  it("rejects a missing weight", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, reps: 8 })).toBe("Weight is required.");
  });

  it("rejects a missing reps count", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80 })).toBe("Reps are required.");
  });

  it("rejects a forbidden distance", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80, reps: 8, distanceM: 20 })).toBe(
      "Distance is not recorded for this exercise.",
    );
  });

  it("rejects a forbidden duration", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80, reps: 8, durationS: 30 })).toBe(
      "Time is not recorded for this exercise.",
    );
  });

  it("rejects weight over the ceiling", () => {
    expect(
      validateSetInput("load_reps", { ...EMPTY, weightKg: MAX_WEIGHT_KG + 0.01, reps: 8 }),
    ).toBe(`Weight must be ${MAX_WEIGHT_KG} kg or less.`);
  });

  it("rejects reps over the ceiling", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80, reps: MAX_REPS + 1 })).toBe(
      `Reps must be ${MAX_REPS} or less.`,
    );
  });

  it("rejects RIR over the ceiling", () => {
    expect(
      validateSetInput("load_reps", { ...EMPTY, weightKg: 80, reps: 8, rir: MAX_RIR + 1 }),
    ).toBe(`RIR must be ${MAX_RIR} or less.`);
  });

  it("O-15: adds no decimal-place guard on weight — three decimals still pass range validation", () => {
    expect(validateSetInput("load_reps", { ...EMPTY, weightKg: 80.125, reps: 8 })).toBeNull();
  });
});

describe("reps — reps required, RIR optional (O-11), weight/distance/duration forbidden", () => {
  it("accepts a valid set", () => {
    expect(validateSetInput("reps", { ...EMPTY, reps: 12 })).toBeNull();
  });

  it("accepts RIR (O-11)", () => {
    expect(validateSetInput("reps", { ...EMPTY, reps: 12, rir: 1 })).toBeNull();
  });

  it("rejects a missing reps count", () => {
    expect(validateSetInput("reps", { ...EMPTY })).toBe("Reps are required.");
  });

  it("rejects a forbidden weight", () => {
    expect(validateSetInput("reps", { ...EMPTY, reps: 12, weightKg: 20 })).toBe(
      "Weight is not recorded for this exercise.",
    );
  });

  it("rejects a forbidden distance", () => {
    expect(validateSetInput("reps", { ...EMPTY, reps: 12, distanceM: 5 })).toBe(
      "Distance is not recorded for this exercise.",
    );
  });

  it("rejects a forbidden duration", () => {
    expect(validateSetInput("reps", { ...EMPTY, reps: 12, durationS: 5 })).toBe(
      "Time is not recorded for this exercise.",
    );
  });
});

describe("load_distance — kg + m required, s optional, reps/RIR forbidden", () => {
  it("accepts a valid set without duration", () => {
    expect(validateSetInput("load_distance", { ...EMPTY, weightKg: 60, distanceM: 20 })).toBeNull();
  });

  it("accepts a valid set with duration", () => {
    expect(
      validateSetInput("load_distance", {
        ...EMPTY,
        weightKg: 60,
        distanceM: 20,
        durationS: 12.4,
        durationSRaw: "12.4",
      }),
    ).toBeNull();
  });

  it("rejects a missing weight", () => {
    expect(validateSetInput("load_distance", { ...EMPTY, distanceM: 20 })).toBe(
      "Weight is required.",
    );
  });

  it("rejects a missing distance", () => {
    expect(validateSetInput("load_distance", { ...EMPTY, weightKg: 60 })).toBe(
      "Enter a distance in metres.",
    );
  });

  it("rejects a forbidden reps", () => {
    expect(
      validateSetInput("load_distance", { ...EMPTY, weightKg: 60, distanceM: 20, reps: 5 }),
    ).toBe("Reps are not recorded for this exercise.");
  });

  it("rejects a forbidden RIR", () => {
    expect(
      validateSetInput("load_distance", { ...EMPTY, weightKg: 60, distanceM: 20, rir: 2 }),
    ).toBe("RIR is not recorded for this exercise.");
  });

  it("rejects more than 2 decimal places on distance (guard reads the raw draft)", () => {
    expect(
      validateSetInput("load_distance", {
        ...EMPTY,
        weightKg: 60,
        distanceM: 20.125,
        distanceMRaw: "20.125",
      }),
    ).toBe("Distance can have at most 2 decimal places.");
  });

  it("rejects more than 2 decimal places on the optional duration", () => {
    expect(
      validateSetInput("load_distance", {
        ...EMPTY,
        weightKg: 60,
        distanceM: 20,
        durationS: 12.456,
        durationSRaw: "12.456",
      }),
    ).toBe("Time can have at most 2 decimal places.");
  });

  it("rejects distance over the ceiling", () => {
    expect(
      validateSetInput("load_distance", { ...EMPTY, weightKg: 60, distanceM: MAX_DISTANCE_M + 1 }),
    ).toBe(`Distance must be ${MAX_DISTANCE_M} m or less.`);
  });
});

describe("distance_time — m + s both required, weight/reps/RIR forbidden", () => {
  it("accepts a valid set", () => {
    expect(
      validateSetInput("distance_time", { ...EMPTY, distanceM: 40, durationS: 5.62 }),
    ).toBeNull();
  });

  it("rejects a missing distance", () => {
    expect(validateSetInput("distance_time", { ...EMPTY, durationS: 5.62 })).toBe(
      "Enter a distance in metres.",
    );
  });

  it("rejects a missing duration", () => {
    expect(validateSetInput("distance_time", { ...EMPTY, distanceM: 40 })).toBe(
      "Enter a time in seconds.",
    );
  });

  it("rejects a forbidden weight", () => {
    expect(
      validateSetInput("distance_time", { ...EMPTY, distanceM: 40, durationS: 5.62, weightKg: 1 }),
    ).toBe("Weight is not recorded for this exercise.");
  });

  it("rejects more than 2 decimal places on duration", () => {
    expect(
      validateSetInput("distance_time", {
        ...EMPTY,
        distanceM: 40,
        durationS: 5.621,
        durationSRaw: "5.621",
      }),
    ).toBe("Time can have at most 2 decimal places.");
  });
});

describe("duration — s required, everything else forbidden", () => {
  it("accepts a valid set", () => {
    expect(validateSetInput("duration", { ...EMPTY, durationS: 45 })).toBeNull();
  });

  it("rejects a missing duration", () => {
    expect(validateSetInput("duration", { ...EMPTY })).toBe("Enter a time in seconds.");
  });

  it("rejects a forbidden distance", () => {
    expect(validateSetInput("duration", { ...EMPTY, durationS: 45, distanceM: 1 })).toBe(
      "Distance is not recorded for this exercise.",
    );
  });

  it("rejects zero as a duration (partial attempts still need a positive value logged)", () => {
    expect(validateSetInput("duration", { ...EMPTY, durationS: 0 })).toBe(
      "Enter a time in seconds.",
    );
  });

  it("rejects duration over the ceiling", () => {
    expect(validateSetInput("duration", { ...EMPTY, durationS: MAX_DURATION_S + 1 })).toBe(
      `Time must be ${MAX_DURATION_S} s or less.`,
    );
  });
});

describe("load_duration — kg + s both required, reps/distance/RIR forbidden", () => {
  it("accepts a valid set", () => {
    expect(validateSetInput("load_duration", { ...EMPTY, weightKg: 20, durationS: 45 })).toBeNull();
  });

  it("rejects a missing weight", () => {
    expect(validateSetInput("load_duration", { ...EMPTY, durationS: 45 })).toBe(
      "Weight is required.",
    );
  });

  it("rejects a missing duration", () => {
    expect(validateSetInput("load_duration", { ...EMPTY, weightKg: 20 })).toBe(
      "Enter a time in seconds.",
    );
  });

  it("rejects a forbidden distance", () => {
    expect(
      validateSetInput("load_duration", { ...EMPTY, weightKg: 20, durationS: 45, distanceM: 1 }),
    ).toBe("Distance is not recorded for this exercise.");
  });
});

describe("decimal-place guard falls back to String(value) when no raw draft is supplied", () => {
  it("still catches an over-precise value passed only as a parsed number", () => {
    expect(validateSetInput("duration", { ...EMPTY, durationS: 12.345 })).toBe(
      "Time can have at most 2 decimal places.",
    );
  });

  it("passes a value that stringifies to <= 2 decimal places", () => {
    expect(validateSetInput("duration", { ...EMPTY, durationS: 12.34 })).toBeNull();
  });
});
