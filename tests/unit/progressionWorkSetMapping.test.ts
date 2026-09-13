import { describe, expect, it } from "vitest";
import { mapWorkSetRows, type WorkSetSourceRow } from "@/server/progression/service";

// athletic-measurement-profiles-architecture-evaluation.md §11.3 site #1,
// NC-10 — the pure half of the SQL→domain boundary `getWorkSetsByExercise`
// (and, through it, the `getEngineHistory` window) delegates to. Rows here
// simulate exactly what the real join hands the mapper *after* the SQL
// WHERE clause has already dropped warm-up sets — warm-up exclusion is
// tested elsewhere; this file is only about the profile filter and the
// no-coercion rule (I-13/H-12).

const SE_LOAD_REPS = "6a1f0a3e-0000-7000-8000-0000000000a1";
const SE_LOAD_REPS_2 = "6a1f0a3e-0000-7000-8000-0000000000a2";
const SE_DISTANCE_TIME = "6a1f0a3e-0000-7000-8000-0000000000b1";
const SE_DURATION = "6a1f0a3e-0000-7000-8000-0000000000b2";
const SE_LOAD_DISTANCE = "6a1f0a3e-0000-7000-8000-0000000000b3";

// V-6's correction: the fixture must not be vacuous on realistic data, so
// the load_reps rows include both a legitimate single (nonzero load, low
// reps) and a legitimate 0 kg bodyweight set — a stray `?? 0` on the
// non-load_reps rows below would otherwise be indistinguishable from a real
// bodyweight set in the output.
const loadRepsRows: WorkSetSourceRow[] = [
  {
    sessionExerciseId: SE_LOAD_REPS,
    weightKg: 140,
    reps: 1,
    rir: 0,
    measurementProfile: "load_reps",
    groupKey: null,
  },
  {
    sessionExerciseId: SE_LOAD_REPS,
    weightKg: 100,
    reps: 5,
    rir: 2,
    measurementProfile: "load_reps",
    groupKey: null,
  },
  {
    sessionExerciseId: SE_LOAD_REPS_2,
    weightKg: 0,
    reps: 15,
    rir: null,
    measurementProfile: "load_reps",
    groupKey: null,
  },
];

// Several non-load_reps rows, each shaped exactly as `ck_set_logs_profile_
// shape` requires for its own profile (weight/reps null where the profile
// forbids them) — a fabricated `0`/`1` here would corrupt `modalWorkingLoad`
// and `classifySet`'s `zeroLoad` bucket (H-12).
const nonLoadRepsRows: WorkSetSourceRow[] = [
  {
    sessionExerciseId: SE_DISTANCE_TIME,
    weightKg: null,
    reps: null,
    rir: null,
    measurementProfile: "distance_time",
    groupKey: null,
  },
  {
    sessionExerciseId: SE_DURATION,
    weightKg: null,
    reps: null,
    rir: null,
    measurementProfile: "duration",
    groupKey: null,
  },
  {
    sessionExerciseId: SE_LOAD_DISTANCE,
    weightKg: 20,
    reps: null,
    rir: null,
    measurementProfile: "load_distance",
    groupKey: null,
  },
];

describe("mapWorkSetRows — §11.3 site #1 SQL→domain boundary (NC-10)", () => {
  it("(a) output for the full mixed fixture equals the output with every non-load_reps row stripped first", () => {
    const fullFixture = [
      loadRepsRows[0]!,
      nonLoadRepsRows[0]!,
      loadRepsRows[1]!,
      nonLoadRepsRows[1]!,
      nonLoadRepsRows[2]!,
      loadRepsRows[2]!,
    ];
    const stripped = loadRepsRows;

    expect(mapWorkSetRows(fullFixture)).toEqual(mapWorkSetRows(stripped));
  });

  it("(b) the count of mapped rows equals exactly the count of load_reps rows in the fixture", () => {
    const fullFixture = [...loadRepsRows, ...nonLoadRepsRows];
    const mapped = mapWorkSetRows(fullFixture);
    const totalMappedSets = [...mapped.values()].reduce((sum, sets) => sum + sets.length, 0);
    expect(totalMappedSets).toBe(loadRepsRows.length);
  });

  it("never fabricates a 0/1 set from a non-load_reps row (the load-bearing detector)", () => {
    const mapped = mapWorkSetRows(nonLoadRepsRows);
    expect(mapped.size).toBe(0);
  });

  it("preserves the legitimate single and the legitimate 0 kg bodyweight set verbatim", () => {
    const mapped = mapWorkSetRows(loadRepsRows);
    expect(mapped.get(SE_LOAD_REPS)).toEqual([
      { weightKg: 140, reps: 1, rir: 0, groupKey: null },
      { weightKg: 100, reps: 5, rir: 2, groupKey: null },
    ]);
    expect(mapped.get(SE_LOAD_REPS_2)).toEqual([
      { weightKg: 0, reps: 15, rir: null, groupKey: null },
    ]);
  });

  it("a load_reps row that ever disagreed with the shape CHECK (defensive, should be unreachable) is skipped, never coerced", () => {
    const corrupt: WorkSetSourceRow = {
      sessionExerciseId: SE_LOAD_REPS,
      weightKg: null,
      reps: 5,
      rir: null,
      measurementProfile: "load_reps",
      groupKey: null,
    };
    expect(mapWorkSetRows([corrupt])).toEqual(new Map());
  });
});
