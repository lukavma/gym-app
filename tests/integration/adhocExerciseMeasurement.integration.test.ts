// H-2 remediation (docs/reviews/athletic-measurement-profiles-release-2-review.md)
// — "addAdhocExercise hardcodes {profile: 'load_reps', loadBasis:
// 'unspecified'} regardless of what the athlete picked, so ad-hoc adding any
// of the five new profiles is rejected measurement_profile_mismatch and the
// slot is unusable." The fix threads the real ExerciseDto measurement
// through AddAdhocExercise.tsx -> activeSessionStore.addAdhocExercise ->
// activeSession.addAdhocExercise (src/sync/activeSession.ts), defaulting to
// load_reps/unspecified only when the caller genuinely supplies nothing.
//
// This file proves the fix at the ONLY level that actually matters for
// "the slot is usable": the REAL client mutator (src/sync/activeSession.ts,
// against a real fake-indexeddb, exactly like
// tests/unit/measurementActiveSession.test.ts's own house convention) emits
// a sessionExercise op that the REAL server (`applySyncBatch`, against a real
// PGlite Postgres, exactly like measurementSync.integration.test.ts's own
// house convention) accepts with zero rejected ops — never
// measurement_profile_mismatch — for every one of the five NEW profiles.
// tests/unit/measurementActiveSession.test.ts's own H-2 block already proves
// the narrower "does the local aggregate/op carry the right value" property;
// this file is the full round-trip that a hand-built payload (as
// measurementSync.integration.test.ts's own fixtures use) could never prove,
// since a hand-built payload can't regress if activeSession.ts's threading
// breaks.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { users } from "@/db/schema";
import { seedMuscleGroups } from "@/db/seed";
import { createExercise } from "@/server/exercises/service";
import { applySyncBatch } from "@/server/sync/service";
import { newId } from "@/domain/ids/uuidv7";
import type { SyncOpEnvelope } from "@/domain/sync/schema";
import { MEASUREMENT_PROFILES, type MeasurementProfile } from "@/domain/measurement/profile";

// Same shape as measurementSync.integration.test.ts's own flush mock isn't
// needed there (it never touches the client) — here it is, since this file
// drives the real src/sync/activeSession.ts mutators, which fire-and-forget
// a `flushOutbox()` this test must not let attempt a real network call. Same
// idiom as tests/unit/measurementActiveSession.test.ts.
const flushOutbox = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
);
vi.mock("@/sync/flush", () => ({ flushOutbox }));

// Verbatim copies of measurementSync.integration.test.ts's own house
// fixtures/helpers (that file's are module-local, not exported).
async function insertTestUser(db: AppDb, email: string) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  return user;
}

const BASE_EXERCISE_INPUT = {
  equipment: "barbell" as const,
  mechanics: "compound" as const,
  laterality: "bilateral" as const,
  loadStepKg: 2.5,
  contributions: [{ muscleGroupId: "quads" as const, role: "primary" as const, weight: 1 }],
};

async function createProfiledExercise(
  db: AppDb,
  userId: string,
  name: string,
  measurementProfile: MeasurementProfile,
) {
  return createExercise(db, userId, { ...BASE_EXERCISE_INPUT, name, measurementProfile });
}

// Same idb-reading idiom as tests/unit/measurementActiveSession.test.ts's own
// `readOutbox` — reads whatever src/sync/activeSession.ts's mutators just
// enqueued into the real (fake) IndexedDB outbox store.
async function readOutbox(): Promise<{ entity: string; payload: Record<string, unknown> }[]> {
  const { getIdb } = await import("@/sync/db");
  const db = await getIdb();
  const all = await db.getAllFromIndex("outbox", "byCreatedAt");
  return all.map((op) => ({ entity: op.entity, payload: op.payload }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  flushOutbox.mockClear();
});

describe("H-2 — ad-hoc-adding a non-load_reps exercise through the REAL client mutator round-trips with zero rejected ops", () => {
  const NEW_PROFILES = MEASUREMENT_PROFILES.filter((p) => p !== "load_reps");

  for (const profile of NEW_PROFILES) {
    it(`${profile}: the sessionExercise op src/sync/activeSession.ts emits is accepted server-side (no measurement_profile_mismatch)`, async () => {
      const db = await createTestDb();
      await seedMuscleGroups(db);
      const user = await insertTestUser(db, `h2-${profile}@example.com`);
      const exercise = await createProfiledExercise(db, user.id, `H-2 ${profile}`, profile);

      const { startSession, addAdhocExercise } = await import("@/sync/activeSession");

      // A bare session, no template exercises — exactly what "Start workout"
      // -> "+ Add exercise" looks like locally before anything else is
      // logged.
      await startSession({
        blockId: null,
        templateId: null,
        templateName: null,
        weekIndex: null,
        isDeload: false,
        exercises: [],
      });

      // Apply the session's own workoutSession op server-side first, the
      // same order a real flush would send it in, so the FK the
      // sessionExercise op needs actually exists.
      const opsAfterStart = await readOutbox();
      const sessionOp = opsAfterStart.find((op) => op.entity === "workoutSession");
      if (!sessionOp) throw new Error("expected a workoutSession op after startSession");
      const sessionEnvelope: SyncOpEnvelope = {
        opId: newId(),
        entity: "workoutSession",
        operation: "upsert",
        payload: sessionOp.payload,
      };
      const sessionResult = await applySyncBatch(db, user.id, [sessionEnvelope]);
      expect(sessionResult.rejected).toEqual([]);

      // Ad-hoc-add through the REAL, fixed client mutator, threading the
      // exercise's real measurement — exactly what the fixed
      // AddAdhocExercise.tsx -> activeSessionStore -> activeSession chain
      // now does (an ExerciseDto's own measurementProfile/loadBasis).
      const session = await addAdhocExercise(exercise.id, exercise.name, {
        profile: exercise.measurementProfile,
        loadBasis: exercise.loadBasis,
      });
      const adhoc = session.exercises.find((e) => e.source === "adhoc");
      if (!adhoc) throw new Error("expected an adhoc exercise on the session");

      const opsAfterAdd = await readOutbox();
      const slotOp = opsAfterAdd.find(
        (op) => op.entity === "sessionExercise" && op.payload.id === adhoc.id,
      );
      if (!slotOp) throw new Error("expected a sessionExercise op for the adhoc slot");

      const slotEnvelope: SyncOpEnvelope = {
        opId: newId(),
        entity: "sessionExercise",
        operation: "upsert",
        payload: slotOp.payload,
      };
      const result = await applySyncBatch(db, user.id, [slotEnvelope]);

      // The binding assertion, asserted FIRST and deliberately not combined
      // with anything above it: zero rejected ops, and specifically never
      // measurement_profile_mismatch — H-2's exact failure signature. (H-2's
      // negative control reverts this to always freeze load_reps/unspecified
      // regardless of `measurement`; every profile here except `load_reps`
      // itself then mismatches the exercise's REAL frozen profile and this
      // is exactly where that surfaces.)
      expect(result.rejected).toEqual([]);
      expect(result.applied).toEqual([slotEnvelope.opId]);

      // Only reached once the server round-trip above already proved the
      // slot is usable — these are mutation witnesses confirming the
      // accepted row's shape came from the real ExerciseDto's measurement,
      // not merely that the server happened not to reject it.
      expect(adhoc.measurement).toEqual({
        profile: exercise.measurementProfile,
        loadBasis: exercise.loadBasis,
      });
      expect(slotOp.payload).toMatchObject({
        measurementProfile: profile,
        loadBasis: exercise.loadBasis,
      });
    });
  }
});
