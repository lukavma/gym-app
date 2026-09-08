import {
  workoutSessionUpsertPayloadSchema,
  sessionExerciseUpsertPayloadSchema,
  setLogUpsertPayloadSchema,
  setLogDeletePayloadSchema,
  recommendationUpsertPayloadSchema,
  recommendationDecisionUpsertPayloadSchema,
  type WorkoutSessionUpsertPayload,
  type SessionExerciseUpsertPayload,
  type SetLogUpsertPayload,
  type SetLogDeletePayload,
  type RecommendationUpsertPayload,
  type RecommendationDecisionUpsertPayload,
} from "./schema";

// BLOCKER-1 belt-and-suspenders: each builder's parameter type is the
// schema's own z.infer'd type, so a call site missing a required field
// (e.g. sessionId on a sessionExercise upsert) is a compile error. The
// `.parse()` call is not redundant with that compile-time check — it's the
// runtime backstop for anything that slips past types (e.g. a value that
// type-checks but is out of range), so the failure mode for a malformed
// payload is a thrown error at the call site, never a silent server-side
// `invalid_payload` dead letter discovered only after `completeSession()`
// has already destroyed the local copy.

export function buildWorkoutSessionUpsertPayload(
  input: WorkoutSessionUpsertPayload,
): WorkoutSessionUpsertPayload {
  return workoutSessionUpsertPayloadSchema.parse(input);
}

export function buildSessionExerciseUpsertPayload(
  input: SessionExerciseUpsertPayload,
): SessionExerciseUpsertPayload {
  return sessionExerciseUpsertPayloadSchema.parse(input);
}

export function buildSetLogUpsertPayload(input: SetLogUpsertPayload): SetLogUpsertPayload {
  return setLogUpsertPayloadSchema.parse(input);
}

// O-13 (athletic-measurement-profiles-architecture-evaluation.md §12.3) —
// closes the "never schema-parsed client-side" gap at
// `src/sync/corrections.ts`'s `correctHistorySet` (previously built its
// payload as a bare object literal, no `.parse()` at all). `correctHistorySet`
// stays the one PARTIAL emitter (not a full-row builder, §12.3's last
// paragraph): it never determines or applies a profile's permitted-key set —
// `setLogUpsertPayloadSchema` already models every field but `id`/
// `sessionExerciseId` as optional/nullable, which is exactly a partial
// correction's shape, so this reuses that same schema rather than a new one.
// Whether a given correction is valid for the parent slot's frozen profile
// (e.g. `{reps: null}` on a `load_reps` set) is decided server-side by the
// effective-row validation (`dimensionsOf`), not here.
export function buildSetLogCorrectionPayload(input: SetLogUpsertPayload): SetLogUpsertPayload {
  return setLogUpsertPayloadSchema.parse(input);
}

export function buildSetLogDeletePayload(input: SetLogDeletePayload): SetLogDeletePayload {
  return setLogDeletePayloadSchema.parse(input);
}

export function buildRecommendationUpsertPayload(
  input: RecommendationUpsertPayload,
): RecommendationUpsertPayload {
  return recommendationUpsertPayloadSchema.parse(input);
}

export function buildRecommendationDecisionUpsertPayload(
  input: RecommendationDecisionUpsertPayload,
): RecommendationDecisionUpsertPayload {
  return recommendationDecisionUpsertPayloadSchema.parse(input);
}
