import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC_ROOT } from "./importGraphWalker";
import {
  METRICS_PAGE_COPY,
  allCopyStrings,
  bandNote,
  estimateDisclaimer,
  freshness,
  footer,
  notAvailableCopy,
  turnedOffCopy,
} from "@/ui/metrics/copy";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §15 (copy rules), acceptance criterion A-20.

// Case-sensitive.
const CASE_SENSITIVE_FORBIDDEN = ["PR", "1RM"] as const;
// Scanned over copy strings AND the comment-stripped source of
// src/ui/metrics/** (case-insensitive).
const SOURCE_SCOPED_FORBIDDEN = [
  "personal record",
  "recommend",
  "research",
  "predict",
  "improv",
  "declin",
  "streak",
  "adherence",
  "compliance",
  "correlat",
  "sleep debt",
  "ready to train",
  "↑",
  "↓",
  "▲",
  "▼",
  "→",
  "›",
] as const;
// Scanned over copy strings ONLY — these collide with ordinary React
// vocabulary (event.target, badge components, etc.).
const COPY_SCOPED_FORBIDDEN = [
  "badge",
  "target",
  "score",
  "trend",
  "goal",
  "fatigue",
  "affect",
  "impact",
  "because",
  "caused",
  "recovered",
  "optimal",
] as const;

function offendingInCopy(text: string): string[] {
  const found: string[] = [];
  for (const needle of CASE_SENSITIVE_FORBIDDEN) {
    if (text.includes(needle)) found.push(needle);
  }
  for (const needle of [...SOURCE_SCOPED_FORBIDDEN, ...COPY_SCOPED_FORBIDDEN]) {
    if (text.toLowerCase().includes(needle.toLowerCase())) found.push(needle);
  }
  return found;
}

function offendingInSource(text: string): string[] {
  const found: string[] = [];
  for (const needle of CASE_SENSITIVE_FORBIDDEN) {
    if (text.includes(needle)) found.push(needle);
  }
  for (const needle of SOURCE_SCOPED_FORBIDDEN) {
    if (text.toLowerCase().includes(needle.toLowerCase())) found.push(needle);
  }
  return found;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [full] : [];
  });
}

// Strips comments and SCREAMING_SNAKE identifiers only — the strength
// template's own rule, so ordinary camelCase code (event.target,
// DeloadBadge) survives the source-scoped scan.
function readableSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, " ");
}

describe("copy rules (§15, A-20)", () => {
  it("bans the forbidden vocabulary from every user-facing string", () => {
    for (const value of allCopyStrings()) {
      expect(offendingInCopy(value), `in: ${value}`).toEqual([]);
    }
  });

  // NEGATIVE CONTROL.
  it("the checker actually detects the vocabulary it bans", () => {
    expect(offendingInCopy("we recommend 100 kg")).toContain("recommend");
    expect(offendingInCopy("your estimated 1RM")).toContain("1RM");
    expect(offendingInCopy("A PR today")).toContain("PR");
    expect(offendingInCopy("this correlates with training")).toContain("correlat");
    expect(offendingInCopy("Based on two sessions")).toEqual([]);
  });

  it("bans them from the readable text of every file under src/ui/metrics", () => {
    const files = listFiles(path.join(SRC_ROOT, "ui", "metrics"));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      expect(
        offendingInSource(readableSource(file)),
        `in ${path.relative(SRC_ROOT, file)}`,
      ).toEqual([]);
    }
  });

  it("the algorithm stamp's 1rm/e1rm spelling survives the source scan exactly as it does for the strength page", () => {
    expect(offendingInSource("e1rm-epley-rir")).toEqual([]);
  });

  it("carries the reused sentences by value (freshness, estimateDisclaimer, bandNote, footer)", () => {
    const strings = allCopyStrings();
    expect(strings).toContain(freshness);
    expect(strings).toContain(estimateDisclaimer);
    expect(strings).toContain(bandNote);
    expect(strings).toContain(footer);
    expect(strings).toContain(notAvailableCopy);
    expect(strings).toContain(turnedOffCopy);
  });

  it("must-appear: the current-week suffix, and every card's required caption", () => {
    expect(METRICS_PAGE_COPY.trainingSoFarSuffix).toBe("(so far)");
    expect(METRICS_PAGE_COPY.trainingCaption).toBe(
      "Completed workouts only. Warm-up sets not counted.",
    );
    expect(METRICS_PAGE_COPY.volumeCaptionContribution).toBe("Under current contribution weights.");
    expect(METRICS_PAGE_COPY.volumeCaptionInProgress).toBe("Includes the workout in progress.");
    expect(METRICS_PAGE_COPY.recoveryCaption).toBe(
      "Your own check-ins, as entered. Not used by the progression engine or any suggestion, and not compared with training here.",
    );
  });

  it("must-appear: the selection empty state and the editor's required sentences", () => {
    expect(METRICS_PAGE_COPY.selectionEmptyState).toBe(
      "No exercises selected. Choose up to five compatible exercises.",
    );
    expect(METRICS_PAGE_COPY.editorCaption).toBe(
      "Up to five compatible exercises, in the order you want them.",
    );
    expect(METRICS_PAGE_COPY.editorLimitMessage).toBe("Five exercises is the limit.");
    expect(METRICS_PAGE_COPY.editorOfflineSaveError).toBe("Couldn't save — you're offline.");
  });

  it("must-appear: the metrics-owned unit and deload lines on Current estimates", () => {
    expect(METRICS_PAGE_COPY.unitLine).toContain("per hand, per stack, as entered");
    expect(METRICS_PAGE_COPY.deloadLine).toBe("Deload sessions are not counted.");
  });

  it("never claims the estimate is the athlete's strength (reused disclaimer)", () => {
    expect(estimateDisclaimer.toLowerCase()).toContain("not a measured value");
    expect(footer).toBe("Estimates only — not tested maxes.");
  });

  it("two words are allowed only in their existing senses: Readiness (column header) and Deload (badge)", () => {
    expect(METRICS_PAGE_COPY.recoveryColumnReadiness).toBe("Readiness");
  });
});
