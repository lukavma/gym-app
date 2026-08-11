import { createHash } from "node:crypto";
import {
  DEFAULT_CONTRIBUTION_WEIGHT,
  DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT,
} from "@/domain/exercises/schema";
import { exerciseMuscleContributions, exercises, users } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { EXERCISE_CATALOG } from "./exerciseCatalog";

// Seed rows need a *stable* id across reseeds (derived from the catalog
// slug + owning user), not a fresh UUIDv7 from `newId()` — a new random id
// on every deploy would defeat idempotency. This is the one other place
// besides legacy `users.id` (see the comment there) that departs from the
// UUIDv7-via-newId() convention, and it's intentional: these ids are never
// exposed to a user as "when was this created," they're a synthetic upsert
// key. Format is a valid UUID (RFC 4122 v5-shaped) but not cryptographic —
// slugs are developer-controlled, not user input.
function slugToUuid(namespace: string, slug: string): string {
  const hash = createHash("sha1").update(`${namespace}:${slug}`).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Catalog exercises are fully mutable by the user post-seed (domain-model.md
// §9), so reseeding uses onConflictDoNothing rather than an upsert — a
// redeploy must never silently overwrite a user's edits to a seeded
// exercise. New catalog entries in a future data update still get inserted;
// only rows that already exist (by id) are left alone.
export async function seedExerciseCatalogForUser(db: AppDb, userId: string): Promise<void> {
  const rows = EXERCISE_CATALOG.map((item) => ({
    id: slugToUuid(`exercise:${userId}`, item.slug),
    userId,
    name: item.name,
    equipment: item.equipment,
    mechanics: item.mechanics,
    laterality: item.laterality ?? "bilateral",
    loadStepKg: DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[item.equipment],
    isSeeded: true,
  }));

  if (rows.length === 0) return;
  await db.insert(exercises).values(rows).onConflictDoNothing({ target: exercises.id });

  const contributionRows = EXERCISE_CATALOG.flatMap((item) => {
    const exerciseId = slugToUuid(`exercise:${userId}`, item.slug);
    return item.contributions.map((c) => ({
      exerciseId,
      muscleGroupId: c.muscleGroupId,
      role: c.role,
      weight: DEFAULT_CONTRIBUTION_WEIGHT[c.role],
    }));
  });

  await db
    .insert(exerciseMuscleContributions)
    .values(contributionRows)
    .onConflictDoNothing({
      target: [exerciseMuscleContributions.exerciseId, exerciseMuscleContributions.muscleGroupId],
    });
}

// Single-user app today (no invite/multi-tenant flow yet) — seeding for
// every existing user row is equivalent to "seed for the user" but doesn't
// require the deploy pipeline to know a specific user id, and degrades
// safely to a no-op before the first-run setup flow has created anyone.
export async function seedExerciseCatalogForAllUsers(db: AppDb): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users);
  for (const user of allUsers) {
    await seedExerciseCatalogForUser(db, user.id);
  }
}

// Exported for tests that need to know a catalog item's deterministic id
// without duplicating the hash logic.
export function seededExerciseId(userId: string, slug: string): string {
  return slugToUuid(`exercise:${userId}`, slug);
}
