import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { exercises, users } from "@/db/schema";
import type { StrengthEstimateMode } from "@/domain/strength/estimateMode";
import { seededExerciseId } from "./exercises";

// ADR-011 / estimated-1RM revision §14.4 (owner decision O-2) — the one-shot
// reconcile that forces the two seeded catalog exercises whose stored load
// cannot be fed to a 1RM equation to `strength_estimate = 'off'`:
//
//   * `machine-assisted-pull-up` — the logged number is the ASSISTANCE, a
//     non-negative value whose meaning is inverted and unmodelled: a larger
//     number is an easier set (revision §6.1, "Must be 'off'").
//   * `dumbbell-farmers-carry` — time/distance work, so its reps are
//     fabricated and no reps-to-failure input exists (revision §6.1, PI-005).
//
// `src/db/seed/exerciseCatalog.ts` carries the same `'off'` for both slugs, so
// a row seeded from now on is correct at insert. This step exists for rows
// seeded BEFORE the column did: the catalog seed is ledger-gated and
// insert-if-absent, so it never touches an existing row again.
//
// WHY HERE AND NOT IN THE MIGRATION. §14.4 words the reconcile as "in the same
// migration ... via their deterministic `slugToUuid` ids", and those two
// halves cannot both be satisfied: the id is a SHA-1 of
// `exercise:<user_id>:<slug>`, and core PostgreSQL has md5 and sha224/256/384/
// 512 but no sha1. ADR-010 hit the identical problem and settled it for this
// repository, verbatim: "A SQL migration cannot safely select renamed seeded
// exercises: slugs are not stored, names are mutable, and reproducing the id
// hash in SQL would need pgcrypto. **Both name matching and pgcrypto are
// rejected.**" Its accepted mechanism is a `runSeed` step that derives the id
// with the existing `seededExerciseId(userId, slug)` helper and runs one
// conditional update. This file is that mechanism, applied to this column —
// so the *identity* half of §14.4 is honoured exactly (the reconcile finds a
// renamed row, which a name match would miss), and only its *location* moves,
// which also keeps `drizzle/` free of DML as every other migration is.
//
// IDEMPOTENCE. State-predicated in the house idiom (ADR-010; the
// `users.default_volume_preset_id` backfill in `volumePresets.ts`): the
// predicate `strength_estimate = 'auto'` is consumed by the update itself, so
// every later run touches zero rows. The one case where it fires twice is an
// athlete deliberately setting one of these two exercises back to `'auto'` —
// which is the state §6.1 says must not exist for them, so re-asserting it is
// the rule, not a fight with the user.

export const STRENGTH_ESTIMATE_OFF_SLUGS = [
  "machine-assisted-pull-up",
  "dumbbell-farmers-carry",
] as const;

const OFF: StrengthEstimateMode = "off";
const AUTO: StrengthEstimateMode = "auto";

export interface StrengthEstimateReconciliationSummary {
  users: number;
  // Rows this run actually switched off. Zero on every run after the first,
  // and zero for a database seeded after the column existed.
  updated: number;
  // Slugs whose row was absent or already `'off'` — the steady state.
  noop: number;
}

// node-postgres exposes `rowCount` (`number | null`); PGlite exposes
// `affectedRows` and leaves `rowCount` undefined. Same portability shim as
// `reconcileContributions.ts`.
type PortableUpdateResult = { rowCount?: number | null; affectedRows?: number };

export async function reconcileStrengthEstimates(
  db: AppDb,
): Promise<StrengthEstimateReconciliationSummary> {
  const allUsers = await db.select({ id: users.id }).from(users);
  let updated = 0;
  let noop = 0;

  for (const user of allUsers) {
    for (const slug of STRENGTH_ESTIMATE_OFF_SLUGS) {
      const exerciseId = seededExerciseId(user.id, slug);
      const result = (await db
        .update(exercises)
        .set({ strengthEstimate: OFF, updatedAt: new Date() })
        .where(
          and(
            eq(exercises.id, exerciseId),
            eq(exercises.userId, user.id),
            // Only a row this seeder created. A user-authored exercise can
            // never collide — the id is derived, not chosen — but the guard
            // makes that explicit rather than incidental.
            eq(exercises.isSeeded, true),
            // The self-consuming half.
            eq(exercises.strengthEstimate, AUTO),
          ),
        )) as PortableUpdateResult;
      const rows = result.rowCount ?? result.affectedRows ?? 0;
      if (rows > 0) updated += rows;
      else noop += 1;
    }
  }

  return { users: allUsers.length, updated, noop };
}
