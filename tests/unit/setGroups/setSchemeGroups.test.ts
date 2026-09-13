import { describe, expect, it } from "vitest";
import {
  assignGroupKeys,
  formatScheme,
  projectGroup,
  setSchemeAuthoringSchema,
  setSchemeSchema,
  type GroupsScheme,
} from "@/domain/schemes/setScheme";

// set-groups-architecture-evaluation.md §4.2/A-1/A-2 — the additive `groups`
// scheme variant: shape validation, stable-key generation, projection to the
// existing fixed/repRange strategies' input shape, and display formatting.

const validGroup = (overrides: Partial<Record<string, unknown>> = {}) => ({
  key: "g7k2",
  label: "Top",
  sets: { min: 1, max: 1 },
  reps: { min: 2, max: 2 },
  ...overrides,
});

describe("setSchemeSchema — groups variant", () => {
  it("accepts a minimal single-group scheme", () => {
    const result = setSchemeSchema.safeParse({ type: "groups", groups: [validGroup()] });
    expect(result.success).toBe(true);
  });

  it("accepts up to 4 groups", () => {
    const groups = ["a1", "a2", "a3", "a4"].map((key) => validGroup({ key, label: key }));
    const result = setSchemeSchema.safeParse({ type: "groups", groups });
    expect(result.success).toBe(true);
  });

  it("rejects more than 4 groups", () => {
    const groups = ["a1", "a2", "a3", "a4", "a5"].map((key) => validGroup({ key, label: key }));
    const result = setSchemeSchema.safeParse({ type: "groups", groups });
    expect(result.success).toBe(false);
  });

  it("rejects zero groups", () => {
    const result = setSchemeSchema.safeParse({ type: "groups", groups: [] });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate group keys", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ key: "g1" }), validGroup({ key: "g1", label: "Back-off" })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a sum of group set-count maximums above 20", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "g1", sets: { min: 10, max: 15 } }),
        validGroup({ key: "g2", label: "Back-off", sets: { min: 5, max: 10 } }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a sum of group set-count maximums exactly at 20", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "g1", sets: { min: 10, max: 10 } }),
        validGroup({ key: "g2", label: "Back-off", sets: { min: 10, max: 10 } }),
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a group's sets.min > sets.max", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ sets: { min: 3, max: 2 } })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a group's rep range span above 30", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ reps: { min: 1, max: 40 } })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty label", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ label: "   " })],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional per-group targetRir and baselineLoadKg", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ targetRir: { min: 2, max: 3 }, baselineLoadKg: 140 })],
    });
    expect(result.success).toBe(true);
  });

  it("a single-group scheme is allowed (the '2-3 x 5 on an ordinary slot' case)", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ sets: { min: 2, max: 3 }, reps: { min: 5, max: 5 } })],
    });
    expect(result.success).toBe(true);
  });
});

describe("formatScheme — groups variant (A-2)", () => {
  it('renders "Top 1 × 2 · Back-off 2–3 × 6–8"', () => {
    const scheme: GroupsScheme = {
      type: "groups",
      groups: [
        { key: "g1", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        { key: "g2", label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
      ],
    };
    expect(formatScheme(scheme)).toBe("Top 1 × 2 · Back-off 2–3 × 6–8");
  });

  it("renders a fixed-count group without a range dash", () => {
    const scheme: GroupsScheme = {
      type: "groups",
      groups: [{ key: "g1", label: "Work", sets: { min: 3, max: 3 }, reps: { min: 5, max: 5 } }],
    };
    expect(formatScheme(scheme)).toBe("Work 3 × 5");
  });

  // M-6 (independent review) — evaluation §11.2's own worked example:
  // "Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3". Each group's OWN
  // effective RIR band renders inline; there is no single slot-level band
  // appended after the whole joined line (that was M-6's own bug).
  it("renders each group's OWN effective RIR band inline — a group override wins over the slot band", () => {
    const scheme: GroupsScheme = {
      type: "groups",
      groups: [
        {
          key: "g1",
          label: "Top",
          sets: { min: 1, max: 1 },
          reps: { min: 2, max: 2 },
          targetRir: { min: 2, max: 2 },
        },
        {
          key: "g2",
          label: "Back-off",
          sets: { min: 2, max: 3 },
          reps: { min: 6, max: 8 },
          targetRir: { min: 2, max: 3 },
        },
      ],
    };
    expect(formatScheme(scheme, { min: 1, max: 3 })).toBe(
      "Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3",
    );
  });

  it("falls back to the slot's band for a group with no override of its own", () => {
    const scheme: GroupsScheme = {
      type: "groups",
      groups: [{ key: "g1", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } }],
    };
    expect(formatScheme(scheme, { min: 1, max: 3 })).toBe("Top 1 × 2 @ RIR 1–3");
  });

  it("renders no RIR clause at all when neither the group nor the slot has a band", () => {
    const scheme: GroupsScheme = {
      type: "groups",
      groups: [{ key: "g1", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } }],
    };
    expect(formatScheme(scheme, null)).toBe("Top 1 × 2");
    expect(formatScheme(scheme)).toBe("Top 1 × 2");
  });

  it("is byte-identical for every non-groups scheme regardless of the new second argument — the parameter is groups-only", () => {
    expect(formatScheme({ type: "fixed", sets: 3, reps: 5 }, { min: 1, max: 2 })).toBe("3 × 5");
    expect(
      formatScheme({ type: "repRange", sets: 3, minReps: 8, maxReps: 12 }, { min: 1, max: 2 }),
    ).toBe("3 × 8–12");
  });
});

describe("projectGroup — §5.4 projection to existing strategy input shapes", () => {
  it("projects a fixed-rep group (reps.min === reps.max) to a fixed scheme", () => {
    const projected = projectGroup({
      key: "g1",
      label: "Top",
      sets: { min: 1, max: 2 },
      reps: { min: 2, max: 2 },
    });
    expect(projected).toEqual({ type: "fixed", sets: 1, reps: 2 });
  });

  it("projects a ranged group to a repRange scheme", () => {
    const projected = projectGroup({
      key: "g2",
      label: "Back-off",
      sets: { min: 2, max: 3 },
      reps: { min: 6, max: 8 },
    });
    expect(projected).toEqual({ type: "repRange", sets: 2, minReps: 6, maxReps: 8 });
  });

  it("always projects sets = the group's sets.min, never sets.max (§4.2 — max has no evaluation meaning)", () => {
    const projected = projectGroup({
      key: "g3",
      label: "Back-off",
      sets: { min: 2, max: 20 },
      reps: { min: 6, max: 8 },
    });
    expect(projected).toMatchObject({ sets: 2 });
  });
});

describe("setSchemeSchema — Stage B `link` invariants (stored shape)", () => {
  it("accepts a group linked to an earlier, unlinked group", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "backoff", label: "Back-off", link: { ref: "top", percent: 80 } }),
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a self-reference", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [validGroup({ key: "top", link: { ref: "top", percent: 80 } })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a forward reference (linking to a LATER group)", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top", link: { ref: "backoff", percent: 80 } }),
        validGroup({ key: "backoff", label: "Back-off" }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown reference key", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "backoff", label: "Back-off", link: { ref: "nope", percent: 80 } }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a chain — linking to a group that is itself linked", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "backoff", label: "Back-off", link: { ref: "top", percent: 80 } }),
        validGroup({ key: "backoff2", label: "Back-off 2", link: { ref: "backoff", percent: 80 } }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer percent", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "backoff", label: "Back-off", link: { ref: "top", percent: 80.5 } }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a percent below 10 or above 100", () => {
    for (const percent of [0, 9, 101, 150]) {
      const result = setSchemeSchema.safeParse({
        type: "groups",
        groups: [
          validGroup({ key: "top", label: "Top" }),
          validGroup({ key: "backoff", label: "Back-off", link: { ref: "top", percent } }),
        ],
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts percent at the 10 and 100 boundaries", () => {
    for (const percent of [10, 100]) {
      const result = setSchemeSchema.safeParse({
        type: "groups",
        groups: [
          validGroup({ key: "top", label: "Top" }),
          validGroup({ key: "backoff", label: "Back-off", link: { ref: "top", percent } }),
        ],
      });
      expect(result.success).toBe(true);
    }
  });

  it("a three-group chain where the LAST group links to the FIRST (skipping the middle) is valid — one hop, not necessarily adjacent", () => {
    const result = setSchemeSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "mid", label: "Mid" }),
        validGroup({ key: "last", label: "Last", link: { ref: "top", percent: 80 } }),
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("setSchemeAuthoringSchema — Stage B `link` invariants (authoring shape)", () => {
  it("accepts a link addressed by an existing group's real key", () => {
    const result = setSchemeAuthoringSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "backoff", label: "Back-off", link: { ref: "top", percent: 80 } }),
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a link addressed by refIndex to a brand-new (keyless) reference group, in the same save", () => {
    const result = setSchemeAuthoringSchema.safeParse({
      type: "groups",
      groups: [
        { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        {
          label: "Back-off",
          sets: { min: 2, max: 3 },
          reps: { min: 6, max: 8 },
          link: { refIndex: 0, percent: 80 },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a link with both ref and refIndex set", () => {
    const result = setSchemeAuthoringSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({
          key: "backoff",
          label: "Back-off",
          link: { ref: "top", refIndex: 0, percent: 80 },
        }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a link with neither ref nor refIndex set", () => {
    const result = setSchemeAuthoringSchema.safeParse({
      type: "groups",
      groups: [
        validGroup({ key: "top", label: "Top" }),
        validGroup({ key: "backoff", label: "Back-off", link: { percent: 80 } }),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects refIndex pointing at itself or later", () => {
    const result = setSchemeAuthoringSchema.safeParse({
      type: "groups",
      groups: [
        { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        {
          label: "Back-off",
          sets: { min: 2, max: 3 },
          reps: { min: 6, max: 8 },
          link: { refIndex: 1, percent: 80 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects refIndex chaining to an already-linked group", () => {
    const result = setSchemeAuthoringSchema.safeParse({
      type: "groups",
      groups: [
        { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        {
          label: "Back-off",
          sets: { min: 2, max: 3 },
          reps: { min: 6, max: 8 },
          link: { refIndex: 0, percent: 80 },
        },
        {
          label: "Back-off 2",
          sets: { min: 2, max: 3 },
          reps: { min: 6, max: 8 },
          link: { refIndex: 1, percent: 50 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("assignGroupKeys — Stage B link resolution", () => {
  it("resolves refIndex onto the newly-assigned real key of a brand-new reference group (one-save authoring)", () => {
    const authoring = setSchemeAuthoringSchema.parse({
      type: "groups",
      groups: [
        { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        {
          label: "Back-off",
          sets: { min: 2, max: 3 },
          reps: { min: 6, max: 8 },
          link: { refIndex: 0, percent: 80 },
        },
      ],
    });
    let counter = 0;
    const scheme = assignGroupKeys(authoring, () => `k${counter++}`);
    if (scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(scheme.groups[0]!.key).toBe("k0");
    expect(scheme.groups[1]!.link).toEqual({ ref: "k0", percent: 80 });
  });

  it("passes an existing-key `ref` link through unchanged for a retained group", () => {
    const authoring = setSchemeAuthoringSchema.parse({
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
    });
    const scheme = assignGroupKeys(authoring, () => "should-not-be-used");
    if (scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(scheme.groups[1]!.link).toEqual({ ref: "top", percent: 80 });
  });

  it("a group with no link at all has no `link` key after resolution", () => {
    const authoring = setSchemeAuthoringSchema.parse({
      type: "groups",
      groups: [{ label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } }],
    });
    const scheme = assignGroupKeys(authoring, () => "k0");
    if (scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(scheme.groups[0]).not.toHaveProperty("link");
  });
});

describe("assignGroupKeys — §4.2 manifest item 18, key generation", () => {
  it("assigns a key to a brand-new group that omitted one", () => {
    const authoring = setSchemeAuthoringSchema.parse({
      type: "groups",
      groups: [{ label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } }],
    });
    const scheme = assignGroupKeys(authoring, () => "generated-key");
    if (scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(scheme.groups[0]!.key).toBe("generated-key");
  });

  it("preserves an existing key verbatim — never re-derives it", () => {
    const authoring = setSchemeAuthoringSchema.parse({
      type: "groups",
      groups: [
        { key: "already-set", label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
      ],
    });
    const scheme = assignGroupKeys(authoring, () => "should-not-be-used");
    if (scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(scheme.groups[0]!.key).toBe("already-set");
  });

  it("assigns distinct generated keys to multiple new groups in one call", () => {
    let counter = 0;
    const authoring = setSchemeAuthoringSchema.parse({
      type: "groups",
      groups: [
        { label: "Top", sets: { min: 1, max: 1 }, reps: { min: 2, max: 2 } },
        { label: "Back-off", sets: { min: 2, max: 3 }, reps: { min: 6, max: 8 } },
      ],
    });
    const scheme = assignGroupKeys(authoring, () => `k${counter++}`);
    if (scheme.type !== "groups") throw new Error("expected groups scheme");
    expect(scheme.groups.map((g) => g.key)).toEqual(["k0", "k1"]);
  });

  it("passes a non-groups scheme through unchanged", () => {
    const authoring = setSchemeAuthoringSchema.parse({ type: "fixed", sets: 3, reps: 5 });
    expect(assignGroupKeys(authoring)).toEqual({ type: "fixed", sets: 3, reps: 5 });
  });
});
