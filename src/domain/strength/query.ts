// Estimated 1RM tracker — the read endpoint's query-parameter contract.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §14.4 (`GET /api/exercises/[id]/strength?asOf=`, invalid -> 400, future
// clamped to server now and echoed as the effective `asOf`) and §15.1 (the
// what-if calculator's reps + RIR inputs).
//
// The bounds on the what-if inputs mirror the `set_logs` CHECK constraints
// (`reps between 1 and 100`, `rir between 0 and 10`) so the calculator can
// only be asked about a set the athlete could actually log. Values inside
// those bounds but outside the formula's usable target range are NOT rejected
// here — they get an honest refusal code from the domain instead
// (`TARGET_NEAR_MAXIMAL_NOT_SUGGESTED`, `TARGET_OUTSIDE_FORMULA_DOMAIN`).

import { z } from "zod";

// The path parameter, guarded before it reaches the database. PostgreSQL's
// `uuid` type rejects a malformed string with SQLSTATE 22P02, which no route
// in this repository maps, so it would surface as an unhandled 500 —
// `GET /api/exercises/not-a-uuid/strength` did exactly that (review F-5).
// §14.4 reads "404 otherwise", and a bad id is "otherwise". Same guard, same
// shape and same reason as `isUuid` in `@/domain/warmup/schema`; it is
// duplicated rather than imported because §14.5 confines
// `src/domain/strength/**` to its own module.
const exerciseIdSchema = z.string().uuid();

export function isStrengthExerciseId(value: string): boolean {
  return exerciseIdSchema.safeParse(value).success;
}

const REPS_MIN = 1;
const REPS_MAX = 100;
const RIR_MIN = 0;
const RIR_MAX = 10;

export const strengthQuerySchema = z
  .object({
    // ISO instant. Absent means "now"; a future value is clamped by the
    // server rather than rejected, so `?asOf=` can never be used to make
    // `best` disagree with `current` (review RM-2).
    asOf: z.string().datetime({ offset: true }).optional(),
    whatIfReps: z.number().int().min(REPS_MIN).max(REPS_MAX).optional(),
    whatIfRir: z.number().int().min(RIR_MIN).max(RIR_MAX).optional(),
  })
  .strict()
  // Both what-if inputs or neither: a half-specified calculator would have to
  // invent the missing half, and this feature never infers an effort.
  .refine((value) => (value.whatIfReps === undefined) === (value.whatIfRir === undefined), {
    message: "whatIfReps and whatIfRir must be supplied together",
    path: ["whatIfRir"],
  });

export type StrengthQuery = z.infer<typeof strengthQuerySchema>;

// Parses raw `URLSearchParams` values. Returns `null` for a syntactically
// invalid number so the route can answer 400 rather than silently coercing
// `"abc"` to `NaN` (the `api/history` precedent, MEDIUM-6).
export function parseStrengthQuery(
  params: URLSearchParams,
): { ok: true; value: StrengthQuery } | { ok: false } {
  const raw: Record<string, unknown> = {};
  const asOf = params.get("asOf");
  if (asOf !== null) raw.asOf = asOf;
  for (const key of ["whatIfReps", "whatIfRir"] as const) {
    const value = params.get(key);
    if (value === null) continue;
    if (value.trim() === "") return { ok: false };
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return { ok: false };
    raw[key] = parsed;
  }
  const result = strengthQuerySchema.safeParse(raw);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
