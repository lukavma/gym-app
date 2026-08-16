import { z } from "zod";

// domain-model.md §4 — WorkoutTemplate: name, notes. `position`/`archivedAt`
// are service-managed, not client input.
export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const templateArchiveActionSchema = z.enum(["archive", "unarchive"]);
export type TemplateArchiveAction = z.infer<typeof templateArchiveActionSchema>;

// implementation-plan.md Phase 2 — "ordered template ... reordering". Full
// replacement list of ids in desired order, mirroring how the template
// editor displays them (service resolves id -> position 0..n-1).
export const reorderTemplatesSchema = z.object({
  templateIds: z.array(z.string().uuid()).min(1),
});
export type ReorderTemplatesInput = z.infer<typeof reorderTemplatesSchema>;
