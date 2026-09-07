import { describe, expect, it } from "vitest";
import { formatSetLine, type FormattableSet } from "@/domain/measurement/format";

// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §15.4
// (the eight example lines, verbatim) and O-8 (duration's additional `m:ss`
// display at or above 60 s) — the format.ts half of A-6a.

const EMPTY: FormattableSet = {
  weightKg: null,
  reps: null,
  rir: null,
  distanceM: null,
  durationS: null,
};

describe("formatSetLine — §15.4's eight example lines", () => {
  it("load_reps, total/unspecified basis, with RIR: '80 kg × 8 @ RIR 2'", () => {
    expect(formatSetLine("load_reps", "total", { ...EMPTY, weightKg: 80, reps: 8, rir: 2 })).toBe(
      "80 kg × 8 @ RIR 2",
    );
    expect(
      formatSetLine("load_reps", "unspecified", { ...EMPTY, weightKg: 80, reps: 8, rir: 2 }),
    ).toBe("80 kg × 8 @ RIR 2");
  });

  it("load_reps, without RIR: '80 kg × 8'", () => {
    expect(formatSetLine("load_reps", "total", { ...EMPTY, weightKg: 80, reps: 8 })).toBe(
      "80 kg × 8",
    );
  });

  it("load_reps, per_hand basis: '30 kg/hand × 8'", () => {
    expect(formatSetLine("load_reps", "per_hand", { ...EMPTY, weightKg: 30, reps: 8 })).toBe(
      "30 kg/hand × 8",
    );
  });

  it("load_reps, assistance basis: '35 kg assist × 8'", () => {
    expect(formatSetLine("load_reps", "assistance", { ...EMPTY, weightKg: 35, reps: 8 })).toBe(
      "35 kg assist × 8",
    );
  });

  it("reps: '12 reps'", () => {
    expect(formatSetLine("reps", null, { ...EMPTY, reps: 12 })).toBe("12 reps");
  });

  it("load_distance, with duration: '60 kg · 20 m · 12.4 s'", () => {
    expect(
      formatSetLine("load_distance", "total", {
        ...EMPTY,
        weightKg: 60,
        distanceM: 20,
        durationS: 12.4,
      }),
    ).toBe("60 kg · 20 m · 12.4 s");
  });

  it("load_distance, without duration (optional per §6.2): '60 kg · 20 m'", () => {
    expect(formatSetLine("load_distance", "total", { ...EMPTY, weightKg: 60, distanceM: 20 })).toBe(
      "60 kg · 20 m",
    );
  });

  it("distance_time: '40 m · 5.62 s'", () => {
    expect(formatSetLine("distance_time", null, { ...EMPTY, distanceM: 40, durationS: 5.62 })).toBe(
      "40 m · 5.62 s",
    );
  });

  it("duration: '45 s'", () => {
    expect(formatSetLine("duration", null, { ...EMPTY, durationS: 45 })).toBe("45 s");
  });

  it("load_duration: '20 kg · 45 s'", () => {
    expect(formatSetLine("load_duration", "total", { ...EMPTY, weightKg: 20, durationS: 45 })).toBe(
      "20 kg · 45 s",
    );
  });
});

describe("formatSetLine — O-8's m:ss display at or above 60 s", () => {
  it("a 90 s duration formats as '90 s · 1:30'", () => {
    expect(formatSetLine("duration", null, { ...EMPTY, durationS: 90 })).toBe("90 s · 1:30");
  });

  it("exactly 60 s formats as '60 s · 1:00' (boundary is inclusive)", () => {
    expect(formatSetLine("duration", null, { ...EMPTY, durationS: 60 })).toBe("60 s · 1:00");
  });

  it("just under 60 s shows seconds only", () => {
    expect(formatSetLine("duration", null, { ...EMPTY, durationS: 59.9 })).toBe("59.9 s");
  });

  it("applies to every profile carrying a durationS, e.g. load_duration", () => {
    expect(
      formatSetLine("load_duration", "total", { ...EMPTY, weightKg: 20, durationS: 125 }),
    ).toBe("20 kg · 125 s · 2:05");
  });
});
