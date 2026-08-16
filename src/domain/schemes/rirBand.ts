import { z } from "zod";

// prescription-model.md §3 — RirBand: an integer band, never a scalar.
export const rirBandSchema = z
  .object({
    min: z.number().int().min(0).max(10),
    max: z.number().int().min(0).max(10),
  })
  .refine((band) => band.min <= band.max, { message: "min must be <= max", path: ["max"] });

export type RirBand = z.infer<typeof rirBandSchema>;

// prescription-model.md §3 — labeled heuristic default for hypertrophy-goal
// templates (EVIDENCE-029 neighborhood), used by the UI to pre-fill new
// prescriptions. Not auto-applied server-side.
export const DEFAULT_HYPERTROPHY_TARGET_RIR: RirBand = { min: 0, max: 2 };
