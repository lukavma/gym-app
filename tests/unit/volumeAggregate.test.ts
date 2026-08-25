import { describe, expect, it } from "vitest";
import { aggregateVolume, type WorkSetContributionRow } from "@/domain/volume/aggregate";

// implementation-plan.md Phase 6 — the binding hand-computed fixture.
// One calendar week, half-open [start, end).
const WEEK = {
  startDate: "2026-08-03",
  endDateExclusive: "2026-08-10",
  startInstant: "2026-08-03T00:00:00.000Z",
  endInstant: "2026-08-10T00:00:00.000Z",
};

function row(
  partial: Partial<WorkSetContributionRow> &
    Pick<WorkSetContributionRow, "setId" | "muscleGroupId" | "role" | "weight">,
): WorkSetContributionRow {
  return {
    sessionStartedAt: "2026-08-04T18:00:00.000Z",
    isDeload: false,
    isWarmup: false,
    ...partial,
  };
}

describe("aggregateVolume — hand-computed fixture (implementation-plan.md Phase 6)", () => {
  // "Bench Press": chest primary 1.0, triceps secondary 0.5, front_delts
  // secondary 0.5 — mixed primary/secondary + editable 0.5 fractional
  // weights. 3 work sets + 1 warmup set (warmup exclusion). Templated
  // exercise (source is a session_exercises concern the aggregator never
  // sees — ad-hoc vs templated counts identically by construction, proven
  // at the service/integration level).
  const benchWorkSets = [1, 2, 3].flatMap((n) => [
    row({ setId: `bench-${n}-chest`, muscleGroupId: "chest", role: "primary", weight: 1.0 }),
    row({ setId: `bench-${n}-chest`, muscleGroupId: "triceps", role: "secondary", weight: 0.5 }),
    row({
      setId: `bench-${n}-chest`,
      muscleGroupId: "front_delts",
      role: "secondary",
      weight: 0.5,
    }),
  ]);
  const benchWarmupSet = [
    row({
      setId: "bench-warmup",
      muscleGroupId: "chest",
      role: "primary",
      weight: 1.0,
      isWarmup: true,
    }),
    row({
      setId: "bench-warmup",
      muscleGroupId: "triceps",
      role: "secondary",
      weight: 0.5,
      isWarmup: true,
    }),
  ];

  // "Custom Row (legacy back)": a user-created exercise still carrying a
  // direct `back` contribution (never reclassified — ADR-010). 2 work sets.
  const legacyBackWorkSets = [1, 2].map((n) =>
    row({ setId: `legacyrow-${n}`, muscleGroupId: "back", role: "primary", weight: 1.0 }),
  );

  // "Pullover Machine": primary on BOTH `lats` and `upper_back` — a
  // legitimate but non-standard configuration (domain-model.md §3: "a user
  // may add them, accepting that the rollup then exceeds RP-style
  // one-set-per-exercise counting"). Logged in a deload session. 2 work
  // sets, each set touching both leaves — the raw-dedup proof case.
  const pulloverWorkSets = [1, 2].flatMap((n) => [
    row({
      setId: `pullover-${n}`,
      muscleGroupId: "lats",
      role: "primary",
      weight: 1.0,
      isDeload: true,
      sessionStartedAt: "2026-08-06T09:00:00.000Z",
    }),
    row({
      setId: `pullover-${n}`,
      muscleGroupId: "upper_back",
      role: "primary",
      weight: 1.0,
      isDeload: true,
      sessionStartedAt: "2026-08-06T09:00:00.000Z",
    }),
  ]);

  const rows = [...benchWorkSets, ...benchWarmupSet, ...legacyBackWorkSets, ...pulloverWorkSets];

  const [week] = aggregateVolume(rows, [WEEK]);

  it("computes leaf effective/raw exactly, excluding the warmup set", () => {
    expect(week!.leaves.chest).toEqual({ effective: 3, raw: 3 });
    expect(week!.leaves.triceps).toEqual({ effective: 1.5, raw: 0 });
    expect(week!.leaves.front_delts).toEqual({ effective: 1.5, raw: 0 });
    expect(week!.leaves.lats).toEqual({ effective: 2, raw: 2 });
    expect(week!.leaves.upper_back).toEqual({ effective: 2, raw: 2 });
  });

  it("zeroes every leaf never touched by the fixture", () => {
    const untouched = [
      "side_delts",
      "rear_delts",
      "traps",
      "biceps",
      "forearms",
      "abs",
      "quads",
      "hamstrings",
      "glutes",
      "adductors",
      "calves",
      "lower_back",
    ] as const;
    for (const leaf of untouched) {
      expect(week!.leaves[leaf]).toEqual({ effective: 0, raw: 0 });
    }
  });

  it("counts the legacy direct `back` contribution as unclassified, not a leaf", () => {
    expect(week!.rollups.back.unclassified).toBe(2);
  });

  it("proves the reconciliation equation for effective values (ADR-010 / M-3)", () => {
    // Back.effective = Lats.effective + Upper Back.effective + Unclassified Back
    expect(week!.rollups.back.effective).toBe(
      week!.leaves.lats.effective +
        week!.leaves.upper_back.effective +
        week!.rollups.back.unclassified,
    );
    expect(week!.rollups.back.effective).toBe(6); // 2 + 2 + 2
  });

  it("proves raw Back is deduplicated per set, not additive across contributions (M-3)", () => {
    // Naive (wrong) additive count: every *primary* contribution counted
    // independently — Lats' 2 primary rows + Upper Back's 2 primary rows +
    // the legacy direct-back exercise's 2 primary rows = 6. The correct,
    // per-set-deduplicated raw count is 4: Pullover Machine's 2 sets each
    // hit two member leaves at once and must count once per set, not twice.
    const naiveAdditiveSum =
      week!.leaves.lats.raw + week!.leaves.upper_back.raw + 2; /* legacy direct-back primary sets */
    expect(naiveAdditiveSum).toBe(6);
    expect(week!.rollups.back.raw).toBe(4);
    expect(week!.rollups.back.raw).toBeLessThan(naiveAdditiveSum);
  });

  it("marks the week as deload because it includes a deload session, without reducing its data", () => {
    expect(week!.isDeload).toBe(true);
    // Pullover Machine's full 2 sets are still counted in both leaves above
    // (2 each), not excluded or halved.
  });
});

describe("aggregateVolume — pre-v2 merged-Back equivalence (ADR-010 sum-preservation invariant)", () => {
  // Mirrors the REAL reconciliation partition: every seeded `back` row maps
  // to exactly ONE leaf, role and weight preserved (never both leaves at
  // once — that's the different, legitimate-divergence case covered above).
  // "Lat Pulldown": back primary 1.0 pre-v2 -> lats primary 1.0 post-v2.
  // "Barbell Row": back secondary 0.5 pre-v2 -> upper_back secondary 0.5
  // post-v2 (mirrors the real deadlift/trap-bar-deadlift secondary rows).
  const preV2Rows = [1, 2, 3].flatMap((n) => [
    row({ setId: `pulldown-${n}`, muscleGroupId: "back", role: "primary", weight: 1.0 }),
    row({ setId: `row-${n}`, muscleGroupId: "back", role: "secondary", weight: 0.5 }),
  ]);
  const postV2Rows = [1, 2, 3].flatMap((n) => [
    row({ setId: `pulldown-${n}`, muscleGroupId: "lats", role: "primary", weight: 1.0 }),
    row({ setId: `row-${n}`, muscleGroupId: "upper_back", role: "secondary", weight: 0.5 }),
  ]);

  const [preV2Week] = aggregateVolume(preV2Rows, [WEEK]);
  const [postV2Week] = aggregateVolume(postV2Rows, [WEEK]);

  it("pre-v2 merged Back matches hand computation", () => {
    expect(preV2Week!.rollups.back).toEqual({ effective: 4.5, raw: 3, unclassified: 4.5 });
  });

  it("post-v2 split leaves match hand computation", () => {
    expect(postV2Week!.leaves.lats).toEqual({ effective: 3, raw: 3 });
    expect(postV2Week!.leaves.upper_back).toEqual({ effective: 1.5, raw: 0 });
  });

  it("post-v2 Back rollup exactly equals the pre-v2 merged Back series (sum-preservation)", () => {
    expect(postV2Week!.rollups.back.effective).toBe(preV2Week!.rollups.back.effective);
    expect(postV2Week!.rollups.back.raw).toBe(preV2Week!.rollups.back.raw);
    expect(postV2Week!.rollups.back).toEqual({ effective: 4.5, raw: 3, unclassified: 0 });
  });
});
