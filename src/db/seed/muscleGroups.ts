import { sql } from "drizzle-orm";
import { MUSCLE_GROUPS } from "@/domain/exercises/muscleGroups";
import { muscleGroups } from "@/db/schema";
import type { AppDb } from "@/db/client";

// Reference vocabulary, not user-editable (domain-model.md §2) — safe to
// keep in sync with the domain constant on every deploy.
export async function seedMuscleGroups(db: AppDb): Promise<void> {
  await db
    .insert(muscleGroups)
    .values(
      MUSCLE_GROUPS.map((group) => ({
        id: group.slug,
        displayName: group.displayName,
        position: group.position,
        kind: group.kind,
      })),
    )
    .onConflictDoUpdate({
      target: muscleGroups.id,
      set: {
        displayName: sql`excluded.display_name`,
        position: sql`excluded.position`,
        kind: sql`excluded.kind`,
      },
    });
}
