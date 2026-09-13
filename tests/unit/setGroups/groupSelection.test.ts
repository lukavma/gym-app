import { describe, expect, it } from "vitest";
import {
  describeGroupLink,
  groupPrefill,
  nextGroupSelection,
  resolveLinkedLoad,
} from "@/ui/workout/groupSelection";
import type { GroupsScheme } from "@/domain/schemes/setScheme";
import type { ActiveSessionSetDto, RecommendationDto } from "@/sync/types";

// set-groups-architecture-evaluation.md §11.4 — the card's pure
// selection/prefill-derivation rules, "unit-tested without React" (A-9).

const scheme: GroupsScheme = {
  type: "groups",
  groups: [
    { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
    { key: "backoff", label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
  ],
};

function makeSet(overrides: Partial<ActiveSessionSetDto>): ActiveSessionSetDto {
  return {
    id: `set-${Math.random()}`,
    setNumber: 1,
    isWarmup: false,
    weightKg: 100,
    reps: 5,
    rir: 2,
    distanceM: null,
    durationS: null,
    loggedAt: "2026-08-10T00:00:00.000Z",
    notes: null,
    groupKey: null,
    ...overrides,
  };
}

describe("nextGroupSelection", () => {
  it("mount rule — the first group in order whose recorded count is below its max", () => {
    expect(nextGroupSelection(scheme, [])).toBe("top");
  });

  it("advances to the next group once the current one reaches its max (auto-advance)", () => {
    const sets = [makeSet({ groupKey: "top" })];
    expect(nextGroupSelection(scheme, sets)).toBe("backoff");
  });

  it("stays on Back-off while it has not yet reached its max", () => {
    const sets = [makeSet({ groupKey: "top" }), makeSet({ groupKey: "backoff" })];
    expect(nextGroupSelection(scheme, sets)).toBe("backoff");
  });

  it("falls back to the LAST group once every group has reached its max", () => {
    const sets = [
      makeSet({ groupKey: "top" }),
      makeSet({ groupKey: "backoff" }),
      makeSet({ groupKey: "backoff" }),
      makeSet({ groupKey: "backoff" }),
    ];
    expect(nextGroupSelection(scheme, sets)).toBe("backoff");
  });

  it("warm-up sets never count toward a group's recorded count and never advance selection", () => {
    const sets = [makeSet({ groupKey: "top", isWarmup: true })];
    // Top still has 0 non-warm-up recorded sets, below its max of 1.
    expect(nextGroupSelection(scheme, sets)).toBe("top");
  });

  it("re-selects Top after a deliberately skipped top group and a reload (V-5) — no mis-attribution from Back-off's sets", () => {
    const sets = [makeSet({ groupKey: "backoff" }), makeSet({ groupKey: "backoff" })];
    // Top has 0 recorded sets (< max 1) — selection returns to Top, not
    // Back-off, even though Back-off is the group with actual activity.
    expect(nextGroupSelection(scheme, sets)).toBe("top");
  });
});

describe("groupPrefill", () => {
  const topGroup = scheme.groups[0]!;
  const backoffGroup = scheme.groups[1]!;

  it("derives from the last set logged IN THAT GROUP this session, when one exists", () => {
    const sets = [
      makeSet({ groupKey: "top", weightKg: 140, reps: 2 }),
      makeSet({ groupKey: "backoff", weightKg: 110, reps: 7 }),
      makeSet({ groupKey: "backoff", weightKg: 112.5, reps: 6 }),
    ];
    expect(groupPrefill(backoffGroup, sets, null, undefined)).toEqual({ loadKg: 112.5, reps: 6 });
  });

  it("never uses a sibling group's last set", () => {
    const sets = [makeSet({ groupKey: "top", weightKg: 140, reps: 2 })];
    // No back-off sets logged — must not fall back to Top's 140kg.
    const result = groupPrefill(backoffGroup, sets, null, undefined);
    expect(result.loadKg).not.toBe(140);
  });

  it("falls back to the pending recommendation's target when nothing is logged yet", () => {
    const rec: RecommendationDto = {
      id: "r1",
      exerciseId: "ex1",
      blockId: null,
      sourceSessionId: "s1",
      strategyId: "load-progression",
      strategyVersion: 1,
      classification: "heuristic",
      action: "increase_load",
      target: { loadKg: 142.5 },
      reasonCodes: [],
      confidence: "high",
      inputs: {} as never,
      computedBy: "server",
      createdAt: "2026-08-10T00:00:00.000Z",
      decision: { status: "pending", chosen: null, decidedAt: null, source: null },
      groupKey: "top",
    };
    expect(groupPrefill(topGroup, [], rec, undefined)).toEqual({ loadKg: 142.5, reps: null });
  });

  it("falls back to the accepted/modified decision's chosen values", () => {
    const rec: RecommendationDto = {
      id: "r1",
      exerciseId: "ex1",
      blockId: null,
      sourceSessionId: "s1",
      strategyId: "load-progression",
      strategyVersion: 1,
      classification: "heuristic",
      action: "increase_load",
      target: { loadKg: 142.5 },
      reasonCodes: [],
      confidence: "high",
      inputs: {} as never,
      computedBy: "server",
      createdAt: "2026-08-10T00:00:00.000Z",
      decision: {
        status: "modified",
        chosen: { loadKg: 145 },
        decidedAt: "2026-08-10T00:00:00.000Z",
        source: "explicit",
      },
      groupKey: "top",
    };
    expect(groupPrefill(topGroup, [], rec, undefined).loadKg).toBe(145);
  });

  it("falls back to groupPrefills[key] when there is no recommendation to consult", () => {
    const result = groupPrefill(topGroup, [], null, { top: { loadKg: 100, reps: 2 } });
    expect(result).toEqual({ loadKg: 100, reps: 2 });
  });

  it("returns empty when there is nothing to derive from at all", () => {
    expect(groupPrefill(topGroup, [], null, undefined)).toEqual({ loadKg: null, reps: null });
  });

  // L-3 (independent review) — defense in depth: a warm-up set should never
  // carry a `groupKey` at all (enforced at the client and server edit
  // paths), but this filter means even a stale/pre-fix row that somehow
  // still carries one can never leak a warm-up's load into "the last set
  // logged in this group" prefill chain.
  it("excludes a warm-up set even if it somehow still carries this group's key (defence in depth, §4.4 rule 1)", () => {
    const sets = [
      makeSet({ groupKey: "top", weightKg: 140, reps: 2 }),
      makeSet({ groupKey: "top", weightKg: 20, reps: 15, isWarmup: true }),
    ];
    // The last REAL entry is 140/2 — the warm-up's 20/15 must never surface.
    expect(groupPrefill(topGroup, sets, null, undefined)).toEqual({ loadKg: 140, reps: 2 });
  });
});

// Stage B (set-groups-architecture-evaluation.md §6) — the percentage-linked
// first-set proposal, and its "no reference work set yet" fallback.
describe("resolveLinkedLoad", () => {
  const link = { ref: "top", percent: 80 };

  it("returns null when the reference group has no logged non-warm-up set yet", () => {
    expect(resolveLinkedLoad(link, [], 2.5)).toEqual({ loadKg: null, referenceLoadKg: null });
  });

  it("uses the HIGHEST logged non-warm-up load attributed to the reference group, not the modal or last one", () => {
    const sets = [
      makeSet({ groupKey: "top", weightKg: 100 }),
      makeSet({ groupKey: "top", weightKg: 130 }),
      makeSet({ groupKey: "top", weightKg: 110 }),
    ];
    expect(resolveLinkedLoad(link, sets, 2.5).referenceLoadKg).toBe(130);
  });

  it("rounds per the worked example — 130 kg × 80% = 104 => 105 kg at a 2.5 kg step", () => {
    const sets = [makeSet({ groupKey: "top", weightKg: 130 })];
    expect(resolveLinkedLoad(link, sets, 2.5).loadKg).toBe(105);
  });

  it("never uses a sibling (non-reference) group's sets", () => {
    const sets = [makeSet({ groupKey: "backoff", weightKg: 999 })];
    expect(resolveLinkedLoad(link, sets, 2.5)).toEqual({ loadKg: null, referenceLoadKg: null });
  });

  it("excludes a warm-up set from the reference group even at a higher weight", () => {
    const sets = [
      makeSet({ groupKey: "top", weightKg: 100 }),
      makeSet({ groupKey: "top", weightKg: 150, isWarmup: true }),
    ];
    expect(resolveLinkedLoad(link, sets, 2.5).referenceLoadKg).toBe(100);
  });

  it("returns null for a group with no link at all", () => {
    expect(resolveLinkedLoad(undefined, [], 2.5)).toEqual({ loadKg: null, referenceLoadKg: null });
  });
});

describe("groupPrefill — Stage B linked-group first-set proposal", () => {
  const linkedBackoff = { ...scheme.groups[1]!, link: { ref: "top", percent: 80 } };

  it("proposes the resolved link value when nothing is logged in the linked group yet", () => {
    const sets = [makeSet({ groupKey: "top", weightKg: 130 })];
    const result = groupPrefill(linkedBackoff, sets, null, undefined, 2.5);
    expect(result.loadKg).toBe(105);
  });

  it("never consults a recommendation for a linked group even if one is somehow passed in", () => {
    const sets = [makeSet({ groupKey: "top", weightKg: 130 })];
    const rec: RecommendationDto = {
      id: "r1",
      exerciseId: "ex1",
      blockId: null,
      sourceSessionId: "s1",
      strategyId: "load-progression",
      strategyVersion: 1,
      classification: "heuristic",
      action: "increase_load",
      target: { loadKg: 999 },
      reasonCodes: [],
      confidence: "high",
      inputs: {} as never,
      computedBy: "server",
      createdAt: "2026-08-10T00:00:00.000Z",
      decision: { status: "pending", chosen: null, decidedAt: null, source: null },
      groupKey: "backoff",
    };
    const result = groupPrefill(linkedBackoff, sets, rec, undefined, 2.5);
    expect(result.loadKg).toBe(105);
  });

  it("falls back to the linked group's own carry-forward when the reference has no logged set yet", () => {
    const result = groupPrefill(linkedBackoff, [], null, { backoff: { loadKg: 90, reps: 7 } }, 2.5);
    expect(result).toEqual({ loadKg: 90, reps: 7 });
  });

  it("falls back to empty when the reference has no set AND there is no carry-forward/baseline", () => {
    const result = groupPrefill(linkedBackoff, [], null, undefined, 2.5);
    expect(result).toEqual({ loadKg: null, reps: null });
  });

  it("later sets copy the athlete's own previous logged load in the linked group, not the link's value", () => {
    const sets = [
      makeSet({ groupKey: "top", weightKg: 130 }),
      makeSet({ groupKey: "backoff", weightKg: 100, reps: 8 }),
    ];
    // The link would propose 105 kg; the athlete actually logged 100 kg for
    // their first back-off set — the SECOND set must copy 100, not re-derive.
    const result = groupPrefill(linkedBackoff, sets, null, undefined, 2.5);
    expect(result).toEqual({ loadKg: 100, reps: 8 });
  });

  it("reference edits (a higher set logged afterward) change the not-yet-logged proposal, never a logged fact", () => {
    const before = [makeSet({ groupKey: "top", weightKg: 100 })];
    expect(groupPrefill(linkedBackoff, before, null, undefined, 2.5).loadKg).toBe(80);
    const after = [...before, makeSet({ groupKey: "top", weightKg: 130 })];
    expect(groupPrefill(linkedBackoff, after, null, undefined, 2.5).loadKg).toBe(105);
  });
});

describe("describeGroupLink", () => {
  const scheme: GroupsScheme = {
    type: "groups",
    groups: [
      { key: "top", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
      {
        key: "backoff",
        label: "Back-off",
        sets: { min: 2, max: 3 },
        reps: { min: 6, max: 8 },
        link: { ref: "top", percent: 80 },
      },
    ],
  };
  const linkedGroup = scheme.groups[1]!;

  it("returns null for a group with no link", () => {
    expect(describeGroupLink(scheme.groups[0]!, scheme, [], 2.5)).toBeNull();
  });

  it("describes the missing-reference fallback visibly", () => {
    const description = describeGroupLink(linkedGroup, scheme, [], 2.5);
    expect(description).toMatchObject({
      refLabel: "Top",
      percent: 80,
      referenceLoadKg: null,
      proposedLoadKg: null,
    });
  });

  // Stage B remediation F-7 (set-groups-stage-b-review.md) — the
  // missing-reference fallback must report the ACTUAL value it resolves to
  // (or `null` when it resolves to nothing), so the caller can render an
  // accurate sentence instead of unconditionally claiming a carry-forward
  // that may not exist.
  describe("fallbackLoadKg (F-7)", () => {
    it("is null when the group has neither a carry-forward nor a baseline", () => {
      const description = describeGroupLink(linkedGroup, scheme, [], 2.5, undefined);
      expect(description?.fallbackLoadKg).toBeNull();
    });

    it("reports the resolved groupPrefills value when one exists", () => {
      const description = describeGroupLink(linkedGroup, scheme, [], 2.5, {
        backoff: { loadKg: 90, reps: 7 },
      });
      expect(description?.fallbackLoadKg).toBe(90);
    });

    it("is independent of whether the reference itself has a load — only reflects the group's OWN fallback", () => {
      const sets = [makeSet({ groupKey: "top", weightKg: 130 })];
      const description = describeGroupLink(linkedGroup, scheme, sets, 2.5, {
        backoff: { loadKg: 90, reps: 7 },
      });
      // The reference DOES have a load here, so `referenceLoadKg`/
      // `proposedLoadKg` are populated too — `fallbackLoadKg` still reports
      // the group's own prefill regardless, since it's a separate fact the
      // caller only reads in the missing-reference branch.
      expect(description).toMatchObject({ referenceLoadKg: 130, fallbackLoadKg: 90 });
    });
  });

  it("describes the live proposal once the reference has a logged set", () => {
    const sets = [makeSet({ groupKey: "top", weightKg: 130 })];
    const description = describeGroupLink(linkedGroup, scheme, sets, 2.5);
    expect(description).toMatchObject({
      refLabel: "Top",
      referenceLoadKg: 130,
      proposedLoadKg: 105,
      supersededByOwnLog: false,
    });
  });

  it("marks itself superseded once the linked group has its own logged set this session", () => {
    const sets = [
      makeSet({ groupKey: "top", weightKg: 130 }),
      makeSet({ groupKey: "backoff", weightKg: 100 }),
    ];
    const description = describeGroupLink(linkedGroup, scheme, sets, 2.5);
    expect(description?.supersededByOwnLog).toBe(true);
  });
});
