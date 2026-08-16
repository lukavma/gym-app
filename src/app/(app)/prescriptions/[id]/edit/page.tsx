import { PrescriptionForm } from "@/ui/prescriptions/PrescriptionForm";

interface EditPrescriptionPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPrescriptionPage({ params }: EditPrescriptionPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <PrescriptionForm mode="edit" prescriptionId={id} />
    </div>
  );
}
