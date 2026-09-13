import { z } from "zod";
import { isUuidv7 } from "../ids/uuidv7";
import { prescriptionSnapshotSchema } from "../schemas/prescriptionSnapshot";
import {
  inputsSummarySchema,
  reasonCodeSchema,
  recommendationClassificationSchema,
  recommendationTargetSchema,
  CONFIDENCE_LEVELS,
  RECOMMENDATION_ACTIONS,
  DECISION_SOURCES,
} from "../schemas/recommendation";
import { strategyIdSchema } from "../progression/registry";
import { dateOnlySchema, bodyweightWeightKgSchema } from "../bodyweight/schema";
import { sleepHoursSchema, recoveryFiveScaleSchema } from "../recovery/schema";
import { LOAD_BASES, MEASUREMENT_PROFILES } from "../measurement/profile";

// athletic-measurement-profiles-architecture-evaluation.md §9.4/§12.2 —
// `profile.ts` is zero-import/framework-agnostic (I-10) and exports no Zod
// schemas of its own, so these are built here from its plain-TS vocabulary
// tuples, mirroring `prescriptionSnapshot.ts`'s identical local schemas.
const measurementProfileSchema = z.enum(MEASUREMENT_PROFILES);
const loadBasisSchema = z.enum(LOAD_BASES);

// pwa-offline-strategy.md — the single write path for execution facts.
// Every session/session-exercise/set-log mutation, online or offline, goes
// through this envelope: `{opId, entity, operation, payload}`, applied
// idempotently by opId (`@/server/sync/service`). Definition CRUD (blocks,
// templates, prescriptions, exercises) is unaffected — plain online REST,
// as before.
const uuidv7Schema = z.string().refine(isUuidv7, { message: "must be a UUIDv7" });

export const SYNC_ENTITIES = [
  "workoutSession",
  "sessionExercise",
  "setLog",
  "recommendation",
  "recommendationDecision",
  "bodyweightEntry",
  "recoveryEntry",
] as const;
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
    // §10.1/§10.2/§12.2 — read on insert only, to derive and compare
    // against the exercise row (never written on update, I-3). `loadBasis`
    // is validated for shape but never read at all: the slot's basis is
    // always the value the server derives from the live exercise row at
    // insert (I-14). Both keys exist purely so `sessionExerciseFullRowOp`
    // keeps a fixed key set (§12.3, W-1) — neither carries authority here.
    measurementProfile: measurementProfileSchema.optional(),
    loadBasis: loadBasisSchema.nullable().optional(),
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
    // set-groups-architecture-evaluation.md §4.4/D-1 — the group this work
    // set is attributed to on a grouped slot. Additive optional, emitted
    // ONLY for a grouped slot's full-row ops (activeSession.ts's
    // `setLogFullRowOp`, setDeletionOps.ts's renumber upserts) — an
    // ungrouped payload omits the key entirely, keeping it byte-identical to
    // today's (rev. 3 V-1, A-10/NC-9). Validated against the parent slot's
    // frozen snapshot group keys by the sync service, not by this schema.
    groupKey: z.string().min(1).max(40).nullable().optional(),
    // §6.1/§12.2 — nullable as of athletic-measurement-profiles: required
    // only for the profiles whose shape needs them, enforced against the
    // parent slot's frozen profile by the sync service (`dimensionsOf`),
    // not by this schema. No `multipleOf` tightening on `weightKg` in v1
    // (O-15, accepted).
    weightKg: z.number().min(0).max(9999.99).nullable().optional(),
    reps: z.number().int().min(1).max(100).nullable().optional(),
    rir: z.number().int().min(0).max(10).nullable().optional(),
    distanceM: z.number().gt(0).max(99999.99).multipleOf(0.01).nullable().optional(),
    durationS: z.number().gt(0).max(86400).multipleOf(0.01).nullable().optional(),
    loggedAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type SetLogUpsertPayload = z.infer<typeof setLogUpsertPayloadSchema>;

export const setLogDeletePayloadSchema = z.object({ id: uuidv7Schema }).strict();
export type SetLogDeletePayload = z.infer<typeof setLogDeletePayloadSchema>;

// Phase 4 — client-computed recommendation (offline completion fallback,
// progression-engine.md §5). Unlike the session payloads, every field is
// required: a recommendation is born whole (immutable output, one-time
// decision append) — there is no partial-update path for its content, and
// the decision fields are absent because a synced record is always born
// `pending`. `computedBy` is pinned to 'client': the server's own
// evaluations never travel through the sync contract.
export const recommendationUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    exerciseId: z.string().uuid(),
    blockId: z.string().uuid().nullable(),
    sourceSessionId: uuidv7Schema,
    sourceSessionExerciseId: uuidv7Schema,
    // set-groups-architecture-evaluation.md §5.3/D-1/D-2 — the group this
    // client-computed recommendation belongs to; additive optional, emitted
    // ONLY for a per-group record (always a real key — recommendations are
    // immutable once born, so there is no "clear it later" case the setLog
    // field's nullability exists for), omitted entirely for an ungrouped one
    // (rev. 3 V-1, A-10/NC-9).
    groupKey: z.string().min(1).max(40).optional(),
    strategyId: strategyIdSchema,
    strategyVersion: z.number().int().positive(),
    classification: recommendationClassificationSchema,
    config: z.record(z.string(), z.unknown()),
    inputs: inputsSummarySchema,
    action: z.enum(RECOMMENDATION_ACTIONS),
    target: recommendationTargetSchema.nullable(),
    reasonCodes: z.array(reasonCodeSchema),
    confidence: z.enum(CONFIDENCE_LEVELS),
    computedBy: z.literal("client"),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type RecommendationUpsertPayload = z.infer<typeof recommendationUpsertPayloadSchema>;

// Phase 4 — the one-time decision append (progression-engine.md §7).
// `recommendationId` is a plain uuid (not necessarily v7): the decided
// recommendation may have been computed server-side. `decidedAt` is the
// client clock, consistent with `logged_at`/`started_at` (event times are
// trusted client data, pwa-offline-strategy.md §5).
export const recommendationDecisionUpsertPayloadSchema = z
  .object({
    recommendationId: z.string().uuid(),
    status: z.enum(["accepted", "modified", "rejected"]),
    chosen: recommendationTargetSchema.nullable(),
    decidedAt: z.string().datetime({ offset: true }),
    source: z.enum(DECISION_SOURCES),
  })
  .strict();
export type RecommendationDecisionUpsertPayload = z.infer<
  typeof recommendationDecisionUpsertPayloadSchema
>;

// Phase 8 — bodyweight/recovery quick-logs join the outbox (capability
// matrix, pwa-offline-strategy.md §2), reusing the day-grain upsert already
// built for Phase 7 (`logBodyweight`/`logRecovery`) rather than a new write
// path. `date` is always supplied by the client (never server-defaulted, per
// pwa-offline-strategy.md §5's "trusts client event time" posture — there's
// no other way to know which user-local day an offline log belongs to). `id`
// is a client-generated UUIDv7 honored only on first insert: the row's real
// identity is (userId, date), so a stale/duplicate id on a replay is
// harmless — see src/server/bodyweight/service.ts and
// src/server/recovery/service.ts.
export const bodyweightEntryUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    date: dateOnlySchema,
    weightKg: bodyweightWeightKgSchema,
    note: z.string().trim().min(1).optional(),
  })
  .strict();
export type BodyweightEntryUpsertPayload = z.infer<typeof bodyweightEntryUpsertPayloadSchema>;

// Every metric is optional/nullable — the client only includes a field it
// actually touched (undefined = omit/preserve whatever the day's row already
// holds; null = an explicit clear), mirroring logRecoveryInputSchema's
// presence-aware contract. Unlike that online schema, there's no
// `hasAnyMetricValue` refine here: whether an all-omitted-metrics op is
// valid depends on whether a row for this day already has a metric, which
// only the server (src/server/recovery/service.ts, backed by
// ck_recovery_entries_has_metric) can know at apply time.
export const recoveryEntryUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    date: dateOnlySchema,
    sleepHours: sleepHoursSchema.nullable().optional(),
    sleepQuality: recoveryFiveScaleSchema.nullable().optional(),
    readiness: recoveryFiveScaleSchema.nullable().optional(),
    soreness: recoveryFiveScaleSchema.nullable().optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type RecoveryEntryUpsertPayload = z.infer<typeof recoveryEntryUpsertPayloadSchema>;
