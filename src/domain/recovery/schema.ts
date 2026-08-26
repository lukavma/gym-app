import { z } from "zod";
import { dateOnlySchema } from "@/domain/bodyweight/schema";

// domain-model.md §7 — RecoveryEntry { date, sleepHours?, sleepQuality?
// 1–5, readiness? 1–5, soreness? 1–5, note? }, all fields optional;
// data-model.md §2.19's `ck_recovery_day`: "at least one metric column not
// null" (note does not count as a metric). EVIDENCE-027 / evidence-to-design
// #14: collection only, never a progression-engine input.
export const recoveryFiveScaleSchema = z.number().int().gte(1).lte(5);

// data-model.md §2.19 — `sleep_hours numeric(4,2)`, ck between 0 and 24.
export const sleepHoursSchema = z.number().gte(0).lte(24).multipleOf(0.01);

// phase-7-review.md MEDIUM-1 remediation — a metric field being *present*
// in the payload is no longer sufficient on its own: an explicit `null`
// (deliberate clear, see logRecoveryInputSchema below) is present but
// carries no value, and clearing a metric on a day with no prior row to
// clear it from is meaningless. This checks for an actual number in at
// least one metric slot, not merely "the key isn't undefined".
function hasAnyMetricValue(data: {
  sleepHours?: number | null | undefined;
  sleepQuality?: number | null | undefined;
  readiness?: number | null | undefined;
  soreness?: number | null | undefined;
}): boolean {
  return (
    typeof data.sleepHours === "number" ||
    typeof data.sleepQuality === "number" ||
    typeof data.readiness === "number" ||
    typeof data.soreness === "number"
  );
}

// Quick check-in input (POST /api/recovery, day-upsert): same server-assigns-
// today convention as bodyweight. Requires at least one actual metric value
// up front, matching the DB check on the very first insert of the day
// (there is no prior row for an explicit-null "clear" to act on yet).
//
// phase-7-review.md MEDIUM-1 — metric/note fields are `.nullable()` here,
// not just `.optional()`, so a repeat day-upsert call can distinguish
// "omitted — preserve whatever's already stored" (`undefined`) from
// "explicitly clearing this field" (`null`) — see
// src/server/recovery/service.ts's `logRecovery` for how each is handled.
export const logRecoveryInputSchema = z
  .object({
    date: dateOnlySchema.optional(),
    sleepHours: sleepHoursSchema.nullable().optional(),
    sleepQuality: recoveryFiveScaleSchema.nullable().optional(),
    readiness: recoveryFiveScaleSchema.nullable().optional(),
    soreness: recoveryFiveScaleSchema.nullable().optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine(hasAnyMetricValue, { message: "at least one recovery metric value is required" });
export type LogRecoveryInput = z.infer<typeof logRecoveryInputSchema>;

// Edit-by-id input (PATCH /api/recovery/[id]): patch semantics — omitted
// fields leave the stored value untouched, `null` explicitly clears it.
// Whether the *merged* row still satisfies "at least one metric" can only be
// checked against the existing row, so that's enforced in
// src/server/recovery/service.ts, not here.
export const updateRecoveryInputSchema = z
  .object({
    sleepHours: sleepHoursSchema.nullable().optional(),
    sleepQuality: recoveryFiveScaleSchema.nullable().optional(),
    readiness: recoveryFiveScaleSchema.nullable().optional(),
    soreness: recoveryFiveScaleSchema.nullable().optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateRecoveryInput = z.infer<typeof updateRecoveryInputSchema>;
