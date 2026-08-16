import { TemplateForm } from "@/ui/templates/TemplateForm";

interface TemplateDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <TemplateForm mode="edit" templateId={id} />
    </div>
  );
}
