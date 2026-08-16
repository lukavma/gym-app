import { describe, expect, it } from "vitest";
import {
  defaultConfigFor,
  resolveProgression,
  supportsScheme,
} from "@/domain/progression/registry";
import type { SetScheme } from "@/domain/schemes/setScheme";

const fixedScheme: SetScheme = { type: "fixed", sets: 3, reps: 10 };
const repRangeScheme: SetScheme = { type: "repRange", sets: 3, minReps: 8, maxReps: 12 };

describe("supportsScheme", () => {
  it("supports fixed schemes for every strategy", () => {
    expect(supportsScheme("load-progression", "fixed")).toBe(true);
    expect(supportsScheme("rep-progression", "fixed")).toBe(true);
    expect(supportsScheme("manual", "fixed")).toBe(true);
  });

  it("supports repRange schemes for every strategy", () => {
    expect(supportsScheme("load-progression", "repRange")).toBe(true);
    expect(supportsScheme("rep-progression", "repRange")).toBe(true);
    expect(supportsScheme("manual", "repRange")).toBe(true);
  });
});

describe("defaultConfigFor", () => {
  it("seeds load-progression's incrementKg from the exercise's loadStepKg", () => {
    const config = defaultConfigFor("load-progression", fixedScheme, { loadStepKg: 2.5 });
    expect(config.incrementKg).toBe(2.5);
  });

  it("leaves repCap unset for rep-progression on a fixed scheme (no natural default)", () => {
    const config = defaultConfigFor("rep-progression", fixedScheme, { loadStepKg: 2.5 });
    expect(config.repCap).toBeUndefined();
    expect(config.repIncrement).toBe(1);
  });

  it("derives rep-progression's repCap from scheme.maxReps on a repRange scheme", () => {
    const config = defaultConfigFor("rep-progression", repRangeScheme, { loadStepKg: 2.5 });
    expect(config.repCap).toBe(12);
  });

  it("returns an empty manual config", () => {
    const config = defaultConfigFor("manual", fixedScheme, { loadStepKg: 2.5 });
    expect(config).toEqual({});
  });
});

describe("resolveProgression", () => {
  // H1 regression matrix — required cases from the Phase 2 review (H-1).

  it("default load progression (config {}) classifies as heuristic", () => {
    const resolved = resolveProgression("load-progression", {}, fixedScheme, { loadStepKg: 2.5 });
    expect(resolved.classification).toBe("heuristic");
    // The materialised default is what gets persisted, not the raw {}.
    expect(resolved.config.incrementKg).toBe(2.5);
  });

  it("customized load progression (incrementKg tuned) classifies as user_defined", () => {
    const resolved = resolveProgression("load-progression", { incrementKg: 5 }, fixedScheme, {
      loadStepKg: 2.5,
    });
    expect(resolved.classification).toBe("user_defined");
    expect(resolved.config.incrementKg).toBe(5);
  });

  it("default rep progression on a repRange scheme classifies as heuristic", () => {
    const resolved = resolveProgression("rep-progression", {}, repRangeScheme, {
      loadStepKg: 2.5,
    });
    expect(resolved.classification).toBe("heuristic");
    expect(resolved.config.repCap).toBe(12);
  });

  it("an explicit repCap matching the required/default scheme.maxReps does not itself imply user_defined", () => {
    const resolved = resolveProgression("rep-progression", { repCap: 12 }, repRangeScheme, {
      loadStepKg: 2.5,
    });
    expect(resolved.classification).toBe("heuristic");
  });

  it("a repCap that diverges from scheme.maxReps on a repRange scheme classifies as user_defined", () => {
    const resolved = resolveProgression("rep-progression", { repCap: 20 }, repRangeScheme, {
      loadStepKg: 2.5,
    });
    expect(resolved.classification).toBe("user_defined");
  });

  it("manual default (no config knobs) remains heuristic", () => {
    const resolved = resolveProgression("manual", {}, fixedScheme, { loadStepKg: 2.5 });
    expect(resolved.classification).toBe("heuristic");
  });

  it("classifies a tuned load-progression config as user_defined (non-incrementKg field)", () => {
    const resolved = resolveProgression("load-progression", { holdAtRirZero: false }, fixedScheme, {
      loadStepKg: 2.5,
    });
    expect(resolved.classification).toBe("user_defined");
  });

  it("rejects an invalid config shape", () => {
    expect(() =>
      resolveProgression("load-progression", { incrementKg: "fast" }, fixedScheme, {
        loadStepKg: 2.5,
      }),
    ).toThrow();
  });

  it("rejects unknown keys (strict schemas)", () => {
    expect(() =>
      resolveProgression("manual", { unknownKey: true }, fixedScheme, { loadStepKg: 2.5 }),
    ).toThrow();
  });
});
