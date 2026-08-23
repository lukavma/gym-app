import { z } from "zod";

// Canonical muscle group vocabulary v2 — domain-model.md §2, ADR-010.
// Seeded reference data (not a hard-coded DB enum) so future groups are
// additive, but the slug set itself is centralized here so no other layer
// (seed script, UI, API validation) maintains its own copy.
//
// 17 leaves + 1 rollup (`back`, membership [lats, upper_back] via
// ROLLUP_MEMBERS below — a domain constant, deliberately not a DB table or
// `parent_id`). New contribution rows may only target leaves; `back` is
// carried through from legacy data, never newly created (see
// src/server/exercises/service.ts).
export const LEAF_MUSCLE_GROUP_SLUGS = [
  "chest",
  "lats",
  "upper_back",
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
  "adductors",
  "calves",
  "lower_back",
] as const;

export const ROLLUP_MUSCLE_GROUP_SLUGS = ["back"] as const;

export const MUSCLE_GROUP_SLUGS = [
  ...LEAF_MUSCLE_GROUP_SLUGS,
  ...ROLLUP_MUSCLE_GROUP_SLUGS,
] as const;

export type LeafMuscleGroupSlug = (typeof LEAF_MUSCLE_GROUP_SLUGS)[number];
export type RollupMuscleGroupSlug = (typeof ROLLUP_MUSCLE_GROUP_SLUGS)[number];
export type MuscleGroupSlug = (typeof MUSCLE_GROUP_SLUGS)[number];

export const MUSCLE_GROUP_KINDS = ["muscle", "rollup"] as const;
export type MuscleGroupKind = (typeof MUSCLE_GROUP_KINDS)[number];

// Rollup membership (ADR-010) — `back`'s effective/raw volume derives from
// its members' contributions plus any legacy direct-on-`back` rows. Not
// persisted; Phase 6 concern, not Release 1.
export const ROLLUP_MEMBERS: Record<RollupMuscleGroupSlug, readonly LeafMuscleGroupSlug[]> = {
  back: ["lats", "upper_back"],
};

export const muscleGroupSlugSchema = z.enum(MUSCLE_GROUP_SLUGS);
export const leafMuscleGroupSlugSchema = z.enum(LEAF_MUSCLE_GROUP_SLUGS);

export const MUSCLE_GROUP_DISPLAY_NAMES: Record<MuscleGroupSlug, string> = {
  chest: "Chest",
  lats: "Lats",
  upper_back: "Upper Back",
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
  adductors: "Adductors",
  calves: "Calves",
  // Slug retained from v1; erector-specific display added for clarity
  // alongside the new lats/upper_back split (ADR-010).
  lower_back: "Lower Back (Erectors)",
  back: "Back",
};

export interface MuscleGroupDefinition {
  slug: MuscleGroupSlug;
  displayName: string;
  position: number;
  kind: MuscleGroupKind;
}

// Stable display order — also the `position` column value used to seed
// `muscle_groups` (data-model.md §2.3). `back` is add-on-migration, so it's
// appended last; position isn't relied on for leaf/rollup selection logic
// anywhere (see LEAF_MUSCLE_GROUPS).
export const MUSCLE_GROUPS: readonly MuscleGroupDefinition[] = MUSCLE_GROUP_SLUGS.map(
  (slug, index) => ({
    slug,
    displayName: MUSCLE_GROUP_DISPLAY_NAMES[slug],
    position: index + 1,
    kind: (ROLLUP_MUSCLE_GROUP_SLUGS as readonly string[]).includes(slug) ? "rollup" : "muscle",
  }),
);

// The selectable subset for new contribution rows (create, and any new row
// added during an update) — never includes a rollup slug.
export const LEAF_MUSCLE_GROUPS: readonly MuscleGroupDefinition[] = MUSCLE_GROUPS.filter(
  (group) => group.kind === "muscle",
);

export function isMuscleGroupSlug(value: string): value is MuscleGroupSlug {
  return (MUSCLE_GROUP_SLUGS as readonly string[]).includes(value);
}

export function isLeafMuscleGroupSlug(value: string): value is LeafMuscleGroupSlug {
  return (LEAF_MUSCLE_GROUP_SLUGS as readonly string[]).includes(value);
}

export function isRollupMuscleGroupSlug(value: string): value is RollupMuscleGroupSlug {
  return (ROLLUP_MUSCLE_GROUP_SLUGS as readonly string[]).includes(value);
}
