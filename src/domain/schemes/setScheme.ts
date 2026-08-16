import { z } from "zod";

// prescription-model.md §2 — MVP SetScheme variants. `perSet` and
// `fixedPlusAmrap` are reserved (post-MVP, prescription-model.md §2) — do
// not implement here.
export const SCHEME_TYPES = ["fixed", "repRange"] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];

const SETS_MIN = 1;
const SETS_MAX = 20;
const REPS_MIN = 1;
const REPS_MAX = 100;
const REP_RANGE_MAX_SPAN = 30;

const fixedSchemeSchema = z.object({
  type: z.literal("fixed"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  reps: z.number().int().min(REPS_MIN).max(REPS_MAX),
});

const repRangeSchemeShape = z.object({
  type: z.literal("repRange"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  minReps: z.number().int().min(REPS_MIN).max(REPS_MAX),
  maxReps: z.number().int().min(REPS_MIN).max(REPS_MAX),
});

// prescription-model.md §6 — repRange additionally requires minReps <=
// maxReps and a span sanity cap. Applied via superRefine (not per-member
// .refine()) so the union stays a plain z.discriminatedUnion.
export const setSchemeSchema = z
  .discriminatedUnion("type", [fixedSchemeSchema, repRangeSchemeShape])
  .superRefine((data, ctx) => {
    if (data.type !== "repRange") return;
    if (data.maxReps < data.minReps) {
      ctx.addIssue({ code: "custom", message: "maxReps must be >= minReps", path: ["maxReps"] });
      return;
    }
    if (data.maxReps - data.minReps > REP_RANGE_MAX_SPAN) {
      ctx.addIssue({
        code: "custom",
        message: `rep range span must be <= ${REP_RANGE_MAX_SPAN}`,
        path: ["maxReps"],
      });
    }
  });

export type SetScheme = z.infer<typeof setSchemeSchema>;

// prescription-model.md §1/§2 — every persisted scheme is wrapped with its
// schema version. Version bumps only on breaking shape changes.
export const SCHEME_ENVELOPE_VERSION = 1;

export const setSchemeEnvelopeSchema = z.object({
  v: z.literal(SCHEME_ENVELOPE_VERSION),
  scheme: setSchemeSchema,
});

export type SetSchemeEnvelope = z.infer<typeof setSchemeEnvelopeSchema>;

export function wrapScheme(scheme: SetScheme): SetSchemeEnvelope {
  return { v: SCHEME_ENVELOPE_VERSION, scheme };
}

// prescription-model.md §2 — "renders '5 × 5'" / "renders '3 × 8–12'".
export function formatScheme(scheme: SetScheme): string {
  if (scheme.type === "fixed") return `${scheme.sets} × ${scheme.reps}`;
  return `${scheme.sets} × ${scheme.minReps}–${scheme.maxReps}`;
}
