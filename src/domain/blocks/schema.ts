import { z } from "zod";

// data-model.md §2.9 — goal is a labeling field, "never hard constraints"
// (domain-model.md §5).
export const blockGoalSchema = z.enum(["hypertrophy", "strength", "general"]);
export type BlockGoal = z.infer<typeof blockGoalSchema>;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// domain-model.md §5 — ScheduleEntry: templateId, weekdays (ISO weekday
// ints 1-7; omitted = rotation mode, per data-model.md §2.10). `position` is
// service-assigned from array order, same as templates/prescriptions.
export const scheduleEntryInputSchema = z
  .object({
    templateId: z.string().uuid(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.weekdays) return;
    if (new Set(data.weekdays).size !== data.weekdays.length) {
      ctx.addIssue({
        code: "custom",
        message: "weekdays must not contain duplicates",
        path: ["weekdays"],
      });
    }
  });
export type ScheduleEntryInput = z.infer<typeof scheduleEntryInputSchema>;

// domain-model.md §5 — WeekModifiers / DeloadConfig VOs.
export const weekModifiersSchema = z
  .object({
    setMultiplier: z.number().positive().optional(),
    loadMultiplier: z.number().positive().optional(),
    targetRirShift: z.number().int().optional(),
  })
  .strict();
export type WeekModifiers = z.infer<typeof weekModifiersSchema>;

export const deloadConfigSchema = z
  .object({
    mode: z.literal("scheduled"),
    weekIndex: z.union([z.number().int().positive(), z.literal("last")]),
    modifiers: weekModifiersSchema,
  })
  .strict();
export type DeloadConfig = z.infer<typeof deloadConfigSchema>;

// domain-model.md §5 — Block property table. `programId` comes from the
// route (/api/programs/[id]/blocks), not the body — same convention as
// templates. `sequence`/`status`/`completedAt` are service-managed.
export const createBlockSchema = z.object({
  name: z.string().trim().min(1).max(200),
  goal: blockGoalSchema.default("hypertrophy"),
  startDate: z.string().regex(DATE_ONLY_REGEX, "must be YYYY-MM-DD"),
  weeksPlanned: z.number().int().min(1).max(16),
  schedule: z.array(scheduleEntryInputSchema).min(1),
  deload: deloadConfigSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateBlockInput = z.infer<typeof createBlockSchema>;

// domain-model.md §5 — "Extension changes weeksPlanned" is the one
// explicitly-authorized post-creation schedule-shape edit; `startDate` is
// intentionally omitted here (not mentioned as mutable, and retroactively
// shifting it would change weekIndex for already-snapshotted context).
export const updateBlockSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    goal: blockGoalSchema.optional(),
    weeksPlanned: z.number().int().min(1).max(16).optional(),
    schedule: z.array(scheduleEntryInputSchema).min(1).optional(),
    deload: deloadConfigSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
