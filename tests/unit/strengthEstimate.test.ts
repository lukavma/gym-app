import { describe, expect, it } from "vitest";
import { deriveEstimate, disabledEstimate } from "@/domain/strength/estimate";
import { buildObservation } from "@/domain/strength/observation";
import type { StrengthObservation, StrengthSessionInput } from "@/domain/strength/types";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §8 (V-10..V-13), §8.4, §11, §15.4. Acceptance criteria A-5, A-6, A-7, A-8,
// A-30, and invariant I-6.

const AS_OF = "2026-09-06";

function daysBefore(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00.000Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// A minimal but structurally valid observation, so the pool arithmetic can be
// tested against the document's bare e1RM lists without routing every number
// through the grouping pipeline first.
function obs(
  e1rmKg: number,
  performedOn: string,
  options: {
    sessionId?: string;
    isDeload?: boolean;
    startedAt?: string;
    flags?: StrengthObservation["flags"];
  } = {},
): StrengthObservation {
  const flags = options.flags ?? [];
  return {
    sessionId: options.sessionId ?? `${performedOn}-${e1rmKg}`,
    performedOn,
    startedAt: options.startedAt ?? `${performedOn}T08:00:00.000Z`,
    isDeload: options.isDeload ?? false,
    groups: [],
    governingGroupLoadKg: 100,
    governingGroupReps: 5,
    governingGroupMedianRir: 2,
    e1rmKg,
    flags,
    excludedSetCounts: {
      warmup: 0,
      zeroLoad: 0,
      highRir: 0,
      highRep: 0,
      subModal: 0,
      implausible: 0,
    },
    reasonCodes: flags,
  };
}

function straightSets(
  sessionId: string,
  performedOn: string,
  loadKg: number,
  reps: number,
  rir: number | null,
  setCount = 3,
): StrengthSessionInput {
  return {
    sessionId,
    performedOn,
    startedAt: `${performedOn}T08:00:00.000Z`,
    isDeload: false,
    sets: Array.from({ length: setCount }, (_, index) => ({
      setNumber: index + 1,
      isWarmup: false,
      weightKg: loadKg,
      reps,
      rir,
    })),
  };
}

function observationOf(session: StrengthSessionInput): StrengthObservation {
  const result = buildObservation(session);
  if (!result.observation) throw new Error("expected an observation");
  return result.observation;
}

describe("current — the pool's lower median (V-12, A-8)", () => {
  it("takes the most recent three in-window observations", () => {
    const observations = [
      obs(136, daysBefore(AS_OF, 20)),
      obs(133, daysBefore(AS_OF, 15)),
      obs(139, daysBefore(AS_OF, 10)),
      obs(128, daysBefore(AS_OF, 5)),
    ];
    const { estimate } = deriveEstimate({ observations, asOfLocalDate: AS_OF });
    expect(estimate.currentE1rmKg).toBe(133);
    expect(estimate.poolSessionIds).toHaveLength(3);
    // NEGATIVE CONTROL for "most recent three": pooling all four would give
    // the lower median of [128, 133, 136, 139] = 133 as well, but pooling the
    // OLDEST three would give 136. The pool ids pin down which three ran.
    expect(estimate.poolSessionIds).not.toContain(observations[0]?.sessionId);
  });

  it("takes the LOWER median of a pair", () => {
    const { estimate } = deriveEstimate({
      observations: [obs(136, daysBefore(AS_OF, 10)), obs(180, daysBefore(AS_OF, 5))],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.currentE1rmKg).toBe(136);
    expect(estimate.reasonCodes).toContain("TWO_SESSION_EVIDENCE");
    expect(estimate.reasonCodes).toContain("ESTIMATE_SPREAD_VERY_WIDE");
    expect(estimate.best).toMatchObject({ e1rmKg: 180, unconfirmed: true });
  });

  it("is robust to ONE HIGH outlier at n = 3 but not to a low one", () => {
    const high = deriveEstimate({
      observations: [
        obs(136, daysBefore(AS_OF, 15)),
        obs(133, daysBefore(AS_OF, 10)),
        obs(180, daysBefore(AS_OF, 5)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(high.estimate.currentE1rmKg).toBe(136);
    expect(high.estimate.best).toMatchObject({ e1rmKg: 180, unconfirmed: true });

    // The stated asymmetry (§7.7): the low typo moves the estimate one rank.
    const low = deriveEstimate({
      observations: [
        obs(130, daysBefore(AS_OF, 15)),
        obs(132, daysBefore(AS_OF, 10)),
        obs(13, daysBefore(AS_OF, 5)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(low.estimate.currentE1rmKg).toBe(130);
  });

  it("is null with no observations at all", () => {
    const { estimate } = deriveEstimate({ observations: [], asOfLocalDate: AS_OF });
    expect(estimate.currentE1rmKg).toBeNull();
    expect(estimate.best).toBeNull();
    expect(estimate.reasonCodes).toEqual(["NO_ELIGIBLE_SETS"]);
    expect(estimate.confidence).toBe("low");
  });

  it("says NO_RECENT_EVIDENCE when everything is older than the window", () => {
    const { estimate } = deriveEstimate({
      observations: [obs(140, daysBefore(AS_OF, 200))],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.currentE1rmKg).toBeNull();
    expect(estimate.reasonCodes).toContain("NO_RECENT_EVIDENCE");
    expect(estimate.reasonCodes).not.toContain("NO_ELIGIBLE_SETS");
    // `best` is all-time and is NOT bounded by the window.
    expect(estimate.best?.e1rmKg).toBe(140);
    expect(estimate.staleObservationCount).toBe(1);
  });
});

describe("the evidence window is calendar days in the account timezone (V-10, A-7)", () => {
  it("includes asOf − 89 and excludes asOf − 90", () => {
    const inside = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 89))],
      asOfLocalDate: AS_OF,
    });
    expect(inside.estimate.currentE1rmKg).toBe(120);
    expect(inside.estimate.staleObservationCount).toBe(0);

    const outside = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 90))],
      asOfLocalDate: AS_OF,
    });
    expect(outside.estimate.currentE1rmKg).toBeNull();
    expect(outside.estimate.staleObservationCount).toBe(1);
  });

  it("does not depend on the instant inside the day", () => {
    const early = deriveEstimate({
      observations: [
        obs(120, daysBefore(AS_OF, 89), { startedAt: `${daysBefore(AS_OF, 89)}T00:01:00.000Z` }),
      ],
      asOfLocalDate: AS_OF,
    });
    const late = deriveEstimate({
      observations: [
        obs(120, daysBefore(AS_OF, 89), { startedAt: `${daysBefore(AS_OF, 89)}T23:59:00.000Z` }),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(early.estimate.currentE1rmKg).toBe(late.estimate.currentE1rmKg);
  });
});

describe("asOf bounds everything (I-6, A-6, review RM-2)", () => {
  it("ignores an observation dated after asOf, and never calls it stale", () => {
    const withFuture = deriveEstimate({
      observations: [
        obs(120, daysBefore(AS_OF, 5)),
        obs(400, daysBefore(AS_OF, -3), { sessionId: "future" }),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(withFuture.estimate.currentE1rmKg).toBe(120);
    expect(withFuture.estimate.best?.e1rmKg).toBe(120);
    expect(withFuture.estimate.staleObservationCount).toBe(0);
    expect(withFuture.estimate.poolSessionIds).not.toContain("future");
    expect(withFuture.windowObservations.map((o) => o.sessionId)).not.toContain("future");
  });

  it("keeps current <= best whenever both exist (I-6)", () => {
    const { estimate } = deriveEstimate({
      observations: [
        obs(150, daysBefore(AS_OF, 40)),
        obs(120, daysBefore(AS_OF, 10)),
        obs(118, daysBefore(AS_OF, 5)),
        obs(122, daysBefore(AS_OF, 2)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.currentE1rmKg).toBe(120);
    expect(estimate.best?.e1rmKg).toBe(150);
    expect(estimate.currentE1rmKg!).toBeLessThanOrEqual(estimate.best!.e1rmKg);
  });
});

describe("best and the unconfirmed label (§8.3)", () => {
  it("is unconfirmed when nothing else reaches 90 % of it", () => {
    const { estimate } = deriveEstimate({
      observations: [obs(100, daysBefore(AS_OF, 20)), obs(180, daysBefore(AS_OF, 10))],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.best).toMatchObject({ e1rmKg: 180, unconfirmed: true });
    expect(estimate.reasonCodes).toContain("BEST_UNCONFIRMED");
  });

  it("is confirmed when a second session reaches 90 % of it", () => {
    const { estimate } = deriveEstimate({
      observations: [obs(133, daysBefore(AS_OF, 20)), obs(139.33, daysBefore(AS_OF, 10))],
      asOfLocalDate: AS_OF,
    });
    // 133.00 >= 139.33 x 0.9 = 125.40.
    expect(estimate.best).toMatchObject({ e1rmKg: 139.33, unconfirmed: false });
    expect(estimate.reasonCodes).not.toContain("BEST_UNCONFIRMED");
  });

  it("compares the unconfirmed threshold UNROUNDED (review F-1)", () => {
    // The reviewer's own E2 fixture. best 139.36 -> threshold 139.36 × 0.9 =
    // 125.424. The only other observation is 125.42, which is BELOW it, so
    // `best` is unconfirmed. `round2(125.424)` is 125.42 — exactly the other
    // value — and would report it as confirmed.
    const { estimate } = deriveEstimate({
      observations: [
        obs(125.42, daysBefore(AS_OF, 10), { sessionId: "second" }),
        obs(139.36, daysBefore(AS_OF, 5), { sessionId: "peak" }),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.best).toMatchObject({ e1rmKg: 139.36, unconfirmed: true });
    expect(estimate.reasonCodes).toContain("BEST_UNCONFIRMED");
    // NEGATIVE CONTROL: rounding the threshold flips this to confirmed and
    // drops the code entirely.
    expect(estimate.best?.unconfirmed).not.toBe(false);
  });

  it("still confirms when the other observation clears the exact threshold", () => {
    // The mirror of the fixture above, one cent higher: 125.43 >= 125.424.
    const { estimate } = deriveEstimate({
      observations: [obs(125.43, daysBefore(AS_OF, 10)), obs(139.36, daysBefore(AS_OF, 5))],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.best).toMatchObject({ e1rmKg: 139.36, unconfirmed: false });
    expect(estimate.reasonCodes).not.toContain("BEST_UNCONFIRMED");
  });

  it("breaks a tie to the earliest observation", () => {
    const { estimate } = deriveEstimate({
      observations: [
        obs(140, daysBefore(AS_OF, 20), { sessionId: "older" }),
        obs(140, daysBefore(AS_OF, 5), { sessionId: "newer" }),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.best?.sessionId).toBe("older");
  });
});

describe("deload sessions are shown, not counted (§6.3, I-6)", () => {
  it("keeps a deload observation out of the pool, current and best", () => {
    const { estimate, windowObservations } = deriveEstimate({
      observations: [
        obs(120, daysBefore(AS_OF, 10)),
        obs(90, daysBefore(AS_OF, 5), { sessionId: "deload", isDeload: true }),
        obs(200, daysBefore(AS_OF, 4), { sessionId: "deload-high", isDeload: true }),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.currentE1rmKg).toBe(120);
    expect(estimate.best?.e1rmKg).toBe(120);
    expect(estimate.poolSessionIds).toEqual([expect.any(String)]);
    expect(estimate.poolSessionIds).not.toContain("deload");
    expect(estimate.deloadObservationCount).toBe(2);
    expect(estimate.reasonCodes).toContain("DELOAD_SESSIONS_EXCLUDED");
    // NEGATIVE CONTROL: the high deload session must not become `best`.
    expect(estimate.best?.e1rmKg).not.toBe(200);
    // ...but it IS still on the trend, badged.
    expect(windowObservations.map((o) => o.sessionId)).toContain("deload-high");
  });
});

describe("confidence (§11)", () => {
  it("reaches high only on three fresh, consistent, cleanly flagged sessions", () => {
    const observations = [3, 2, 1].map((weeksAgo, index) =>
      observationOf(straightSets(`s${index}`, daysBefore(AS_OF, weeksAgo * 5), 100, 5, 2)),
    );
    const { estimate } = deriveEstimate({ observations, asOfLocalDate: AS_OF });
    expect(estimate.currentE1rmKg).toBe(123.33);
    expect(estimate.confidence).toBe("high");
    expect(estimate.reasonCodes).toEqual([]);
  });

  it("caps at low for a single session and medium for two", () => {
    const one = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 3))],
      asOfLocalDate: AS_OF,
    });
    expect(one.estimate.confidence).toBe("low");
    expect(one.estimate.reasonCodes).toContain("SINGLE_SESSION_EVIDENCE");

    const two = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 6)), obs(122, daysBefore(AS_OF, 3))],
      asOfLocalDate: AS_OF,
    });
    expect(two.estimate.confidence).toBe("medium");
    expect(two.estimate.reasonCodes).toContain("TWO_SESSION_EVIDENCE");
  });

  it("caps at medium when a basis flag is present, and reports the flag", () => {
    const observations = [0, 1, 2].map((index) =>
      observationOf(straightSets(`s${index}`, daysBefore(AS_OF, 10 - index * 3), 100, 5, null)),
    );
    const { estimate } = deriveEstimate({ observations, asOfLocalDate: AS_OF });
    expect(estimate.confidence).toBe("medium");
    expect(estimate.reasonCodes).toContain("RIR_MISSING_LOWER_BOUND");
  });

  it("steps down with the age of the most recent pool session", () => {
    const fresh = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 21))],
      asOfLocalDate: AS_OF,
    });
    expect(fresh.estimate.reasonCodes).not.toContain("EVIDENCE_AGING");

    const aging = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 22))],
      asOfLocalDate: AS_OF,
    });
    expect(aging.estimate.reasonCodes).toContain("EVIDENCE_AGING");
    expect(aging.estimate.reasonCodes).not.toContain("EVIDENCE_OLD");

    const old = deriveEstimate({
      observations: [obs(120, daysBefore(AS_OF, 43))],
      asOfLocalDate: AS_OF,
    });
    expect(old.estimate.reasonCodes).toContain("EVIDENCE_OLD");
    expect(old.estimate.reasonCodes).not.toContain("EVIDENCE_AGING");
    expect(old.estimate.confidence).toBe("low");
  });

  it("uses disjoint spread levels", () => {
    // §11 — spread is (max - min) / LOWER MEDIAN, a range over a low centre,
    // NOT over the mean or the max. For [100, 110, 123] the centre is 110, so
    // the spread is 23/110 = 20.91 %; for [100, 110, 134] it is 34/110 =
    // 30.91 %. Dividing by the minimum instead would give 23 % and 34 % —
    // which is why the denominator is asserted here, not just the level.
    const wide = deriveEstimate({
      observations: [
        obs(100, daysBefore(AS_OF, 9)),
        obs(110, daysBefore(AS_OF, 6)),
        obs(123, daysBefore(AS_OF, 3)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(wide.estimate.poolSpreadPct).toBe(20.91);
    expect(wide.estimate.reasonCodes).toContain("ESTIMATE_SPREAD_WIDE");
    expect(wide.estimate.reasonCodes).not.toContain("ESTIMATE_SPREAD_VERY_WIDE");
    expect(wide.estimate.confidence).toBe("medium");

    const veryWide = deriveEstimate({
      observations: [
        obs(100, daysBefore(AS_OF, 9)),
        obs(110, daysBefore(AS_OF, 6)),
        obs(134, daysBefore(AS_OF, 3)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(veryWide.estimate.poolSpreadPct).toBe(30.91);
    expect(veryWide.estimate.reasonCodes).toContain("ESTIMATE_SPREAD_VERY_WIDE");
    expect(veryWide.estimate.reasonCodes).not.toContain("ESTIMATE_SPREAD_WIDE");
    expect(veryWide.estimate.confidence).toBe("low");

    // The boundary is strictly ">": a spread of exactly 20 % is not "wide".
    const exactly20 = deriveEstimate({
      observations: [
        obs(100, daysBefore(AS_OF, 9)),
        obs(100, daysBefore(AS_OF, 6)),
        obs(120, daysBefore(AS_OF, 3)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(exactly20.estimate.poolSpreadPct).toBe(20);
    expect(exactly20.estimate.reasonCodes).not.toContain("ESTIMATE_SPREAD_WIDE");
  });

  it("compares the spread UNROUNDED (review F-1)", () => {
    // The reviewer's own E3 fixture: `3 × 100×10 @ RIR 0` twice and
    // `3 × 120×10 @ RIR 0` once -> pool [133.33, 133.33, 160.00]. The spread
    // is 26.67 / 133.33 = 20.0030 %, which is over the threshold — but
    // `round2` turns it into exactly 20.00, which is not, so the code
    // disappears and the confidence word climbs to `high`.
    const { estimate } = deriveEstimate({
      observations: [
        obs(133.33, daysBefore(AS_OF, 9)),
        obs(133.33, daysBefore(AS_OF, 6)),
        obs(160.0, daysBefore(AS_OF, 3)),
      ],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.reasonCodes).toContain("ESTIMATE_SPREAD_WIDE");
    expect(estimate.confidence).toBe("medium");
    // The DTO field stays rounded — display precision, not comparison
    // precision.
    expect(estimate.poolSpreadPct).toBe(20);
    // NEGATIVE CONTROLS: comparing the rounded value gives no code and `high`.
    expect(estimate.reasonCodes).not.toEqual([]);
    expect(estimate.confidence).not.toBe("high");
  });

  it("compares the 30 % spread level UNROUNDED too (review F-1)", () => {
    // The reviewer's fuzz report #8067: pool [173.33, 133.33] -> spread
    // 40 / 133.33 = 30.00075 %, over the level. `round2` gives exactly 30.00,
    // which reads one level calmer and one confidence word higher.
    const { estimate } = deriveEstimate({
      observations: [obs(133.33, daysBefore(AS_OF, 6)), obs(173.33, daysBefore(AS_OF, 3))],
      asOfLocalDate: AS_OF,
    });
    expect(estimate.reasonCodes).toContain("ESTIMATE_SPREAD_VERY_WIDE");
    expect(estimate.confidence).toBe("low");
    expect(estimate.poolSpreadPct).toBe(30);
    expect(estimate.reasonCodes).not.toContain("ESTIMATE_SPREAD_WIDE");
    expect(estimate.confidence).not.toBe("medium");
  });
});

describe("determinism (I-5, A-5)", () => {
  it("produces identical output for a swapped input order at an identical date and instant", () => {
    const a = obs(130, daysBefore(AS_OF, 5), {
      sessionId: "aaa",
      startedAt: "2026-09-01T08:00:00.000Z",
    });
    const b = obs(140, daysBefore(AS_OF, 5), {
      sessionId: "bbb",
      startedAt: "2026-09-01T08:00:00.000Z",
    });
    const forward = deriveEstimate({ observations: [a, b], asOfLocalDate: AS_OF });
    const reversed = deriveEstimate({ observations: [b, a], asOfLocalDate: AS_OF });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });
});

describe("the document's headline fixture (§22)", () => {
  it("pools session A and session B into current 133.00, best 139.33 confirmed", () => {
    const a = observationOf({
      sessionId: "A",
      performedOn: "2026-08-31",
      startedAt: "2026-08-31T08:00:00.000Z",
      isDeload: false,
      sets: [3, 3, 2, 2, 1].map((rir, index) => ({
        setNumber: index + 1,
        isWarmup: false,
        weightKg: 110,
        reps: 5,
        rir,
      })),
    });
    const b = observationOf({
      sessionId: "B",
      performedOn: "2026-09-03",
      startedAt: "2026-09-03T08:00:00.000Z",
      isDeload: false,
      sets: [2, 1, 0].map((rir, index) => ({
        setNumber: index + 1,
        isWarmup: false,
        weightKg: 95,
        reps: 12,
        rir,
      })),
    });
    const { estimate } = deriveEstimate({ observations: [a, b], asOfLocalDate: "2026-09-06" });
    expect(estimate.currentE1rmKg).toBe(133.0);
    expect(estimate.poolSpreadPct).toBe(4.76);
    expect(estimate.best).toMatchObject({ e1rmKg: 139.33, unconfirmed: false });
    expect(estimate.confidence).toBe("medium");
    expect(estimate.reasonCodes).toContain("TWO_SESSION_EVIDENCE");
    expect(estimate.reasonCodes).toContain("RIR_MODERATE_RANGE");
    expect(estimate.reasonCodes).toContain("EXTENDED_REP_RANGE");
    expect(estimate.reasonCodes).toContain("SINGLE_SET_GROUP");
    expect(estimate.reasonCodes).toContain("HIGH_REP_SETS_EXCLUDED");
  });
});

describe("disabledEstimate (A-30)", () => {
  it("carries the refusal code and nothing else", () => {
    const estimate = disabledEstimate("EXERCISE_ESTIMATE_DISABLED", AS_OF);
    expect(estimate.currentE1rmKg).toBeNull();
    expect(estimate.best).toBeNull();
    expect(estimate.reasonCodes).toEqual(["EXERCISE_ESTIMATE_DISABLED"]);
    expect(estimate.algorithm).toEqual({ id: "e1rm-epley-rir", version: 1, formula: "epley" });
  });
});
