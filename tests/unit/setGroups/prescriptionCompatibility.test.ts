import { describe, expect, it } from "vitest";
import { checkPrescriptionCompatibility } from "@/domain/prescriptions/schema";
import type { GroupsScheme } from "@/domain/schemes/setScheme";

// set-groups-architecture-evaluation.md §5.3 L-3 — per-group compatibility
// rules: repCap forbidden at slot level for a `groups` scheme, required per
// fixed-rep group under rep-progression, and profile/strategy compatibility
// checked per group (not just once for the slot).

const topFixed: GroupsScheme["groups"][number] = {
  key: "top",
  label: "Top",
  sets: { min: 1, max: 1 },
  reps: { min: 2, max: 2 },
};
const backoffRanged: GroupsScheme["groups"][number] = {
  key: "q9m4",
  label: "Back-off",
  sets: { min: 2, max: 3 },
  reps: { min: 6, max: 8 },
};
const groupsScheme: GroupsScheme = { type: "groups", groups: [topFixed, backoffRanged] };

describe("checkPrescriptionCompatibility — groups scheme", () => {
  it("accepts load-progression with no per-group config at all", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      { strategyId: "load-progression", config: {} },
      "load_reps",
    );
    expect(issues).toEqual([]);
  });

  it("rejects a slot-level repCap on a groups scheme (forbidden — a single cap can't fit two different reps.max)", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      { strategyId: "rep-progression", config: { repCap: 12 } },
      "load_reps",
    );
    expect(issues.some((i) => i.includes("not allowed in slot-level config"))).toBe(true);
  });

  it("requires a per-group repCap for a fixed-rep group under rep-progression (F-23 closed)", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      { strategyId: "rep-progression", config: {} },
      "load_reps",
    );
    // Top projects to `fixed` (reps.min === reps.max) — rep-progression on a
    // fixed-rep group requires its own repCap; Back-off projects to
    // `repRange` and infers its cap from reps.max, so it needs no override.
    expect(issues.some((i) => i.includes('"Top"'))).toBe(true);
    expect(issues.some((i) => i.includes('"Back-off"'))).toBe(false);
  });

  it("a per-group repCap override satisfies the fixed-rep group's requirement", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      {
        strategyId: "rep-progression",
        config: {},
        groups: { top: { strategyId: "rep-progression", config: { repCap: 4 } } },
      },
      "load_reps",
    );
    expect(issues.some((i) => i.includes('"Top"'))).toBe(false);
  });

  it("a per-group manual override needs no repCap even under a rep-progression slot default", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      {
        strategyId: "rep-progression",
        config: {},
        groups: { top: { strategyId: "manual", config: {} } },
      },
      "load_reps",
    );
    expect(issues.some((i) => i.includes('"Top"'))).toBe(false);
  });

  it("flags a progression.groups entry that references an unknown group key", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      {
        strategyId: "load-progression",
        config: {},
        groups: { "not-a-real-key": { strategyId: "load-progression", config: {} } },
      },
      "load_reps",
    );
    expect(issues.some((i) => i.includes("unknown group key"))).toBe(true);
  });

  it("rejects a groups scheme entirely for a profile that does not support it (e.g. reps)", () => {
    const issues = checkPrescriptionCompatibility(
      groupsScheme,
      { strategyId: "manual", config: {} },
      "reps",
    );
    expect(issues.some((i) => i.includes("does not support groups"))).toBe(true);
  });

  it("rejects progression.groups on a non-groups scheme", () => {
    const issues = checkPrescriptionCompatibility(
      { type: "fixed", sets: 3, reps: 5 },
      {
        strategyId: "load-progression",
        config: {},
        groups: { top: { strategyId: "load-progression", config: {} } },
      },
      "load_reps",
    );
    expect(issues.some((i) => i.includes("only valid for groups schemes"))).toBe(true);
  });
});

describe("checkPrescriptionCompatibility — Stage B rule L-1 (a linked group must be manual)", () => {
  const backoffLinked: GroupsScheme["groups"][number] = {
    ...backoffRanged,
    link: { ref: "top", percent: 80 },
  };
  const linkedScheme: GroupsScheme = { type: "groups", groups: [topFixed, backoffLinked] };

  it("rejects a linked group whose effective strategy is load-progression (the slot default)", () => {
    const issues = checkPrescriptionCompatibility(
      linkedScheme,
      { strategyId: "load-progression", config: {} },
      "load_reps",
    );
    expect(
      issues.some((i) => i.includes("percent-linked group cannot use") && i.includes('"Back-off"')),
    ).toBe(true);
  });

  it("rejects a linked group whose effective strategy is rep-progression via an explicit per-group override", () => {
    const issues = checkPrescriptionCompatibility(
      linkedScheme,
      {
        strategyId: "manual",
        config: {},
        groups: { q9m4: { strategyId: "rep-progression", config: { repCap: 12 } } },
      },
      "load_reps",
    );
    expect(issues.some((i) => i.includes("percent-linked group cannot use"))).toBe(true);
  });

  it("accepts a linked group whose effective strategy is manual (the slot default)", () => {
    const issues = checkPrescriptionCompatibility(
      linkedScheme,
      { strategyId: "manual", config: {} },
      "load_reps",
    );
    expect(issues.some((i) => i.includes("percent-linked group cannot use"))).toBe(false);
  });

  it("accepts a linked group explicitly overridden to manual under a non-manual slot default", () => {
    const issues = checkPrescriptionCompatibility(
      linkedScheme,
      {
        strategyId: "load-progression",
        config: {},
        groups: { q9m4: { strategyId: "manual", config: {} } },
      },
      "load_reps",
    );
    expect(issues.some((i) => i.includes("percent-linked group cannot use"))).toBe(false);
  });

  it("an unlinked sibling group in the same scheme is unaffected by the linked group's manual requirement", () => {
    const issues = checkPrescriptionCompatibility(
      linkedScheme,
      { strategyId: "load-progression", config: {} },
      "load_reps",
    );
    expect(issues.some((i) => i.includes('"Top"'))).toBe(false);
  });
});
