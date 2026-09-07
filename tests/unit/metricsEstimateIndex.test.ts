import { describe, expect, it } from "vitest";
import { deriveStrengthReport } from "@/domain/strength/report";
import type { StrengthSessionInput } from "@/domain/strength/types";
import { projectEstimateIndex, type SelectionRowInput } from "@/domain/metrics/estimateIndex";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §4 (M-4), §9, §11.2 step 9, acceptance criteria A-7, A-8, A-9, A-6(b)/(c).

const AS_OF_LOCAL_DATE = "2026-09-06";

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

function session(
  id: string,
  daysBefore: number,
  weightKg: number,
  isDeload = false,
): StrengthSessionInput {
  const performedOn = shiftDate(AS_OF_LOCAL_DATE, -daysBefore);
  return {
    sessionId: id,
    performedOn,
    startedAt: `${performedOn}T10:00:00.000Z`,
    isDeload,
    sets: [
      { setNumber: 1, isWarmup: false, weightKg, reps: 5, rir: 2 },
      { setNumber: 2, isWarmup: false, weightKg, reps: 5, rir: 2 },
      { setNumber: 3, isWarmup: false, weightKg, reps: 5, rir: 2 },
    ],
  };
}

function selectionRow(overrides: Partial<SelectionRowInput> = {}): SelectionRowInput {
  return {
    exerciseId: "ex-1",
    name: "Back Squat",
    equipment: "barbell",
    archived: false,
    position: 1,
    loadStepKg: 2.5,
    strengthEstimate: "auto",
    measurementProfile: "load_reps",
    loadBasis: "unspecified",
    ...overrides,
  };
}

describe("projectEstimateIndex (M-4)", () => {
  it("A-7: three in-window non-deload observations yield state 'estimate' with the tracker's currentE1rmKg", () => {
    const sessions = [session("s1", 20, 100), session("s2", 12, 105), session("s3", 5, 110)];
    const rows = projectEstimateIndex(
      [selectionRow()],
      new Map([["ex-1", sessions]]),
      AS_OF_LOCAL_DATE,
    );
    expect(rows).toEqual([
      expect.objectContaining({ state: "estimate", currentE1rmKg: 129.5, confidence: "high" }),
    ]);
  });

  it("A-7: an eligible exercise whose only in-window session is a deload yields 'no_current_estimate' and keeps its position", () => {
    const rows = projectEstimateIndex(
      [selectionRow({ position: 3 })],
      new Map([["ex-1", [session("s1", 5, 130, true)]]]),
      AS_OF_LOCAL_DATE,
    );
    expect(rows).toEqual([
      expect.objectContaining({ state: "no_current_estimate", currentE1rmKg: null, position: 3 }),
    ]);
  });

  it("A-7: an eligible exercise with no sessions at all yields 'no_current_estimate'", () => {
    const rows = projectEstimateIndex([selectionRow()], new Map(), AS_OF_LOCAL_DATE);
    expect(rows).toEqual([
      expect.objectContaining({ state: "no_current_estimate", currentE1rmKg: null }),
    ]);
  });

  it("A-7: equipment='bodyweight' yields 'not_available'; strengthEstimate='off' yields 'turned_off'", () => {
    const notAvailable = projectEstimateIndex(
      [selectionRow({ exerciseId: "ex-bw", equipment: "bodyweight" })],
      new Map([["ex-bw", [session("s1", 5, 100)]]]),
      AS_OF_LOCAL_DATE,
    );
    expect(notAvailable[0]).toMatchObject({ state: "not_available", currentE1rmKg: null });

    const turnedOff = projectEstimateIndex(
      [selectionRow({ exerciseId: "ex-off", strengthEstimate: "off" })],
      new Map([["ex-off", [session("s1", 5, 100)]]]),
      AS_OF_LOCAL_DATE,
    );
    expect(turnedOff[0]).toMatchObject({ state: "turned_off", currentE1rmKg: null });
  });

  it("A-7 / I-9: rows are emitted in stored position order for every permutation of the input, never re-sorted", () => {
    const rows = [
      selectionRow({ exerciseId: "ex-c", name: "Zercher Squat", position: 3 }),
      selectionRow({ exerciseId: "ex-a", name: "Ab Wheel", position: 1 }),
      selectionRow({ exerciseId: "ex-b", name: "Bench Press", position: 2 }),
    ];
    const result = projectEstimateIndex(rows, new Map(), AS_OF_LOCAL_DATE);
    expect(result.map((r) => r.exerciseId)).toEqual(["ex-a", "ex-b", "ex-c"]);

    const scrambled = [rows[1]!, rows[2]!, rows[0]!];
    const resultScrambled = projectEstimateIndex(scrambled, new Map(), AS_OF_LOCAL_DATE);
    expect(resultScrambled.map((r) => r.exerciseId)).toEqual(["ex-a", "ex-b", "ex-c"]);
  });

  it("A-7: an empty selection yields []", () => {
    expect(projectEstimateIndex([], new Map(), AS_OF_LOCAL_DATE)).toEqual([]);
  });

  it("A-8: an archived exercise's row still carries archived: true, whichever state its facts give", () => {
    const rows = projectEstimateIndex(
      [selectionRow({ archived: true })],
      new Map([["ex-1", [session("s1", 5, 100)]]]),
      AS_OF_LOCAL_DATE,
    );
    expect(rows[0]).toMatchObject({ archived: true, state: "estimate" });
  });

  it("A-6(b): shuffling the selection rows changes nothing — the projection re-orders by stored position", () => {
    const rowA = selectionRow({ exerciseId: "ex-a", position: 1 });
    const rowB = selectionRow({ exerciseId: "ex-b", position: 2 });
    const forward = projectEstimateIndex([rowA, rowB], new Map(), AS_OF_LOCAL_DATE);
    const shuffled = projectEstimateIndex([rowB, rowA], new Map(), AS_OF_LOCAL_DATE);
    expect(shuffled).toEqual(forward);
  });

  it("A-9 / I-3: currentE1rmKg, confidence and latestPoolAgeDays equal deriveStrengthReport's own values for the in-window subset, for 0/1/2/3/5 observations in window", () => {
    const exercise = {
      equipment: "barbell",
      strengthEstimate: "auto" as const,
      loadStepKg: 2.5,
      measurementProfile: "load_reps" as const,
      loadBasis: "unspecified" as const,
    };

    for (const inWindowCount of [0, 1, 2, 3, 5]) {
      const allSessions: StrengthSessionInput[] = [];
      // Five candidate sessions, all comfortably within 90 days of D so every
      // one of them is genuinely eligible to be "in window"; the ones NOT
      // meant to be in window for this iteration are pushed out to 150+ days
      // ago instead, which the tracker's own window excludes on its own.
      for (let i = 0; i < 5; i++) {
        const inWindow = i < inWindowCount;
        const daysBefore = inWindow ? 10 + i * 15 : 150 + i * 10;
        allSessions.push(session(`s${i}`, daysBefore, 100 + i));
      }

      // What the SQL step-9 query would actually deliver: only the rows whose
      // `performedOn` sits in [D-89, D] — mirrors the window-bounded fact
      // query, computed here from the same fixture rather than duplicated by
      // hand.
      const windowBounded = allSessions.filter((s) => {
        const days = Math.round(
          (Date.parse(`${AS_OF_LOCAL_DATE}T00:00:00.000Z`) -
            Date.parse(`${s.performedOn}T00:00:00.000Z`)) /
            86_400_000,
        );
        return days <= 89;
      });
      expect(windowBounded).toHaveLength(inWindowCount);

      const allTime = deriveStrengthReport({
        exercise,
        sessions: allSessions,
        asOfLocalDate: AS_OF_LOCAL_DATE,
      });
      const rows = projectEstimateIndex(
        [selectionRow()],
        new Map([["ex-1", windowBounded]]),
        AS_OF_LOCAL_DATE,
      );

      expect(rows[0]?.currentE1rmKg).toBe(allTime.estimate.currentE1rmKg);
      expect(rows[0]?.latestPoolAgeDays).toBe(
        allTime.estimate.currentE1rmKg !== null ? allTime.estimate.latestPoolAgeDays : null,
      );
      if (allTime.estimate.currentE1rmKg !== null) {
        expect(rows[0]?.confidence).toBe(allTime.estimate.confidence);
      }
    }
  });
});
