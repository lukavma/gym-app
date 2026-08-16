export interface TemplateDto {
  id: string;
  programId: string;
  name: string;
  position: number;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
