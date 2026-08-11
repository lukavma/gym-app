import { z } from "zod";

// Canonical muscle group vocabulary — domain-model.md §2. Seeded reference
// data (not a hard-coded DB enum) so future groups are additive, but the
// slug set itself is centralized here so no other layer (seed script, UI,
// API validation) maintains its own copy.
export const MUSCLE_GROUP_SLUGS = [
  "chest",
  "back",
  "front_delts",
  "side_delts",
  "rear_delts",
  "traps",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "lower_back",
] as const;

export type MuscleGroupSlug = (typeof MUSCLE_GROUP_SLUGS)[number];

export const muscleGroupSlugSchema = z.enum(MUSCLE_GROUP_SLUGS);

export const MUSCLE_GROUP_DISPLAY_NAMES: Record<MuscleGroupSlug, string> = {
  chest: "Chest",
  back: "Back",
  front_delts: "Front Delts",
  side_delts: "Side Delts",
  rear_delts: "Rear Delts",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  lower_back: "Lower Back",
};

export interface MuscleGroupDefinition {
  slug: MuscleGroupSlug;
  displayName: string;
  position: number;
}

// Stable display order — also the `position` column value used to seed
// `muscle_groups` (data-model.md §2.3).
export const MUSCLE_GROUPS: readonly MuscleGroupDefinition[] = MUSCLE_GROUP_SLUGS.map(
  (slug, index) => ({
    slug,
    displayName: MUSCLE_GROUP_DISPLAY_NAMES[slug],
    position: index + 1,
  }),
);

export function isMuscleGroupSlug(value: string): value is MuscleGroupSlug {
  return (MUSCLE_GROUP_SLUGS as readonly string[]).includes(value);
}
