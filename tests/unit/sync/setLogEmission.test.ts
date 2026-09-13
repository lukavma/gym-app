import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import {
  dimensionsOf,
  MEASUREMENT_PROFILES,
  type MeasurementProfile,
  type ProfileDimensions,
} from "@/domain/measurement/profile";
import { setLogFullRowOp } from "@/sync/activeSession";
import type { ActiveSessionSetDto } from "@/sync/types";

// athletic-measurement-profiles-architecture-evaluation.md §12.3 (O-13),
// NC-1's CLIENT half (the server half — SESSION_EXERCISE_FIELDS/
// SET_LOG_FIELDS — is covered by
// tests/integration/measurementSync.integration.test.ts's own "NC-1" describe
// block). Binding rule, verbatim: `setLogFullRowOp` emits the
// profile-independent keys (id, sessionExerciseId, setNumber, isWarmup,
// loggedAt, notes) plus every key the frozen profile permits — required and
// optional, `null` for an absent optional — and omits forbidden keys. The
// permitted set comes from `dimensionsOf`. For `load_reps` this is exactly
// today's nine keys, byte for byte. Never conditional within a profile.

const PROFILE_INDEPENDENT_KEYS = [
  "id",
  "sessionExerciseId",
  "setNumber",
  "isWarmup",
  "loggedAt",
  "notes",
] as const;

const DIMENSION_TO_FIELD = {
  weight: "weightKg",
  reps: "reps",
  rir: "rir",
  distance: "distanceM",
  duration: "durationS",
} as const;

function permittedKeysOf(profile: MeasurementProfile): string[] {
  const dims = dimensionsOf(profile);
  return (Object.keys(DIMENSION_TO_FIELD) as (keyof ProfileDimensions)[])
    .filter((dimension) => dims[dimension] !== "forbidden")
    .map((dimension) => DIMENSION_TO_FIELD[dimension]);
}

// A concrete, schema-valid set for `profile`: every required/optional field
// gets a real, non-null value — the harder case than the trivially-
// round-tripping "absent optional -> null", matching the fixture convention
// tests/unit/measurement/dtoRoundTrip.test.ts's `shapedFields` already
// established. Forbidden fields are still populated (never left at their
// natural `null`) precisely to prove `setLogFullRowOp` OMITS the key
// regardless of the value present in the source object, not merely because
// the value happened to be null.
function makeSet(profile: MeasurementProfile): ActiveSessionSetDto {
  const dims = dimensionsOf(profile);
  return {
    id: newId(),
    setNumber: 1,
    isWarmup: false,
    weightKg: dims.weight === "forbidden" ? 999 : 42.5,
    reps: dims.reps === "forbidden" ? 999 : 8,
    rir: dims.rir === "forbidden" ? 9 : 2,
    distanceM: dims.distance === "forbidden" ? 999 : 500.25,
    durationS: dims.duration === "forbidden" ? 999 : 90.5,
    loggedAt: new Date(0).toISOString(),
    notes: "a note",
  };
}

describe("setLogFullRowOp — profile-scoped emission (O-13, NC-1 client half)", () => {
  for (const profile of MEASUREMENT_PROFILES) {
    it(`profile ${profile}: emits exactly the profile-independent keys union the permitted keys`, () => {
      const set = makeSet(profile);
      const op = setLogFullRowOp(newId(), set, profile, false);

      const expectedKeys = [...PROFILE_INDEPENDENT_KEYS, ...permittedKeysOf(profile)].sort();
      expect(Object.keys(op.payload).sort()).toEqual(expectedKeys);
      // A forbidden field's key is truly ABSENT, not merely `undefined` —
      // `"x" in obj` is false for a key genuinely never set.
      const dims = dimensionsOf(profile);
      for (const [dimension, field] of Object.entries(DIMENSION_TO_FIELD) as [
        keyof ProfileDimensions,
        string,
      ][]) {
        if (dims[dimension] === "forbidden") {
          expect(field in op.payload).toBe(false);
        } else {
          expect(field in op.payload).toBe(true);
        }
      }
    });
  }

  it("load_reps stays byte-identical to the pre-Release-2 nine-key shape", () => {
    const sessionExerciseId = newId();
    const set: ActiveSessionSetDto = {
      id: newId(),
      setNumber: 3,
      isWarmup: false,
      weightKg: 102.5,
      reps: 4,
      rir: 1,
      distanceM: null,
      durationS: null,
      loggedAt: new Date(0).toISOString(),
      notes: "bumped weight",
    };

    const op = setLogFullRowOp(sessionExerciseId, set, "load_reps", false);

    expect(op.payload).toEqual({
      id: set.id,
      sessionExerciseId,
      setNumber: 3,
      isWarmup: false,
      weightKg: 102.5,
      reps: 4,
      rir: 1,
      loggedAt: set.loggedAt,
      notes: "bumped weight",
    });
    expect(Object.keys(op.payload)).toHaveLength(9);
    expect("distanceM" in op.payload).toBe(false);
    expect("durationS" in op.payload).toBe(false);
    // Key-set equality (above) does not constrain wire ORDER, which is the
    // actual content of a "byte for byte" JSON claim — a reordering of
    // keys within an unchanged set would pass every assertion above while
    // still changing the emitted JSON byte-for-byte. This is the real
    // current emission order (schema-declaration order from
    // `setLogUpsertPayloadSchema`, not input-object order — verified
    // against a live payload, not guessed), and must fail if it ever
    // changes.
    expect(Object.keys(op.payload)).toEqual([
      "id",
      "sessionExerciseId",
      "setNumber",
      "isWarmup",
      "weightKg",
      "reps",
      "rir",
      "loggedAt",
      "notes",
    ]);
  });

  // An optional field's key is present but `null` when the value itself is
  // absent — `durationS` is optional (not required, not forbidden) for
  // `load_distance`, so a `load_distance` set with no duration must still
  // carry the key, valued `null`, distinct from `reps`/`rir` (forbidden for
  // this profile), which must be genuinely absent.
  it("an absent OPTIONAL value's key is present with null, not omitted", () => {
    const set: ActiveSessionSetDto = {
      id: newId(),
      setNumber: 1,
      isWarmup: false,
      weightKg: 40,
      reps: null,
      rir: null,
      distanceM: 25,
      durationS: null,
      loggedAt: new Date(0).toISOString(),
      notes: null,
    };
    const op = setLogFullRowOp(newId(), set, "load_distance", false);

    expect(op.payload).toMatchObject({ weightKg: 40, distanceM: 25, durationS: null });
    expect("durationS" in op.payload).toBe(true);
    expect("reps" in op.payload).toBe(false);
    expect("rir" in op.payload).toBe(false);
  });

  // Negative control — proves the per-profile equality above is not
  // vacuously true (e.g. a subset check, or a hard-coded single key set
  // reused for every profile, would still pass a naive assertion). A
  // deliberately load_reps-shaped expected key set must NOT match a
  // load_distance set's real emitted keys. (This is a negative control, not
  // a mutation witness: it proves the assertion discriminates between
  // profiles by feeding it a known-wrong expectation, not by breaking and
  // restoring production code.)
  it("negative control — a load_reps-shaped expectation does not fit a load_distance set's emitted keys", () => {
    const set = makeSet("load_distance");
    const op = setLogFullRowOp(newId(), set, "load_distance", false);
    const loadRepsShapedKeys = [...PROFILE_INDEPENDENT_KEYS, "weightKg", "reps", "rir"].sort();

    expect(() => {
      expect(Object.keys(op.payload).sort()).toEqual(loadRepsShapedKeys);
    }).toThrow();
  });
});
