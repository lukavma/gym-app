import { describe, expect, it } from "vitest";
import {
  PRESCRIPTION_SNAPSHOT_VERSION,
  prescriptionSnapshotDataSchema,
  prescriptionSnapshotSchema,
} from "@/domain/schemas/prescriptionSnapshot";

// measurement-profiles-architecture-evaluation.md §9.4 — `measurement` is
// ONE optional key added to an already-versioned snapshot schema; A-7
// requires a pre-existing v1 row (no `measurement` key at all) to still
// parse unchanged, and a v1 row that does carry it to round-trip.
function baseSnapshotData(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    exerciseId: "00000000-0000-0000-0000-000000000001",
    exerciseName: "Bench Press",
    scheme: { type: "fixed", sets: 5, reps: 5 },
    targetRir: { min: 0, max: 2 },
    restSeconds: null,
    progression: {
      strategyId: "manual",
      strategyVersion: 1,
      config: {},
      classification: "heuristic",
    },
    appliedModifiers: null,
    prefill: { loadKg: 100, reps: 5 },
    ...overrides,
  };
}

describe("prescriptionSnapshotDataSchema — §9.4 measurement key", () => {
  it("parses a pre-existing v1 snapshot with no measurement key at all", () => {
    const result = prescriptionSnapshotDataSchema.safeParse(baseSnapshotData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.measurement).toBeUndefined();
    }
  });

  it("round-trips a snapshot that carries measurement.profile/loadBasis", () => {
    const input = baseSnapshotData({
      measurement: { profile: "load_reps", loadBasis: "unspecified" },
    });
    const result = prescriptionSnapshotDataSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.measurement).toEqual({ profile: "load_reps", loadBasis: "unspecified" });
    }
  });

  it("accepts a null loadBasis (profiles with no load field)", () => {
    const input = baseSnapshotData({
      measurement: { profile: "duration", loadBasis: null },
      scheme: { type: "durationRounds", sets: 3, durationS: 60 },
    });
    const result = prescriptionSnapshotDataSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown measurement.profile value", () => {
    const input = baseSnapshotData({ measurement: { profile: "bodyweight", loadBasis: null } });
    const result = prescriptionSnapshotDataSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown measurement.loadBasis value", () => {
    const input = baseSnapshotData({
      measurement: { profile: "load_reps", loadBasis: "half_bodyweight" },
    });
    const result = prescriptionSnapshotDataSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("still rejects an unknown scheme type (setSchemeSchema, unchanged by the measurement addition)", () => {
    const input = baseSnapshotData({ scheme: { type: "perSet", sets: 3 } });
    const result = prescriptionSnapshotDataSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts the two new scheme variants (distanceRounds/durationRounds)", () => {
    const distance = prescriptionSnapshotDataSchema.safeParse(
      baseSnapshotData({
        scheme: { type: "distanceRounds", sets: 4, distanceM: 20 },
        prefill: { loadKg: null, reps: null },
      }),
    );
    expect(distance.success).toBe(true);
    const duration = prescriptionSnapshotDataSchema.safeParse(
      baseSnapshotData({
        scheme: { type: "durationRounds", sets: 3, durationS: 60 },
        prefill: { loadKg: null, reps: null },
      }),
    );
    expect(duration.success).toBe(true);
  });
});

describe("prescriptionSnapshotSchema envelope", () => {
  it("keeps v at 1 — additive change, no version bump (ADR-008)", () => {
    expect(PRESCRIPTION_SNAPSHOT_VERSION).toBe(1);
  });

  it("wraps and parses a v1 envelope with a measurement key", () => {
    const result = prescriptionSnapshotSchema.safeParse({
      v: 1,
      snapshot: baseSnapshotData({
        measurement: { profile: "load_reps", loadBasis: "total" },
      }),
    });
    expect(result.success).toBe(true);
  });
});
