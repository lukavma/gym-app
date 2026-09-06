import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC_ROOT } from "./importGraphWalker";
import {
  STRENGTH_PAGE_COPY,
  STRENGTH_REASON_COPY,
  allCopyStrings,
  confidenceCopy,
  reasonCopy,
} from "@/ui/strength/copy";
import {
  estimateBand,
  formatBand,
  formatEstimate,
  formatGoverningSet,
  formatSessionAge,
  formatTranslatedLoad,
} from "@/ui/strength/format";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §8.5 (V-13), §15.2 (copy rules), §15.3. Acceptance criteria A-28 and I-10.

// A-28's list, plus the rest of §15.2's banned vocabulary. The list lives
// here rather than in `copy.ts` so the module under test contains none of the
// words it bans and can be scanned whole.
const FORBIDDEN = [
  "1RM",
  "PR",
  "personal record",
  "recommend",
  "research shows",
  "declin",
  "accurate",
  "precise",
  "scientifically",
  "predicted",
  "will lift",
  "you can lift",
] as const;

function offendingSubstrings(text: string): string[] {
  // "PR" and "1RM" are checked case-sensitively — they are acronyms, and a
  // case-insensitive "PR" would fire on any word containing "pr". Everything
  // else is prose and is checked case-insensitively.
  const caseSensitive = new Set<string>(["PR", "1RM"]);
  return FORBIDDEN.filter((needle) =>
    caseSensitive.has(needle)
      ? text.includes(needle)
      : text.toLowerCase().includes(needle.toLowerCase()),
  );
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [full] : [];
  });
}

// The rule is about what an athlete can READ. Comments explain the rule (and
// therefore quote the banned words), and reason-code identifiers are
// SCREAMING_SNAKE constants that happen to contain them —
// `PENDING_RECOMMENDATION_PRESENT` contains both "PR" and "RECOMMEND". Both
// are stripped before the source scan; the value-level scan below is the
// strict one and strips nothing.
function readableSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, " ");
}

describe("copy rules (§15.2, A-28)", () => {
  it("bans the forbidden vocabulary from every user-facing string", () => {
    for (const value of allCopyStrings()) {
      expect(offendingSubstrings(value), `in: ${value}`).toEqual([]);
    }
  });

  // NEGATIVE CONTROL: without this, a checker that silently matched nothing
  // would make the assertion above pass vacuously.
  it("the checker actually detects the vocabulary it bans", () => {
    expect(offendingSubstrings("A new personal record!")).toContain("personal record");
    expect(offendingSubstrings("your estimated 1RM")).toContain("1RM");
    expect(offendingSubstrings("we recommend 100 kg")).toContain("recommend");
    expect(offendingSubstrings("research shows this works")).toContain("research shows");
    expect(offendingSubstrings("your strength may have declined")).toContain("declin");
    expect(offendingSubstrings("a precise estimate")).toContain("precise");
    expect(offendingSubstrings("you can lift 140 kg")).toContain("you can lift");
    expect(offendingSubstrings("A PR today")).toContain("PR");
    expect(offendingSubstrings("Based on two sessions")).toEqual([]);
  });

  it("bans them from the readable text of every file under src/ui/strength", () => {
    const files = listFiles(path.join(SRC_ROOT, "ui", "strength"));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      expect(
        offendingSubstrings(readableSource(file)),
        `in ${path.relative(SRC_ROOT, file)}`,
      ).toEqual([]);
    }
  });

  it("never claims the estimate is the athlete's strength", () => {
    expect(STRENGTH_PAGE_COPY.estimateDisclaimer.toLowerCase()).toContain("not a measured value");
    expect(STRENGTH_PAGE_COPY.footer).toBe("Estimates only — not tested maxes.");
  });

  it("frames the 90-day window as freshness, never as detraining (V-11)", () => {
    expect(STRENGTH_PAGE_COPY.freshness).toBe("Based on the last 90 days of training.");
    expect(offendingSubstrings(STRENGTH_PAGE_COPY.freshness)).toEqual([]);
  });

  it("states the unit convention (review O-7)", () => {
    expect(STRENGTH_PAGE_COPY.unitConvention.toLowerCase()).toContain(
      "in the numbers you log for this exercise",
    );
  });

  it("phrases a missing RIR as a bound on the ESTIMATE, not on the athlete (§15.3)", () => {
    expect(STRENGTH_REASON_COPY.RIR_MISSING_LOWER_BOUND.toLowerCase()).toContain(
      "by this estimate",
    );
  });

  it("does not claim there were no sessions when deload rows are on screen (review F-3)", () => {
    // `NO_RECENT_EVIDENCE` fires when no NON-DELOAD observation is in the
    // window, so the sentence renders directly above a trend that shows the
    // deload sessions. It has to say "counted", not "no sessions".
    const phrase = STRENGTH_REASON_COPY.NO_RECENT_EVIDENCE.toLowerCase();
    expect(phrase).toContain("counted");
    expect(phrase).toContain("90 days");
    // NEGATIVE CONTROL: the unqualified wording contradicted the trend list.
    expect(STRENGTH_REASON_COPY.NO_RECENT_EVIDENCE).not.toBe("No sessions in the last 90 days");
  });

  it("presents the band as a convention, not as a measured statistic (review F-4)", () => {
    // K-03 tags the noise magnitude [E*] and the value 10 [P]; §2 forbids
    // anything [E*] from reaching copy as evidence, and row 20 forbids
    // presenting the band as calibrated to anything.
    expect(STRENGTH_PAGE_COPY.bandNote.toLowerCase()).toContain("convention");
    expect(STRENGTH_PAGE_COPY.bandNote.toLowerCase()).not.toContain("standard deviation");
    expect(STRENGTH_PAGE_COPY.bandNote.toLowerCase()).not.toContain("measured error either");
  });

  it("keeps the one evidence-backed sentence about deloads (B6 / EVIDENCE-025)", () => {
    expect(STRENGTH_PAGE_COPY.deloadNote.toLowerCase()).toContain("expected");
  });

  it("falls back to the raw code rather than rendering nothing", () => {
    expect(reasonCopy("NOT_A_REAL_CODE")).toBe("NOT_A_REAL_CODE");
    expect(confidenceCopy("medium")).toBe("medium confidence");
    expect(confidenceCopy("bogus")).toBe("bogus");
  });
});

describe("formatEstimate — the grid, the band and the label (V-13, §15.2, I-10)", () => {
  it("reproduces the document's rendering of 139.33 on a 2.5 kg step", () => {
    expect(formatEstimate(139.33, 2.5)).toBe("≈ 140 kg (likely 125–155) est.");
  });

  it("reproduces the headline fixture's display line", () => {
    expect(formatEstimate(133.0, 2.5)).toBe("≈ 132.5 kg (likely 117.5–147.5) est.");
  });

  it("always carries the approximation mark, a band and the estimate label", () => {
    for (const [value, step] of [
      [139.33, 2.5],
      [50.67, 5],
      [13.57, 0.5],
      [1356.67, 2.5],
      [104.5, 2],
    ] as const) {
      const rendered = formatEstimate(value, step);
      expect(rendered).toContain("≈");
      expect(rendered).toContain("est.");
      expect(rendered).toMatch(/\(likely [\d.]+–[\d.]+\)/);
    }
  });

  // NEGATIVE CONTROL for §8.5: a bare kilogram figure is the precision claim
  // the evidence does not license, so no rendering may be band-less.
  it("never renders a bare value", () => {
    expect(formatEstimate(139.33, 2.5)).not.toBe("140 kg");
    expect(formatEstimate(139.33, 2.5)).not.toBe("≈ 140 kg");
    expect(formatBand(estimateBand(139.33, 2.5))).toBe("(likely 125–155)");
  });

  it("rounds the displayed value to the exercise's own grid, not a fixed one", () => {
    // O-18: the grid is the exercise's `loadStepKg`. On a 5 kg machine step
    // the same estimate reads differently from a 2.5 kg barbell step — that
    // is the decision, not a bug.
    expect(formatEstimate(133.0, 5)).toBe("≈ 135 kg (likely 115–150) est.");
    expect(formatEstimate(133.0, 1)).toBe("≈ 133 kg (likely 119–147) est.");
  });

  it("formats a floored translated load with its raw-value band", () => {
    expect(formatTranslatedLoad(20, [20, 30])).toBe("≈ 20 kg (likely 20–30) est.");
  });

  it("states the data's age, never the athlete's condition (§15.3)", () => {
    expect(formatSessionAge(0)).toBe("today");
    expect(formatSessionAge(1)).toBe("yesterday");
    expect(formatSessionAge(6)).toBe("6 days ago");
    expect(formatSessionAge(13)).toBe("13 days ago");
    expect(formatSessionAge(14)).toBe("2 weeks ago");
    expect(formatSessionAge(42)).toBe("6 weeks ago");
    expect(formatSessionAge(89)).toBe("13 weeks ago");
    for (const days of [0, 1, 6, 14, 42, 89]) {
      expect(offendingSubstrings(formatSessionAge(days))).toEqual([]);
    }
  });

  it("formats the governing set the way the rest of the app formats a set", () => {
    expect(formatGoverningSet(110, 5, 2)).toBe("110 kg × 5 @ RIR 2");
    expect(formatGoverningSet(110, 5, null)).toBe("110 kg × 5");
    expect(formatGoverningSet(82.5, 6, 0)).toBe("82.5 kg × 6 @ RIR 0");
  });
});
