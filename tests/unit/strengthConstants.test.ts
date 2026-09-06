import { describe, expect, it } from "vitest";
import * as constants from "@/domain/strength/constants";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §16 — the K-nn table, whose values the owner-decision addendum of
// 2026-09-05 makes binding.
//
// Why this file exists as well as the behavioural suites: a constant can be
// changed to a wrong value and still leave every behavioural fixture passing,
// because a fixture only pins the constant to the extent its own numbers
// straddle the threshold. Widening `PLAUSIBILITY_FACTOR` from 1.20 to 1.50,
// for instance, leaves both the 1100 kg typo (still far outside either band)
// and the 140 kg top set (still inside either band) reading exactly as
// before. So the table is asserted here VALUE BY VALUE against the document,
// and `strengthObservation.test.ts` additionally carries a pair of fixtures
// that bracket the 1.20 boundary so the band's exact size is load-bearing in
// behaviour too.
//
// Every expected number below is transcribed from §16's "Revision" column.
// If one of them has to change, the document changes first.

describe("§16 constants — value by value", () => {
  it.each([
    ["NOISE_SD_PCT (K-03)", constants.NOISE_SD_PCT, 10],
    ["RTF_MAX (K-04)", constants.RTF_MAX, 12],
    ["RTF_CORE_MAX (K-05)", constants.RTF_CORE_MAX, 10],
    ["RIR_NEAR_FAILURE_MAX (K-06)", constants.RIR_NEAR_FAILURE_MAX, 2],
    ["RIR_ELIGIBLE_MAX (K-07)", constants.RIR_ELIGIBLE_MAX, 4],
    ["GROUP_SET_POSITIONS (K-08)", constants.GROUP_SET_POSITIONS, 3],
    ["PLAUSIBILITY_FACTOR (K-09)", constants.PLAUSIBILITY_FACTOR, 1.2],
    ["EVIDENCE_WINDOW_DAYS (K-10)", constants.EVIDENCE_WINDOW_DAYS, 90],
    ["CURRENT_SESSION_COUNT (K-11)", constants.CURRENT_SESSION_COUNT, 3],
    ["FRESH_DAYS_HIGH (K-12)", constants.FRESH_DAYS_HIGH, 21],
    ["FRESH_DAYS_MEDIUM (K-12)", constants.FRESH_DAYS_MEDIUM, 42],
    ["SAME_REPS_TOLERANCE (K-13)", constants.SAME_REPS_TOLERANCE, 1],
    ["NEARBY_REPS_MAX_DOWN (K-14)", constants.NEARBY_REPS_MAX_DOWN, 3],
    ["NEARBY_REPS_MAX_UP (K-15)", constants.NEARBY_REPS_MAX_UP, 2],
    ["MAX_REP_DISTANCE_DOWN (K-16)", constants.MAX_REP_DISTANCE_DOWN, 4],
    ["MAX_REP_DISTANCE_UP (K-17)", constants.MAX_REP_DISTANCE_UP, 3],
    ["TARGET_RTF_MIN (K-18)", constants.TARGET_RTF_MIN, 3],
    ["TARGET_RTF_CORE_MAX (K-19)", constants.TARGET_RTF_CORE_MAX, 12],
    ["TARGET_RTF_MAX (K-19)", constants.TARGET_RTF_MAX, 15],
    ["SPREAD_MEDIUM_PCT (K-20)", constants.SPREAD_MEDIUM_PCT, 20],
    ["SPREAD_LOW_PCT (K-21)", constants.SPREAD_LOW_PCT, 30],
    ["DISAGREE_REFUSE_PCT (K-22)", constants.DISAGREE_REFUSE_PCT, 30],
    ["TIER_VS_POOLED_DISAGREE_PCT (K-23)", constants.TIER_VS_POOLED_DISAGREE_PCT, 20],
    ["UPWARD_LOAD_CAP_FACTOR (K-24)", constants.UPWARD_LOAD_CAP_FACTOR, 1.1],
    ["BEST_UNCONFIRMED_PCT (K-25)", constants.BEST_UNCONFIRMED_PCT, 10],
    ["CONSISTENT_MAJORITY_MIN (§9.6)", constants.CONSISTENT_MAJORITY_MIN, 3],
  ])("%s = %s", (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("stamps the algorithm the way I-4 requires", () => {
    expect(constants.STRENGTH_ALGORITHM).toEqual({
      id: "e1rm-epley-rir",
      version: 1,
      formula: "epley",
    });
  });

  it("lists exactly the four eligible equipment categories (K-37)", () => {
    expect([...constants.STRENGTH_ELIGIBLE_EQUIPMENT]).toEqual([
      "barbell",
      "dumbbell",
      "cable",
      "machine",
    ]);
    // NEGATIVE CONTROL: bodyweight and other are excluded, not merely absent
    // from the happy path.
    expect(constants.STRENGTH_ELIGIBLE_EQUIPMENT).not.toContain("bodyweight");
    expect(constants.STRENGTH_ELIGIBLE_EQUIPMENT).not.toContain("other");
  });

  it("names the three equipment types a Release-B suggestion would degrade (K-36)", () => {
    expect([...constants.SUGGESTION_NOISIER_EQUIPMENT]).toEqual(["cable", "dumbbell", "machine"]);
    // §9.7's split verdict: the TRACKER takes no equipment penalty, so
    // barbell's absence here is not what makes the tracker unpenalised —
    // nothing in Release A reads this list at all.
    expect(constants.SUGGESTION_NOISIER_EQUIPMENT).not.toContain("barbell");
  });
});

describe("every threshold is a stated multiple of the one noise constant (§16)", () => {
  const noise = constants.NOISE_SD_PCT;

  it("derives the spread, refusal and cross-check thresholds from it", () => {
    expect(constants.SPREAD_MEDIUM_PCT).toBe(2 * noise);
    expect(constants.SPREAD_LOW_PCT).toBe(3 * noise);
    expect(constants.DISAGREE_REFUSE_PCT).toBe(3 * noise);
    expect(constants.TIER_VS_POOLED_DISAGREE_PCT).toBe(2 * noise);
  });

  it("derives the plausibility band from TWO noise units and the cap from ONE", () => {
    expect(constants.PLAUSIBILITY_FACTOR).toBe(1 + (2 * noise) / 100);
    expect(constants.UPWARD_LOAD_CAP_FACTOR).toBe(1 + noise / 100);
    // The two are deliberately different sizes: a heavier group inside one
    // session may sit two noise units above the modal group, but a
    // SUGGESTION may never exceed one noise unit over the heaviest load the
    // athlete has actually handled recently.
    expect(constants.PLAUSIBILITY_FACTOR).toBeGreaterThan(constants.UPWARD_LOAD_CAP_FACTOR);
  });

  it("keeps the target ceiling above the source ceiling (§9.4)", () => {
    // A high-RTF target divides by a too-large multiplier and errs LIGHT;
    // a high-RTF source errs the other way. Same number would be wrong.
    expect(constants.TARGET_RTF_MAX).toBeGreaterThan(constants.RTF_MAX);
    expect(constants.TARGET_RTF_CORE_MAX).toBe(constants.RTF_MAX);
  });

  it("keeps the directional rep-distance limits asymmetric (K-16/K-17)", () => {
    // Load-up disagrees more at equal distance AND the error adds load, so
    // the up limit is tighter than the down limit at both tiers.
    expect(constants.NEARBY_REPS_MAX_UP).toBeLessThan(constants.NEARBY_REPS_MAX_DOWN);
    expect(constants.MAX_REP_DISTANCE_UP).toBeLessThan(constants.MAX_REP_DISTANCE_DOWN);
  });
});

describe("constants the revision REMOVED are gone", () => {
  it("declares no MAX_REP_DISTANCE, FAR_REP_DISTANCE or SESSION_SPREAD_FLAG_PCT", () => {
    // §16 removes all three by name: the first two are redundant once the
    // distances are capped at 4/3, and the third was unreachable.
    const declared = Object.keys(constants);
    expect(declared).not.toContain("MAX_REP_DISTANCE");
    expect(declared).not.toContain("FAR_REP_DISTANCE");
    expect(declared).not.toContain("SESSION_SPREAD_FLAG_PCT");
    expect(declared).not.toContain("E1RM_DISPLAY_ROUND_KG");
  });
});
