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
