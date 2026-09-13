import { describe, expect, it } from "vitest";
import {
  dimensionsOf,
  loadBasisRequired,
  MEASUREMENT_PROFILES,
  type LoadBasis,
} from "@/domain/measurement/profile";
import { newId } from "@/domain/ids/uuidv7";
import type {
  ActiveSessionExerciseDto,
  ActiveSessionSetDto,
  HistorySetSummaryDto,
} from "@/sync/types";
import type { HistorySetDetail } from "@/ui/history/types";

// athletic-measurement-profiles-architecture-evaluation.md §21.2 (Release 2
// Foundations) — the client DTO widening itself: ActiveSessionSetDto and
// HistorySetSummaryDto/HistorySetDetail must be able to hold a validly
// shaped row for every one of the six §5.3 profiles (not just `load_reps`,
// the only one any current client code can actually create), and that
// shape must survive exactly what IndexedDB and a JSON API response both
// do to a value: JSON.stringify + JSON.parse (a `structuredClone`-style
// round trip would keep `undefined` keys; the wire/IndexedDB
// serialization this exercises does not, which is the more conservative,
// harder-to-pass check). No arithmetic, no strategy, no evaluation code is
// exercised here — this is pure shape coverage for the DTO widening.

// Builds a §6.2-shaped numeric row for `profile`: every REQUIRED field gets
// a concrete value, every FORBIDDEN field is null, and every OPTIONAL field
// is populated (the harder case — an absent optional would trivially
// round-trip as null regardless of whether the DTO widening is correct).
function shapedFields(profile: (typeof MEASUREMENT_PROFILES)[number]) {
  const dims = dimensionsOf(profile);
  return {
    weightKg: dims.weight === "forbidden" ? null : 42.5,
    reps: dims.reps === "forbidden" ? null : 8,
    rir: dims.rir === "forbidden" ? null : 2,
    distanceM: dims.distance === "forbidden" ? null : 500.25,
    durationS: dims.duration === "forbidden" ? null : 90.5,
  };
}

// One concrete, valid load basis per profile — arbitrary but varied, so a
// test bug that hard-coded a single basis value everywhere would still be
// caught by a mismatch. `null` for every profile without a load field at
// all (loadBasisRequired === false), matching §7.1.
const CHOSEN_LOAD_BASIS: Partial<Record<(typeof MEASUREMENT_PROFILES)[number], LoadBasis>> = {
  load_reps: "unspecified",
  load_distance: "total",
  load_duration: "per_hand",
};

function measurementFor(profile: (typeof MEASUREMENT_PROFILES)[number]) {
  return {
    profile,
    loadBasis: loadBasisRequired(profile) ? (CHOSEN_LOAD_BASIS[profile] ?? "unspecified") : null,
  };
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("ActiveSessionSetDto — every profile's shape round-trips (Release 2 DTO widening)", () => {
  for (const profile of MEASUREMENT_PROFILES) {
    it(`profile ${profile}`, () => {
      const set: ActiveSessionSetDto = {
        id: newId(),
        setNumber: 1,
        isWarmup: false,
        ...shapedFields(profile),
        loggedAt: new Date(0).toISOString(),
        notes: null,
      };

      const restored = roundTrip(set);
      expect(restored).toEqual(set);
      // Named assertions on top of the deep-equal above, so a future field
      // rename/typo shows up as a specific failure, not just "not equal".
      expect(restored.weightKg).toBe(set.weightKg);
      expect(restored.reps).toBe(set.reps);
      expect(restored.distanceM).toBe(set.distanceM);
      expect(restored.durationS).toBe(set.durationS);
    });
  }
});

describe("ActiveSessionExerciseDto.measurement — frozen shape round-trips for every profile", () => {
  for (const profile of MEASUREMENT_PROFILES) {
    it(`profile ${profile}, load basis ${loadBasisRequired(profile) ? (CHOSEN_LOAD_BASIS[profile] ?? "unspecified") : "null (no load field)"}`, () => {
      const exercise: ActiveSessionExerciseDto = {
        id: newId(),
        exerciseId: newId(),
        exerciseName: "Fixture Exercise",
        position: 0,
        source: "template",
        prescription: null,
        skipped: false,
        notes: null,
        loadStepKg: loadBasisRequired(profile) ? 2.5 : null,
        recommendation: null,
        measurement: measurementFor(profile),
        sets: [
          {
            id: newId(),
            setNumber: 1,
            isWarmup: false,
            ...shapedFields(profile),
            loggedAt: new Date(0).toISOString(),
            notes: null,
          },
        ],
      };

      const restored = roundTrip(exercise);
      expect(restored).toEqual(exercise);
      expect(restored.measurement.profile).toBe(profile);
      expect(restored.measurement.loadBasis).toBe(measurementFor(profile).loadBasis);
    });
  }
});

describe("HistorySetSummaryDto (src/sync/types.ts) — every profile's shape round-trips", () => {
  for (const profile of MEASUREMENT_PROFILES) {
    it(`profile ${profile}`, () => {
      const set: HistorySetSummaryDto = {
        setNumber: 1,
        isWarmup: false,
        ...shapedFields(profile),
      };
      const restored = roundTrip(set);
      expect(restored).toEqual(set);
    });
  }
});

describe("HistorySetDetail (src/ui/history/types.ts) — every profile's shape round-trips", () => {
  for (const profile of MEASUREMENT_PROFILES) {
    it(`profile ${profile}`, () => {
      const set: HistorySetDetail = {
        id: newId(),
        setNumber: 1,
        isWarmup: false,
        ...shapedFields(profile),
        loggedAt: new Date(0).toISOString(),
        notes: null,
        groupKey: null,
      };
      const restored = roundTrip(set);
      expect(restored).toEqual(set);
    });
  }
});
