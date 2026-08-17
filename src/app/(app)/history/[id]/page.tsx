import { HistoryDetail } from "@/ui/history/HistoryDetail";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HistoryDetail id={id} />;
}
