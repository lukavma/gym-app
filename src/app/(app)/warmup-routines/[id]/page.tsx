import { WarmupRoutineForm } from "@/ui/warmup/WarmupRoutineForm";

interface WarmupRoutineDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WarmupRoutineDetailPage({ params }: WarmupRoutineDetailPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <WarmupRoutineForm mode="edit" routineId={id} />
    </div>
  );
}
