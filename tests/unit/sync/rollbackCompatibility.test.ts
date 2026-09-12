import { describe, expect, it } from "vitest";
import { z } from "zod";
import { newId, isUuidv7 } from "@/domain/ids/uuidv7";
import { setLogFullRowOp } from "@/sync/activeSession";
import { buildSessionExerciseUpsertPayload } from "@/domain/sync/payloadBuilders";
import {
  setLogUpsertPayloadSchema as liveSetLogUpsertPayloadSchema,
  sessionExerciseUpsertPayloadSchema as liveSessionExerciseUpsertPayloadSchema,
} from "@/domain/sync/schema";
import type { ActiveSessionSetDto } from "@/sync/types";
import { STRATEGY_VERSIONS, wrapPrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";

// athletic-measurement-profiles-architecture-evaluation.md §13.5 (NC-13),
// §14.5 — the rollback-compatibility boundary the O-7/O-13 select was
// chosen for:
//
//   * a NEW-build (Release 2), profile-scoped `load_reps` setLog op must
//     still parse against a server rolled all the way back to PRE-migration
//     `0013` — frozen below, because the LIVE schema module
//     (src/domain/sync/schema.ts) was permanently widened BY migration 0013
//     and can no longer stand in for that older shape;
//   * a NEW-build `sessionExercise` op — which, per O-13 §12.3, now ALWAYS
//     carries `measurementProfile`/`loadBasis` (the one fixed-key-set
//     exception to "profile-scoped") — parses against a server rolled back
//     only to Release 1 (the LIVE schema: unchanged since R1, because only
//     the CLIENT's emission changed in Release 2, not the schema itself),
//     but FAILS against that same pre-`0013` rollback target, whose
//     `.strict()` schema has never heard of either key.
//
// This is exactly §14.5's stated rollback window: roll back to R1, fine;
// roll back past migration 0013 and `sessionExercise` ops start
// dead-lettering (a pre-existing, accepted limit — not a regression this
// stage introduces), while `load_reps` `setLog` ops stay safe all the way
// back, because O-13 never adds a key that profile didn't already send.

// Frozen exactly as of commit 137bd09 — the build immediately preceding
// migration 0013 / the athletic-measurement-profiles feature (see
// `git show 137bd09:src/domain/sync/schema.ts`). Deliberately NOT derived
// from the live module: the whole point of a frozen copy is that the live
// module's own future evolution cannot silently drag this proof forward
// with it. `prescription` is loosened to `z.unknown()` here (rather than
// re-freezing the entire nested prescriptionSnapshotSchema) because every
// payload below sends it as `null`, which satisfies either shape — the only
// thing this test cares about is the KEY SET, not the prescription value.
const uuidv7Schema = z.string().refine(isUuidv7, { message: "must be a UUIDv7" });

const preMigration0013SetLogUpsertPayloadSchema = z
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

const preMigration0013SessionExerciseUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    sessionId: uuidv7Schema,
    exerciseId: z.string().uuid().optional(),
    position: z.number().int().min(0).optional(),
    source: z.enum(["template", "adhoc"]).optional(),
    prescription: z.unknown().nullable().optional(),
    skipped: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

describe("NC-13 — rollback compatibility across the profile-scoped emission boundary (O-13)", () => {
  it("a new-build, profile-scoped load_reps setLog op parses against the pre-migration-0013 schema", () => {
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
    };
    const op = setLogFullRowOp(newId(), set, "load_reps");

    // The real, unmodified emitter — no distanceM/durationS on the wire at
    // all for load_reps — is what makes this safe: the pre-0013 server's
    // `.strict()` schema never sees a key it doesn't recognize.
    expect("distanceM" in op.payload).toBe(false);
    expect("durationS" in op.payload).toBe(false);
    expect(preMigration0013SetLogUpsertPayloadSchema.safeParse(op.payload).success).toBe(true);
    // Also still parses against the live (R1/R2-unchanged) schema.
    expect(liveSetLogUpsertPayloadSchema.safeParse(op.payload).success).toBe(true);
  });

  it("a new-build sessionExercise op (measurementProfile/loadBasis always present) parses against the R1 (live) schema but fails against the pre-migration-0013 schema", () => {
    // Exactly what `sessionExerciseFullRowOp` (src/sync/activeSession.ts)
    // now always sends — measurementProfile/loadBasis are a fixed key set,
    // O-13's one exception to "profile-scoped".
    const payload = buildSessionExerciseUpsertPayload({
      id: newId(),
      sessionId: newId(),
      exerciseId: newId(),
      position: 0,
      source: "template",
      prescription: null,
      measurementProfile: "load_reps",
      loadBasis: "unspecified",
      skipped: false,
      notes: null,
    });

    expect(liveSessionExerciseUpsertPayloadSchema.safeParse(payload).success).toBe(true);

    const preMigrationResult =
      preMigration0013SessionExerciseUpsertPayloadSchema.safeParse(payload);
    expect(preMigrationResult.success).toBe(false);
    if (!preMigrationResult.success) {
      // `.strict()`'s rejection is a single `unrecognized_keys` issue
      // naming every extra key on its own `keys` array (not one issue per
      // key, and its `path` is empty) — asserting on `keys` is what proves
      // it's genuinely `measurementProfile`/`loadBasis` causing the
      // rejection, not an unrelated validation failure.
      const unrecognized = preMigrationResult.error.issues.flatMap(
        (issue) => (issue as { keys?: string[] }).keys ?? [],
      );
      expect(unrecognized).toEqual(expect.arrayContaining(["measurementProfile", "loadBasis"]));
    }
  });

  // Mutation witness — if the frozen pre-migration-0013 schema (incorrectly)
  // already knew about these two keys, it would accept the same payload,
  // proving the failure above is genuinely due to the key-set difference
  // this test exists to pin down, not an unrelated validation quirk.
  it("mutation witness — a pre-migration-0013 schema widened to know the two keys accepts the same payload", () => {
    const payload = buildSessionExerciseUpsertPayload({
      id: newId(),
      sessionId: newId(),
      exerciseId: newId(),
      position: 0,
      source: "template",
      prescription: null,
      measurementProfile: "load_reps",
      loadBasis: "unspecified",
      skipped: false,
      notes: null,
    });

    const widenedPreMigrationSchema = preMigration0013SessionExerciseUpsertPayloadSchema.extend({
      measurementProfile: z.string().optional(),
      loadBasis: z.string().nullable().optional(),
    });

    expect(widenedPreMigrationSchema.safeParse(payload).success).toBe(true);
  });
});

// PI-018 U-4 (docs/reviews/workout-prescription-context-architecture-evaluation.md
// §7 C-5 / §10) — the rollback boundary for `prescriptionNotes`, which is
// structurally UNLIKE the `measurementProfile`/`loadBasis` limit above.
//
// Those two are TOP-LEVEL keys on a `.strict()` payload schema, so an older
// server rejects the whole op and it dead-letters. `prescriptionNotes` lives
// one level down, inside `prescription`, which is parsed by the NON-strict
// `prescriptionSnapshotSchema` — so an older server silently STRIPS the key
// and applies the op. The row stores a snapshot without the note; sets,
// session and everything else are unaffected. A rollback degrades; it does
// not dead-letter.
//
// Frozen literal, deliberately NOT imported from the live module — the same
// rule this file's own header states: the live module's future evolution
// must not be able to drag this proof forward with it.
const preFeaturePrescriptionSnapshotDataSchema = z.object({
  exerciseId: z.string().uuid(),
  exerciseName: z.string(),
  // The full setScheme/rirBand/progression vocabulary is irrelevant to this
  // proof and is loosened here on purpose: the only thing under test is
  // whether an UNKNOWN NESTED KEY is stripped or rejected, which is decided
  // by the object's strictness, not by its members' own shapes.
  scheme: z.unknown(),
  targetRir: z.unknown(),
  restSeconds: z.number().int().positive().nullable(),
  progression: z.unknown(),
  appliedModifiers: z.unknown(),
  prefill: z.unknown(),
  measurement: z.unknown().optional(),
  // …and NO `prescriptionNotes` key — that is the point.
});

const preFeaturePrescriptionSnapshotSchema = z.object({
  v: z.literal(1),
  snapshot: preFeaturePrescriptionSnapshotDataSchema,
});

const preFeatureSessionExerciseUpsertPayloadSchema = z
  .object({
    id: uuidv7Schema,
    sessionId: uuidv7Schema,
    exerciseId: z.string().uuid().optional(),
    position: z.number().int().min(0).optional(),
    source: z.enum(["template", "adhoc"]).optional(),
    prescription: preFeaturePrescriptionSnapshotSchema.nullable().optional(),
    measurementProfile: z.string().optional(),
    loadBasis: z.string().nullable().optional(),
    skipped: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

function newBuildPayloadCarryingANote() {
  return buildSessionExerciseUpsertPayload({
    id: newId(),
    sessionId: newId(),
    exerciseId: newId(),
    position: 0,
    source: "template",
    prescription: wrapPrescriptionSnapshot({
      exerciseId: "00000000-0000-0000-0000-000000000001",
      exerciseName: "Bench Press",
      scheme: { type: "fixed", sets: 3, reps: 5 },
      targetRir: { min: 1, max: 2 },
      restSeconds: 150,
      progression: {
        strategyId: "manual",
        strategyVersion: STRATEGY_VERSIONS.manual,
        config: {},
        classification: "user_defined",
      },
      appliedModifiers: null,
      prefill: { loadKg: 100, reps: 5 },
      prescriptionNotes: "Pause 1 s on the chest.",
    }),
    measurementProfile: "load_reps",
    loadBasis: "unspecified",
    skipped: false,
    notes: null,
  });
}

describe("U-4 — PI-018 rollback compatibility: a nested new key degrades, it does not dead-letter", () => {
  it("a new-build sessionExercise op carrying prescriptionNotes still PARSES against a frozen pre-feature schema", () => {
    const payload = newBuildPayloadCarryingANote();
    expect(payload.prescription?.snapshot.prescriptionNotes).toBe("Pause 1 s on the chest.");

    const rolledBack = preFeatureSessionExerciseUpsertPayloadSchema.safeParse(payload);
    expect(rolledBack.success).toBe(true);
  });

  it("the rolled-back parse STRIPS the note rather than rejecting the op, and keeps every pre-existing snapshot field", () => {
    const payload = newBuildPayloadCarryingANote();
    const rolledBack = preFeatureSessionExerciseUpsertPayloadSchema.safeParse(payload);
    expect(rolledBack.success).toBe(true);
    if (!rolledBack.success) return;

    const snapshot = rolledBack.data.prescription?.snapshot as Record<string, unknown> | undefined;
    // Stripped — the old server stores a snapshot without the note…
    expect(snapshot && "prescriptionNotes" in snapshot).toBe(false);
    // …and nothing else about the op is harmed: `restSeconds`, which has
    // been in the snapshot since Phase 3, still arrives (this is exactly the
    // §7 C-1 "rest but no note" asymmetry, seen from the wire side).
    expect(snapshot?.restSeconds).toBe(150);
    expect(rolledBack.data.skipped).toBe(false);
  });

  it("and it still parses against the LIVE schema, where the note survives", () => {
    const payload = newBuildPayloadCarryingANote();
    const live = liveSessionExerciseUpsertPayloadSchema.safeParse(payload);
    expect(live.success).toBe(true);
    if (!live.success) return;
    expect(live.data.prescription?.snapshot.prescriptionNotes).toBe("Pause 1 s on the chest.");
  });
});
