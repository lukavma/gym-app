import { describe, expect, it } from "vitest";
import { aggregateTrainingWeeks } from "@/domain/metrics/training";
import type { InstantWeekWindow } from "@/domain/volume/aggregate";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §4 (M-1, M-2, M-3), acceptance criteria A-1 (the future-session fixture),
// A-2 (the base fixtures) and A-6(a) (determinism / input-order invariance).

const W0: InstantWeekWindow = {
  startDate: "2026-08-31",
  endDateExclusive: "2026-09-07",
  startInstant: "2026-08-31T00:00:00.000Z",
  endInstant: "2026-09-07T00:00:00.000Z",
};
const W1: InstantWeekWindow = {
  startDate: "2026-08-24",
  endDateExclusive: "2026-08-31",
  startInstant: "2026-08-24T00:00:00.000Z",
  endInstant: "2026-08-31T00:00:00.000Z",
};
const FUTURE_GUARD = "2026-09-07T00:00:00.000Z"; // instant(D + 1)

describe("aggregateTrainingWeeks (M-1, M-2, M-3)", () => {
  it("a week with no sessions yields zeroed fields and is present, never omitted", () => {
    const result = aggregateTrainingWeeks([], [], [W0, W1], FUTURE_GUARD);
    expect(result).toEqual([
      {
        startDate: W0.startDate,
        endDateExclusive: W0.endDateExclusive,
        sessionsCompleted: 0,
        workSets: 0,
        isDeload: false,
      },
      {
        startDate: W1.startDate,
        endDateExclusive: W1.endDateExclusive,
        sessionsCompleted: 0,
        workSets: 0,
        isDeload: false,
      },
    ]);
  });

  it("a completed session with zero sets counts as 1 session / 0 work sets", () => {
    const result = aggregateTrainingWeeks(
      [{ sessionId: "s1", startedAt: "2026-09-01T10:00:00.000Z", isDeload: false }],
      [],
      [W0, W1],
      FUTURE_GUARD,
    );
    expect(result[0]).toMatchObject({ sessionsCompleted: 1, workSets: 0 });
  });

  it("receives {sessionId, isWarmup} rows unfiltered and drops isWarmup=true itself (the aggregateVolume precedent)", () => {
    const result = aggregateTrainingWeeks(
      [{ sessionId: "s1", startedAt: "2026-09-01T10:00:00.000Z", isDeload: false }],
      [
        { sessionId: "s1", isWarmup: true },
        { sessionId: "s1", isWarmup: false },
        { sessionId: "s1", isWarmup: false },
      ],
      [W0, W1],
      FUTURE_GUARD,
    );
    expect(result[0]).toMatchObject({ sessionsCompleted: 1, workSets: 2 });
  });

  it("a deload session flags the week (any(is_deload))", () => {
    const result = aggregateTrainingWeeks(
      [
        { sessionId: "s1", startedAt: "2026-09-01T10:00:00.000Z", isDeload: false },
        { sessionId: "s2", startedAt: "2026-09-02T10:00:00.000Z", isDeload: true },
      ],
      [],
      [W0, W1],
      FUTURE_GUARD,
    );
    expect(result[0]).toMatchObject({ sessionsCompleted: 2, isDeload: true });
    expect(result[1]).toMatchObject({ sessionsCompleted: 0, isDeload: false });
  });

  it("A-1 / I-6: a session at or after the future guard instant counts in neither training nor strength", () => {
    const withFuture = aggregateTrainingWeeks(
      [{ sessionId: "s1", startedAt: FUTURE_GUARD, isDeload: false }],
      [{ sessionId: "s1", isWarmup: false }],
      [W0, W1],
      FUTURE_GUARD,
    );
    expect(withFuture[0]).toMatchObject({ sessionsCompleted: 0, workSets: 0 });

    // NEGATIVE CONTROL: one millisecond earlier, the same session counts.
    const justBefore = aggregateTrainingWeeks(
      [{ sessionId: "s1", startedAt: "2026-09-06T23:59:59.999Z", isDeload: false }],
      [{ sessionId: "s1", isWarmup: false }],
      [W0, W1],
      FUTURE_GUARD,
    );
    expect(justBefore[0]).toMatchObject({ sessionsCompleted: 1, workSets: 1 });

    // A genuinely mid-week guard: D = Wednesday 2026-09-02 (guard =
    // 2026-09-03T00:00:00.000Z), a "future" session on Friday 2026-09-04 —
    // still comfortably WITHIN W0's own [start, end) instant bounds, so
    // only the guard (not the window boundary) can be excluding it. This is
    // the scenario the window-boundary-only fixture above cannot
    // distinguish from a disabled guard.
    const midWeekGuard = "2026-09-03T00:00:00.000Z";
    const midWeekFuture = aggregateTrainingWeeks(
      [{ sessionId: "s1", startedAt: "2026-09-04T10:00:00.000Z", isDeload: false }],
      [{ sessionId: "s1", isWarmup: false }],
      [W0, W1],
      midWeekGuard,
    );
    expect(midWeekFuture[0]).toMatchObject({ sessionsCompleted: 0, workSets: 0 });
  });

  it("A-6(a): shuffling the input session and set rows yields a byte-identical result", () => {
    const sessions = [
      { sessionId: "s1", startedAt: "2026-09-01T10:00:00.000Z", isDeload: false },
      { sessionId: "s2", startedAt: "2026-09-03T10:00:00.000Z", isDeload: true },
      { sessionId: "s3", startedAt: "2026-08-25T10:00:00.000Z", isDeload: false },
    ];
    const setRows = [
      { sessionId: "s1", isWarmup: false },
      { sessionId: "s1", isWarmup: true },
      { sessionId: "s2", isWarmup: false },
      { sessionId: "s3", isWarmup: false },
      { sessionId: "s3", isWarmup: false },
    ];
    const forward = aggregateTrainingWeeks(sessions, setRows, [W0, W1], FUTURE_GUARD);
    const shuffled = aggregateTrainingWeeks(
      [...sessions].reverse(),
      [...setRows].reverse(),
      [W0, W1],
      FUTURE_GUARD,
    );
    expect(shuffled).toEqual(forward);
  });
});
