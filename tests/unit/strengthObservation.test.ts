import { describe, expect, it } from "vitest";
import { classifySet, evaluateExerciseEligibility } from "@/domain/strength/eligibility";
import { buildObservation } from "@/domain/strength/observation";
import type { StrengthSessionInput, StrengthSetInput } from "@/domain/strength/types";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §6 (V-3, V-4), §7 (V-6..V-9), §7.6, §15.4. Acceptance criteria A-2, A-3,
// A-4, A-30, and invariants I-12, I-13.
//
// Several tests below are NEGATIVE CONTROLS: they assert both the value the
// rules produce AND the value that a bypassed rule would produce, so the test
// fails loudly if the rule is quietly removed rather than passing for the
// wrong reason.

let nextSetNumber = 1;

function set(
  weightKg: number,
  reps: number,
  rir: number | null,
  options: { isWarmup?: boolean; setNumber?: number } = {},
): StrengthSetInput {
  return {
    setNumber: options.setNumber ?? nextSetNumber++,
    isWarmup: options.isWarmup ?? false,
    weightKg,
    reps,
    rir,
  };
}

function session(
  sets: StrengthSetInput[],
  options: { isDeload?: boolean; performedOn?: string } = {},
): StrengthSessionInput {
  nextSetNumber = 1;
  return {
    sessionId: "s-1",
    performedOn: options.performedOn ?? "2026-09-01",
    startedAt: "2026-09-01T08:00:00.000Z",
    isDeload: options.isDeload ?? false,
    sets: sets.map((s, index) => ({ ...s, setNumber: index + 1 })),
  };
}

function observe(sets: StrengthSetInput[], options: { isDeload?: boolean } = {}) {
  const result = buildObservation(session(sets, options));
  if (!result.observation) throw new Error("expected an observation");
  return result;
}

describe("evaluateExerciseEligibility (V-3, A-30)", () => {
  it("admits the four load-bearing equipment categories under 'auto'", () => {
    for (const equipment of ["barbell", "dumbbell", "cable", "machine"]) {
      expect(
        evaluateExerciseEligibility({ equipment, strengthEstimate: "auto", loadStepKg: 2.5 }),
      ).toEqual({ eligible: true });
    }
  });

  it("refuses bodyweight and other, whatever the switch says", () => {
    for (const equipment of ["bodyweight", "other"]) {
      expect(
        evaluateExerciseEligibility({ equipment, strengthEstimate: "auto", loadStepKg: 2.5 }),
      ).toEqual({ eligible: false, reasonCode: "EXERCISE_CATEGORY_UNSUPPORTED" });
    }
  });

  it("lets the switch only ever DISABLE, never enable (A-30)", () => {
    // NEGATIVE CONTROL for V-3's "the switch can only disable": if `'auto'`
    // were read as "estimate regardless", the first assertion would come back
    // eligible.
    expect(
      evaluateExerciseEligibility({
        equipment: "bodyweight",
        strengthEstimate: "auto",
        loadStepKg: 2.5,
      }),
    ).toEqual({ eligible: false, reasonCode: "EXERCISE_CATEGORY_UNSUPPORTED" });
    expect(
      evaluateExerciseEligibility({
        equipment: "barbell",
        strengthEstimate: "off",
        loadStepKg: 2.5,
      }),
    ).toEqual({ eligible: false, reasonCode: "EXERCISE_ESTIMATE_DISABLED" });
  });

  it("reports the category refusal first when both gates fail (§9.6 order)", () => {
    expect(
      evaluateExerciseEligibility({
        equipment: "other",
        strengthEstimate: "off",
        loadStepKg: 2.5,
      }),
    ).toEqual({ eligible: false, reasonCode: "EXERCISE_CATEGORY_UNSUPPORTED" });
  });
});

describe("classifySet (V-4, A-2)", () => {
  it("excludes a marked warm-up before anything else", () => {
    expect(classifySet(set(110, 5, 2, { isWarmup: true }))).toEqual({
      eligible: false,
      bucket: "warmup",
    });
  });

  it("excludes a 0 kg set — 0 means bodyweight-only, not a load", () => {
    expect(classifySet(set(0, 10, 1))).toEqual({ eligible: false, bucket: "zeroLoad" });
  });

  it("admits RIR 3-4 as degraded and excludes RIR 5+", () => {
    expect(classifySet(set(60, 6, 4))).toEqual({ eligible: true, rtf: 10 });
    expect(classifySet(set(60, 6, 5))).toEqual({ eligible: false, bucket: "highRir" });
  });

  it("applies the source ceiling of 12 reps to failure, not to raw reps", () => {
    expect(classifySet(set(95, 12, 0))).toEqual({ eligible: true, rtf: 12 });
    expect(classifySet(set(95, 12, 1))).toEqual({ eligible: false, bucket: "highRep" });
    expect(classifySet(set(95, 12, 2))).toEqual({ eligible: false, bucket: "highRep" });
    // PI-001's pathological row.
    expect(classifySet(set(8, 90, null))).toEqual({ eligible: false, bucket: "highRep" });
  });

  it("treats a missing RIR as RTF = reps, eligible", () => {
    expect(classifySet(set(110, 5, null))).toEqual({ eligible: true, rtf: 5 });
  });
});

describe("group e1RM is set-count invariant (V-8, I-12, A-3)", () => {
  it("reads the same at three sets and at five", () => {
    const three = observe([set(110, 5, 3), set(110, 5, 3), set(110, 5, 2)]);
    const five = observe([
      set(110, 5, 3),
      set(110, 5, 3),
      set(110, 5, 2),
      set(110, 5, 2),
      set(110, 5, 1),
    ]);
    expect(three.observation?.e1rmKg).toBe(139.33);
    expect(five.observation?.e1rmKg).toBe(139.33);
    // NEGATIVE CONTROL: the evaluation's all-sets lower median gave 135.67
    // for the five-set case. If GROUP_SET_POSITIONS stops being applied, this
    // assertion is the one that fails.
    expect(five.observation?.e1rmKg).not.toBe(135.67);
    expect(five.observation?.groups[0]?.setCount).toBe(5);
  });

  it("reads 135.67 when every set is at RIR 2 (A-3)", () => {
    expect(observe([set(110, 5, 2), set(110, 5, 2), set(110, 5, 2)]).observation?.e1rmKg).toBe(
      135.67,
    );
  });

  // Independent fixture, not from the document: 4 x 82.5 kg x 6 at RIR
  // 2, 2, 1, 0 -> set e1RMs 104.50, 104.50, 101.75, 99.00.
  it("ignores sets four and later — independent fixture", () => {
    const result = observe([set(82.5, 6, 2), set(82.5, 6, 2), set(82.5, 6, 1), set(82.5, 6, 0)]);
    expect(result.observation?.e1rmKg).toBe(104.5);
    // NEGATIVE CONTROL: the lower median over ALL FOUR sets is 101.75.
    expect(result.observation?.e1rmKg).not.toBe(101.75);
    expect(result.observation?.groups[0]?.positions).toHaveLength(3);
  });
});

describe("the modal group, ties, and the plausibility band (V-6, V-7, A-4)", () => {
  it("anchors an ascending pyramid on the HEAVIEST group", () => {
    const result = observe([set(100, 8, 2), set(110, 8, 2), set(120, 8, 2)]);
    expect(result.observation?.e1rmKg).toBe(160.0);
    expect(result.excludedSetCounts.subModal).toBe(2);
    expect(result.observation?.reasonCodes).toContain("SUB_MODAL_SETS_EXCLUDED");
  });

  it("reports a DIFFERENT value than a ties-to-earliest rule would (V-6)", () => {
    // NEGATIVE CONTROL for V-6's tie rule, chosen so the two rules actually
    // disagree. The three-set pyramid above does NOT discriminate: under
    // ties-to-earliest the 100 kg group would be modal, the 110 and 120 kg
    // groups would both sit inside the 1.20 band (133.33 x 1.20 = 160.00),
    // and the max admitted group e1RM would still be 160.00.
    //
    // Two single-set groups far enough apart do discriminate. 100 kg x 8 @
    // RIR 2 -> 133.33; 130 kg x 8 @ RIR 2 -> 173.33.
    //   ties-to-heaviest (the rule): modal = 130 -> the 100 kg group is
    //     sub-modal and excluded -> observation 173.33.
    //   ties-to-earliest (the engine's rule): modal = 100 -> the ceiling is
    //     159.996, so 173.33 is IMPLAUSIBLE -> observation 133.33.
    const result = observe([set(100, 8, 2), set(130, 8, 2)]);
    expect(result.observation?.e1rmKg).toBe(173.33);
    expect(result.observation?.e1rmKg).not.toBe(133.33);
    expect(result.excludedSetCounts.subModal).toBe(1);
    expect(result.excludedSetCounts.implausible).toBe(0);
    expect(result.observation?.groups.find((g) => g.loadKg === 130)?.isModal).toBe(true);
  });

  it("compares against the UNROUNDED plausibility ceiling (V-7)", () => {
    // Rounding the ceiling to two decimals before comparing would raise it by
    // up to half a cent, and an admitted supra-modal group then GOVERNS — so
    // that half-cent moves the session's value by twenty per cent here.
    // Modal `3 x 110.01x5 @ RIR 2` -> 135.68; the supra group `132.02x5 @
    // RIR 2` -> 162.82; the exact ceiling is 135.68 x 1.20 = 162.816, so the
    // group is implausible. Under `round2(162.816) = 162.82` it would tie and
    // be admitted.
    const result = observe([
      set(110.01, 5, 2),
      set(110.01, 5, 2),
      set(110.01, 5, 2),
      set(132.02, 5, 2),
    ]);
    expect(result.observation?.groups.find((g) => g.loadKg === 132.02)?.e1rmKg).toBe(162.82);
    expect(result.observation?.e1rmKg).toBe(135.68);
    expect(result.observation?.e1rmKg).not.toBe(162.82);
    expect(result.excludedSetCounts.implausible).toBe(1);
    expect(result.observation?.reasonCodes).toContain("IMPLAUSIBLE_SETS_EXCLUDED");
  });

  it("excludes an order-of-magnitude typo as implausible", () => {
    const result = observe([
      set(110, 5, 2),
      set(110, 5, 2),
      set(110, 5, 2),
      set(110, 5, 2),
      set(1100, 5, 2),
    ]);
    expect(result.observation?.e1rmKg).toBe(135.67);
    expect(result.excludedSetCounts.implausible).toBe(1);
    expect(result.observation?.reasonCodes).toContain("IMPLAUSIBLE_SETS_EXCLUDED");
    // NEGATIVE CONTROL: without the 1.20 band the typo's group e1RM of
    // 1356.67 would govern, because it is both heavier and higher.
    expect(result.observation?.e1rmKg).not.toBe(1356.67);
    const typo = result.observation?.groups.find((g) => g.loadKg === 1100);
    expect(typo?.status).toBe("implausible");
    expect(typo?.e1rmKg).toBe(1356.67);
  });

  it("excludes a light typo as sub-modal", () => {
    const result = observe([
      set(110, 5, 2),
      set(110, 5, 2),
      set(110, 5, 2),
      set(110, 5, 2),
      set(11, 5, 2),
    ]);
    expect(result.observation?.e1rmKg).toBe(135.67);
    expect(result.excludedSetCounts.subModal).toBe(1);
  });

  // NEGATIVE CONTROL for the SIZE of the plausibility band, not just its
  // existence. The 1100 kg typo is far outside any plausible band and the
  // 140 kg top set is well inside one, so neither of those fixtures would
  // notice if `PLAUSIBILITY_FACTOR` were widened. This pair brackets the
  // 1.20 boundary: modal `3 x 100x5 @ RIR 2` -> 123.33, ceiling 148.00.
  it("admits a supra-modal group just UNDER the 1.20 ceiling", () => {
    // 130 kg x 3 @ RIR 1 -> RTF 4 -> 147.33, which is <= 148.00.
    const result = observe([set(130, 3, 1), set(100, 5, 2), set(100, 5, 2), set(100, 5, 2)]);
    expect(result.observation?.groups.find((g) => g.loadKg === 130)?.e1rmKg).toBe(147.33);
    expect(result.observation?.groups.find((g) => g.loadKg === 130)?.status).toBe("admitted");
    expect(result.observation?.e1rmKg).toBe(147.33);
    expect(result.observation?.flags).toContain("TOP_SET_GOVERNS");
  });

  it("excludes a supra-modal group just OVER the 1.20 ceiling", () => {
    // 135 kg x 3 @ RIR 1 -> RTF 4 -> 153.00, which is > 148.00. A band of
    // 1.30 or wider would admit this and report 153.00 instead.
    const result = observe([set(135, 3, 1), set(100, 5, 2), set(100, 5, 2), set(100, 5, 2)]);
    expect(result.observation?.groups.find((g) => g.loadKg === 135)?.e1rmKg).toBe(153.0);
    expect(result.observation?.groups.find((g) => g.loadKg === 135)?.status).toBe("implausible");
    expect(result.observation?.e1rmKg).toBe(123.33);
    expect(result.observation?.e1rmKg).not.toBe(153.0);
    expect(result.observation?.flags).not.toContain("TOP_SET_GOVERNS");
    expect(result.observation?.reasonCodes).toContain("IMPLAUSIBLE_SETS_EXCLUDED");
  });

  it("discards a LIGHTER group by load even when it implies MORE (§7.3, I-13)", () => {
    // `100x12 @ RIR 0` implies 140.00; `3 x 110x5 @ RIR 2` implies 135.67.
    // The lighter group is presumed a ramp, back-off or drop set regardless
    // of what it implies — the deliberate mirror of "do not silently prefer
    // the back-off".
    const result = observe([set(100, 12, 0), set(110, 5, 2), set(110, 5, 2), set(110, 5, 2)]);
    expect(result.observation?.e1rmKg).toBe(135.67);
    // NEGATIVE CONTROL: admitting by implied e1RM instead of by load would
    // report 140.00 here.
    expect(result.observation?.e1rmKg).not.toBe(140.0);
    const lighter = result.observation?.groups.find((g) => g.loadKg === 100);
    expect(lighter?.status).toBe("sub_modal");
    expect(lighter?.e1rmKg).toBe(140.0);
  });

  it("admits a plausible top set and lets it govern (V-9, A-4)", () => {
    const result = observe([set(140, 3, 1), set(110, 8, 1), set(110, 8, 1), set(110, 8, 0)]);
    expect(result.observation?.e1rmKg).toBe(158.67);
    // NEGATIVE CONTROL: the evaluation's modal-group rule reported 143.00
    // here — a 10 % understatement of a session the athlete actually did.
    expect(result.observation?.e1rmKg).not.toBe(143.0);
    expect(result.observation?.flags).toContain("TOP_SET_GOVERNS");
    expect(result.observation?.flags).toContain("MIXED_LOADS_IN_SESSION");
    expect(result.observation?.flags).toContain("SINGLE_SET_GROUP");
    expect(result.observation?.governingGroupLoadKg).toBe(140);
    expect(result.observation?.governingGroupReps).toBe(3);
    expect(result.observation?.groups.filter((g) => g.status === "admitted")).toHaveLength(2);
  });
});

describe("warm-up classification is load-bearing, not decorative (§3)", () => {
  // NEGATIVE CONTROL for `set_logs.is_warmup` being the PRIMARY work-set
  // classifier. Ramping at the working weight is the case the modal-load rule
  // cannot catch, because the ramp sets share the work sets' load: marked,
  // the session reads 120.00 from the three work sets; unmarked, the first
  // three sets are the two ramps plus one work set and it reads 130.00 with a
  // moderate-RIR flag it should not have.
  const ramp = [
    set(100, 5, 4, { isWarmup: true }),
    set(100, 5, 4, { isWarmup: true }),
    set(100, 5, 1),
    set(100, 5, 1),
    set(100, 5, 0),
  ];

  it("reads the work sets when the ramp is marked", () => {
    const result = observe(ramp);
    expect(result.observation?.e1rmKg).toBe(120.0);
    expect(result.excludedSetCounts.warmup).toBe(2);
    expect(result.observation?.flags).not.toContain("RIR_MODERATE_RANGE");
    // A marked warm-up is correctly classified data, not an anomaly: it is
    // counted but carries no reason code (§15.4).
    expect(result.observation?.reasonCodes).toEqual([]);
  });

  it("reads a different, higher value when the same ramp is unmarked", () => {
    const unmarked = ramp.map((s) => ({ ...s, isWarmup: false }));
    const result = observe(unmarked);
    expect(result.observation?.e1rmKg).toBe(130.0);
    expect(result.observation?.flags).toContain("RIR_MODERATE_RANGE");
    expect(result.excludedSetCounts.warmup).toBe(0);
  });
});

describe("flags come from ADMITTED groups only (§7.6)", () => {
  it("does not inherit an excluded group's set quality", () => {
    // The 60 kg ramp group is unmarked and sub-modal; its missing RIR must
    // not make the session look like a lower bound.
    const result = observe([set(60, 5, null), set(110, 5, 2), set(110, 5, 2), set(110, 5, 2)]);
    expect(result.observation?.e1rmKg).toBe(135.67);
    expect(result.observation?.flags).not.toContain("RIR_MISSING_LOWER_BOUND");
    expect(result.observation?.reasonCodes).toContain("SUB_MODAL_SETS_EXCLUDED");
  });

  it("flags a lower bound when an admitted group's first three sets lack RIR", () => {
    const result = observe([set(110, 5, null), set(110, 5, null), set(110, 5, null)]);
    expect(result.observation?.e1rmKg).toBe(128.33);
    expect(result.observation?.flags).toContain("RIR_MISSING_LOWER_BOUND");
    expect(result.observation?.groups[0]?.rirComplete).toBe(false);
    expect(result.observation?.groups[0]?.medianRir).toBeNull();
  });

  it("flags the extended rep range from RTF 11-12, not from raw reps", () => {
    const eleven = observe([set(60, 9, 2), set(60, 9, 2), set(60, 9, 2)]);
    expect(eleven.observation?.flags).toContain("EXTENDED_REP_RANGE");
    const ten = observe([set(60, 8, 2), set(60, 8, 2), set(60, 8, 2)]);
    expect(ten.observation?.flags).not.toContain("EXTENDED_REP_RANGE");
  });

  it("badges a deload session but still computes it (§6.3, O-10)", () => {
    const result = observe([set(90, 5, 3), set(90, 5, 3), set(90, 5, 3)], { isDeload: true });
    expect(result.observation?.isDeload).toBe(true);
    expect(result.observation?.flags).toContain("DELOAD_SESSION");
    expect(result.observation?.e1rmKg).toBe(114.0);
  });
});

describe("the document's own worked session fixtures (§22)", () => {
  it("session A — 5 x 110 kg x 5 at RIR 3,3,2,2,1", () => {
    const result = observe([
      set(110, 5, 3),
      set(110, 5, 3),
      set(110, 5, 2),
      set(110, 5, 2),
      set(110, 5, 1),
    ]);
    expect(result.observation?.e1rmKg).toBe(139.33);
    expect(result.observation?.flags).toEqual(["RIR_MODERATE_RANGE"]);
  });

  it("session B — 3 x 95 kg x 12 at RIR 2,1,0", () => {
    const result = observe([set(95, 12, 2), set(95, 12, 1), set(95, 12, 0)]);
    expect(result.observation?.e1rmKg).toBe(133.0);
    expect(result.excludedSetCounts.highRep).toBe(2);
    expect(result.observation?.reasonCodes).toEqual([
      "HIGH_REP_SETS_EXCLUDED",
      "EXTENDED_REP_RANGE",
      "SINGLE_SET_GROUP",
    ]);
    expect(result.observation?.groups[0]?.setCount).toBe(1);
  });

  it("PI-001 — 8 kg x 90 alone yields no observation at all", () => {
    const result = buildObservation(session([set(8, 90, null)]));
    expect(result.observation).toBeNull();
    expect(result.excludedSetCounts.highRep).toBe(1);
  });

  it("a warm-up-only session yields no observation", () => {
    const result = buildObservation(
      session([set(40, 10, null, { isWarmup: true }), set(60, 5, null, { isWarmup: true })]),
    );
    expect(result.observation).toBeNull();
    expect(result.excludedSetCounts.warmup).toBe(2);
  });
});

describe("determinism (I-5)", () => {
  it("is independent of the order the sets arrive in", () => {
    const sets = [
      { setNumber: 1, isWarmup: false, weightKg: 140, reps: 3, rir: 1 },
      { setNumber: 2, isWarmup: false, weightKg: 110, reps: 8, rir: 1 },
      { setNumber: 3, isWarmup: false, weightKg: 110, reps: 8, rir: 1 },
      { setNumber: 4, isWarmup: false, weightKg: 110, reps: 8, rir: 0 },
    ];
    const forward = buildObservation({
      sessionId: "s",
      performedOn: "2026-09-01",
      startedAt: "2026-09-01T08:00:00.000Z",
      isDeload: false,
      sets,
    });
    const reversed = buildObservation({
      sessionId: "s",
      performedOn: "2026-09-01",
      startedAt: "2026-09-01T08:00:00.000Z",
      isDeload: false,
      sets: [...sets].reverse(),
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });
});
