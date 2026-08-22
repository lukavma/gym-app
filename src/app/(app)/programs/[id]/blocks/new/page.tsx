import { BlockForm } from "@/ui/blocks/BlockForm";

interface NewBlockPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromBlockId?: string }>;
}

export default async function NewBlockPage({ params, searchParams }: NewBlockPageProps) {
  const { id } = await params;
  const { fromBlockId } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-sm">
      <BlockForm mode="create" programId={id} fromBlockId={fromBlockId} />
    </div>
  );
}
