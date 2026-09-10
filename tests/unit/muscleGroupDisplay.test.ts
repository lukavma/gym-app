import { describe, expect, it } from "vitest";
import { contributionMuscleLabel } from "@/ui/exercises/muscleGroupDisplay";

// D-CE1-1(iii) forward hardening (catalog-expansion-1 §12.8) — NC-E: the
// "Unclassified " prefix is reserved for a known rollup slug (`back`) and
// must never attach to a merely-unrecognised one, which would turn every
// future vocabulary gap into a pseudo-rollup.
describe("contributionMuscleLabel", () => {
  it("returns the plain display name for a known leaf", () => {
    expect(contributionMuscleLabel("chest")).toBe("Chest");
    expect(contributionMuscleLabel("lower_back")).toBe("Lower Back (Erectors)");
  });

  it("returns the new tibialis leaf's display name (ADR-010 Amendment 1)", () => {
    expect(contributionMuscleLabel("tibialis")).toBe("Tibialis (Shin)");
  });

  it("prefixes 'Unclassified ' for the back rollup (NC-E)", () => {
    expect(contributionMuscleLabel("back")).toBe("Unclassified Back");
  });

  it("falls back to the raw slug, with no 'Unclassified ' prefix, for an unrecognised slug (NC-A, NC-E)", () => {
    // `MuscleGroupSlug` is a closed union at compile time; the runtime value
    // this function actually receives arrives through a cast
    // (src/server/exercises/service.ts), which is exactly the case this
    // fallback exists for — so the unit test reproduces that cast.
    const unknownSlug = "obliques" as Parameters<typeof contributionMuscleLabel>[0];
    expect(contributionMuscleLabel(unknownSlug)).toBe("obliques");
  });
});
