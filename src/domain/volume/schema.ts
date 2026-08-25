import { z } from "zod";
import { muscleGroupSlugSchema } from "@/domain/exercises/muscleGroups";

// data-model.md §2.16 / evidence-to-design.md — same three-tier vocabulary
// as `recommendations.classification` (progression's config classification
// only reaches two of these — heuristic/user_defined; volume presets can
// additionally be `evidence_supported` in principle, though nothing ships
// as that tier in MVP: RP General is seeded `heuristic`).
export const VOLUME_PRESET_CLASSIFICATIONS = [
  "evidence_supported",
  "heuristic",
  "user_defined",
] as const;
export type VolumePresetClassification = (typeof VOLUME_PRESET_CLASSIFICATIONS)[number];
export const volumePresetClassificationSchema = z.enum(VOLUME_PRESET_CLASSIFICATIONS);

// data-model.md §2.17 — `key` is deliberately a free string ("the schema
// does not bake in RP's four-landmark framework", volume-model.md §4), but
// bounded in length as ordinary input hygiene. `value_min`/`value_max` are
// `numeric(5,1)` — one decimal place, matching the loadStepKg/contribution-
// weight precedent (phase-5.5-light-remediation "M-1(new)") of guarding
// against the column silently truncating extra precision instead of
// rejecting it.
export const volumeLandmarkKeySchema = z.string().trim().min(1).max(30);

export const upsertVolumeLandmarkInputSchema = z
  .object({
    muscleGroupId: muscleGroupSlugSchema,
    key: volumeLandmarkKeySchema,
    valueMin: z.number().min(0).multipleOf(0.1).optional(),
    valueMax: z.number().min(0).multipleOf(0.1).optional(),
    openEnded: z.boolean().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => data.valueMin !== undefined || data.valueMax !== undefined, {
    message: "at least one of valueMin/valueMax is required",
    path: ["valueMin"],
  })
  .refine(
    (data) =>
      data.valueMin === undefined || data.valueMax === undefined || data.valueMax >= data.valueMin,
    { message: "valueMax must be >= valueMin", path: ["valueMax"] },
  );

export type UpsertVolumeLandmarkInput = z.infer<typeof upsertVolumeLandmarkInputSchema>;
