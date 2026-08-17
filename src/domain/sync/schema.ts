import { z } from "zod";
import { isUuidv7 } from "../ids/uuidv7";
import { prescriptionSnapshotSchema } from "../schemas/prescriptionSnapshot";

// pwa-offline-strategy.md — the single write path for execution facts.
// Every session/session-exercise/set-log mutation, online or offline, goes
// through this envelope: `{opId, entity, operation, payload}`, applied
// idempotently by opId (`@/server/sync/service`). Definition CRUD (blocks,
// templates, prescriptions, exercises) is unaffected — plain online REST,
// as before.
const uuidv7Schema = z.string().refine(isUuidv7, { message: "must be a UUIDv7" });

export const SYNC_ENTITIES = ["workoutSession", "sessionExercise", "setLog"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OPERATIONS = ["upsert", "delete"] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

// Loose envelope: `payload` is validated against the entity/operation-
// specific schema below inside the sync service, not here, because which
// schema applies depends on the combination of two sibling fields — a
// plain z.discriminatedUnion can only branch on one.
export const syncOpEnvelopeSchema = z.object({
  opId: uuidv7Schema,
  entity: z.enum(SYNC_ENTITIES),
  operation: z.enum(SYNC_OPERATIONS),
  payload: z.record(z.string(), z.unknown()),
});
export type SyncOpEnvelope = z.infer<typeof syncOpEnvelopeSchema>;

// A soft cap on ops-per-batch — not spec-mandated, just a sane bound so a
// pathological client (e.g. a corrupted outbox) can't send an unbounded
// request body. The client's own outbox flush batches far below this.
export const MAX_OPS_PER_BATCH = 200;

export const syncBatchSchema = z.object({
  ops: z.array(syncOpEnvelopeSchema).min(1).max(MAX_OPS_PER_BATCH),
});
export type SyncBatch = z.infer<typeof syncBatchSchema>;

const workoutSessionStatusSchema = z.enum(["in_progress", "completed", "discarded"]);

// All fields but `id` are optional here: creation-required fields are
// enforced by the sync service (which knows whether the row already
// exists), not by this schema — see that service's comment for why.
export const workoutSessionUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    blockId: z.string().uuid().nullable().optional(),
    templateId: z.string().uuid().nullable().optional(),
    templateName: z.string().trim().min(1).max(200).nullable().optional(),
    weekIndex: z.number().int().positive().nullable().optional(),
    isDeload: z.boolean().optional(),
    status: workoutSessionStatusSchema.optional(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    completedAt: z.string().datetime({ offset: true }).nullable().optional(),
    clientId: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type WorkoutSessionUpsertPayload = z.infer<typeof workoutSessionUpsertPayloadSchema>;

export const sessionExerciseSourceSchema = z.enum(["template", "adhoc"]);

export const sessionExerciseUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    sessionId: uuidv7Schema,
    exerciseId: z.string().uuid().optional(),
    position: z.number().int().min(0).optional(),
    source: sessionExerciseSourceSchema.optional(),
    prescription: prescriptionSnapshotSchema.nullable().optional(),
    skipped: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type SessionExerciseUpsertPayload = z.infer<typeof sessionExerciseUpsertPayloadSchema>;

export const setLogUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    sessionExerciseId: uuidv7Schema,
    setNumber: z.number().int().min(1).optional(),
    isWarmup: z.boolean().optional(),
    weightKg: z.number().min(0).max(9999.99).optional(),
    reps: z.number().int().min(1).max(100).optional(),
    rir: z.number().int().min(0).max(10).nullable().optional(),
    loggedAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type SetLogUpsertPayload = z.infer<typeof setLogUpsertPayloadSchema>;

export const setLogDeletePayloadSchema = z.object({ id: uuidv7Schema }).strict();
export type SetLogDeletePayload = z.infer<typeof setLogDeletePayloadSchema>;
