import { describe, expect, it } from "vitest";
import {
  RELEASE_B_ONLY_REASON_CODES,
  STRENGTH_REASON_CODES,
  isStrengthReasonCode,
} from "@/domain/strength/reasonCodes";
import type { StrengthReasonCode } from "@/domain/strength/reasonCodes";
import { deriveStrengthReport } from "@/domain/strength/report";
import { STRENGTH_REASON_COPY } from "@/ui/strength/copy";
import type { StrengthReportInput, StrengthSessionInput } from "@/domain/strength/types";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §15.4 (the enum, declared "exactly"), I-14 and A-19.
//
// A-19 has two halves. The COMPLETENESS half — enum, copy map and the §15.4
// table have identical membership — is fully checkable in Release A and is
// asserted below. The REACHABILITY half is tagged (A+B) in the document
// because eighteen of the codes belong to `suggestStartingLoad`, which
// Release A does not ship. Rather than weaken the criterion to "the codes we
// happen to emit", this suite asserts the unreachable set is EXACTLY the
// declared Release-B list — so a Release-A code that silently loses its
// emitter still fails, and so does a Release-B code that is quietly emitted
// early.

const AS_OF = "2026-09-06";

function daysBefore(days: number): string {
  return new Date(Date.parse(`${AS_OF}T00:00:00.000Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface SetSpec {
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup?: boolean;
}

function session(
  sessionId: string,
  performedOn: string,
  sets: SetSpec[],
  isDeload = false,
): StrengthSessionInput {
  return {
    sessionId,
    performedOn,
    startedAt: `${performedOn}T08:00:00.000Z`,
    isDeload,
    sets: sets.map((s, index) => ({
      setNumber: index + 1,
      isWarmup: s.isWarmup ?? false,
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
    })),
  };
}

function straight(
  sessionId: string,
  performedOn: string,
  weightKg: number,
  reps: number,
  rir: number | null,
  count = 3,
  isDeload = false,
): StrengthSessionInput {
  return session(
    sessionId,
    performedOn,
    Array.from({ length: count }, () => ({ weightKg, reps, rir })),
    isDeload,
  );
}

const BARBELL = { equipment: "barbell", strengthEstimate: "auto" as const, loadStepKg: 2.5 };

// Each entry names the codes it exists to reach, so a future reader can see
// why the fixture is shaped the way it is.
const FIXTURES: { name: string; input: StrengthReportInput }[] = [
  {
    name: "no history at all -> NO_ELIGIBLE_SETS",
    input: { exercise: BARBELL, sessions: [], asOfLocalDate: AS_OF },
  },
  {
    name: "history entirely outside the window -> NO_RECENT_EVIDENCE, BEST_UNCONFIRMED",
    input: {
      exercise: BARBELL,
      sessions: [straight("old", daysBefore(200), 100, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "one clean session -> SINGLE_SESSION_EVIDENCE",
    input: {
      exercise: BARBELL,
      sessions: [straight("one", daysBefore(3), 100, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    // 100 kg x 5 @ RIR 2 -> 123.33; 140 kg x 5 @ RIR 2 -> 172.67. The lower
    // median is 123.33, so the spread is 49.34 / 123.33 = 40.01 % — past the
    // 30 % level. (130 kg would land on exactly 30.00 %, which the strict ">"
    // boundary correctly reports as merely WIDE.)
    name: "two far-apart sessions -> TWO_SESSION_EVIDENCE, ESTIMATE_SPREAD_VERY_WIDE",
    input: {
      exercise: BARBELL,
      sessions: [straight("a", daysBefore(6), 100, 5, 2), straight("b", daysBefore(3), 140, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "three sessions with a 21 % spread -> ESTIMATE_SPREAD_WIDE",
    input: {
      exercise: BARBELL,
      sessions: [
        straight("w1", daysBefore(9), 100, 5, 2),
        straight("w2", daysBefore(6), 110, 5, 2),
        straight("w3", daysBefore(3), 123, 5, 2),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "latest session 30 days old -> EVIDENCE_AGING",
    input: {
      exercise: BARBELL,
      sessions: [straight("aging", daysBefore(30), 100, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "latest session 60 days old -> EVIDENCE_OLD",
    input: {
      exercise: BARBELL,
      sessions: [straight("old2", daysBefore(60), 100, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "a deload week -> DELOAD_SESSION, DELOAD_SESSIONS_EXCLUDED",
    input: {
      exercise: BARBELL,
      sessions: [
        straight("work", daysBefore(10), 100, 5, 2),
        straight("deload", daysBefore(3), 80, 5, 3, 3, true),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "a 0 kg set and a RIR 5 set -> ZERO_LOAD_SETS_EXCLUDED, HIGH_RIR_SETS_EXCLUDED",
    input: {
      exercise: BARBELL,
      sessions: [
        session("mixedExclusions", daysBefore(4), [
          { weightKg: 0, reps: 10, rir: 1 },
          { weightKg: 60, reps: 6, rir: 5 },
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
          { weightKg: 100, reps: 5, rir: 2 },
        ]),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "the document's session B -> HIGH_REP_SETS_EXCLUDED, EXTENDED_REP_RANGE, SINGLE_SET_GROUP",
    input: {
      exercise: BARBELL,
      sessions: [
        session("B", daysBefore(5), [
          { weightKg: 95, reps: 12, rir: 2 },
          { weightKg: 95, reps: 12, rir: 1 },
          { weightKg: 95, reps: 12, rir: 0 },
        ]),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "a light typo -> SUB_MODAL_SETS_EXCLUDED",
    input: {
      exercise: BARBELL,
      sessions: [
        session("subModal", daysBefore(5), [
          { weightKg: 110, reps: 5, rir: 2 },
          { weightKg: 110, reps: 5, rir: 2 },
          { weightKg: 110, reps: 5, rir: 2 },
          { weightKg: 11, reps: 5, rir: 2 },
        ]),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "an order-of-magnitude typo -> IMPLAUSIBLE_SETS_EXCLUDED",
    input: {
      exercise: BARBELL,
      sessions: [
        session("implausible", daysBefore(5), [
          { weightKg: 110, reps: 5, rir: 2 },
          { weightKg: 110, reps: 5, rir: 2 },
          { weightKg: 110, reps: 5, rir: 2 },
          { weightKg: 1100, reps: 5, rir: 2 },
        ]),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "a top set after back-offs -> MIXED_LOADS_IN_SESSION, TOP_SET_GOVERNS",
    input: {
      exercise: BARBELL,
      sessions: [
        session("topSet", daysBefore(5), [
          { weightKg: 140, reps: 3, rir: 1 },
          { weightKg: 110, reps: 8, rir: 1 },
          { weightKg: 110, reps: 8, rir: 1 },
          { weightKg: 110, reps: 8, rir: 0 },
        ]),
      ],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "no RIR logged -> RIR_MISSING_LOWER_BOUND",
    input: {
      exercise: BARBELL,
      sessions: [straight("noRir", daysBefore(5), 100, 5, null)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "RIR 3 -> RIR_MODERATE_RANGE",
    input: {
      exercise: BARBELL,
      sessions: [straight("moderate", daysBefore(5), 100, 5, 3)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "an ineligible category -> EXERCISE_CATEGORY_UNSUPPORTED",
    input: {
      exercise: { equipment: "bodyweight", strengthEstimate: "auto", loadStepKg: 2.5 },
      sessions: [straight("bw", daysBefore(5), 100, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "the switch turned off -> EXERCISE_ESTIMATE_DISABLED",
    input: {
      exercise: { equipment: "barbell", strengthEstimate: "off", loadStepKg: 2.5 },
      sessions: [straight("off", daysBefore(5), 100, 5, 2)],
      asOfLocalDate: AS_OF,
    },
  },
  {
    name: "what-if below RTF 3 -> TARGET_NEAR_MAXIMAL_NOT_SUGGESTED",
    input: {
      exercise: BARBELL,
      sessions: [straight("wi1", daysBefore(5), 100, 5, 2)],
      asOfLocalDate: AS_OF,
      whatIf: { reps: 2, rir: 0 },
    },
  },
  {
    name: "what-if above RTF 15 -> TARGET_OUTSIDE_FORMULA_DOMAIN",
    input: {
      exercise: BARBELL,
      sessions: [straight("wi2", daysBefore(5), 100, 5, 2)],
      asOfLocalDate: AS_OF,
      whatIf: { reps: 14, rir: 3 },
    },
  },
  {
    name: "what-if at RTF 14 on a coarse grid -> EXTENDED_TARGET_EFFORT, ROUNDED_DOWN_TO_LOAD_STEP",
    input: {
      exercise: BARBELL,
      sessions: [straight("wi3", daysBefore(5), 100, 5, 2)],
      asOfLocalDate: AS_OF,
      whatIf: { reps: 12, rir: 2 },
    },
  },
  {
    // Review F-2's owner decision: §9.5's step-4 global cap applies to the
    // calculator. The single session gives current 139.33 with a heaviest
    // admitted load of 110, so the cap is 121.00 and a 1-rep target at RIR 2
    // (RTF 3, translating to 126.66) exceeds it.
    name: "what-if above 1.10 x the heaviest admitted load -> CAPPED_AT_RECENT_MAX_LOAD",
    input: {
      exercise: BARBELL,
      sessions: [
        session(
          "capped",
          daysBefore(5),
          [3, 3, 2, 2, 1].map((rir) => ({ weightKg: 110, reps: 5, rir })),
        ),
      ],
      asOfLocalDate: AS_OF,
      whatIf: { reps: 1, rir: 2 },
    },
  },
  {
    name: "what-if floored to nothing -> BELOW_MINIMUM_LOAD",
    input: {
      exercise: { equipment: "machine", strengthEstimate: "auto", loadStepKg: 5 },
      sessions: [straight("wi4", daysBefore(5), 3, 5, 2)],
      asOfLocalDate: AS_OF,
      whatIf: { reps: 15, rir: 0 },
    },
  },
];

function emittedCodes(): Set<string> {
  const emitted = new Set<string>();
  for (const fixture of FIXTURES) {
    const report = deriveStrengthReport(fixture.input);
    for (const code of report.estimate.reasonCodes) emitted.add(code);
    for (const observation of report.observations) {
      for (const code of observation.reasonCodes) emitted.add(code);
      for (const code of observation.flags) emitted.add(code);
      for (const group of observation.groups) for (const code of group.flags) emitted.add(code);
    }
    for (const code of report.whatIf?.reasonCodes ?? []) emitted.add(code);
  }
  return emitted;
}

describe("the reason-code enum is exactly §15.4's (I-14, A-19)", () => {
  it("declares forty-eight distinct codes", () => {
    expect(STRENGTH_REASON_CODES).toHaveLength(48);
    expect(new Set(STRENGTH_REASON_CODES).size).toBe(48);
  });

  it("does not re-introduce the five evaluation-era codes §15.4 removed", () => {
    for (const removed of [
      "SESSION_SETS_INCONSISTENT",
      "REP_DISTANCE_FAR",
      "NEARBY_POOLED_DISAGREE",
      "PENDING_RECOMMENDATION_COMPATIBLE",
      "SOURCE_CURRENT_ESTIMATE_TRANSLATED",
    ]) {
      expect(isStrengthReasonCode(removed)).toBe(false);
    }
  });

  it("has identical membership with the UI copy map, in both directions", () => {
    const enumCodes = [...STRENGTH_REASON_CODES].sort();
    const copyCodes = Object.keys(STRENGTH_REASON_COPY).sort();
    expect(copyCodes).toEqual(enumCodes);
  });

  it("gives every code a non-empty phrasing distinct from its identifier", () => {
    for (const code of STRENGTH_REASON_CODES) {
      const phrase = STRENGTH_REASON_COPY[code];
      expect(phrase.trim().length).toBeGreaterThan(0);
      expect(phrase).not.toBe(code);
    }
  });
});

describe("reachability over real fixtures (A-19, Release A half)", () => {
  it("emits nothing outside the enum", () => {
    for (const code of emittedCodes()) {
      expect(isStrengthReasonCode(code), `unknown code emitted: ${code}`).toBe(true);
    }
  });

  it("emits every Release-A code at least once", () => {
    const emitted = emittedCodes();
    const releaseBOnly = new Set<string>(RELEASE_B_ONLY_REASON_CODES);
    const expected = STRENGTH_REASON_CODES.filter((code) => !releaseBOnly.has(code));
    const missing = expected.filter((code) => !emitted.has(code));
    expect(missing, `Release-A codes with no fixture: ${missing.join(", ")}`).toEqual([]);
  });

  it("emits no Release-B-only code — the suggestion does not exist yet", () => {
    const emitted = emittedCodes();
    const leaked = RELEASE_B_ONLY_REASON_CODES.filter((code) => emitted.has(code));
    expect(leaked, `Release-B codes emitted by Release A: ${leaked.join(", ")}`).toEqual([]);
  });

  it("accounts for all forty-eight codes as reached-or-deferred", () => {
    const emitted = emittedCodes();
    const releaseBOnly = new Set<string>(RELEASE_B_ONLY_REASON_CODES);
    const reached = STRENGTH_REASON_CODES.filter((code) => emitted.has(code));
    expect(reached.length + releaseBOnly.size).toBe(STRENGTH_REASON_CODES.length);
    expect(releaseBOnly.size).toBe(18);
  });

  it("keeps every deferred code inside the enum", () => {
    for (const code of RELEASE_B_ONLY_REASON_CODES) {
      expect(STRENGTH_REASON_CODES).toContain(code as StrengthReasonCode);
    }
  });

  // NEGATIVE CONTROL for the reachability check itself: if `emittedCodes()`
  // silently returned nothing — a broken harness, not a broken feature — the
  // "every Release-A code" assertion above would be the only thing to catch
  // it, and only by failing. This proves the collector genuinely collects.
  it("the collector is not vacuous", () => {
    const emitted = emittedCodes();
    expect(emitted.size).toBeGreaterThanOrEqual(30);
    expect(emitted.has("TOP_SET_GOVERNS")).toBe(true);
    expect(emitted.has("IMPLAUSIBLE_SETS_EXCLUDED")).toBe(true);
  });
});
