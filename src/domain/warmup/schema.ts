import { z } from "zod";

// Warm-up Routines v1 — domain validation
// (docs/reviews/warmup-routines-architecture-evaluation.md §4.1, R-8).
//
// Pure Zod, no imports outside `domain` — this file is a leaf, which is what
// lets tests/unit/warmupBoundary.test.ts assert that nothing progression-,
// volume- or sync-related is reachable from any warm-up module.

export const WARMUP_ROUTINE_NAME_MAX = 100;
export const WARMUP_ITEM_LABEL_MAX = 120;
export const WARMUP_ITEM_INSTRUCTION_MAX = 200;
export const WARMUP_ROUTINE_ITEMS_MIN = 1;
export const WARMUP_ROUTINE_ITEMS_MAX = 20;
// Not specified by the evaluation; a sane bound so a pathological client
// can't attach an unbounded association list to one template. Well above any
// realistic curated set (the product case is 2-4 alternatives per template).
export const TEMPLATE_WARMUP_ROUTINES_MAX = 20;

// Every route in this feature takes a UUID path parameter. PostgreSQL's
// `uuid` type rejects a malformed string with SQLSTATE 22P02, which no route
// in this repo maps — it would surface as an unhandled 500. Services call
// `isUuid` before touching the database and report "not found" instead, so a
// bad id is a 404, never a 500.
export const uuidSchema = z.string().uuid();

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export const warmupRoutineNameSchema = z.string().trim().min(1).max(WARMUP_ROUTINE_NAME_MAX);

// `label` is required; `instruction` is the ONE optional free-text field
// (M-6 folded the proposal's separate "note" into it). An empty/whitespace
// instruction is normalized to null rather than stored as "" so "no dose
// given" has exactly one representation.
export const warmupRoutineItemInputSchema = z
  .object({
    label: z.string().trim().min(1).max(WARMUP_ITEM_LABEL_MAX),
    instruction: z
      .string()
      .trim()
      .max(WARMUP_ITEM_INSTRUCTION_MAX)
      .nullable()
      .optional()
      .transform((value) => (value === undefined || value === "" ? null : value)),
  })
  .strict();
export type WarmupRoutineItemInput = z.infer<typeof warmupRoutineItemInputSchema>;

const itemsSchema = z
  .array(warmupRoutineItemInputSchema)
  .min(WARMUP_ROUTINE_ITEMS_MIN)
  .max(WARMUP_ROUTINE_ITEMS_MAX);

// Create and replace share one shape on purpose: routine + items are a
// single consistency boundary (B-3), edited full-replace inside one
// transaction. There is no per-item endpoint, so "add", "edit", "remove" and
// "reorder" are all the same write.
export const createWarmupRoutineSchema = z
  .object({
    name: warmupRoutineNameSchema,
    items: itemsSchema,
  })
  .strict();
export type CreateWarmupRoutineInput = z.infer<typeof createWarmupRoutineSchema>;

export const replaceWarmupRoutineSchema = createWarmupRoutineSchema;
export type ReplaceWarmupRoutineInput = z.infer<typeof replaceWarmupRoutineSchema>;

// Owner decision O-1 — the curated association set for one template, written
// as a whole. `routineIds` order IS the link order (position 0..n-1), so
// reordering is the same call as adding or removing. `defaultRoutineId` must
// be one of `routineIds` (or null); the service re-checks that against what
// it actually wrote, and the database's partial unique index is the
// backstop.
export const setTemplateWarmupRoutinesSchema = z
  .object({
    routineIds: z
      .array(uuidSchema)
      .max(TEMPLATE_WARMUP_ROUTINES_MAX)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "routineIds must not contain duplicates",
      }),
    defaultRoutineId: uuidSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (value) => value.defaultRoutineId === null || value.routineIds.includes(value.defaultRoutineId),
    { message: "defaultRoutineId must be one of routineIds", path: ["defaultRoutineId"] },
  );
export type SetTemplateWarmupRoutinesInput = z.infer<typeof setTemplateWarmupRoutinesSchema>;
