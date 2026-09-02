import { ProgramList } from "@/ui/programs/ProgramList";
import { WarmupRoutinesSection } from "@/ui/warmup/WarmupRoutinesSection";

// Owner decision O-4 — warm-up routine management is reached from here, not
// from an eighth top-level nav link (the nav already wraps at seven;
// phase-7-review.md BLOCKER-1, PI-004 pending). It renders below the program
// list so the page's primary content is unchanged.
export default function ProgramsPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <ProgramList />
      <WarmupRoutinesSection />
    </div>
  );
}
