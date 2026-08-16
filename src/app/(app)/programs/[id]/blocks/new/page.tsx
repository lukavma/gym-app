import { BlockForm } from "@/ui/blocks/BlockForm";

interface NewBlockPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewBlockPage({ params }: NewBlockPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <BlockForm mode="create" programId={id} />
    </div>
  );
}
