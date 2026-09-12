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

// U-1 (docs/reviews/workout-prescription-context-architecture-evaluation.md
// §10) — `prescriptionNotes` is the second additive-optional key on this
// same already-versioned schema, and §7 C-1's no-reconstruction rule turns
// on a pre-existing snapshot with no such key parsing unchanged and staying
// `undefined` (absent, not defaulted to anything).
describe("prescriptionSnapshotDataSchema — PI-018 prescriptionNotes key", () => {
  it("parses a pre-existing v1 snapshot with no prescriptionNotes key at all", () => {
    const result = prescriptionSnapshotDataSchema.safeParse(baseSnapshotData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prescriptionNotes).toBeUndefined();
    }
  });

  it("round-trips a prescription note verbatim, including its own line breaks", () => {
    const note = "Pause 1 s on the chest.\nElbows ~45°.";
    const result = prescriptionSnapshotDataSchema.safeParse(
      baseSnapshotData({ prescriptionNotes: note }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prescriptionNotes).toBe(note);
    }
  });

  it("does NOT trim on read — a stored value with surrounding whitespace survives byte-identical", () => {
    // No `.trim()` on the schema on purpose (§8 file 1): a transform here
    // would silently rewrite historical values every time a stored snapshot
    // is parsed. The write path (domain/prescriptions/schema.ts) trims.
    const padded = "  keep me as stored  ";
    const result = prescriptionSnapshotDataSchema.safeParse(
      baseSnapshotData({ prescriptionNotes: padded }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prescriptionNotes).toBe(padded);
    }
  });

  it("accepts an explicit null (the slot has no program note)", () => {
    const result = prescriptionSnapshotDataSchema.safeParse(
      baseSnapshotData({ prescriptionNotes: null }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prescriptionNotes).toBeNull();
    }
  });

  it("rejects a note longer than the 2000-character source column limit", () => {
    const result = prescriptionSnapshotDataSchema.safeParse(
      baseSnapshotData({ prescriptionNotes: "x".repeat(2001) }),
    );
    expect(result.success).toBe(false);
    expect(
      prescriptionSnapshotDataSchema.safeParse(
        baseSnapshotData({ prescriptionNotes: "x".repeat(2000) }),
      ).success,
    ).toBe(true);
  });

  it("rejects a non-string note", () => {
    expect(
      prescriptionSnapshotDataSchema.safeParse(baseSnapshotData({ prescriptionNotes: 42 })).success,
    ).toBe(false);
  });
});

describe("prescriptionSnapshotSchema envelope", () => {
  it("keeps v at 1 — additive change, no version bump (ADR-008)", () => {
    // Two additive-optional keys now ride on v1: `measurement` (Release 2)
    // and `prescriptionNotes` (PI-018). A bump would be actively wrong for
    // either — it would demand an upgrade function for a value that is
    // genuinely absent and must stay absent (PI-018 §3.3/§7 C-1).
    expect(PRESCRIPTION_SNAPSHOT_VERSION).toBe(1);
    expect(
      prescriptionSnapshotSchema.safeParse({
        v: 1,
        snapshot: baseSnapshotData({ prescriptionNotes: "Pause 1 s on the chest." }),
      }).success,
    ).toBe(true);
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
