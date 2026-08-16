import { BlockForm } from "@/ui/blocks/BlockForm";

interface BlockDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BlockDetailPage({ params }: BlockDetailPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-sm">
      <BlockForm mode="edit" blockId={id} />
    </div>
  );
}
