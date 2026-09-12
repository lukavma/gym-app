import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import {
  buildWorkoutSessionUpsertPayload,
  buildSessionExerciseUpsertPayload,
  buildSetLogUpsertPayload,
  buildSetLogDeletePayload,
  buildSetLogCorrectionPayload,
} from "@/domain/sync/payloadBuilders";
import {
  workoutSessionUpsertPayloadSchema,
  sessionExerciseUpsertPayloadSchema,
  setLogUpsertPayloadSchema,
  setLogDeletePayloadSchema,
} from "@/domain/sync/schema";
import { STRATEGY_VERSIONS, wrapPrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";

// Regression coverage for BLOCKER-1 ("skip, exercise notes, and in-session
// set edits never reach PostgreSQL because the enqueued payload is missing
// its required parent FK") and MEDIUM-1 (full-row upserts, not partial
// diffs). Each case below is shaped exactly like the payload the
// corresponding src/sync/activeSession.ts mutator now constructs (see that
// file's *FullRowOp helpers) — full row, every schema-accepted field
// populated, parent id included. If a mutator ever regresses back to a
// partial patch missing a required parent id, the matching case here fails
// both the builder's own .parse() (thrown, not silently returned) and the
// schema.safeParse() assertion.
//
// There is no fake-indexeddb (or similar) dependency in this repo, and
// activeSession.ts's mutators go through the real `idb` package against a
// browser IndexedDB via getIdb() — not available in the node test
// environment configured in vitest.config.ts. Testing the payload builders
// directly, with one input per mutator/entity/operation combination shaped
// exactly like what each mutator now builds, is the lightest-weight way to
// prove every payload shape the client constructs is schema-valid without
// standing up a fake IndexedDB environment.

const sessionId = newId();
const sessionExerciseId = newId();
const setId = newId();

describe("buildWorkoutSessionUpsertPayload", () => {
  it("parses a startSession-shaped full row (status in_progress)", () => {
    const payload = buildWorkoutSessionUpsertPayload({
      id: sessionId,
      blockId: newId(),
      templateId: newId(),
      templateName: "Push/Pull/Legs",
      weekIndex: 2,
      isDeload: false,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      clientId: null,
      notes: null,
    });
    expect(workoutSessionUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("parses a setSessionNotes-shaped full row", () => {
    const payload = buildWorkoutSessionUpsertPayload({
      id: sessionId,
      blockId: null,
      templateId: null,
      templateName: null,
      weekIndex: null,
      isDeload: false,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      clientId: null,
      notes: "felt strong today",
    });
    expect(workoutSessionUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("parses a completeSession-shaped full row (status completed + completedAt)", () => {
    const payload = buildWorkoutSessionUpsertPayload({
      id: sessionId,
      blockId: newId(),
      templateId: newId(),
      templateName: "Push/Pull/Legs",
      weekIndex: 2,
      isDeload: false,
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      clientId: null,
      notes: null,
    });
    expect(workoutSessionUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("parses a discardSession-shaped full row (local session, status discarded)", () => {
    const payload = buildWorkoutSessionUpsertPayload({
      id: sessionId,
      blockId: null,
      templateId: null,
      templateName: null,
      weekIndex: null,
      isDeload: false,
      status: "discarded",
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      clientId: null,
      notes: null,
    });
    expect(workoutSessionUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("parses a discardSession-shaped minimal payload (foreign session, id + status only)", () => {
    const payload = buildWorkoutSessionUpsertPayload({ id: sessionId, status: "discarded" });
    expect(workoutSessionUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("throws instead of silently returning when a required id is missing", () => {
    expect(() =>
      // @ts-expect-error — intentionally omitting the required `id` to prove
      // the belt-and-suspenders runtime parse rejects it (not just types).
      buildWorkoutSessionUpsertPayload({ status: "discarded" }),
    ).toThrow();
  });
});

describe("buildSessionExerciseUpsertPayload", () => {
  it("parses an addAdhocExercise-shaped full row", () => {
    const payload = buildSessionExerciseUpsertPayload({
      id: sessionExerciseId,
      sessionId,
      exerciseId: newId(),
      position: 3,
      source: "adhoc",
      prescription: null,
      skipped: false,
      notes: null,
    });
    expect(sessionExerciseUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  // BLOCKER-1's exact regression: setExerciseSkipped used to enqueue only
  // `{ id, skipped }`, missing the required `sessionId` parent FK. The
  // full-row payload the mutator now builds must include it.
  it("parses a setExerciseSkipped-shaped full row (includes required sessionId)", () => {
    const payload = buildSessionExerciseUpsertPayload({
      id: sessionExerciseId,
      sessionId,
      exerciseId: newId(),
      position: 0,
      source: "template",
      prescription: null,
      skipped: true,
      notes: null,
    });
    expect(sessionExerciseUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  // BLOCKER-1's exact regression: setExerciseNotes used to enqueue only
  // `{ id, notes }`, missing the required `sessionId` parent FK.
  it("parses a setExerciseNotes-shaped full row (includes required sessionId)", () => {
    const payload = buildSessionExerciseUpsertPayload({
      id: sessionExerciseId,
      sessionId,
      exerciseId: newId(),
      position: 0,
      source: "template",
      prescription: null,
      skipped: false,
      notes: "elbow felt tight on set 2",
    });
    expect(sessionExerciseUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  // U-3 (docs/reviews/workout-prescription-context-architecture-evaluation.md
  // §2 R-B / §10) — THE strip hazard, and the only reason PI-018 touches a
  // Zod schema at all. The frozen snapshot rides to the server INSIDE this
  // payload's `prescription` field, and this builder `.parse()`s the payload.
  // Zod 3's `z.object` strips undeclared keys silently rather than rejecting
  // them, so if `prescriptionNotes` were absent from
  // `prescriptionSnapshotDataSchema` the note would survive in the local
  // IndexedDB aggregate (never parsed) and vanish on the wire — no error
  // anywhere, and the note gone on cross-device adopt or post-eviction
  // resume. Reverting only that schema key must fail THIS test (NC-1).
  it("carries a snapshot's prescriptionNotes through the payload parse instead of silently stripping it", () => {
    const note = "Pause 1 s on the chest.\nElbows ~45°.";
    const payload = buildSessionExerciseUpsertPayload({
      id: sessionExerciseId,
      sessionId,
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
        prescriptionNotes: note,
      }),
      measurementProfile: "load_reps",
      loadBasis: "unspecified",
      skipped: false,
      notes: null,
    });

    expect(payload.prescription?.snapshot.prescriptionNotes).toBe(note);
    // The sibling frozen field the card renders on the same line, asserted
    // here too so a schema regression cannot pass by keeping only one.
    expect(payload.prescription?.snapshot.restSeconds).toBe(150);
    expect(sessionExerciseUpsertPayloadSchema.safeParse(payload).success).toBe(true);
    // §3.4 — the note rides INSIDE `prescription`; no new top-level payload
    // key is introduced, and the `.strict()` key set is unchanged.
    expect("prescriptionNotes" in payload).toBe(false);
  });

  it("carries an explicit null prescriptionNotes (frozen 'no program note') rather than dropping the key", () => {
    const payload = buildSessionExerciseUpsertPayload({
      id: sessionExerciseId,
      sessionId,
      exerciseId: newId(),
      position: 0,
      source: "template",
      prescription: wrapPrescriptionSnapshot({
        exerciseId: "00000000-0000-0000-0000-000000000001",
        exerciseName: "Bench Press",
        scheme: { type: "fixed", sets: 3, reps: 5 },
        targetRir: null,
        restSeconds: null,
        progression: {
          strategyId: "manual",
          strategyVersion: STRATEGY_VERSIONS.manual,
          config: {},
          classification: "user_defined",
        },
        appliedModifiers: null,
        prefill: { loadKg: null, reps: null },
        prescriptionNotes: null,
      }),
      measurementProfile: "load_reps",
      loadBasis: "unspecified",
      skipped: false,
      notes: null,
    });

    expect(payload.prescription?.snapshot).toHaveProperty("prescriptionNotes");
    expect(payload.prescription?.snapshot.prescriptionNotes).toBeNull();
  });

  it("throws instead of silently returning when the required sessionId is missing", () => {
    expect(() =>
      // @ts-expect-error — intentionally omitting the required `sessionId`
      // to reproduce BLOCKER-1's exact defect shape.
      buildSessionExerciseUpsertPayload({
        id: sessionExerciseId,
        skipped: true,
      }),
    ).toThrow();
  });
});

describe("buildSetLogUpsertPayload", () => {
  it("parses a logSet-shaped full row", () => {
    const payload = buildSetLogUpsertPayload({
      id: setId,
      sessionExerciseId,
      setNumber: 1,
      isWarmup: false,
      weightKg: 100,
      reps: 5,
      rir: 2,
      loggedAt: new Date().toISOString(),
      notes: null,
    });
    expect(setLogUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  // BLOCKER-1's exact regression: editSet used to enqueue `{ id, ...patch }`,
  // missing the required `sessionExerciseId` parent FK.
  it("parses an editSet-shaped full row (includes required sessionExerciseId)", () => {
    const payload = buildSetLogUpsertPayload({
      id: setId,
      sessionExerciseId,
      setNumber: 1,
      isWarmup: false,
      weightKg: 102.5,
      reps: 4,
      rir: 1,
      loggedAt: new Date().toISOString(),
      notes: "bumped weight",
    });
    expect(setLogUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("throws instead of silently returning when the required sessionExerciseId is missing", () => {
    expect(() =>
      // @ts-expect-error — intentionally omitting the required
      // `sessionExerciseId` to reproduce BLOCKER-1's exact defect shape.
      buildSetLogUpsertPayload({
        id: setId,
        weightKg: 102.5,
      }),
    ).toThrow();
  });
});

describe("buildSetLogDeletePayload", () => {
  it("parses a deleteSet-shaped payload", () => {
    const payload = buildSetLogDeletePayload({ id: setId });
    expect(setLogDeletePayloadSchema.safeParse(payload).success).toBe(true);
  });
});

// O-13 (athletic-measurement-profiles-architecture-evaluation.md §12.3) —
// closes the "never schema-parsed client-side" gap `correctHistorySet`
// (src/sync/corrections.ts) previously had: it built its payload as a bare
// object literal, with no `.parse()` at all. `buildSetLogCorrectionPayload`
// reuses `setLogUpsertPayloadSchema` itself (a correction IS exactly that
// schema's partial shape — every field but `id`/`sessionExerciseId` is
// already optional/nullable there), rather than a second schema.
describe("buildSetLogCorrectionPayload", () => {
  it("parses a correctHistorySet-shaped partial payload (weight/reps/rir only)", () => {
    const payload = buildSetLogCorrectionPayload({
      id: setId,
      sessionExerciseId,
      weightKg: 102.5,
      reps: 4,
      rir: 1,
      isWarmup: false,
      notes: "bumped weight",
    });
    expect(setLogUpsertPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("parses a single-field distance/duration correction (the load_distance/duration case)", () => {
    const payload = buildSetLogCorrectionPayload({
      id: setId,
      sessionExerciseId,
      durationS: null,
    });
    expect(payload).toEqual({ id: setId, sessionExerciseId, durationS: null });
  });

  it("throws instead of silently returning when the required sessionExerciseId is missing", () => {
    expect(() =>
      // @ts-expect-error — intentionally omitting the required
      // `sessionExerciseId`, mirroring BLOCKER-1's original shape for the
      // other builders.
      buildSetLogCorrectionPayload({ id: setId, weightKg: 100 }),
    ).toThrow();
  });

  it("throws on an out-of-range value the previous, unvalidated object literal would have let through silently", () => {
    expect(() =>
      buildSetLogCorrectionPayload({
        id: setId,
        sessionExerciseId,
        // `reps` max is 100 (setLogUpsertPayloadSchema) — this used to reach
        // the outbox (and the wire) completely unchecked.
        reps: 999,
      }),
    ).toThrow();
  });
});
