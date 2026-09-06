import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  DEFAULT_CONTRIBUTION_WEIGHT,
  DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT,
} from "@/domain/exercises/schema";
import { DEFAULT_STRENGTH_ESTIMATE_MODE } from "@/domain/strength/estimateMode";
import { exerciseCatalogSeedLog, exerciseMuscleContributions, exercises, users } from "@/db/schema";
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

type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

// Marks catalog slugs as applied to a user. `onConflictDoNothing` guards the
// (serialized in practice, but not enforced) case of two seed runs racing.
async function recordApplied(
  tx: AppTx,
  userId: string,
  items: readonly { slug: string }[],
): Promise<void> {
  await tx
    .insert(exerciseCatalogSeedLog)
    .values(items.map((item) => ({ userId, slug: item.slug })))
    .onConflictDoNothing({
      target: [exerciseCatalogSeedLog.userId, exerciseCatalogSeedLog.slug],
    });
}

// Catalog exercises are fully mutable by the user post-seed (domain-model.md
// §9), so a slug already recorded in `exercise_catalog_seed_log` is skipped
// entirely on reseed — not touched, not re-inserted, not given fresh
// contributions — regardless of whether the row still exists, was edited,
// or was hard-deleted (Phase 1 review H1). Only slugs never applied to this
// user get inserted, so a future catalog addition still seeds correctly.
// The whole per-user seed is one transaction: a partial failure must not
// leave an exercise row inserted without its log entry, or the next deploy
// would treat it as "new" again.
export async function seedExerciseCatalogForUser(db: AppDb, userId: string): Promise<void> {
  if (EXERCISE_CATALOG.length === 0) return;

  await db.transaction(async (tx) => {
    const appliedRows = await tx
      .select({ slug: exerciseCatalogSeedLog.slug })
      .from(exerciseCatalogSeedLog)
      .where(eq(exerciseCatalogSeedLog.userId, userId));
    const applied = new Set(appliedRows.map((row) => row.slug));

    // Ledger bootstrap for users seeded before the ledger existed. An empty
    // ledger alone can't tell "never seeded" from "seeded pre-ledger" — but
    // `exercises.is_seeded` can, and it is decisive: nothing except this
    // function ever writes it (the column defaults to false and neither
    // `createExercise` nor `updateExercise` touches it), and the pre-ledger
    // seed inserted the whole catalog in one atomic statement. So a single
    // surviving `is_seeded` row proves the entire catalog was already
    // applied to this user, and every slug can be recorded without
    // inserting anything — which is what stops a pre-ledger hard delete
    // from being resurrected on the first post-migration seed.
    // This branch can only ever fire once per user: from here on the ledger
    // is non-empty, and under the transaction below an `is_seeded` row can
    // never again coexist with an empty ledger.
    if (applied.size === 0) {
      const [preLedgerRow] = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(eq(exercises.userId, userId), eq(exercises.isSeeded, true)))
        .limit(1);
      if (preLedgerRow) {
        await recordApplied(tx, userId, EXERCISE_CATALOG);
        return;
      }
    }

    const newItems = EXERCISE_CATALOG.filter((item) => !applied.has(item.slug));
    if (newItems.length === 0) return;

    const rows = newItems.map((item) => ({
      id: slugToUuid(`exercise:${userId}`, item.slug),
      userId,
      name: item.name,
      equipment: item.equipment,
      mechanics: item.mechanics,
      laterality: item.laterality ?? "bilateral",
      loadStepKg: DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT[item.equipment],
      // ADR-011 — new seeds get the catalog's value; omitted falls through to
      // the column's `'auto'` default. Rows seeded before this column existed
      // are reconciled once by `reconcileStrengthEstimates`, because the
      // ledger above makes them unreachable from here forever.
      strengthEstimate: item.strengthEstimate ?? DEFAULT_STRENGTH_ESTIMATE_MODE,
      isSeeded: true,
    }));

    // Arbiter-less `onConflictDoNothing` — deliberately *not*
    // `{ target: exercises.id }`. A slug's row can be absent while its name
    // is taken by an active exercise the user created or renamed, in which
    // case an id-targeted arbiter doesn't apply and the insert instead
    // violates `uq_exercises_active_name`, aborting the transaction; since
    // the ledger writes below roll back with it, every later run repeats
    // the same failure and the deploy pipeline stays blocked (Phase 1
    // verification MED-1). Without a target, Postgres skips any row that
    // violates *any* unique index — both that name collision and the
    // ordinary id collision — while still raising check/FK/not-null
    // violations, so a genuinely malformed catalog entry is not swallowed.
    // The user's row always wins; the slug is recorded as applied either
    // way, so it is never reconsidered.
    // `.returning()` tells us which of `newItems` were genuinely inserted
    // this run, so only those get contributions.
    const inserted = await tx
      .insert(exercises)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: exercises.id });
    const insertedIds = new Set(inserted.map((row) => row.id));

    const contributionRows = newItems
      .filter((item) => insertedIds.has(slugToUuid(`exercise:${userId}`, item.slug)))
      .flatMap((item) => {
        const exerciseId = slugToUuid(`exercise:${userId}`, item.slug);
        return item.contributions.map((c) => ({
          exerciseId,
          muscleGroupId: c.muscleGroupId,
          role: c.role,
          weight: DEFAULT_CONTRIBUTION_WEIGHT[c.role],
        }));
      });

    if (contributionRows.length > 0) {
      await tx.insert(exerciseMuscleContributions).values(contributionRows);
    }

    await recordApplied(tx, userId, newItems);
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
