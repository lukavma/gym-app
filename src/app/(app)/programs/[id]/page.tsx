import { ProgramForm } from "@/ui/programs/ProgramForm";

interface ProgramDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProgramDetailPage({ params }: ProgramDetailPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <ProgramForm mode="edit" programId={id} />
    </div>
  );
}
