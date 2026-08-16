import { ProgramForm } from "@/ui/programs/ProgramForm";

export default function NewProgramPage() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <ProgramForm mode="create" />
    </div>
  );
}
