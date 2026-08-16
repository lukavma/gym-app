export interface ProgramDto {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
