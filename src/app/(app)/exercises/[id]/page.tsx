import { ExerciseForm } from "@/ui/exercises/ExerciseForm";

interface EditExercisePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExercisePage({ params }: EditExercisePageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <ExerciseForm mode="edit" exerciseId={id} />
    </div>
  );
}
