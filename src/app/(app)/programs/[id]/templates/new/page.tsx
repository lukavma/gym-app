import { TemplateForm } from "@/ui/templates/TemplateForm";

interface NewTemplatePageProps {
  params: Promise<{ id: string }>;
}

export default async function NewTemplatePage({ params }: NewTemplatePageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <TemplateForm mode="create" programId={id} />
    </div>
  );
}
