import { z } from "zod";
import { parseDateOnly } from "@/domain/scheduling/weekIndex";

// domain-model.md §7 — BodyweightEntry { date, weightKg }. `date` is the
// user-timezone local date (data-model.md §1); a client never resolves its
// own "today" — the quick-log flow lets the server assign it.
export const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

// phase-7-review.md MEDIUM-3 — the regex alone accepts calendar-impossible
// strings like "2026-13-45" or "2026-02-30" (Feb 30 never exists; Feb 29
// only exists in a leap year). Both would previously reach PostgreSQL and
// fail with SQLSTATE 22008 (invalid_datetime_format), unmapped by any route,
// surfacing as a raw 500 instead of the 400 the route's own validation
// contract implies. `parseDateOnly` (the same `Date.UTC(...)`-based parser
// `weekIndex`/`weekBuckets` already use, so this doesn't introduce a second
// date convention) silently normalizes out-of-range components — day 30 of
// a 28-day February rolls into March — so round-tripping the parsed epoch
// back through `Date#getUTC*` and comparing to the original numbers catches
// every case where normalization actually happened, without hand-rolling a
// leap-year rule.
function isValidCalendarDateString(value: string): boolean {
  const match = DATE_ONLY_REGEX.exec(value);
  const yearStr = match?.[1];
  const monthStr = match?.[2];
  const dayStr = match?.[3];
  if (!yearStr || !monthStr || !dayStr) return false;

  const parsed = new Date(parseDateOnly(value));
  return (
    parsed.getUTCFullYear() === Number(yearStr) &&
    parsed.getUTCMonth() === Number(monthStr) - 1 &&
    parsed.getUTCDate() === Number(dayStr)
  );
}

export const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_REGEX, "must be YYYY-MM-DD")
  .refine(isValidCalendarDateString, { message: "must be a valid calendar date" });

// data-model.md §2.18 — `weight_kg numeric(5,2)`, ck between 20 and 400.
// `.multipleOf(0.01)` guards the same silent-rounding failure mode fixed for
// loadStepKg/contribution weight (Phase 1/5.5 reviews) — without it, e.g.
// 83.455 rounds to 83.46 in Postgres instead of being rejected here.
export const bodyweightWeightKgSchema = z.number().gte(20).lte(400).multipleOf(0.01);

// Quick-log input (POST /api/bodyweight): date defaults server-side to
// today's user-local date when omitted — the ≤2-interaction path (mvp-scope
// F10) never asks the user to pick a date.
export const logBodyweightInputSchema = z
  .object({
    date: dateOnlySchema.optional(),
    weightKg: bodyweightWeightKgSchema,
    note: z.string().trim().min(1).optional(),
  })
  .strict();
export type LogBodyweightInput = z.infer<typeof logBodyweightInputSchema>;

// Edit-by-id input (PATCH /api/bodyweight/[id]): corrects a specific
// historical entry's value/note. Date is deliberately not editable here —
// changing which day an entry belongs to is a delete+relog, not a "fix a
// typo'd weight" correction (mirrors F9's post-completion set corrections,
// which only touch weight/reps/RIR, never the session's own date).
export const updateBodyweightInputSchema = z
  .object({
    weightKg: bodyweightWeightKgSchema.optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateBodyweightInput = z.infer<typeof updateBodyweightInputSchema>;
