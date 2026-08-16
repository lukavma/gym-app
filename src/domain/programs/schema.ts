import { z } from "zod";

// domain-model.md §4 — Program: name, description, status.
export const createProgramSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

export const programArchiveActionSchema = z.enum(["archive", "unarchive"]);
export type ProgramArchiveAction = z.infer<typeof programArchiveActionSchema>;
