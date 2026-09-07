import { describe, expect, it } from "vitest";
import { bodyweightSummaryLine, formatSignedKg } from "@/ui/metrics/format";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §4 M-8, §12.2 (the wireframe's "−0.6 kg"); L-2 remediation.

describe("formatSignedKg (L-2)", () => {
  it("prefixes a gain with +", () => {
    expect(formatSignedKg(0.6)).toBe("+0.6 kg");
  });

  it("leaves a loss's own leading - alone, without a double sign", () => {
    expect(formatSignedKg(-0.6)).toBe("-0.6 kg");
  });

  it("shows a zero change bare, neither a gain nor a loss", () => {
    expect(formatSignedKg(0)).toBe("0 kg");
  });
});

describe("bodyweightSummaryLine (L-2)", () => {
  it("carries the kg unit on every value, including the highest (§13 text alternative)", () => {
    const series = [
      { date: "2026-08-08", weightKg: 82 },
      { date: "2026-09-06", weightKg: 85 },
    ];
    expect(bodyweightSummaryLine(series)).toBe(
      "90 days · 2 entries · first 82 kg · latest 85 kg · lowest 82 kg · highest 85 kg",
    );
  });

  it("reports the no-entries fallback when the series is empty", () => {
    expect(bodyweightSummaryLine([])).toBe("90 days · no entries");
  });
});
