import { PrescriptionForm } from "@/ui/prescriptions/PrescriptionForm";

interface NewPrescriptionPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewPrescriptionPage({ params }: NewPrescriptionPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <PrescriptionForm mode="create" templateId={id} />
    </div>
  );
}
