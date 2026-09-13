import { describe, expect, it } from "vitest";
import {
  defaultConfigFor,
  resolveGroupProgression,
  resolvePrescriptionProgression,
} from "@/domain/progression/registry";
import type { GroupsScheme, SetGroup } from "@/domain/schemes/setScheme";

// set-groups-architecture-evaluation.md §5.3 L-3 — F-23 closed:
// `defaultConfigFor` is now exhaustive over scheme types, and per-group
// resolution defaults each group independently from its own PROJECTED
// scheme (a ranged group's `repCap` default comes from its own `reps.max`,
// never the slot's).

const top: SetGroup = {
  key: "top",
  label: "Top",
  sets: { min: 1, max: 1 },
  reps: { min: 2, max: 2 },
};
const backoff: SetGroup = {
  key: "q9m4",
  label: "Back-off",
  sets: { min: 2, max: 3 },
  reps: { min: 6, max: 8 },
};
const scheme: GroupsScheme = { type: "groups", groups: [top, backoff] };
const exercise = { loadStepKg: 2.5 };

describe("defaultConfigFor — exhaustive over scheme types", () => {
  it("a groups scheme has no single rep-progression repCap default (resolved per group instead)", () => {
    const config = defaultConfigFor("rep-progression", scheme, exercise);
    expect(config.repCap).toBeUndefined();
  });

  it("still defaults load-progression's incrementKg regardless of scheme type", () => {
    const config = defaultConfigFor("load-progression", scheme, exercise);
    expect(config.incrementKg).toBe(2.5);
  });
});

describe("resolveGroupProgression", () => {
  it("defaults a ranged group's repCap from its OWN reps.max, not the slot's", () => {
    const resolved = resolveGroupProgression("rep-progression", {}, undefined, backoff, exercise);
    expect(resolved.config.repCap).toBe(8);
  });

  it("a fixed-rep group (Top) gets no repCap default — the owner must set one explicitly", () => {
    const resolved = resolveGroupProgression("rep-progression", {}, undefined, top, exercise);
    expect(resolved.config.repCap).toBeUndefined();
  });

  it("a group override merges over the slot's raw config, not replacing it wholesale", () => {
    const resolved = resolveGroupProgression(
      "load-progression",
      { progressRirGate: { min: 2, max: 4 } },
      { incrementKg: 5 },
      backoff,
      exercise,
    );
    expect(resolved.config.incrementKg).toBe(5);
    expect(resolved.config.progressRirGate).toEqual({ min: 2, max: 4 });
  });

  it("classifies as user_defined once the group's config differs from its own default", () => {
    const resolved = resolveGroupProgression(
      "load-progression",
      {},
      { incrementKg: 10 },
      backoff,
      exercise,
    );
    expect(resolved.classification).toBe("user_defined");
  });

  it("classifies as heuristic when the group's effective config equals its own derived default", () => {
    const resolved = resolveGroupProgression("load-progression", {}, undefined, backoff, exercise);
    expect(resolved.classification).toBe("heuristic");
  });
});

describe("resolvePrescriptionProgression", () => {
  it("resolves one entry per group, keyed by group key", () => {
    const resolved = resolvePrescriptionProgression(
      { strategyId: "load-progression", config: {} },
      scheme,
      exercise,
    );
    expect(Object.keys(resolved.groups ?? {}).sort()).toEqual(["q9m4", "top"]);
    expect(resolved.groups!.top!.strategyId).toBe("load-progression");
    expect(resolved.groups!.q9m4!.config.incrementKg).toBe(2.5);
  });

  it("an explicit per-group override changes only that group's strategy", () => {
    const resolved = resolvePrescriptionProgression(
      {
        strategyId: "load-progression",
        config: {},
        groups: { q9m4: { strategyId: "manual" } },
      },
      scheme,
      exercise,
    );
    expect(resolved.groups!.top!.strategyId).toBe("load-progression");
    expect(resolved.groups!.q9m4!.strategyId).toBe("manual");
  });

  it("returns no .groups for a non-groups scheme", () => {
    const resolved = resolvePrescriptionProgression(
      { strategyId: "load-progression", config: {} },
      { type: "fixed", sets: 3, reps: 5 },
      exercise,
    );
    expect(resolved.groups).toBeUndefined();
  });
});
