import { describe, expect, it } from "vitest";
import { STRENGTH_ALGORITHM } from "@/domain/strength/constants";
import { deriveStrengthReport } from "@/domain/strength/report";
import { computeWhatIf } from "@/domain/strength/whatIf";
import type { StrengthEstimate, StrengthSessionInput } from "@/domain/strength/types";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §15.1 (the Release A what-if calculator), §9.4 (target effort bounds), §9.5
// steps 5-8 (finite guard, floor, band). Acceptance criteria A-11 (the
// arithmetic and the flooring), A-18 (nothing non-finite reaches a DTO), and
// the §15.4 codes.

function estimateWith(currentE1rmKg: number | null, reasonCodes: string[] = []): StrengthEstimate {
  return {
    currentE1rmKg,
    best: null,
    confidence: "medium",
    reasonCodes: reasonCodes as StrengthEstimate["reasonCodes"],
    poolSessionIds: [],
    poolSpreadPct: null,
    latestPoolAgeDays: null,
    staleObservationCount: 0,
    deloadObservationCount: 0,
    algorithm: STRENGTH_ALGORITHM,
    asOfLocalDate: "2026-09-06",
  };
}

describe("target effort bounds (§9.4)", () => {
  it("refuses a near-maximal target below RTF 3", () => {
    const result = computeWhatIf({
      input: { reps: 2, rir: 0 },
      estimate: estimateWith(140),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.status).toBe("none");
    expect(result.reasonCodes).toEqual(["TARGET_NEAR_MAXIMAL_NOT_SUGGESTED"]);
    expect(result.loadKg).toBeNull();
  });

  it("accepts RTF 3 exactly", () => {
    const result = computeWhatIf({
      input: { reps: 3, rir: 0 },
      estimate: estimateWith(140),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.status).toBe("ok");
    // 140 / (1 + 3/30) = 127.27 -> floored to 127.5? No: floor(127.27/2.5)
    // = 50 -> 125.0.
    expect(result.rawLoadKg).toBe(127.27);
    expect(result.loadKg).toBe(125);
  });

  it("flags 13-15 as extended target effort and refuses above 15", () => {
    const extended = computeWhatIf({
      input: { reps: 12, rir: 2 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(extended.status).toBe("ok");
    expect(extended.targetRtf).toBe(14);
    expect(extended.reasonCodes).toContain("EXTENDED_TARGET_EFFORT");

    const twelve = computeWhatIf({
      input: { reps: 12, rir: 0 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(twelve.reasonCodes).not.toContain("EXTENDED_TARGET_EFFORT");

    const beyond = computeWhatIf({
      input: { reps: 12, rir: 4 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(beyond.status).toBe("none");
    expect(beyond.reasonCodes).toEqual(["TARGET_OUTSIDE_FORMULA_DOMAIN"]);
  });

  it("allows a target ceiling ABOVE the source ceiling (§9.4)", () => {
    // The source ceiling is RTF 12; the target ceiling is 15, because a
    // high-RTF target divides by a multiplier Epley makes too large and so
    // errs LIGHT. NEGATIVE CONTROL: if the source ceiling were reused as the
    // target ceiling, RTF 15 would refuse here.
    const result = computeWhatIf({
      input: { reps: 12, rir: 3 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.targetRtf).toBe(15);
    expect(result.status).toBe("ok");
  });
});

describe("the translation arithmetic (§9.5, A-11)", () => {
  it("reproduces the document's 133.00 -> 12 reps fixtures", () => {
    // 133.00 / f(15) = 133 / 1.5 = 88.67 -> floor(2.5) = 87.5
    const band03 = computeWhatIf({
      input: { reps: 12, rir: 3 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(band03.rawLoadKg).toBe(88.67);
    expect(band03.loadKg).toBe(87.5);
    expect(band03.reasonCodes).toContain("EXTENDED_TARGET_EFFORT");
    expect(band03.reasonCodes).toContain("ROUNDED_DOWN_TO_LOAD_STEP");

    // 133.00 / f(14) = 133 / 1.466666... = 90.68 -> floor(2.5) = 90.0
    const band02 = computeWhatIf({
      input: { reps: 12, rir: 2 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(band02.rawLoadKg).toBe(90.68);
    expect(band02.loadKg).toBe(90);
  });

  it("reproduces the effort-matched 12-rep case exactly on the grid", () => {
    // 133.00 / f(12) = 133 / 1.4 = 95.00 — already a grid multiple, so no
    // rounding code is emitted.
    const result = computeWhatIf({
      input: { reps: 12, rir: 0 },
      estimate: estimateWith(133),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.rawLoadKg).toBe(95);
    expect(result.loadKg).toBe(95);
    expect(result.reasonCodes).not.toContain("ROUNDED_DOWN_TO_LOAD_STEP");
  });

  it("is non-increasing in target RTF, strictly so before the floor bites", () => {
    const estimate = estimateWith(139.33);
    const rows = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((rtf) =>
      computeWhatIf({
        input: { reps: rtf, rir: 0 },
        estimate,
        loadStepKg: 2.5,
        windowMaxAdmittedLoadKg: null,
      }),
    );
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.rawLoadKg!).toBeLessThan(rows[i - 1]!.rawLoadKg!);
      expect(rows[i]!.loadKg!).toBeLessThanOrEqual(rows[i - 1]!.loadKg!);
    }
  });

  it("floors on a coarse grid and leaves the band around the RAW value (§9.5 step 8)", () => {
    // The document's own coarse-grid illustration: loadStepKg 5, raw 24 ->
    // emitted 20, band [20, 30], rendered "likely 20-30". The emitted load
    // sitting on the band's lower edge is the visible face of the floor
    // discount X-12 declined to cap; §15.3 forbids re-centring the band.
    const result = computeWhatIf({
      input: { reps: 10, rir: 0 },
      estimate: estimateWith(32),
      loadStepKg: 5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.rawLoadKg).toBe(24);
    expect(result.loadKg).toBe(20);
    expect(result.bandKg).toEqual([20, 30]);
    // NEGATIVE CONTROL: rounding to nearest would emit 25 — above the
    // evidence — and re-centring the band on 20 would give [18, 22].
    expect(result.loadKg).not.toBe(25);
    expect(result.bandKg?.[1]).not.toBe(22);
  });

  it("brackets the raw value with a ±10 % band rounded outward", () => {
    const result = computeWhatIf({
      input: { reps: 5, rir: 2 },
      estimate: estimateWith(139.33),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    // 139.33 / f(7) = 112.97; ±10 % = [101.673, 124.267].
    expect(result.rawLoadKg).toBe(112.97);
    expect(result.loadKg).toBe(112.5);
    expect(result.bandKg).toEqual([100, 125]);
    expect(result.bandKg![0]).toBeLessThanOrEqual(result.loadKg!);
    expect(result.bandKg![1]).toBeGreaterThanOrEqual(result.loadKg!);
  });
});

describe("the §9.5 step-4 global cap (review F-2, owner decision 2026-09-06)", () => {
  // The reviewer's own E14 fixture. After `5 × 110×5 @ RIR 3,3,2,2,1` the
  // current estimate is 139.33 and the heaviest admitted load in the window is
  // 110, so the cap is 1.10 × 110 = 121.00. Asking for 1 rep @ RIR 2 (RTF 3)
  // translates to 139.33 / 1.1 = 126.66, above the cap.
  const CAP_BASIS = 110;

  it("caps the translation at 1.10 × the heaviest admitted load and says so", () => {
    const result = computeWhatIf({
      input: { reps: 1, rir: 2 },
      estimate: estimateWith(139.33),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: CAP_BASIS,
    });
    expect(result.status).toBe("ok");
    // §12 / A-9: `rawLoadKg` is the PRE-cap translation.
    expect(result.rawLoadKg).toBe(126.66);
    // Capped to 121.00, then floored to the 2.5 kg grid.
    expect(result.loadKg).toBe(120);
    expect(result.reasonCodes).toContain("CAPPED_AT_RECENT_MAX_LOAD");
    expect(result.reasonCodes).toContain("ROUNDED_DOWN_TO_LOAD_STEP");
    // NEGATIVE CONTROL: uncapped, this fixture answered 125 kg — the exact
    // number the review reported as exceeding the cap by 4 kg.
    expect(result.loadKg).not.toBe(125);
  });

  it("brackets the CAPPED value, not the pre-cap translation (§9.5 step 8)", () => {
    const result = computeWhatIf({
      input: { reps: 1, rir: 2 },
      estimate: estimateWith(139.33),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: CAP_BASIS,
    });
    // 121.00 ±10 % = [108.9, 133.1] -> outward on the 2.5 grid.
    expect(result.bandKg).toEqual([107.5, 135]);
    // NEGATIVE CONTROL: the uncapped band was [112.5, 140].
    expect(result.bandKg).not.toEqual([112.5, 140]);
  });

  it("does not bind when the translation is already under the cap", () => {
    const result = computeWhatIf({
      input: { reps: 5, rir: 2 },
      estimate: estimateWith(139.33),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: CAP_BASIS,
    });
    // 112.97 < 121.00 — untouched, and no code.
    expect(result.rawLoadKg).toBe(112.97);
    expect(result.loadKg).toBe(112.5);
    expect(result.reasonCodes).not.toContain("CAPPED_AT_RECENT_MAX_LOAD");
  });

  it("compares the cap UNROUNDED", () => {
    // Cap basis 110.01 -> cap 121.011. A translation of exactly 121.01 is
    // BELOW it and must pass through untouched; rounding the cap to 121.01
    // would make the comparison a tie and leave the value alone too, so the
    // discriminating case is the other side: 121.02 exceeds 121.011 and must
    // be capped to it.
    const under = computeWhatIf({
      input: { reps: 3, rir: 0 },
      estimate: estimateWith(133.111),
      loadStepKg: 0.01,
      windowMaxAdmittedLoadKg: 110.01,
    });
    expect(under.rawLoadKg).toBe(121.01);
    expect(under.reasonCodes).not.toContain("CAPPED_AT_RECENT_MAX_LOAD");

    const over = computeWhatIf({
      input: { reps: 3, rir: 0 },
      estimate: estimateWith(133.13),
      loadStepKg: 0.01,
      windowMaxAdmittedLoadKg: 110.01,
    });
    expect(over.rawLoadKg).toBe(121.03);
    expect(over.loadKg).toBe(121.01);
    expect(over.reasonCodes).toContain("CAPPED_AT_RECENT_MAX_LOAD");
  });

  it("has no cap to apply when the window holds no admitted group", () => {
    const result = computeWhatIf({
      input: { reps: 3, rir: 0 },
      estimate: estimateWith(139.33),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    // 139.33 / 1.1 = 126.66, floored to the 2.5 kg grid.
    expect(result.rawLoadKg).toBe(126.66);
    expect(result.loadKg).toBe(125);
    expect(result.reasonCodes).not.toContain("CAPPED_AT_RECENT_MAX_LOAD");
  });

  it("takes its basis from ADMITTED groups only, never an excluded one (I-13)", () => {
    // A `1100 kg` typo is excluded as implausible, so it must not licence a
    // bigger answer. Driven through the whole report so the basis is derived,
    // not asserted.
    const sessions: StrengthSessionInput[] = [
      {
        sessionId: "typo",
        performedOn: "2026-09-03",
        startedAt: "2026-09-03T08:00:00.000Z",
        isDeload: false,
        sets: [
          { setNumber: 1, isWarmup: false, weightKg: 110, reps: 5, rir: 2 },
          { setNumber: 2, isWarmup: false, weightKg: 110, reps: 5, rir: 2 },
          { setNumber: 3, isWarmup: false, weightKg: 110, reps: 5, rir: 2 },
          { setNumber: 4, isWarmup: false, weightKg: 1100, reps: 5, rir: 2 },
        ],
      },
    ];
    const report = deriveStrengthReport({
      exercise: { equipment: "barbell", strengthEstimate: "auto", loadStepKg: 2.5 },
      sessions,
      asOfLocalDate: "2026-09-06",
      whatIf: { reps: 3, rir: 0 },
    });
    expect(report.estimate.currentE1rmKg).toBe(135.67);
    // The cap basis is 110, not 1100: 1.10 × 110 = 121.00 binds on the
    // 123.34 translation.
    expect(report.whatIf?.rawLoadKg).toBe(123.34);
    expect(report.whatIf?.loadKg).toBe(120);
    expect(report.whatIf?.reasonCodes).toContain("CAPPED_AT_RECENT_MAX_LOAD");
    // NEGATIVE CONTROL: had the excluded group set the basis, the cap would be
    // 1210 and nothing would bind.
    expect(report.whatIf?.loadKg).not.toBe(122.5);
  });

  it("takes its basis from non-deload observations only (I-6)", () => {
    const session = (
      id: string,
      performedOn: string,
      weightKg: number,
      isDeload: boolean,
    ): StrengthSessionInput => ({
      sessionId: id,
      performedOn,
      startedAt: `${performedOn}T08:00:00.000Z`,
      isDeload,
      sets: [0, 1, 2].map((i) => ({
        setNumber: i + 1,
        isWarmup: false,
        weightKg,
        reps: 5,
        rir: 2,
      })),
    });
    const report = deriveStrengthReport({
      exercise: { equipment: "barbell", strengthEstimate: "auto", loadStepKg: 2.5 },
      // The deload session is the heaviest in the window; it must not raise
      // the ceiling on what the calculator may answer.
      sessions: [
        session("work", "2026-09-01", 100, false),
        session("deload", "2026-09-04", 200, true),
      ],
      asOfLocalDate: "2026-09-06",
      whatIf: { reps: 3, rir: 0 },
    });
    expect(report.estimate.currentE1rmKg).toBe(123.33);
    // Cap basis 100 -> 110.00; the translation 112.12 is capped.
    expect(report.whatIf?.rawLoadKg).toBe(112.12);
    expect(report.whatIf?.loadKg).toBe(110);
    expect(report.whatIf?.reasonCodes).toContain("CAPPED_AT_RECENT_MAX_LOAD");
  });
});

describe("guards (§9.5 step 5/7, A-18)", () => {
  it("refuses when there is no current estimate, echoing the estimate's own reason", () => {
    const result = computeWhatIf({
      input: { reps: 5, rir: 2 },
      estimate: estimateWith(null, ["NO_RECENT_EVIDENCE"]),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.status).toBe("none");
    expect(result.reasonCodes).toEqual(["NO_RECENT_EVIDENCE"]);
  });

  it("never lets a non-finite load reach the result", () => {
    const nonFinite = computeWhatIf({
      input: { reps: 5, rir: 2 },
      estimate: estimateWith(Number.POSITIVE_INFINITY),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(nonFinite.status).toBe("none");
    expect(nonFinite.reasonCodes).toEqual(["BELOW_MINIMUM_LOAD"]);
    expect(nonFinite.loadKg).toBeNull();

    const negative = computeWhatIf({
      input: { reps: 5, rir: 2 },
      estimate: estimateWith(-10),
      loadStepKg: 2.5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(negative.status).toBe("none");
    expect(negative.reasonCodes).toEqual(["BELOW_MINIMUM_LOAD"]);
  });

  it("refuses when the floor drives the load to zero", () => {
    // 4 kg estimate at RTF 10 -> 3.00 raw; a 5 kg step floors that to 0.
    const result = computeWhatIf({
      input: { reps: 10, rir: 0 },
      estimate: estimateWith(4),
      loadStepKg: 5,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.rawLoadKg).toBeNull();
    expect(result.status).toBe("none");
    expect(result.reasonCodes).toEqual(["BELOW_MINIMUM_LOAD"]);
  });

  it("degrades a non-positive load step to exact-value rounding without crashing", () => {
    const result = computeWhatIf({
      input: { reps: 5, rir: 2 },
      estimate: estimateWith(139.33),
      loadStepKg: 0,
      windowMaxAdmittedLoadKg: null,
    });
    expect(result.status).toBe("ok");
    expect(result.loadKg).toBe(112.97);
    expect(Number.isFinite(result.loadKg!)).toBe(true);
  });
});

describe("the what-if reaches the report (§15.1, Release A)", () => {
  const sessions: StrengthSessionInput[] = [
    {
      sessionId: "s1",
      performedOn: "2026-09-01",
      startedAt: "2026-09-01T08:00:00.000Z",
      isDeload: false,
      sets: [0, 1, 2].map((i) => ({
        setNumber: i + 1,
        isWarmup: false,
        weightKg: 100,
        reps: 5,
        rir: 2,
      })),
    },
  ];

  it("computes from the current estimate", () => {
    const report = deriveStrengthReport({
      exercise: { equipment: "barbell", strengthEstimate: "auto", loadStepKg: 2.5 },
      sessions,
      asOfLocalDate: "2026-09-06",
      whatIf: { reps: 8, rir: 1 },
    });
    expect(report.estimate.currentE1rmKg).toBe(123.33);
    // 123.33 / f(9) = 123.33 / 1.3 = 94.87 -> floor 2.5 -> 92.5
    expect(report.whatIf?.rawLoadKg).toBe(94.87);
    expect(report.whatIf?.loadKg).toBe(92.5);
  });

  it("refuses for a disabled exercise, with the exercise's own code (A-30)", () => {
    const report = deriveStrengthReport({
      exercise: { equipment: "barbell", strengthEstimate: "off", loadStepKg: 2.5 },
      sessions,
      asOfLocalDate: "2026-09-06",
      whatIf: { reps: 8, rir: 1 },
    });
    expect(report.eligible).toBe(false);
    expect(report.observations).toEqual([]);
    expect(report.whatIf?.status).toBe("none");
    expect(report.whatIf?.reasonCodes).toEqual(["EXERCISE_ESTIMATE_DISABLED"]);
  });

  it("is absent when no what-if was asked for", () => {
    const report = deriveStrengthReport({
      exercise: { equipment: "barbell", strengthEstimate: "auto", loadStepKg: 2.5 },
      sessions,
      asOfLocalDate: "2026-09-06",
    });
    expect(report.whatIf).toBeNull();
  });
});
