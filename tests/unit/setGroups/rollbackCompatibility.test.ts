import { describe, expect, it } from "vitest";
import { z } from "zod";
import { newId, isUuidv7 } from "@/domain/ids/uuidv7";
import { setLogFullRowOp } from "@/sync/activeSession";
import {
  setLogUpsertPayloadSchema as liveSetLogUpsertPayloadSchema,
  recommendationUpsertPayloadSchema as liveRecommendationUpsertPayloadSchema,
} from "@/domain/sync/schema";
import type { ActiveSessionSetDto } from "@/sync/types";

// set-groups-architecture-evaluation.md §8 "New client, rolled-back
// server" / A-11 — a new-build grouped op must fail a FROZEN pre-Stage-A
// (pre-migration-0014) schema (the server rejects the unknown `groupKey`
// key, `invalid_payload`), while an ungrouped op stays byte-identical and
// keeps parsing against that same frozen schema. Frozen independently of
// the live module (`src/domain/sync/schema.ts`), matching the exact
// precedent `tests/unit/sync/rollbackCompatibility.test.ts` (NC-13) already
// established for the athletic-measurement-profiles rollback window.

const uuidv7Schema = z.string().refine(isUuidv7, { message: "must be a UUIDv7" });

const preStageASetLogUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    sessionExerciseId: uuidv7Schema,
    setNumber: z.number().int().min(1).optional(),
    isWarmup: z.boolean().optional(),
    weightKg: z.number().min(0).max(9999.99).nullable().optional(),
    reps: z.number().int().min(1).max(100).nullable().optional(),
    rir: z.number().int().min(0).max(10).nullable().optional(),
    distanceM: z.number().gt(0).max(99999.99).multipleOf(0.01).nullable().optional(),
    durationS: z.number().gt(0).max(86400).multipleOf(0.01).nullable().optional(),
    loggedAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

// Loosened `inputs` to `z.unknown()` — the frozen schema's job here is only
// to prove the TOP-LEVEL `groupKey` key is unknown to a pre-Stage-A server,
// not to re-freeze the entire nested InputsSummary shape.
const preStageARecommendationUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    exerciseId: z.string().uuid(),
    blockId: z.string().uuid().nullable(),
    sourceSessionId: uuidv7Schema,
    sourceSessionExerciseId: uuidv7Schema,
    strategyId: z.enum(["load-progression", "rep-progression", "manual"]),
    strategyVersion: z.number().int().positive(),
    classification: z.enum(["evidence_supported", "heuristic", "user_defined"]),
    config: z.record(z.string(), z.unknown()),
    inputs: z.unknown(),
    action: z.enum(["increase_load", "decrease_load", "hold", "increase_reps", "none"]),
    target: z
      .object({ loadKg: z.number().optional(), reps: z.number().optional() })
      .strict()
      .nullable(),
    reasonCodes: z.array(z.string()),
    confidence: z.enum(["low", "medium", "high"]),
    computedBy: z.literal("client"),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

// A frozen pre-Stage-A InputsSummary.prescribed shape — proves `group` is
// an unknown key to a rolled-back server even where `inputs` itself is
// otherwise untouched.
const preStageAPrescribedSchema = z
  .object({
    scheme: z.record(z.string(), z.unknown()),
    targetRir: z.object({ min: z.number(), max: z.number() }).optional(),
  })
  .strict();

describe("A-11/rev.3 V-1 — Set Groups rollback window", () => {
  it("a grouped setLog op (carries groupKey) fails the frozen pre-Stage-A schema", () => {
    const set: ActiveSessionSetDto = {
      id: newId(),
      setNumber: 1,
      isWarmup: false,
      weightKg: 140,
      reps: 2,
      rir: 2,
      distanceM: null,
      durationS: null,
      loggedAt: new Date().toISOString(),
      notes: null,
      groupKey: "g7k2",
    };
    const op = setLogFullRowOp(newId(), set, "load_reps", true);
    expect("groupKey" in op.payload).toBe(true);
    expect(preStageASetLogUpsertPayloadSchema.safeParse(op.payload).success).toBe(false);
    // Still valid against the live (Stage A) schema.
    expect(liveSetLogUpsertPayloadSchema.safeParse(op.payload).success).toBe(true);
  });

  it("an ungrouped setLog op stays byte-identical — no groupKey key at all — and still parses against the frozen pre-Stage-A schema", () => {
    const set: ActiveSessionSetDto = {
      id: newId(),
      setNumber: 1,
      isWarmup: false,
      weightKg: 100,
      reps: 5,
      rir: 2,
      distanceM: null,
      durationS: null,
      loggedAt: new Date().toISOString(),
      notes: null,
      groupKey: null,
    };
    const op = setLogFullRowOp(newId(), set, "load_reps", false);
    expect("groupKey" in op.payload).toBe(false);
    expect(preStageASetLogUpsertPayloadSchema.safeParse(op.payload).success).toBe(true);
    expect(liveSetLogUpsertPayloadSchema.safeParse(op.payload).success).toBe(true);
  });

  it("a per-group client-computed recommendation op (carries groupKey) fails the frozen pre-Stage-A schema", () => {
    const payload = {
      id: newId(),
      exerciseId: newId(),
      blockId: null,
      sourceSessionId: newId(),
      sourceSessionExerciseId: newId(),
      groupKey: "q9m4",
      strategyId: "load-progression" as const,
      strategyVersion: 1,
      classification: "heuristic" as const,
      config: {},
      inputs: {
        prescribed: { scheme: { type: "repRange", sets: 2, minReps: 6, maxReps: 8 } },
        workSets: [],
        extraWorkSets: [],
        derived: { setsCompleted: 0, prescribedSets: 2, finalSetRir: null, workingLoadKg: 0 },
        historyDepthUsed: 0,
      },
      action: "hold" as const,
      target: null,
      reasonCodes: [],
      confidence: "low" as const,
      computedBy: "client" as const,
      createdAt: new Date().toISOString(),
    };
    expect(preStageARecommendationUpsertPayloadSchema.safeParse(payload).success).toBe(false);
    expect(liveRecommendationUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("an ungrouped recommendation op's inputs.prescribed omits `group` entirely and still parses against the frozen pre-Stage-A prescribed shape", () => {
    const prescribed = { scheme: { type: "fixed", sets: 3, reps: 5 } };
    expect("group" in prescribed).toBe(false);
    expect(preStageAPrescribedSchema.safeParse(prescribed).success).toBe(true);
  });

  it("a prescribed.group key fails the frozen pre-Stage-A prescribed shape", () => {
    const prescribed = {
      scheme: { type: "fixed", sets: 1, reps: 2 },
      group: { key: "top", label: "Top", setsMin: 1, setsMax: 1 },
    };
    expect(preStageAPrescribedSchema.safeParse(prescribed).success).toBe(false);
  });
});
