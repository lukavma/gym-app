import { createHash } from "node:crypto";
import { isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { users, volumeLandmarks, volumePresets } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { newId } from "@/domain/ids/uuidv7";
import type { MuscleGroupSlug } from "@/domain/exercises/muscleGroups";

// Same technique as `seededExerciseId` (`src/db/seed/exercises.ts`) — a
// deterministic, non-random id so reseeding upserts the same row instead of
// duplicating it. Unlike exercise ids, RP General is a single global row
// (`user_id` null), so the namespace has no per-user component.
function slugToUuid(namespace: string, slug: string): string {
  const hash = createHash("sha1").update(`${namespace}:${slug}`).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const RP_GENERAL_PRESET_ID = slugToUuid("volume-preset", "rp-general");

export const RP_GENERAL_DESCRIPTION =
  "Renaissance Periodization's weekly hard-set volume landmarks (docs/input/rp-volume-landmarks.md), " +
  "seeded as a labeled coaching heuristic — not a validated scientific threshold (GAP-01). " +
  "RP's 'Rear/Side Delts' row is one combined figure; it is duplicated onto both Rear Delts and " +
  "Side Delts here, which is a seeding approximation, not two independent landmarks. RP's 'Back' " +
  "row attaches to the Back rollup only (Lats + Upper Back + Unclassified Back) and is never split " +
  "or duplicated onto its member leaves. RP has no row for Lats, Upper Back, Adductors, Forearms, " +
  "or Lower Back (Erectors) — those groups show volume with no reference band.";

const REAR_SIDE_DELT_NOTE =
  "RP lists Rear Delts and Side Delts as one combined row; this value is duplicated onto both, not independently established.";

interface RpRow {
  muscleGroupId: MuscleGroupSlug;
  mv: number;
  mev: number;
  mavMin: number;
  mavMax: number;
  mrvMin: number;
  note?: string;
}

// docs/input/rp-volume-landmarks.md's "Volume Landmarks" table, mapped to
// vocabulary v2 slugs (ADR-010). `back` gets the rollup's row, never its
// member leaves; Rear/Side Delts is one source row duplicated per the note
// above; `lats`/`upper_back`/`adductors`/`forearms`/`lower_back` are
// deliberately absent (volume-model.md §4 / ADR-010 "Aggregation").
const RP_ROWS: readonly RpRow[] = [
  { muscleGroupId: "abs", mv: 0, mev: 0, mavMin: 16, mavMax: 20, mrvMin: 25 },
  { muscleGroupId: "back", mv: 8, mev: 10, mavMin: 14, mavMax: 22, mrvMin: 25 },
  { muscleGroupId: "biceps", mv: 5, mev: 8, mavMin: 14, mavMax: 20, mrvMin: 26 },
  { muscleGroupId: "triceps", mv: 4, mev: 6, mavMin: 10, mavMax: 14, mrvMin: 18 },
  { muscleGroupId: "calves", mv: 6, mev: 8, mavMin: 12, mavMax: 16, mrvMin: 20 },
  { muscleGroupId: "chest", mv: 8, mev: 10, mavMin: 12, mavMax: 20, mrvMin: 22 },
  { muscleGroupId: "front_delts", mv: 0, mev: 0, mavMin: 6, mavMax: 8, mrvMin: 12 },
  { muscleGroupId: "glutes", mv: 0, mev: 0, mavMin: 4, mavMax: 12, mrvMin: 16 },
  { muscleGroupId: "hamstrings", mv: 4, mev: 6, mavMin: 10, mavMax: 16, mrvMin: 20 },
  { muscleGroupId: "quads", mv: 6, mev: 8, mavMin: 12, mavMax: 18, mrvMin: 20 },
  {
    muscleGroupId: "rear_delts",
    mv: 0,
    mev: 8,
    mavMin: 16,
    mavMax: 22,
    mrvMin: 26,
    note: REAR_SIDE_DELT_NOTE,
  },
  {
    muscleGroupId: "side_delts",
    mv: 0,
    mev: 8,
    mavMin: 16,
    mavMax: 22,
    mrvMin: 26,
    note: REAR_SIDE_DELT_NOTE,
  },
  { muscleGroupId: "traps", mv: 0, mev: 0, mavMin: 12, mavMax: 20, mrvMin: 26 },
];

interface LandmarkSeedRow {
  muscleGroupId: MuscleGroupSlug;
  key: "mv" | "mev" | "mav" | "mrv";
  valueMin: number;
  valueMax: number | null;
  openEnded: boolean;
  note: string | null;
}

function landmarkRowsFor(row: RpRow): LandmarkSeedRow[] {
  const note = row.note ?? null;
  return [
    {
      muscleGroupId: row.muscleGroupId,
      key: "mv",
      valueMin: row.mv,
      valueMax: row.mv,
      openEnded: false,
      note,
    },
    {
      muscleGroupId: row.muscleGroupId,
      key: "mev",
      valueMin: row.mev,
      valueMax: row.mev,
      openEnded: false,
      note,
    },
    {
      muscleGroupId: row.muscleGroupId,
      key: "mav",
      valueMin: row.mavMin,
      valueMax: row.mavMax,
      openEnded: false,
      note,
    },
    {
      muscleGroupId: row.muscleGroupId,
      key: "mrv",
      valueMin: row.mrvMin,
      valueMax: null,
      openEnded: true,
      note,
    },
  ];
}

// Builtin RP General preset + its landmark rows — idempotent upsert keyed
// by the deterministic id above (implementation-plan.md §1.4). `is_builtin`
// / immutability is enforced in `src/server/volume/service.ts`, not here;
// the seed only ever writes this one row and its landmarks.
export async function seedVolumePresets(db: AppDb): Promise<void> {
  await db
    .insert(volumePresets)
    .values({
      id: RP_GENERAL_PRESET_ID,
      userId: null,
      name: "RP General",
      description: RP_GENERAL_DESCRIPTION,
      classification: "heuristic",
      sourceRef: "docs/input/rp-volume-landmarks.md",
      isBuiltin: true,
    })
    .onConflictDoUpdate({
      target: volumePresets.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        classification: sql`excluded.classification`,
        sourceRef: sql`excluded.source_ref`,
        isBuiltin: sql`excluded.is_builtin`,
        updatedAt: new Date(),
      },
    });

  const landmarkRows = RP_ROWS.flatMap(landmarkRowsFor);
  if (landmarkRows.length > 0) {
    await db
      .insert(volumeLandmarks)
      .values(
        landmarkRows.map((row) => ({
          id: newId(),
          presetId: RP_GENERAL_PRESET_ID,
          muscleGroupId: row.muscleGroupId,
          key: row.key,
          valueMin: row.valueMin,
          valueMax: row.valueMax,
          openEnded: row.openEnded,
          note: row.note,
        })),
      )
      .onConflictDoUpdate({
        target: [volumeLandmarks.presetId, volumeLandmarks.muscleGroupId, volumeLandmarks.key],
        set: {
          valueMin: sql`excluded.value_min`,
          valueMax: sql`excluded.value_max`,
          openEnded: sql`excluded.open_ended`,
          note: sql`excluded.note`,
        },
      });
  }

  // implementation-plan.md Phase 6 — "the smallest spec-consistent
  // initialization needed for the current user to see RP General without
  // adding preset switching or overwriting an existing explicit selection"
  // (documented in the implementation report). State-predicated, same idiom
  // as ADR-010's reconciliation: the predicate ("no default preset yet") is
  // consumed by the update itself, so every later run touches zero rows —
  // no ledger, safe to rerun on every deploy, and a user who has explicitly
  // cleared their default (set it back to null on purpose) would be
  // re-defaulted on the next deploy same as one who never had it set. That
  // is an accepted trade-off: MVP has no "clear default" UI action, so the
  // only way `default_volume_preset_id` is null post-seed is "never set."
  await db
    .update(users)
    .set({ defaultVolumePresetId: RP_GENERAL_PRESET_ID, updatedAt: new Date() })
    .where(isNull(users.defaultVolumePresetId));
}
