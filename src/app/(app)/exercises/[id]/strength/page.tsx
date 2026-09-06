import { StrengthScreen } from "@/ui/strength/StrengthScreen";

interface ExerciseStrengthPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExerciseStrengthPage({ params }: ExerciseStrengthPageProps) {
  const { id } = await params;
  return <StrengthScreen exerciseId={id} />;
}
