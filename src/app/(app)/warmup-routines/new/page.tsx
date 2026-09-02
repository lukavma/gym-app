import { WarmupRoutineForm } from "@/ui/warmup/WarmupRoutineForm";

export default function NewWarmupRoutinePage() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <WarmupRoutineForm mode="create" />
    </div>
  );
}
