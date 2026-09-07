import { z } from "zod";

// prescription-model.md §2 — MVP SetScheme variants, plus the athletic
// measurement profiles evaluation §9.1's two additive variants
// (distanceRounds/durationRounds). `perSet` and `fixedPlusAmrap` are
// reserved (post-MVP, prescription-model.md §2) — do not implement here.
export const SCHEME_TYPES = ["fixed", "repRange", "distanceRounds", "durationRounds"] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];

const SETS_MIN = 1;
// Exported so callers that must produce a PrescriptionSnapshot-valid scheme
// outside this file (applyWeekModifiers.ts's setMultiplier clamp) share the
// exact same ceiling instead of duplicating the literal.
export const SETS_MAX = 20;
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

// §9.1 — distance/duration-basis exercises round-count instead of counting
// reps. 99999.99 m / 86400 s (24h) are the column ceilings (§8), not
// meaningful training values — the point is the numeric(*, 2) column can
// hold whatever's validated here.
const distanceRoundsSchemeSchema = z.object({
  type: z.literal("distanceRounds"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  distanceM: z.number().gt(0).max(99999.99).multipleOf(0.01),
});

const durationRoundsSchemeSchema = z.object({
  type: z.literal("durationRounds"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  durationS: z.number().gt(0).max(86400).multipleOf(0.01),
});

// prescription-model.md §6 — repRange additionally requires minReps <=
// maxReps and a span sanity cap. Applied via superRefine (not per-member
// .refine()) so the union stays a plain z.discriminatedUnion.
export const setSchemeSchema = z
  .discriminatedUnion("type", [
    fixedSchemeSchema,
    repRangeSchemeShape,
    distanceRoundsSchemeSchema,
    durationRoundsSchemeSchema,
  ])
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
// §9.1 — renders "4 × 20 m" / "3 × 60 s" for the two athletic variants. A
// switch (not an if/else) so a fifth variant fails to compile here instead
// of silently falling through to the wrong branch.
export function formatScheme(scheme: SetScheme): string {
  switch (scheme.type) {
    case "fixed":
      return `${scheme.sets} × ${scheme.reps}`;
    case "repRange":
      return `${scheme.sets} × ${scheme.minReps}–${scheme.maxReps}`;
    case "distanceRounds":
      return `${scheme.sets} × ${scheme.distanceM} m`;
    case "durationRounds":
      return `${scheme.sets} × ${scheme.durationS} s`;
  }
}
