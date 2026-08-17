import { describe, expect, it } from "vitest";
import {
  resolveCarryForwardLoadKg,
  type CarryForwardCandidate,
} from "@/domain/progression/carryForward";

function candidate(overrides: Partial<CarryForwardCandidate> = {}): CarryForwardCandidate {
  return {
    status: "completed",
    isDeload: false,
    startedAt: "2026-01-01T09:00:00.000Z",
    firstWorkSetLoadKg: 60,
    ...overrides,
  };
}

describe("resolveCarryForwardLoadKg", () => {
  it("returns null when there are no candidates and no baseline", () => {
    expect(resolveCarryForwardLoadKg([], null)).toBeNull();
  });

  it("falls back to baselineLoadKg when there are no eligible candidates", () => {
    expect(resolveCarryForwardLoadKg([], 42.5)).toBe(42.5);
  });

  it("uses the most recent completed non-deload session's first work-set load", () => {
    const candidates = [
      candidate({ startedAt: "2026-01-01T09:00:00.000Z", firstWorkSetLoadKg: 60 }),
      candidate({ startedAt: "2026-01-08T09:00:00.000Z", firstWorkSetLoadKg: 62.5 }),
      candidate({ startedAt: "2026-01-15T09:00:00.000Z", firstWorkSetLoadKg: 65 }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 40)).toBe(65);
  });

  it("ignores candidate order in the input array and sorts by recency itself", () => {
    const candidates = [
      candidate({ startedAt: "2026-01-15T09:00:00.000Z", firstWorkSetLoadKg: 65 }),
      candidate({ startedAt: "2026-01-01T09:00:00.000Z", firstWorkSetLoadKg: 60 }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 40)).toBe(65);
  });

  it("skips discarded sessions", () => {
    const candidates = [
      candidate({ startedAt: "2026-01-01T09:00:00.000Z", firstWorkSetLoadKg: 60 }),
      candidate({
        startedAt: "2026-01-15T09:00:00.000Z",
        status: "discarded",
        firstWorkSetLoadKg: 999,
      }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 40)).toBe(60);
  });

  it("skips in-progress sessions", () => {
    const candidates = [
      candidate({ startedAt: "2026-01-01T09:00:00.000Z", firstWorkSetLoadKg: 60 }),
      candidate({
        startedAt: "2026-01-15T09:00:00.000Z",
        status: "in_progress",
        firstWorkSetLoadKg: 999,
      }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 40)).toBe(60);
  });

  it("skips deload sessions even if more recent", () => {
    const candidates = [
      candidate({ startedAt: "2026-01-01T09:00:00.000Z", firstWorkSetLoadKg: 60 }),
      candidate({ startedAt: "2026-01-15T09:00:00.000Z", isDeload: true, firstWorkSetLoadKg: 40 }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 999)).toBe(60);
  });

  it("skips a completed non-deload session with no logged work set", () => {
    const candidates = [
      candidate({ startedAt: "2026-01-01T09:00:00.000Z", firstWorkSetLoadKg: 60 }),
      candidate({ startedAt: "2026-01-15T09:00:00.000Z", firstWorkSetLoadKg: null }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 40)).toBe(60);
  });

  it("falls back to baselineLoadKg when every candidate is ineligible", () => {
    const candidates = [
      candidate({ status: "discarded" }),
      candidate({ isDeload: true }),
      candidate({ firstWorkSetLoadKg: null }),
    ];
    expect(resolveCarryForwardLoadKg(candidates, 50)).toBe(50);
  });

  it("returns null when every candidate is ineligible and there is no baseline", () => {
    const candidates = [candidate({ status: "discarded" })];
    expect(resolveCarryForwardLoadKg(candidates, null)).toBeNull();
  });

  it("prefers history over baseline even when the baseline is higher", () => {
    const candidates = [candidate({ firstWorkSetLoadKg: 20 })];
    expect(resolveCarryForwardLoadKg(candidates, 100)).toBe(20);
  });
});
