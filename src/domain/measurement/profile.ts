// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md §5.3
// (the closed vocabulary), §6.2 (the field/profile matrix) and §6.4
// (`dimensionsOf`), §7.1 (`load_basis`) and §11.4 (`volume_counting`).
//
// Zero imports, by design (I-10): this is the single source the DB CHECK
// text (`ck_set_logs_profile_shape`, built the way `checkInList` is), the
// Zod refinement, the server validation and the client emitter's
// permitted-key set (§12.3, Release 2) all read. `domain/strength`,
// `domain/progression`, `domain/volume` and `domain/metrics` may import this
// module; it may not import any of them (I-10).
//
// A closed enum rather than a dimension/capability bag on the exercise row
// (§5.2 option B, rejected as storage): one value per exercise, every
// consumer branches on a finite set, and the database can prove each row's
// field set. The dimension/capability shape survives only as a *derived*
// function of the profile — `dimensionsOf` below.
export const MEASUREMENT_PROFILES = [
  "load_reps",
  "reps",
  "load_distance",
  "distance_time",
  "duration",
  "load_duration",
] as const;
export type MeasurementProfile = (typeof MEASUREMENT_PROFILES)[number];

// §7.1 — applies only to profiles with a load field (`load_reps`,
// `load_distance`, `load_duration`). `unspecified` is the permanent default
// for every migrated row and any exercise the athlete has not classified
// (a retroactive guess would be inference from equipment, which PI-005
// forbids).
export const LOAD_BASES = ["total", "per_hand", "assistance", "unspecified"] as const;
export type LoadBasis = (typeof LOAD_BASES)[number];

// §11.4 — `'auto'` counts when structurally compatible, `'off'` never
// counts. A switch can only ever disable, never enable (I-5), matching
// `strength_estimate`'s `'auto' | 'off'` shape (`estimateMode.ts`).
export const VOLUME_COUNTING_MODES = ["auto", "off"] as const;
export type VolumeCounting = (typeof VOLUME_COUNTING_MODES)[number];

// §6.3 — every existing `set_logs` row has non-null `weight_kg`/`reps` and
// no historical `load_basis` convention recorded, so both defaults are what
// makes the migration non-reinterpreting (I-2).
export const DEFAULT_MEASUREMENT_PROFILE: MeasurementProfile = "load_reps";
export const DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE: LoadBasis = "unspecified";

export type FieldRequirement = "required" | "optional" | "forbidden";

export interface ProfileDimensions {
  weight: FieldRequirement;
  reps: FieldRequirement;
  rir: FieldRequirement;
  distance: FieldRequirement;
  duration: FieldRequirement;
}

// §6.2's matrix, verbatim.
const DIMENSIONS: Record<MeasurementProfile, ProfileDimensions> = {
  load_reps: {
    weight: "required",
    reps: "required",
    rir: "optional",
    distance: "forbidden",
    duration: "forbidden",
  },
  reps: {
    weight: "forbidden",
    reps: "required",
    rir: "optional",
    distance: "forbidden",
    duration: "forbidden",
  },
  load_distance: {
    weight: "required",
    reps: "forbidden",
    rir: "forbidden",
    distance: "required",
    duration: "optional",
  },
  distance_time: {
    weight: "forbidden",
    reps: "forbidden",
    rir: "forbidden",
    distance: "required",
    duration: "required",
  },
  duration: {
    weight: "forbidden",
    reps: "forbidden",
    rir: "forbidden",
    distance: "forbidden",
    duration: "required",
  },
  load_duration: {
    weight: "required",
    reps: "forbidden",
    rir: "forbidden",
    distance: "forbidden",
    duration: "required",
  },
};

// The single source the DB CHECK text, the Zod refinement, the server
// validation and the client emitter's permitted-key set all read (§6.4).
export function dimensionsOf(profile: MeasurementProfile): ProfileDimensions {
  return DIMENSIONS[profile];
}

// §7.1 — mirrors the matrix's load column: `load_basis` exists only where a
// load field exists at all, independent of whether that load is required or
// optional (it never is optional — only `load_reps`/`load_distance`/
// `load_duration` have a load field, and all three require it).
const LOAD_BASIS_REQUIRED: Record<MeasurementProfile, boolean> = {
  load_reps: true,
  reps: false,
  load_distance: true,
  distance_time: false,
  duration: false,
  load_duration: true,
};

// Drives the DB's `ck_..._load_basis_presence` predicate, mirrored here for
// the service/Zod layer that must enforce the same rule at the API boundary.
export function loadBasisRequired(profile: MeasurementProfile): boolean {
  return LOAD_BASIS_REQUIRED[profile];
}
