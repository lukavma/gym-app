import { ExerciseForm } from "@/ui/exercises/ExerciseForm";

export default function NewExercisePage() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <ExerciseForm mode="create" />
    </div>
  );
}
