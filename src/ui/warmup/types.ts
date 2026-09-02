// Client-side mirrors of the warm-up REST payloads, by the same
// contract-mirroring convention every other src/ui/*/types.ts uses (the `ui`
// element cannot import `server` — see eslint.config.mjs boundaries).

export interface WarmupRoutineItemDto {
  id: string;
  position: number;
  label: string;
  instruction: string | null;
}

export interface WarmupRoutineDto {
  id: string;
  name: string;
  items: WarmupRoutineItemDto[];
  // How many workout templates currently link this routine, so the delete
  // confirmation can say what it will unwire.
  linkedTemplateCount: number;
}

export interface TemplateWarmupRoutineLinkDto {
  routineId: string;
  name: string;
  position: number;
  isDefault: boolean;
  items: WarmupRoutineItemDto[];
}
