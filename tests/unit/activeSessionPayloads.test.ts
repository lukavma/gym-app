import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import {
  buildWorkoutSessionUpsertPayload,
  buildSessionExerciseUpsertPayload,
  buildSetLogUpsertPayload,
  buildSetLogDeletePayload,
} from "@/domain/sync/payloadBuilders";
import {
  workoutSessionUpsertPayloadSchema,
  sessionExerciseUpsertPayloadSchema,
  setLogUpsertPayloadSchema,
  setLogDeletePayloadSchema,
} from "@/domain/sync/schema";

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
