import { describe, expect, it } from "vitest";
import { evaluateThrottle, nextStateAfterFailure } from "@/server/auth/throttle";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("evaluateThrottle", () => {
  it("is not locked when there is no prior state", () => {
    expect(evaluateThrottle(undefined, NOW)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it("is not locked when lockedUntil is unset", () => {
    const state = { failureCount: 2, windowStartedAt: NOW, lockedUntil: null };
    expect(evaluateThrottle(state, NOW)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it("is locked when lockedUntil is in the future", () => {
    const lockedUntil = new Date(NOW.getTime() + 60_000);
    const state = { failureCount: 5, windowStartedAt: NOW, lockedUntil };
    const decision = evaluateThrottle(state, NOW);
    expect(decision.locked).toBe(true);
    expect(decision.retryAfterMs).toBe(60_000);
  });

  it("is not locked once lockedUntil has passed", () => {
    const lockedUntil = new Date(NOW.getTime() - 1);
    const state = { failureCount: 5, windowStartedAt: NOW, lockedUntil };
    expect(evaluateThrottle(state, NOW)).toEqual({ locked: false, retryAfterMs: 0 });
  });
});

describe("nextStateAfterFailure", () => {
  it("starts a fresh window at failure count 1 with no prior state", () => {
    const next = nextStateAfterFailure(undefined, NOW);
    expect(next.failureCount).toBe(1);
    expect(next.windowStartedAt).toEqual(NOW);
    expect(next.lockedUntil).toBeNull();
  });

  it("increments the failure count within the same window", () => {
    const prior = { failureCount: 2, windowStartedAt: NOW, lockedUntil: null };
    const later = new Date(NOW.getTime() + 60_000);
    const next = nextStateAfterFailure(prior, later);
    expect(next.failureCount).toBe(3);
    expect(next.windowStartedAt).toEqual(NOW);
  });

  it("resets the window after it has expired", () => {
    const prior = { failureCount: 4, windowStartedAt: NOW, lockedUntil: null };
    const later = new Date(NOW.getTime() + 16 * 60 * 1000);
    const next = nextStateAfterFailure(prior, later);
    expect(next.failureCount).toBe(1);
    expect(next.windowStartedAt).toEqual(later);
  });

  it("locks out once the failure cap is reached, with base backoff", () => {
    const prior = { failureCount: 4, windowStartedAt: NOW, lockedUntil: null };
    const next = nextStateAfterFailure(prior, NOW);
    expect(next.failureCount).toBe(5);
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it("increases backoff exponentially for repeated failures once locked", () => {
    // 6th failure -> 2nd failure past the cap -> backoff doubles.
    const prior = {
      failureCount: 5,
      windowStartedAt: NOW,
      lockedUntil: new Date(NOW.getTime() + 60_000),
    };
    const next = nextStateAfterFailure(prior, NOW);
    expect(next.failureCount).toBe(6);
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + 120_000));
  });

  it("caps backoff at one hour", () => {
    const prior = {
      failureCount: 20,
      windowStartedAt: NOW,
      lockedUntil: new Date(NOW.getTime() + 1),
    };
    const next = nextStateAfterFailure(prior, NOW);
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + 60 * 60 * 1000));
  });
});
