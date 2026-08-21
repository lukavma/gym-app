import { describe, expect, it } from "vitest";
import { resolveImplicitDecision } from "@/domain/progression/implicitDecision";

// progression-engine.md §7 — "logged load equal to the recommended target
// (after loadStepKg rounding) ⇒ accepted / implicit_first_set; a different
// load ⇒ modified with chosen = actual".

describe("resolveImplicitDecision", () => {
  it("first work set at the rounded target load → accepted with chosen = full target", () => {
    const result = resolveImplicitDecision(
      { action: "increase_load", target: { loadKg: 115 } },
      { weightKg: 115 },
      2.5,
    );
    expect(result).toEqual({
      status: "accepted",
      chosen: { loadKg: 115 },
      source: "implicit_first_set",
    });
  });

  it("accepting a rep recommendation carries the chosen reps too", () => {
    const result = resolveImplicitDecision(
      { action: "increase_reps", target: { loadKg: 100, reps: 11 } },
      { weightKg: 100 },
      2.5,
    );
    expect(result).toEqual({
      status: "accepted",
      chosen: { loadKg: 100, reps: 11 },
      source: "implicit_first_set",
    });
  });

  it("a different load → modified with chosen = the actual load only", () => {
    const result = resolveImplicitDecision(
      { action: "increase_load", target: { loadKg: 115 } },
      { weightKg: 112.5 },
      2.5,
    );
    expect(result).toEqual({
      status: "modified",
      chosen: { loadKg: 112.5 },
      source: "implicit_first_set",
    });
  });

  it("an off-step target is compared after loadStepKg rounding", () => {
    // Target 114.9 rounds to 115 on a 2.5 step — logging 115 accepts it.
    const result = resolveImplicitDecision(
      { action: "increase_load", target: { loadKg: 114.9 } },
      { weightKg: 115 },
      2.5,
    );
    expect(result?.status).toBe("accepted");
  });

  it("no load target (e.g. action none) → no implicit decision", () => {
    expect(
      resolveImplicitDecision({ action: "none", target: null }, { weightKg: 100 }, 2.5),
    ).toBeNull();
    expect(
      resolveImplicitDecision({ action: "none", target: {} }, { weightKg: 100 }, 2.5),
    ).toBeNull();
  });
});
